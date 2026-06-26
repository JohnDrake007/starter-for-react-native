import AsyncStorage from "@react-native-async-storage/async-storage";
import { databases, storage, ID, Query, DATABASE_ID, CUSTOMERS_COLLECTION_ID, VISITS_COLLECTION_ID, ITEMS_COLLECTION_ID, RECOMMENDATIONS_COLLECTION_ID, VISIT_PHOTOS_COLLECTION_ID, STORAGE_BUCKET_ID, INVENTORY_ITEMS_COLLECTION_ID, INVENTORY_BATCHES_COLLECTION_ID } from "./appwrite";
// Lazy import to avoid circular deps — imported inline in syncNow
let _scheduleVisitReminders: (() => Promise<void>) | null = null;
async function refreshNotifications() {
  try {
    if (!_scheduleVisitReminders) {
      const mod = await import("./notification-manager");
      _scheduleVisitReminders = mod.scheduleVisitReminders;
    }
    await _scheduleVisitReminders();
  } catch {}
}

// ── Storage Keys ──────────────────────────────────────────────────────────────
const STORAGE_KEYS: Record<string, string> = {
  [CUSTOMERS_COLLECTION_ID]: "@fa_customers",
  [VISITS_COLLECTION_ID]: "@fa_visits",
  [ITEMS_COLLECTION_ID]: "@fa_items",
  [RECOMMENDATIONS_COLLECTION_ID]: "@fa_recommendations",
  [VISIT_PHOTOS_COLLECTION_ID]: "@fa_visit_photos",
  [INVENTORY_ITEMS_COLLECTION_ID]: "@fa_inventory_items",
  [INVENTORY_BATCHES_COLLECTION_ID]: "@fa_inventory_batches",
};
const PENDING_QUEUE_KEY = "@fa_pending_queue";
const LAST_SYNC_KEY = "@fa_last_sync";

// ── Types ─────────────────────────────────────────────────────────────────────
export type SyncStatus = "idle" | "syncing" | "error" | "offline";

interface PendingMutation {
  id: string;
  action: "create" | "update" | "delete";
  collectionId: string;
  docId: string;
  data?: Record<string, any>;
  timestamp: number;
  /** For photo uploads: local URI, bucket ID, etc. */
  photoMeta?: {
    localUri: string;
    fileName: string;
    mimeType: string;
    fileSize: number;
    bucketId: string;
    visitId: string;
    caption?: string;
  };
}

type SyncListener = (status: SyncStatus, info?: string) => void;

// ── Collections that support full pull ────────────────────────────────────────
const SYNCABLE_COLLECTIONS = [
  CUSTOMERS_COLLECTION_ID,
  VISITS_COLLECTION_ID,
  ITEMS_COLLECTION_ID,
  RECOMMENDATIONS_COLLECTION_ID,
  VISIT_PHOTOS_COLLECTION_ID,
  INVENTORY_ITEMS_COLLECTION_ID,
  INVENTORY_BATCHES_COLLECTION_ID,
];

// ── In-memory cache ───────────────────────────────────────────────────────────
const cache: Record<string, any[]> = {};
let pendingQueue: PendingMutation[] = [];
let lastSyncTime: string | null = null;
let currentStatus: SyncStatus = "idle";
const listeners: Set<SyncListener> = new Set();
let initialized = false;

