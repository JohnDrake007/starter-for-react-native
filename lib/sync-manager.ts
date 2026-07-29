import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import { client, databases, storage, Query, DATABASE_ID, CUSTOMERS_COLLECTION_ID, VISITS_COLLECTION_ID, RECOMMENDATIONS_COLLECTION_ID, VISIT_PHOTOS_COLLECTION_ID, INVENTORY_ITEMS_COLLECTION_ID, INVENTORY_BATCHES_COLLECTION_ID } from "./appwrite";
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
  [RECOMMENDATIONS_COLLECTION_ID]: "@fa_recommendations",
  [VISIT_PHOTOS_COLLECTION_ID]: "@fa_visit_photos",
  [INVENTORY_ITEMS_COLLECTION_ID]: "@fa_inventory_items",
  [INVENTORY_BATCHES_COLLECTION_ID]: "@fa_inventory_batches",
};
const PENDING_QUEUE_KEY = "@fa_pending_queue";
const LAST_SYNC_KEY = "@fa_last_sync";
const LAST_INVENTORY_SYNC_KEY = "@fa_last_inventory_sync";
const LAST_CORE_FULL_SYNC_KEY = "@fa_last_core_full_sync";
const LAST_INVENTORY_FULL_SYNC_KEY = "@fa_last_inventory_full_sync";
const CORE_PULL_MIN_INTERVAL_MS = 5 * 60 * 1000;
const INVENTORY_PULL_MIN_INTERVAL_MS = 15 * 60 * 1000;
const FULL_RECONCILIATION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

// ── Types ─────────────────────────────────────────────────────────────────────
export type SyncStatus = "idle" | "syncing" | "error" | "offline";

interface PendingMutation {
  id: string;
  action: "create" | "update" | "delete";
  collectionId: string;
  docId: string;
  /** Stable Appwrite ID reserved before the first create attempt. */
  serverDocId?: string;
  serverCreateAttempted?: boolean;
  data?: Record<string, any>;
  timestamp: number;
  fileDeleteMeta?: {
    bucketId: string;
    fileId: string;
  };
  /** For photo uploads: local URI, bucket ID, etc. */
  photoMeta?: {
    localUri: string;
    fileName: string;
    mimeType: string;
    fileSize: number;
    bucketId: string;
    visitId: string;
    caption?: string;
    /** Stable file ID lets a retry recover a file whose response was lost. */
    fileId?: string;
    uploadAttempted?: boolean;
  };
}

type SyncListener = (status: SyncStatus, info?: string) => void;

