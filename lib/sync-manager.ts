import AsyncStorage from "@react-native-async-storage/async-storage";
import { databases, storage, ID, Query, DATABASE_ID, CUSTOMERS_COLLECTION_ID, VISITS_COLLECTION_ID, ITEMS_COLLECTION_ID, RECOMMENDATIONS_COLLECTION_ID, VISIT_PHOTOS_COLLECTION_ID, INVENTORY_ITEMS_COLLECTION_ID, INVENTORY_BATCHES_COLLECTION_ID } from "./appwrite";
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
];

// ── Inventory collections — pulled separately (large, optional) ────────────────
const INVENTORY_COLLECTIONS = [
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

/**
 * Determine whether an error represents a network failure or server-side
 * unavailability (as opposed to a client/validation error). Only network /
 * unavailable errors should cause a write to fall back to the pending queue;
 * client errors (4xx) indicate bad data and must surface to the caller so the
 * user can correct the input rather than retrying a doomed mutation forever.
 */
function isNetworkOrUnavailableError(e: any): boolean {
  if (e && typeof e.code === "number") {
    return e.code >= 500;
  }
  return true;
}

/**
 * Create a document on the server with automatic retry on ID collisions.
 *
 * The Appwrite SDK's ID.unique() default padding is only 7 hex digits
 * (~268 M possibilities). Under rapid successive calls or with a large
 * collection, collisions can occur and the server returns HTTP 409. This
 * helper uses a larger padding (20 hex digits ≈ 80 bits) and retries a
 * handful of times with a fresh ID on 409, making collisions practically
 * impossible.
 */
async function createServerDocument(
  collectionId: string,
  data: Record<string, any>,
  maxRetries = 3
): Promise<any> {
  let lastError: any;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await databases.createDocument(
        DATABASE_ID,
        collectionId,
        ID.unique(20),
        data
      );
    } catch (e: any) {
      lastError = e;
      if (e?.code === 409 && attempt < maxRetries) continue;
      throw e;
    }
  }
  throw lastError;
}

/** Insert or replace a document in the in-memory cache by its $id (idempotent). */
function upsertIntoCache(collectionId: string, doc: any) {
  if (!cache[collectionId]) cache[collectionId] = [];
  const docs = cache[collectionId];
  const idx = docs.findIndex((d: any) => d.$id === doc.$id);
  if (idx >= 0) {
    docs[idx] = { ...docs[idx], ...doc, _pendingSync: undefined };
  } else {
    docs.unshift({ ...doc, _pendingSync: undefined });
  }
}