// ── Helpers ───────────────────────────────────────────────────────────────────
function generateLocalId(): string {
  return `local_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

function broadcast(status: SyncStatus, info?: string) {
  currentStatus = status;
  listeners.forEach((fn) => {
    try {
      fn(status, info);
    } catch {}
  });
}

async function persistCollection(collectionId: string) {
  const key = STORAGE_KEYS[collectionId];
  if (!key) return;
  await AsyncStorage.setItem(key, JSON.stringify(cache[collectionId] || []));
}

async function persistQueue() {
  await AsyncStorage.setItem(PENDING_QUEUE_KEY, JSON.stringify(pendingQueue));
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Initialise sync manager: load local data from AsyncStorage into memory.
 * Call once at app startup.
 */
export async function initSync(): Promise<void> {
  if (initialized) return;
  try {
    // Load all collections from disk
    for (const collectionId of SYNCABLE_COLLECTIONS) {
      const key = STORAGE_KEYS[collectionId];
      const raw = await AsyncStorage.getItem(key);
      cache[collectionId] = raw ? JSON.parse(raw) : [];
    }
    // Load pending queue
    const rawQueue = await AsyncStorage.getItem(PENDING_QUEUE_KEY);
    pendingQueue = rawQueue ? JSON.parse(rawQueue) : [];
    // Load last sync time
    lastSyncTime = await AsyncStorage.getItem(LAST_SYNC_KEY);
    initialized = true;
  } catch (e) {
    console.warn("[SyncManager] initSync error:", e);
  }
}

/** Get all local documents for a collection. */
export function getCollection(collectionId: string): any[] {
  return cache[collectionId] || [];
}

/** Get a single document by ID from local cache. */
export function getDocument(collectionId: string, docId: string): any | null {
  const docs = cache[collectionId] || [];
  return docs.find((d: any) => d.$id === docId) || null;
}

/**
 * Create a document locally and enqueue for server sync.
 * Returns the locally-created document with a local $id.
 */
export async function createDocument(
  collectionId: string,
  data: Record<string, any>
): Promise<any> {
  const localId = generateLocalId();
  const doc = {
    ...data,
    $id: localId,
    $createdAt: new Date().toISOString(),
    $updatedAt: new Date().toISOString(),
    _pendingSync: true,
  };

  if (!cache[collectionId]) cache[collectionId] = [];
  cache[collectionId].unshift(doc);
  await persistCollection(collectionId);

  // Enqueue mutation
  pendingQueue.push({
    id: generateLocalId(),
    action: "create",
    collectionId,
    docId: localId,
    data,
    timestamp: Date.now(),
  });
  await persistQueue();

  return doc;
}

/**
 * Update a document locally and enqueue for server sync.
 */
export async function updateDocument(
  collectionId: string,
  docId: string,
  data: Record<string, any>
): Promise<any> {
  const docs = cache[collectionId] || [];
  const idx = docs.findIndex((d: any) => d.$id === docId);
  if (idx >= 0) {
    docs[idx] = { ...docs[idx], ...data, $updatedAt: new Date().toISOString(), _pendingSync: true };
    cache[collectionId] = docs;
    await persistCollection(collectionId);
  }

  pendingQueue.push({
    id: generateLocalId(),
    action: "update",
    collectionId,
    docId,
    data,
    timestamp: Date.now(),
  });
  await persistQueue();

  return docs[idx] || null;
}

/**
 * Delete a document locally and enqueue for server sync.
 */
export async function deleteDocument(
  collectionId: string,
  docId: string
): Promise<void> {
  const docs = cache[collectionId] || [];
  cache[collectionId] = docs.filter((d: any) => d.$id !== docId);
  await persistCollection(collectionId);

  // Only queue server delete if it's NOT a local-only document
  if (!docId.startsWith("local_")) {
    pendingQueue.push({
      id: generateLocalId(),
      action: "delete",
      collectionId,
      docId,
      timestamp: Date.now(),
    });
    await persistQueue();
  }
}

/**
 * Enqueue a photo upload for when network is available.
 */
export async function enqueuePhotoUpload(meta: PendingMutation["photoMeta"]): Promise<void> {
  if (!meta) return;

  // Save a local record immediately so the photo is visible while offline
  const localPhotoId = generateLocalId();
  const localPhotoDoc = {
    $id: localPhotoId,
    visitId: meta.visitId,
    url: meta.localUri,   // use local URI for offline display
    caption: meta.caption || undefined,
    $createdAt: new Date().toISOString(),
    $updatedAt: new Date().toISOString(),
    _pendingSync: true,
    _isLocalPhoto: true,  // flag so we can replace it after sync
  };
  if (!cache[VISIT_PHOTOS_COLLECTION_ID]) cache[VISIT_PHOTOS_COLLECTION_ID] = [];
  cache[VISIT_PHOTOS_COLLECTION_ID].push(localPhotoDoc);
  await persistCollection(VISIT_PHOTOS_COLLECTION_ID);

  pendingQueue.push({
    id: generateLocalId(),
    action: "create",
    collectionId: VISIT_PHOTOS_COLLECTION_ID,
    docId: localPhotoId,
    timestamp: Date.now(),
    photoMeta: meta,
  });
  await persistQueue();
}

/** Get current sync status. */
export function getSyncStatus(): SyncStatus {
  return currentStatus;
}

/** Get last sync time as ISO string, or null. */
export function getLastSyncTime(): string | null {
  return lastSyncTime;
}

/** Get the count of pending (unsynced) mutations. */
export function getPendingCount(): number {
  return pendingQueue.length;
}

/** Register a listener for sync status changes. Returns unsubscribe fn. */
export function addSyncListener(fn: SyncListener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// ── Sync Execution ────────────────────────────────────────────────────────────

/**
 * Full sync: push pending mutations, then pull fresh data from Appwrite.
 * Called automatically on connectivity change and manually via "Sync Now".
 */
export async function syncNow(): Promise<void> {
  if (currentStatus === "syncing") return;
  broadcast("syncing");

  try {
    // ── 1. Push pending mutations ──
    await pushPendingQueue();

    // ── 2. Pull fresh data from all collections ──
    await pullAllCollections();

    // ── 3. Update last sync time ──
    lastSyncTime = new Date().toISOString();
    await AsyncStorage.setItem(LAST_SYNC_KEY, lastSyncTime);

    // ── 4. Re-schedule device notifications to reflect fresh data ──
    refreshNotifications();

    broadcast("idle", "Sync complete");
  } catch (e: any) {
    console.warn("[SyncManager] syncNow error:", e);
    broadcast("error", e.message || "Sync failed");
  }
}

/** Push all pending mutations to Appwrite. */
async function pushPendingQueue(): Promise<void> {
  // Create a copy so we can remove processed items
  const queue = [...pendingQueue];
  const failed: PendingMutation[] = [];
  // Map local IDs → server IDs so references can be updated
  const idMap: Record<string, string> = {};

  for (const mutation of queue) {
    try {
      // Handle photo uploads specially
      if (mutation.photoMeta) {
        await pushPhotoUpload(mutation, idMap);
        continue;
      }

      switch (mutation.action) {
        case "create": {
          const serverData = { ...mutation.data };
          // Resolve local ID references in data fields
          if (serverData) {
            for (const [key, value] of Object.entries(serverData)) {
              if (typeof value === "string" && value.startsWith("local_") && idMap[value]) {
                serverData[key] = idMap[value];
              }
            }
          }

          const created = await databases.createDocument(
            DATABASE_ID,
            mutation.collectionId,
            ID.unique(),
            serverData!
          );
          // Map old local ID → new server ID
          idMap[mutation.docId] = created.$id;

          // Update local cache with server ID
          const docs = cache[mutation.collectionId] || [];
          const idx = docs.findIndex((d: any) => d.$id === mutation.docId);
          if (idx >= 0) {
            docs[idx] = { ...created, _pendingSync: undefined };
            cache[mutation.collectionId] = docs;
          }
          break;
        }
        case "update": {
          // Skip if the document was a local-only doc that got a new server ID
          const resolvedId = idMap[mutation.docId] || mutation.docId;
          if (resolvedId.startsWith("local_")) {
            // Can't update a doc that doesn't exist on server yet; skip
            continue;
          }
          await databases.updateDocument(
            DATABASE_ID,
            mutation.collectionId,
            resolvedId,
            mutation.data!
          );
          break;
        }
        case "delete": {
          const resolvedId = idMap[mutation.docId] || mutation.docId;
          if (resolvedId.startsWith("local_")) continue;
          await databases.deleteDocument(
            DATABASE_ID,
            mutation.collectionId,
            resolvedId
          );
          break;
        }
      }
    } catch (e) {
      console.warn("[SyncManager] Failed to push mutation:", mutation.id, e);
      failed.push(mutation);
    }
  }

  pendingQueue = failed;
  await persistQueue();
}

/** Handle a queued photo upload. */
async function pushPhotoUpload(
  mutation: PendingMutation,
  idMap: Record<string, string>
): Promise<void> {
  const meta = mutation.photoMeta!;
  const resolvedVisitId = idMap[meta.visitId] || meta.visitId;

  // Upload file to storage
  const uploaded = await storage.createFile(meta.bucketId, ID.unique(), {
    name: meta.fileName,
    type: meta.mimeType,
    size: meta.fileSize,
    uri: meta.localUri,
  });

  const fileUrl = storage.getFileView(meta.bucketId, uploaded.$id).toString();

  // Create photo document
  await databases.createDocument(DATABASE_ID, VISIT_PHOTOS_COLLECTION_ID, ID.unique(), {
    visitId: resolvedVisitId,
    url: fileUrl,
    caption: meta.caption || undefined,
  });
}

/** Pull all data from Appwrite and replace local cache. */
async function pullAllCollections(): Promise<void> {
  for (const collectionId of SYNCABLE_COLLECTIONS) {
    try {
      const res = await databases.listDocuments(DATABASE_ID, collectionId, [
        Query.limit(1000),
        Query.orderDesc("$createdAt"),
      ]);
      const serverDocs = res.documents as any[];

      // Merge: keep local-only docs (not yet synced) that aren't in server data
      const localOnlyDocs = (cache[collectionId] || []).filter(
        (d: any) => d.$id.startsWith("local_") && d._pendingSync
      );

      cache[collectionId] = [...localOnlyDocs, ...serverDocs];
      await persistCollection(collectionId);
    } catch (e) {
      console.warn(`[SyncManager] Pull failed for ${collectionId}:`, e);
      // Keep existing local data on failure — offline resilience
    }
  }
}

/**
 * Sets the sync status to offline (called by network provider).
 */
export function setOffline(): void {
  if (currentStatus !== "syncing") {
    broadcast("offline");
  }
}

/**
 * Sets the sync status back to idle (called after coming online if no sync needed).
 */
export function setOnline(): void {
  if (currentStatus === "offline") {
    broadcast("idle");
  }
}