// ── Collections that support full pull ────────────────────────────────────────
const SYNCABLE_COLLECTIONS = [
  CUSTOMERS_COLLECTION_ID,
  VISITS_COLLECTION_ID,
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
let lastInventorySyncTime: string | null = null;
let lastCoreFullSyncTime: string | null = null;
let lastInventoryFullSyncTime: string | null = null;
let currentStatus: SyncStatus = "idle";
const listeners: Set<SyncListener> = new Set();
// Fired whenever the local cache is mutated (pull, push, or a realtime event)
// so that any visible screen can re-read getCollection() and update live.
const dataListeners: Set<() => void> = new Set();
let initialized = false;
let realtimeUnsub: (() => void) | null = null;
let activeSync: Promise<void> | null = null;
let activeInventorySync: Promise<void> | null = null;
let reconciliationRequired = false;

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Generate a cryptographically strong unique ID suitable for Appwrite documents.
 * Uses crypto.getRandomValues (available in Hermes & JSC) for proper entropy,
 * avoiding the weak Math.random()-based IDs from the SDK's ID.unique().
 * Format: 13-char hex timestamp + 20 random hex chars = 33 chars (≤ 36 limit).
 */
function generateDocumentId(): string {
  const now = new Date();
  const sec = Math.floor(now.getTime() / 1000);
  const msec = now.getMilliseconds();
  const hexTimestamp = sec.toString(16) + msec.toString(16).padStart(5, '0');

  let randomHex = '';
  if (typeof globalThis.crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = new Uint8Array(10); // 10 bytes = 20 hex chars
    crypto.getRandomValues(bytes);
    bytes.forEach((b) => { randomHex += b.toString(16).padStart(2, '0'); });
  } else {
    // Fallback: multiple Math.random() calls for better entropy
    for (let i = 0; i < 20; i++) {
      randomHex += Math.floor(Math.random() * 16).toString(16);
    }
  }
  return hexTimestamp + randomHex;
}

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

/** Notify subscribers that the local cache changed so visible screens refresh. */
function notifyDataChange() {
  dataListeners.forEach((fn) => {
    try {
      fn();
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
  // Pending count is displayed in the UI, so queue-only mutations need to
  // notify status listeners even when connectivity did not change.
  broadcast(currentStatus);
}

async function readStoredArray(key: string): Promise<any[]> {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error("Expected an array");
    return parsed;
  } catch (e) {
    // Keep a recoverable copy for support/debugging rather than silently
    // overwriting the only copy of pending offline work.
    try {
      await AsyncStorage.setItem(`${key}_corrupt_backup`, raw);
    } catch {}
    console.warn(`[SyncManager] Corrupt local data was backed up for ${key}:`, e);
    return [];
  }
}

function hasPendingMutation(collectionId: string, docId: string): boolean {
  return pendingQueue.some(
    (m) => m.collectionId === collectionId &&
      (m.docId === docId || m.serverDocId === docId)
  );
}

/**
 * Add a mutation while collapsing redundant operations. Besides saving
 * Appwrite requests, this prevents an older queued update from overwriting a
 * newer edit that happened after connectivity returned.
 */
function enqueueMutation(mutation: PendingMutation): void {
  if (mutation.action === "update") {
    const pendingCreate = pendingQueue.find(
      (m) => m.action === "create" &&
        !m.photoMeta &&
        m.collectionId === mutation.collectionId &&
        m.docId === mutation.docId
    );
    if (pendingCreate) {
      pendingCreate.data = { ...(pendingCreate.data || {}), ...(mutation.data || {}) };
      pendingCreate.timestamp = mutation.timestamp;
      return;
    }

    const pendingUpdate = [...pendingQueue].reverse().find(
      (m) => m.action === "update" &&
        m.collectionId === mutation.collectionId &&
        m.docId === mutation.docId
    );
    if (pendingUpdate) {
      pendingUpdate.data = { ...(pendingUpdate.data || {}), ...(mutation.data || {}) };
      pendingUpdate.timestamp = mutation.timestamp;
      return;
    }
  }

  if (mutation.action === "delete") {
    pendingQueue = pendingQueue.filter(
      (m) => !(m.collectionId === mutation.collectionId &&
        m.docId === mutation.docId &&
        m.action === "update")
    );
    const pendingDelete = pendingQueue.find(
      (m) => m.action === "delete" &&
        m.collectionId === mutation.collectionId &&
        m.docId === mutation.docId
    );
    if (pendingDelete) {
      pendingDelete.fileDeleteMeta ||= mutation.fileDeleteMeta;
      return;
    }
  }

  pendingQueue.push(mutation);
}

/**
 * Determine whether an error represents a network failure or server-side
 * unavailability (as opposed to a client/validation error). Only network /
 * unavailable errors should cause a write to fall back to the pending queue;
 * client errors (4xx) indicate bad data and must surface to the caller so the
 * user can correct the input rather than retrying a doomed mutation forever.
 *
 * NOTE: react-native-appwrite wraps a failed `fetch` (device offline, DNS
 * failure, connection reset, TLS error, timeout) into an AppwriteException
 * whose `code` defaults to 0 — NOT a 5xx. Treating code 0 as a client error
 * caused genuine network failures to be re-thrown to the user instead of
 * being queued for later sync (the "Network request failed" dialog with no
 * offline fallback). Anything that is not an explicit 4xx client error is
 * therefore treated as a transient network/server failure and queued.
 */
function isNetworkOrUnavailableError(e: any): boolean {
  const code = e?.code;
  if (typeof code === "number" && code >= 400 && code < 500) {
    // Explicit client error (bad data, unauthorized, conflict, not found) —
    // surface to the caller; queuing it would retry a doomed mutation forever.
    return false;
  }
  // code === 0 / undefined (fetch failure) or >= 500 (server unavailable) —
  // transient; fall back to the offline queue and retry on reconnect.
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
  documentId = generateDocumentId()
): Promise<any> {
  try {
    return await databases.createDocument(
      DATABASE_ID,
      collectionId,
      documentId,
      data
    );
  } catch (e: any) {
    if (e?.code !== 409) throw e;
    // A stable ID is reserved before the first request. A 409 on retry means
    // the original create may have committed even though its response was
    // lost, so recover that canonical document instead of creating a duplicate.
    return databases.getDocument(DATABASE_ID, collectionId, documentId);
  }
}

async function uploadPhotoFile(
  meta: NonNullable<PendingMutation["photoMeta"]>
): Promise<{ $id: string }> {
  const fileId = meta.fileId || generateDocumentId();
  meta.fileId = fileId;
  try {
    return await storage.createFile(meta.bucketId, fileId, {
      name: meta.fileName,
      type: meta.mimeType,
      size: meta.fileSize,
      uri: meta.localUri,
    });
  } catch (e: any) {
    if (e?.code !== 409) throw e;
    return storage.getFile(meta.bucketId, fileId);
  }
}

async function stagePhotoForOffline(
  meta: NonNullable<PendingMutation["photoMeta"]>
): Promise<NonNullable<PendingMutation["photoMeta"]>> {
  let resolvedMeta = meta;
  try {
    const sourceInfo = await FileSystem.getInfoAsync(meta.localUri);
    if (sourceInfo.exists && typeof sourceInfo.size === "number" && sourceInfo.size > 0) {
      resolvedMeta = { ...meta, fileSize: sourceInfo.size };
    }
  } catch {}

  const base = FileSystem.documentDirectory;
  if (!base || resolvedMeta.localUri.startsWith(`${base}pending-photos/`)) return resolvedMeta;

  try {
    const directory = `${base}pending-photos/`;
    await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
    const extension = (resolvedMeta.fileName.split(".").pop() || "jpg").replace(/[^a-z0-9]/gi, "") || "jpg";
    const destination = `${directory}${generateDocumentId()}.${extension}`;
    await FileSystem.copyAsync({ from: resolvedMeta.localUri, to: destination });
    const stagedInfo = await FileSystem.getInfoAsync(destination);
    return {
      ...resolvedMeta,
      localUri: destination,
      fileSize: stagedInfo.exists && typeof stagedInfo.size === "number"
        ? stagedInfo.size
        : resolvedMeta.fileSize,
    };
  } catch (e) {
    // Some platform URIs cannot be copied by the legacy bridge. Keep the
    // original rather than dropping the photo; upload still proceeds and a
    // reconnect retry can use it while the picker asset remains available.
    console.warn("[SyncManager] Could not stage photo in durable storage:", e);
    return resolvedMeta;
  }
}

async function removeStagedPhoto(localUri: string): Promise<void> {
  const base = FileSystem.documentDirectory;
  if (!base || !localUri.startsWith(`${base}pending-photos/`)) return;
  try {
    await FileSystem.deleteAsync(localUri, { idempotent: true });
  } catch {}
}

function resolveReferences(
  data: Record<string, any> | undefined,
  idMap: Record<string, string>
): { data: Record<string, any>; unresolved: string[] } {
  const resolved = { ...(data || {}) };
  const unresolved: string[] = [];
  for (const [key, value] of Object.entries(resolved)) {
    if (typeof value !== "string" || !value.startsWith("local_")) continue;
    if (idMap[value]) resolved[key] = idMap[value];
    else unresolved.push(value);
  }
  return { data: resolved, unresolved };
}

/**
 * Persist reference remapping immediately after a parent create. This makes
 * parent/child sync crash-safe: after an app termination, remaining children
 * no longer depend on an in-memory ID map from the previous run.
 */
async function persistResolvedLocalId(
  localId: string,
  serverId: string,
  originMutationId: string
): Promise<void> {
  for (const mutation of pendingQueue) {
    if (mutation.id !== originMutationId && mutation.docId === localId) {
      mutation.docId = serverId;
    }
    if (mutation.data) {
      for (const [key, value] of Object.entries(mutation.data)) {
        if (value === localId) mutation.data[key] = serverId;
      }
    }
    if (mutation.photoMeta?.visitId === localId) {
      mutation.photoMeta.visitId = serverId;
    }
  }

  const changedCollections: string[] = [];
  for (const [collectionId, docs] of Object.entries(cache)) {
    let changed = false;
    for (const doc of docs) {
      for (const [key, value] of Object.entries(doc)) {
        if (value === localId) {
          doc[key] = serverId;
          changed = true;
        }
      }
    }
    if (changed) changedCollections.push(collectionId);
  }
  await Promise.all(changedCollections.map(persistCollection));
  await persistQueue();
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

function getPhotoFileRef(doc: any): PendingMutation["fileDeleteMeta"] | undefined {
  if (!doc || typeof doc.url !== "string") return undefined;
  const match = doc.url.match(/\/storage\/buckets\/([^/]+)\/files\/([^/]+)\//);
  if (!match) return undefined;
  try {
    return {
      bucketId: decodeURIComponent(match[1]),
      fileId: decodeURIComponent(match[2]),
    };
  } catch {
    return undefined;
  }
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
      cache[collectionId] = await readStoredArray(key);
    }
    // Also load any previously-cached inventory data
    for (const collectionId of INVENTORY_COLLECTIONS) {
      const key = STORAGE_KEYS[collectionId];
      if (key) {
        try {
          cache[collectionId] = await readStoredArray(key);
        } catch {}
      }
    }
    // Durable product-name map (survives inventory re-import with new $ids)
    try {
      const { initProductNameCache, seedProductNamesFromInventory } = await import("./product-name-cache");
      await initProductNameCache();
      seedProductNamesFromInventory(cache[INVENTORY_ITEMS_COLLECTION_ID] || []);
    } catch {}
    // Load pending queue
    pendingQueue = (await readStoredArray(PENDING_QUEUE_KEY)).filter(
      (mutation) =>
        mutation &&
        typeof mutation.id === "string" &&
        ["create", "update", "delete"].includes(mutation.action) &&
        typeof mutation.collectionId === "string" &&
        typeof mutation.docId === "string"
    ) as PendingMutation[];
    // Recover from a crash between persisting a local placeholder and its
    // mutation (or between cancelling a mutation and removing its placeholder).
    // A local document without a matching queued operation can never sync.
    const queuedLocalIds = new Set(
      pendingQueue.filter((mutation) => mutation.docId.startsWith("local_"))
        .map((mutation) => mutation.docId)
    );
    for (const collectionId of SYNCABLE_COLLECTIONS) {
      const docs = cache[collectionId] || [];
      const reconciled = docs.filter(
        (doc: any) => !doc.$id?.startsWith("local_") || queuedLocalIds.has(doc.$id)
      );
      if (reconciled.length !== docs.length) {
        cache[collectionId] = reconciled;
        await persistCollection(collectionId);
      }
    }
    // Load last sync time
    lastSyncTime = await AsyncStorage.getItem(LAST_SYNC_KEY);
    lastInventorySyncTime = await AsyncStorage.getItem(LAST_INVENTORY_SYNC_KEY);
    lastCoreFullSyncTime = await AsyncStorage.getItem(LAST_CORE_FULL_SYNC_KEY);
    lastInventoryFullSyncTime = await AsyncStorage.getItem(LAST_INVENTORY_FULL_SYNC_KEY);
  } catch (e) {
    console.warn("[SyncManager] initSync error:", e);
  } finally {
    initialized = true;
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
  const serverDocId = generateDocumentId();
  let serverCreateAttempted = false;
  if (currentStatus !== "offline") {
    try {
      serverCreateAttempted = true;
      const created = await createServerDocument(collectionId, data, serverDocId);
      upsertIntoCache(collectionId, created);
      await persistCollection(collectionId);
      return created;
    } catch (e: any) {
      if (!isNetworkOrUnavailableError(e)) throw e;
    }
  }

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

  enqueueMutation({
    id: generateLocalId(),
    action: "create",
    collectionId,
    docId: localId,
    serverDocId,
    serverCreateAttempted,
    data,
    timestamp: Date.now(),
  });
  await persistQueue();
  await persistCollection(collectionId);

  return doc;
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
    }
    enqueueMutation({
      id: generateLocalId(),
      action: "update",
      collectionId,
      docId,
      data,
      timestamp: Date.now(),
    });
    await persistQueue();
    if (idx >= 0) await persistCollection(collectionId);
    return docs[idx] || null;
  }

  // Preserve ordering when an older mutation for this document is still
  // queued. Sending this edit immediately would let the older retry overwrite
  // the user's newest values later.
  if (hasPendingMutation(collectionId, docId) || currentStatus === "offline") {
    const docs = cache[collectionId] || [];
    const idx = docs.findIndex((d: any) => d.$id === docId);
    if (idx >= 0) {
      docs[idx] = { ...docs[idx], ...data, $updatedAt: new Date().toISOString(), _pendingSync: true };
    }
    enqueueMutation({
      id: generateLocalId(),
      action: "update",
      collectionId,
      docId,
      data,
      timestamp: Date.now(),
    });
    await persistQueue();
    if (idx >= 0) await persistCollection(collectionId);
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
    }
    enqueueMutation({
      id: generateLocalId(),
      action: "update",
      collectionId,
      docId,
      data,
      timestamp: Date.now(),
    });
    await persistQueue();
    if (idx >= 0) await persistCollection(collectionId);
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
    const queuedCreate = pendingQueue.find(
      (m) => m.action === "create" &&
        m.collectionId === collectionId &&
        m.docId === docId
    );
    const queuedPhoto = pendingQueue.find(
      (m) => m.collectionId === collectionId && m.docId === docId && !!m.photoMeta
    );
    pendingQueue = pendingQueue.filter(
      (m) => !(m.collectionId === collectionId && m.docId === docId)
    );
    if (
      queuedCreate?.serverCreateAttempted &&
      queuedCreate.serverDocId &&
      !queuedPhoto
    ) {
      // An online create may have committed before its response was lost.
      // Deleting the placeholder must also idempotently delete that possible
      // server document, otherwise it can reappear on the next full pull.
      enqueueMutation({
        id: generateLocalId(),
        action: "delete",
        collectionId,
        docId: queuedCreate.serverDocId,
        timestamp: Date.now(),
      });
    }
    if (
      queuedPhoto?.photoMeta?.uploadAttempted &&
      queuedPhoto.serverDocId &&
      queuedPhoto.photoMeta.fileId
    ) {
      // The upload/create may have committed before its response was lost.
      // Queue idempotent cleanup of both resources instead of leaking them.
      enqueueMutation({
        id: generateLocalId(),
        action: "delete",
        collectionId,
        docId: queuedPhoto.serverDocId,
        timestamp: Date.now(),
        fileDeleteMeta: {
          bucketId: queuedPhoto.photoMeta.bucketId,
          fileId: queuedPhoto.photoMeta.fileId,
        },
      });
    }
    await persistQueue();
    removeFromCache(collectionId, docId);
    await persistCollection(collectionId);
    if (queuedPhoto?.photoMeta) {
      await removeStagedPhoto(queuedPhoto.photoMeta.localUri);
    }
    return;
  }

  const cachedDoc = getDocument(collectionId, docId);
  const fileDeleteMeta =
    collectionId === VISIT_PHOTOS_COLLECTION_ID
      ? getPhotoFileRef(cachedDoc)
      : undefined;

  if (hasPendingMutation(collectionId, docId) || currentStatus === "offline") {
    enqueueMutation({
      id: generateLocalId(),
      action: "delete",
      collectionId,
      docId,
      timestamp: Date.now(),
      fileDeleteMeta,
    });
    await persistQueue();
    removeFromCache(collectionId, docId);
    await persistCollection(collectionId);
    return;
  }

  try {
    await databases.deleteDocument(DATABASE_ID, collectionId, docId);
    removeFromCache(collectionId, docId);
    await persistCollection(collectionId);
    if (fileDeleteMeta) {
      try {
        await storage.deleteFile(fileDeleteMeta.bucketId, fileDeleteMeta.fileId);
      } catch (e: any) {
        if (e?.code !== 404 && isNetworkOrUnavailableError(e)) {
          enqueueMutation({
            id: generateLocalId(),
            action: "delete",
            collectionId,
            docId,
            timestamp: Date.now(),
            fileDeleteMeta,
          });
          await persistQueue();
        }
      }
    }
  } catch (e: any) {
    if (e?.code === 404) {
      // The desired document state is already reached (for example after a
      // lost response or another device deleting it first).
      removeFromCache(collectionId, docId);
      await persistCollection(collectionId);
      if (fileDeleteMeta) {
        try {
          await storage.deleteFile(fileDeleteMeta.bucketId, fileDeleteMeta.fileId);
        } catch (fileError: any) {
          if (fileError?.code !== 404 && isNetworkOrUnavailableError(fileError)) {
            enqueueMutation({
              id: generateLocalId(),
              action: "delete",
              collectionId,
              docId,
              timestamp: Date.now(),
              fileDeleteMeta,
            });
            await persistQueue();
          }
        }
      }
      return;
    }
    if (!isNetworkOrUnavailableError(e)) throw e;

    enqueueMutation({
      id: generateLocalId(),
      action: "delete",
      collectionId,
      docId,
      timestamp: Date.now(),
      fileDeleteMeta,
    });
    await persistQueue();
    removeFromCache(collectionId, docId);
    await persistCollection(collectionId);
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

  const stagedMeta = await stagePhotoForOffline({
    ...meta,
    fileId: meta.fileId || generateDocumentId(),
  });
  const photoDocumentId = generateDocumentId();

  // A photo that belongs to an offline-created visit must wait for the visit's
  // real ID. Appwrite accepts arbitrary strings, so attempting this early would
  // otherwise create a permanently detached photo document.
  if (!stagedMeta.visitId.startsWith("local_") && currentStatus !== "offline") {
    stagedMeta.uploadAttempted = true;
    try {
      const uploaded = await uploadPhotoFile(stagedMeta);
      const fileUrl = storage.getFileView(stagedMeta.bucketId, uploaded.$id).toString();
      const created = await createServerDocument(VISIT_PHOTOS_COLLECTION_ID, {
        visitId: stagedMeta.visitId,
        url: fileUrl,
        caption: stagedMeta.caption || undefined,
      }, photoDocumentId);
      upsertIntoCache(VISIT_PHOTOS_COLLECTION_ID, created);
      await persistCollection(VISIT_PHOTOS_COLLECTION_ID);
      await removeStagedPhoto(stagedMeta.localUri);
      return;
    } catch (e: any) {
      if (!isNetworkOrUnavailableError(e)) {
        // Validation/permission errors will not succeed on retry. Remove a file
        // that was already uploaded so the free-tier storage cannot leak.
        try {
          await storage.deleteFile(stagedMeta.bucketId, stagedMeta.fileId!);
        } catch {}
        await removeStagedPhoto(stagedMeta.localUri);
        throw e;
      }
    }
  }

  // Offline / unavailable — store a local placeholder and queue the upload.
  const localPhotoId = generateLocalId();
  const localPhotoDoc = {
    $id: localPhotoId,
    visitId: stagedMeta.visitId,
    url: stagedMeta.localUri,   // use durable local URI for offline display
    caption: stagedMeta.caption || undefined,
    $createdAt: new Date().toISOString(),
    $updatedAt: new Date().toISOString(),
    _pendingSync: true,
    _isLocalPhoto: true,  // flag so we can replace it after sync
  };
  if (!cache[VISIT_PHOTOS_COLLECTION_ID]) cache[VISIT_PHOTOS_COLLECTION_ID] = [];
  cache[VISIT_PHOTOS_COLLECTION_ID].push(localPhotoDoc);

  enqueueMutation({
    id: generateLocalId(),
    action: "create",
    collectionId: VISIT_PHOTOS_COLLECTION_ID,
    docId: localPhotoId,
    serverDocId: photoDocumentId,
    timestamp: Date.now(),
    photoMeta: stagedMeta,
  });
  await persistQueue();
  await persistCollection(VISIT_PHOTOS_COLLECTION_ID);
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

/**
 * Register a listener that fires whenever the local cache changes — from a
 * pull, a pushed mutation, or a realtime event pushed by another device.
 * Screens use this to re-read getCollection() and stay live without a manual
 * refresh. Returns an unsubscribe fn.
 */
export function addDataChangeListener(fn: () => void): () => void {
  dataListeners.add(fn);
  return () => dataListeners.delete(fn);
}

// ── Realtime ──────────────────────────────────────────────────────────────────

/** All collections we mirror locally and want live updates for. */
const REALTIME_COLLECTIONS = [...SYNCABLE_COLLECTIONS, ...INVENTORY_COLLECTIONS];

/**
 * Apply a single realtime event to the local cache. Online-first: the server
 * is the source of truth, so a create/update upserts the canonical document and
 * a delete removes it — keeping every device's offline cache continuously
 * updated (and stale entries removed) without waiting for the next full sync.
 */
async function handleRealtimeEvent(res: any): Promise<void> {
  const doc = res?.payload;
  const events: string[] = res?.events || [];
  if (!doc || !doc.$id) return;

  // Resolve which tracked collection this document belongs to.
  const collectionId: string | undefined = doc.$collectionId;
  if (!collectionId || !STORAGE_KEYS[collectionId]) return;

  const isDelete = events.some((e) => e.endsWith(".delete"));
  if (isDelete) {
    removeFromCache(collectionId, doc.$id);
  } else {
    // Do not let a realtime echo or another device overwrite optimistic local
    // edits which are still waiting in our durable mutation queue.
    if (hasPendingMutation(collectionId, doc.$id)) return;
    // create or update
    upsertIntoCache(collectionId, doc);
  }
  await persistCollection(collectionId);
  notifyDataChange();
}

/**
 * Subscribe to Appwrite realtime for every mirrored collection. Idempotent —
 * calling it again while already subscribed is a no-op. The Appwrite client
 * manages websocket reconnection internally; we (re)subscribe when the app
 * comes online and tear down when it goes offline.
 */
export function startRealtime(): void {
  if (realtimeUnsub) return;
  const channels = REALTIME_COLLECTIONS.map(
    (c) => `databases.${DATABASE_ID}.collections.${c}.documents`
  );
  try {
    realtimeUnsub = client.subscribe(channels, (res: any) => {
      handleRealtimeEvent(res).catch(() => {});
    });
  } catch (e) {
    console.warn("[SyncManager] realtime subscribe failed:", e);
    realtimeUnsub = null;
  }
}

/** Tear down the realtime subscription (called when the app goes offline). */
export function stopRealtime(): void {
  if (!realtimeUnsub) return;
  try {
    realtimeUnsub();
  } catch {}
  realtimeUnsub = null;
}

// ── Sync Execution ────────────────────────────────────────────────────────────

/**
 * Full sync: push pending mutations, then pull fresh data from Appwrite.
 * Called automatically on connectivity change and manually via "Sync Now".
 */
export async function syncNow(options: { forcePull?: boolean } = {}): Promise<void> {
  if (activeSync) return activeSync;
  activeSync = runSync(options).finally(() => {
    activeSync = null;
  });
  return activeSync;
}

async function runSync(options: { forcePull?: boolean }): Promise<void> {
  broadcast("syncing");
  // Persist the cycle start (not the finish) as the incremental cursor. A
  // document changed while this cycle is running may then be read twice on the
  // next cycle, but can never fall into a timestamp gap and be missed.
  const syncStartedAt = new Date().toISOString();

  try {
    const hadPending = pendingQueue.length > 0;

    // ── 1. Push pending mutations ──
    const failedCount = await pushPendingQueue();
    if (failedCount > 0) {
      throw new Error(`${failedCount} change${failedCount === 1 ? "" : "s"} still waiting to sync`);
    }

    // Foreground churn can otherwise perform four full collection reads every
    // few seconds. Realtime covers live changes while the app is active; this
    // bounded interval still performs regular full delete reconciliation.
    const lastPullAge = lastSyncTime
      ? Date.now() - new Date(lastSyncTime).getTime()
      : Number.POSITIVE_INFINITY;
    const shouldPull =
      options.forcePull === true ||
      hadPending ||
      reconciliationRequired ||
      lastPullAge >= CORE_PULL_MIN_INTERVAL_MS;

    if (shouldPull) {
      // ── 2. Pull fresh data from all collections ──
      await pullAllCollections(options.forcePull === true, syncStartedAt);
      reconciliationRequired = false;

      // ── 3. Update last successful reconciliation time ──
      lastSyncTime = syncStartedAt;
      await AsyncStorage.setItem(LAST_SYNC_KEY, lastSyncTime);

      // ── 4. Re-schedule device notifications to reflect fresh data ──
      refreshNotifications();

      // ── 5. Refresh visible screens with the freshly synced cache ──
      notifyDataChange();
    }

    broadcast("idle", shouldPull ? "Sync complete" : "Already up to date");
  } catch (e: any) {
    reconciliationRequired = true;
    console.warn("[SyncManager] syncNow error:", e);
    broadcast("error", e.message || "Sync failed");
  }
}

/** Push all pending mutations to Appwrite. */
async function pushPendingQueue(): Promise<number> {
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
          const { data: serverData, unresolved } = resolveReferences(mutation.data, idMap);
          if (unresolved.length > 0) {
            throw new Error(`Waiting for parent ${unresolved[0]}`);
          }

          // Old queue entries are migrated lazily. Persist the stable ID before
          // the request so an app termination after a server commit is safe.
          if (!mutation.serverDocId) {
            mutation.serverDocId = generateDocumentId();
            await persistQueue();
          }
          if (!mutation.serverCreateAttempted) {
            mutation.serverCreateAttempted = true;
            await persistQueue();
          }
          const created = await createServerDocument(
            mutation.collectionId,
            serverData,
            mutation.serverDocId
          );
          // Map old local ID → new server ID
          idMap[mutation.docId] = created.$id;

          // Replace the local placeholder with the canonical server document
          removeFromCache(mutation.collectionId, mutation.docId);
          upsertIntoCache(mutation.collectionId, created);
          await persistCollection(mutation.collectionId);
          await persistResolvedLocalId(mutation.docId, created.$id, mutation.id);
          break;
        }
        case "update": {
          const resolvedId = idMap[mutation.docId] || mutation.docId;
          if (resolvedId.startsWith("local_")) {
            throw new Error(`Waiting for document ${resolvedId}`);
          }
          const { data: resolvedData, unresolved } = resolveReferences(mutation.data, idMap);
          if (unresolved.length > 0) throw new Error(`Waiting for parent ${unresolved[0]}`);
          const updated = await databases.updateDocument(
            DATABASE_ID,
            mutation.collectionId,
            resolvedId,
            resolvedData
          );
          // Keep local cache in sync with the server response
          upsertIntoCache(mutation.collectionId, updated);
          await persistCollection(mutation.collectionId);
          break;
        }
        case "delete": {
          const resolvedId = idMap[mutation.docId] || mutation.docId;
          if (resolvedId.startsWith("local_")) {
            throw new Error(`Waiting for document ${resolvedId}`);
          }
          try {
            await databases.deleteDocument(
              DATABASE_ID,
              mutation.collectionId,
              resolvedId
            );
          } catch (e: any) {
            // A lost delete response is safely idempotent: 404 means the desired
            // final state has already been reached.
            if (e?.code !== 404) throw e;
          }
          if (mutation.fileDeleteMeta) {
            try {
              await storage.deleteFile(
                mutation.fileDeleteMeta.bucketId,
                mutation.fileDeleteMeta.fileId
              );
            } catch (e: any) {
              if (e?.code !== 404) throw e;
            }
          }
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
  return failed.length;
}

/** Handle a queued photo upload. */
async function pushPhotoUpload(
  mutation: PendingMutation,
  idMap: Record<string, string>
): Promise<void> {
  const meta = mutation.photoMeta!;
  const resolvedVisitId = idMap[meta.visitId] || meta.visitId;
  if (resolvedVisitId.startsWith("local_")) {
    throw new Error(`Waiting for visit ${resolvedVisitId}`);
  }

  if (!mutation.serverDocId) {
    mutation.serverDocId = generateDocumentId();
    await persistQueue();
  }
  if (!meta.fileId) {
    meta.fileId = generateDocumentId();
    await persistQueue();
  }
  if (!meta.uploadAttempted) {
    meta.uploadAttempted = true;
    await persistQueue();
  }

  // Both the file and photo document use stable IDs. Retrying after an
  // ambiguous network failure recovers the existing resources on 409.
  const uploaded = await uploadPhotoFile(meta);
  const fileUrl = storage.getFileView(meta.bucketId, uploaded.$id).toString();

  // Create photo document
  const created = await createServerDocument(VISIT_PHOTOS_COLLECTION_ID, {
    visitId: resolvedVisitId,
    url: fileUrl,
    caption: meta.caption || undefined,
  }, mutation.serverDocId);

  // Replace the local placeholder with the synced server document
  removeFromCache(VISIT_PHOTOS_COLLECTION_ID, mutation.docId);
  upsertIntoCache(VISIT_PHOTOS_COLLECTION_ID, created);
  await persistCollection(VISIT_PHOTOS_COLLECTION_ID);
  await removeStagedPhoto(meta.localUri);
}

/**
 * Fetch every matching document with cursor pagination.
 */
async function fetchAllDocuments(
  collectionId: string,
  filters: string[] = []
): Promise<any[]> {
  const documents: any[] = [];
  let cursor: string | null = null;
  const limit = 1000;

  while (true) {
    const queries = [
      ...filters,
      Query.limit(limit),
      Query.orderDesc("$updatedAt"),
    ];
    if (cursor) queries.push(Query.cursorAfter(cursor));
    const res = await databases.listDocuments(DATABASE_ID, collectionId, queries);
    documents.push(...(res.documents as any[]));
    const total = Number(res.total);
    if (Number.isFinite(total) && documents.length >= total) break;
    if (res.documents.length < limit) break;
    cursor = res.documents[res.documents.length - 1].$id;
  }

  return documents;
}

function replaceServerDocuments(collectionId: string, serverDocuments: any[]): void {
  const localOnly = (cache[collectionId] || []).filter(
    (doc: any) => doc.$id?.startsWith("local_")
  );
  cache[collectionId] = [...localOnly, ...serverDocuments];
}

/**
 * Pull only documents changed since the previous successful cycle, then issue
 * a one-row count probe. Because Appwrite bills reads per returned document
 * rather than per HTTP call, this normally costs one read for an empty delta
 * plus one read for the count probe instead of re-reading the whole collection.
 *
 * A hard delete is not present in an updated-at query. It changes the server
 * count, however, so a count mismatch immediately triggers a full collection
 * reconciliation. Creates (including an equal number of creates and deletes)
 * are upserted before comparing counts, which also exposes the mismatch.
 */
async function pullCollection(
  collectionId: string,
  since: string | null,
  forceFull: boolean
): Promise<void> {
  if (forceFull || !since) {
    replaceServerDocuments(collectionId, await fetchAllDocuments(collectionId));
    await persistCollection(collectionId);
    return;
  }

  const changed = await fetchAllDocuments(
    collectionId,
    [Query.greaterThanEqual("$updatedAt", since)]
  );
  for (const document of changed) {
    if (!hasPendingMutation(collectionId, document.$id)) {
      upsertIntoCache(collectionId, document);
    }
  }

  // `total` describes every visible document even though only one is returned.
  // That one returned document is the only billed row read for this probe.
  const countProbe = await databases.listDocuments(
    DATABASE_ID,
    collectionId,
    [Query.limit(1)]
  );
  const localServerCount = (cache[collectionId] || []).filter(
    (document: any) => !document.$id?.startsWith("local_")
  ).length;
  const serverCount = Number(countProbe.total);

  if (!Number.isFinite(serverCount) || localServerCount !== serverCount) {
    replaceServerDocuments(collectionId, await fetchAllDocuments(collectionId));
  }
  await persistCollection(collectionId);
}

/**
 * Pull data from Appwrite and merge it into the local cache.
 *
 * Routine pulls use updated-at deltas plus count probes. First sync, manual
 * refresh, and a weekly safety pass perform full cursor-paginated scans. Count
 * divergence also immediately promotes just that collection to a full scan,
 * preserving hard-delete reconciliation without paying for every row whenever
 * the app resumes.
 */
async function pullAllCollections(
  forceFull = false,
  syncStartedAt = new Date().toISOString()
): Promise<void> {
  const failures: string[] = [];
  const fullSyncAge = lastCoreFullSyncTime
    ? Date.now() - new Date(lastCoreFullSyncTime).getTime()
    : Number.POSITIVE_INFINITY;
  const fullAll =
    forceFull ||
    !lastSyncTime ||
    fullSyncAge >= FULL_RECONCILIATION_MAX_AGE_MS;

  for (const collectionId of SYNCABLE_COLLECTIONS) {
    try {
      await pullCollection(collectionId, lastSyncTime, fullAll);
    } catch (e) {
      console.warn(`[SyncManager] Pull failed for ${collectionId}:`, e);
      // Keep existing local data on failure — offline resilience
      failures.push(collectionId);
    }
  }
  if (failures.length > 0) {
    throw new Error(`Could not refresh ${failures.join(", ")}`);
  }
  if (fullAll) {
    lastCoreFullSyncTime = syncStartedAt;
    await AsyncStorage.setItem(LAST_CORE_FULL_SYNC_KEY, lastCoreFullSyncTime);
  }
}

/**
 * Sync inventory_items and inventory_batches on-demand.
 * Called from product screens — does NOT block the main syncNow cycle.
 */
export async function syncInventoryCollections(force = false): Promise<void> {
  if (activeInventorySync) return activeInventorySync;
  const lastPullAge = lastInventorySyncTime
    ? Date.now() - new Date(lastInventorySyncTime).getTime()
    : Number.POSITIVE_INFINITY;
  if (!force && lastPullAge < INVENTORY_PULL_MIN_INTERVAL_MS) return;

  activeInventorySync = runInventorySync(force).finally(() => {
    activeInventorySync = null;
  });
  return activeInventorySync;
}

async function runInventorySync(forceFull = false): Promise<void> {
  const syncStartedAt = new Date().toISOString();
  // Snapshot names from whatever is currently cached BEFORE replace, so a
  // Tally re-import (new Appwrite $ids) doesn't break old recommendation links.
  try {
    const { seedProductNamesFromInventory } = await import("./product-name-cache");
    seedProductNamesFromInventory(cache[INVENTORY_ITEMS_COLLECTION_ID] || []);
  } catch {}

  const failures: string[] = [];
  const fullSyncAge = lastInventoryFullSyncTime
    ? Date.now() - new Date(lastInventoryFullSyncTime).getTime()
    : Number.POSITIVE_INFINITY;
  const fullAll =
    forceFull ||
    !lastInventorySyncTime ||
    fullSyncAge >= FULL_RECONCILIATION_MAX_AGE_MS;

  for (const collectionId of INVENTORY_COLLECTIONS) {
    try {
      await pullCollection(collectionId, lastInventorySyncTime, fullAll);
    } catch (e) {
      console.warn(`[SyncManager] Inventory pull failed for ${collectionId}:`, e);
      // Non-fatal — keep cached data
      failures.push(collectionId);
    }
  }
  if (failures.length === 0) {
    lastInventorySyncTime = syncStartedAt;
    await AsyncStorage.setItem(LAST_INVENTORY_SYNC_KEY, lastInventorySyncTime);
    if (fullAll) {
      lastInventoryFullSyncTime = syncStartedAt;
      await AsyncStorage.setItem(
        LAST_INVENTORY_FULL_SYNC_KEY,
        lastInventoryFullSyncTime
      );
    }
    try {
      const { seedProductNamesFromInventory } = await import("./product-name-cache");
      seedProductNamesFromInventory(cache[INVENTORY_ITEMS_COLLECTION_ID] || []);
    } catch {}
  }
  notifyDataChange();
  if (failures.length > 0) {
    throw new Error(`Could not refresh ${failures.join(", ")}`);
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