/** Remove a single document from the in-memory cache by its $id. */
function removeFromCache(collectionId: string, docId: string) {
  const docs = cache[collectionId];
  if (!docs) return;
  cache[collectionId] = docs.filter((d: any) => d.$id !== docId);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Initialise sync manager: load local data from AsyncStorage into memory.
 * Call once at app startup.
 */
export async function initSync(): Promise<void> {
  if (initialized) return;
  try {
    // Load core collections from disk
    for (const collectionId of SYNCABLE_COLLECTIONS) {
      const key = STORAGE_KEYS[collectionId];
      const raw = await AsyncStorage.getItem(key);
      cache[collectionId] = raw ? JSON.parse(raw) : [];
    }
    // Also load any previously-cached inventory data
    for (const collectionId of INVENTORY_COLLECTIONS) {
      const key = STORAGE_KEYS[collectionId];
      if (key) {
        try {
          const raw = await AsyncStorage.getItem(key);
          cache[collectionId] = raw ? JSON.parse(raw) : [];
        } catch {}
      }
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
 * Create a document.
 *
 * Online-first: attempts the server API first. On success the returned
 * document is stored locally immediately so the cache stays in sync. If the
 * device is offline or the API is unavailable, the document is created locally
 * (with a temporary `local_` id) and enqueued for synchronisation as soon as
 * connectivity is restored. Client errors (4xx) are re-thrown to the caller.
 */
export async function createDocument(
  collectionId: string,
  data: Record<string, any>
): Promise<any> {
  try {
    const created = await createServerDocument(collectionId, data);
    upsertIntoCache(collectionId, created);
    await persistCollection(collectionId);
    return created;
  } catch (e: any) {
    if (!isNetworkOrUnavailableError(e)) throw e;

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
}

/**
 * Update a document.
 *
 * Online-first: if the document already has a server id, the API is updated
 * first and the local cache is refreshed from the response on success. When
 * offline the change is applied locally and queued. For documents that only
 * exist locally (pending `local_` id) the update is applied locally and queued;
 * it is resolved to the real server id via the id-map during the next push.
 */
export async function updateDocument(
  collectionId: string,
  docId: string,
  data: Record<string, any>
): Promise<any> {
  // Local-only document (pending create) — cannot be updated on the server yet.
  if (docId.startsWith("local_")) {
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

  try {
    const updated = await databases.updateDocument(
      DATABASE_ID,
      collectionId,
      docId,
      data
    );
    upsertIntoCache(collectionId, updated);
    await persistCollection(collectionId);
    return updated;
  } catch (e: any) {
    if (!isNetworkOrUnavailableError(e)) throw e;

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
}

/**
 * Delete a document.
 *
 * Online-first: if the document has a server id the API is called first and,
 * on success, the document is removed from the local cache. When offline the
 * document is removed locally and a delete mutation is queued. Documents that
 * only exist locally (pending `local_` id) are simply dropped from the cache
 * and their queued create mutation is discarded — there is nothing on the
 * server to delete.
 */
export async function deleteDocument(
  collectionId: string,
  docId: string
): Promise<void> {
  // Local-only document — nothing exists on the server to delete.
  if (docId.startsWith("local_")) {
    removeFromCache(collectionId, docId);
    await persistCollection(collectionId);
    pendingQueue = pendingQueue.filter(
      (m) => !(m.collectionId === collectionId && m.docId === docId)
    );
    await persistQueue();
    return;
  }

  try {
    await databases.deleteDocument(DATABASE_ID, collectionId, docId);
    removeFromCache(collectionId, docId);
    await persistCollection(collectionId);
  } catch (e: any) {
    if (!isNetworkOrUnavailableError(e)) throw e;

    removeFromCache(collectionId, docId);
    await persistCollection(collectionId);
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
 * Upload a visit photo.
 *
 * Online-first: attempts to upload the file to storage and create the
 * corresponding photo document immediately. On success the server document is
 * cached locally. When offline, a local placeholder (using the local file URI)
 * is stored so the photo remains visible and the upload is queued for later.
 */
export async function enqueuePhotoUpload(meta: PendingMutation["photoMeta"]): Promise<void> {
  if (!meta) return;

  try {
    const uploaded = await storage.createFile(meta.bucketId, ID.unique(20), {
      name: meta.fileName,
      type: meta.mimeType,
      size: meta.fileSize,
      uri: meta.localUri,
    });
    const fileUrl = storage.getFileView(meta.bucketId, uploaded.$id).toString();
    const created = await createServerDocument(VISIT_PHOTOS_COLLECTION_ID, {
      visitId: meta.visitId,
      url: fileUrl,
      caption: meta.caption || undefined,
    });
    upsertIntoCache(VISIT_PHOTOS_COLLECTION_ID, created);
    await persistCollection(VISIT_PHOTOS_COLLECTION_ID);
    return;
  } catch (e: any) {
    if (!isNetworkOrUnavailableError(e)) throw e;
  }

  // Offline / unavailable — store a local placeholder and queue the upload.
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

          const created = await createServerDocument(mutation.collectionId, serverData!);
          // Map old local ID → new server ID
          idMap[mutation.docId] = created.$id;

          // Replace the local placeholder with the canonical server document
          removeFromCache(mutation.collectionId, mutation.docId);
          upsertIntoCache(mutation.collectionId, created);
          await persistCollection(mutation.collectionId);
          break;
        }
        case "update": {
          // Skip if the document was a local-only doc that got a new server ID
          const resolvedId = idMap[mutation.docId] || mutation.docId;
          if (resolvedId.startsWith("local_")) {
            // Can't update a doc that doesn't exist on server yet; skip
            continue;
          }
          const updated = await databases.updateDocument(
            DATABASE_ID,
            mutation.collectionId,
            resolvedId,
            mutation.data!
          );
          // Keep local cache in sync with the server response
          upsertIntoCache(mutation.collectionId, updated);
          await persistCollection(mutation.collectionId);
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
          removeFromCache(mutation.collectionId, resolvedId);
          await persistCollection(mutation.collectionId);
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
  const uploaded = await storage.createFile(meta.bucketId, ID.unique(20), {
    name: meta.fileName,
    type: meta.mimeType,
    size: meta.fileSize,
    uri: meta.localUri,
  });

  const fileUrl = storage.getFileView(meta.bucketId, uploaded.$id).toString();

  // Create photo document
  const created = await createServerDocument(VISIT_PHOTOS_COLLECTION_ID, {
    visitId: resolvedVisitId,
    url: fileUrl,
    caption: meta.caption || undefined,
  });

  // Replace the local placeholder with the synced server document
  removeFromCache(VISIT_PHOTOS_COLLECTION_ID, mutation.docId);
  upsertIntoCache(VISIT_PHOTOS_COLLECTION_ID, created);
  await persistCollection(VISIT_PHOTOS_COLLECTION_ID);
}

/**
 * Pull data from Appwrite and merge it into the local cache.
 *
 * Delta sync: when a last-sync timestamp exists, only documents modified
 * (`$updatedAt`) since that point are fetched, keeping the sync idempotent —
 * unchanged records are not re-fetched and the upsert-by-`$id` merge guarantees
 * no duplicate entries on repeated sync attempts. On the very first sync (no
 * last-sync time) a full pull is performed and stale server documents that no
 * longer exist remotely are reconciled away (delete detection). Local-only
 * pending documents are always preserved.
 */
async function pullAllCollections(): Promise<void> {
  for (const collectionId of SYNCABLE_COLLECTIONS) {
    try {
      const isDelta = !!lastSyncTime;
      const queries: any[] = [Query.limit(1000), Query.orderDesc("$createdAt")];
      if (isDelta) {
        queries.push(Query.greaterThan("$updatedAt", lastSyncTime!));
      }
      const res = await databases.listDocuments(DATABASE_ID, collectionId, queries);
      const serverDocs = res.documents as any[];

      if (isDelta && serverDocs.length === 0) continue;

      // Full pull: reconcile deletes — drop any server-id docs absent from the
      // server response while keeping local-only pending docs.
      if (!isDelta) {
        const serverIds = new Set(serverDocs.map((d: any) => d.$id));
        const existing = cache[collectionId] || [];
        cache[collectionId] = existing.filter(
          (d: any) => d.$id.startsWith("local_") || serverIds.has(d.$id)
        );
      }

      // Idempotent upsert: update existing entries or add new ones by $id.
      for (const doc of serverDocs) {
        upsertIntoCache(collectionId, doc);
      }
      await persistCollection(collectionId);
    } catch (e) {
      console.warn(`[SyncManager] Pull failed for ${collectionId}:`, e);
      // Keep existing local data on failure — offline resilience
    }
  }
}

/**
 * Sync inventory_items and inventory_batches on-demand.
 * Called from product screens — does NOT block the main syncNow cycle.
 */
export async function syncInventoryCollections(): Promise<void> {
  for (const collectionId of INVENTORY_COLLECTIONS) {
    try {
      const res = await databases.listDocuments(DATABASE_ID, collectionId, [
        Query.limit(5000),
        Query.orderDesc("$createdAt"),
      ]);
      cache[collectionId] = res.documents as any[];
      await persistCollection(collectionId);
    } catch (e) {
      console.warn(`[SyncManager] Inventory pull failed for ${collectionId}:`, e);
      // Non-fatal — keep cached data
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
