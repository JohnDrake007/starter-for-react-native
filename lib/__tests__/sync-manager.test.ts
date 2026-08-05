const storageState = new Map<string, string>();

const mockAsyncStorage = {
  getItem: jest.fn(async (key: string) => storageState.get(key) ?? null),
  setItem: jest.fn(async (key: string, value: string) => {
    storageState.set(key, value);
  }),
};

const mockDatabases = {
  createDocument: jest.fn(),
  getDocument: jest.fn(),
  updateDocument: jest.fn(),
  deleteDocument: jest.fn(),
  listDocuments: jest.fn(),
};

const mockStorage = {
  createFile: jest.fn(),
  getFile: jest.fn(),
  deleteFile: jest.fn(),
  getFileView: jest.fn((bucketId: string, fileId: string) => ({
    toString: () => `https://appwrite.test/v1/storage/buckets/${bucketId}/files/${fileId}/view`,
  })),
};

let mockRealtimeCallback: ((response: any) => void) | null = null;
const mockClient = {
  subscribe: jest.fn((_channels: string[], callback: (response: any) => void) => {
    mockRealtimeCallback = callback;
    return jest.fn();
  }),
};

jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: mockAsyncStorage,
}));

jest.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///documents/",
  makeDirectoryAsync: jest.fn(async () => undefined),
  copyAsync: jest.fn(async () => undefined),
  getInfoAsync: jest.fn(async () => ({ exists: true, size: 100 })),
  deleteAsync: jest.fn(async () => undefined),
}));

jest.mock("../appwrite", () => ({
  client: mockClient,
  databases: mockDatabases,
  storage: mockStorage,
  Query: {
    limit: (value: number) => `limit:${value}`,
    orderDesc: (value: string) => `orderDesc:${value}`,
    cursorAfter: (value: string) => `cursorAfter:${value}`,
    greaterThanEqual: (attribute: string, value: string) =>
      `greaterThanEqual:${attribute}:${value}`,
  },
  DATABASE_ID: "db",
  CUSTOMERS_COLLECTION_ID: "customers",
  VISITS_COLLECTION_ID: "visits",
  RECOMMENDATIONS_COLLECTION_ID: "recommendations",
  VISIT_PHOTOS_COLLECTION_ID: "visit_photos",
  INVENTORY_ITEMS_COLLECTION_ID: "inventory_items",
  INVENTORY_BATCHES_COLLECTION_ID: "inventory_batches",
}));

jest.mock("../notification-manager", () => ({
  scheduleVisitReminders: jest.fn(async () => undefined),
}));

function serverDoc(collectionId: string, id: string, data: Record<string, any>) {
  return {
    ...data,
    $id: id,
    $collectionId: collectionId,
    $createdAt: new Date().toISOString(),
    $updatedAt: new Date().toISOString(),
  };
}

function transientError() {
  return Object.assign(new Error("Network request failed"), { code: 0 });
}

describe("sync-manager offline queue", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    storageState.clear();
    mockRealtimeCallback = null;
    mockDatabases.listDocuments.mockResolvedValue({ documents: [] });
    mockStorage.createFile.mockImplementation(
      async (_bucketId: string, fileId: string) => ({ $id: fileId })
    );
  });

  test("remaps an offline-created customer before syncing its visit", async () => {
    const sync = require("../sync-manager") as typeof import("../sync-manager");
    await sync.initSync();
    sync.setOffline();

    const customer = await sync.createDocument("customers", {
      guid: "app_customer_1",
      name: "Asha",
      customer_name: "Asha",
      phone: "123",
    });
    await sync.createDocument("visits", {
      customerId: customer.$id,
      visitDate: new Date().toISOString(),
    });

    mockDatabases.createDocument.mockImplementation(
      async (_db: string, collectionId: string, documentId: string, data: Record<string, any>) =>
        serverDoc(collectionId, documentId, data)
    );
    sync.setOnline();
    await sync.syncNow({ forcePull: true });

    const customerCall = mockDatabases.createDocument.mock.calls.find(
      (call) => call[1] === "customers"
    );
    const visitCall = mockDatabases.createDocument.mock.calls.find(
      (call) => call[1] === "visits"
    );

    expect(customerCall).toBeDefined();
    expect(visitCall?.[3].customerId).toBe(customerCall?.[2]);
    expect(visitCall?.[3].customerId).not.toMatch(/^local_/);
    expect(sync.getPendingCount()).toBe(0);
  });

  test("defers children until an offline-created visit has a server ID", async () => {
    const sync = require("../sync-manager") as typeof import("../sync-manager");
    await sync.initSync();
    sync.setOffline();

    const visit = await sync.createDocument("visits", { customerId: "customer-1" });
    await sync.createDocument("recommendations", {
      visitId: visit.$id,
      customItem: "Neem oil",
    });
    await sync.enqueuePhotoUpload({
      localUri: "file:///picker/photo.jpg",
      fileName: "photo.jpg",
      mimeType: "image/jpeg",
      fileSize: 100,
      bucketId: "visit-photos",
      visitId: visit.$id,
    });

    mockDatabases.createDocument.mockImplementation(
      async (_db: string, collectionId: string, documentId: string, data: Record<string, any>) =>
        serverDoc(collectionId, documentId, data)
    );
    sync.setOnline();
    await sync.syncNow({ forcePull: true });

    const recommendationCall = mockDatabases.createDocument.mock.calls.find(
      (call) => call[1] === "recommendations"
    );
    const photoCall = mockDatabases.createDocument.mock.calls.find(
      (call) => call[1] === "visit_photos"
    );
    const visitCall = mockDatabases.createDocument.mock.calls.find(
      (call) => call[1] === "visits"
    );

    expect(recommendationCall?.[3].visitId).toBe(visitCall?.[2]);
    expect(photoCall?.[3].visitId).toBe(visitCall?.[2]);
    expect(mockStorage.createFile).toHaveBeenCalledTimes(1);
    expect(sync.getPendingCount()).toBe(0);
    expect(sync.getSyncStatus()).toBe("idle");
  });

  test("does not upload children when their parent create fails", async () => {
    const sync = require("../sync-manager") as typeof import("../sync-manager");
    await sync.initSync();
    sync.setOffline();

    const visit = await sync.createDocument("visits", { customerId: "customer-1" });
    await sync.createDocument("recommendations", { visitId: visit.$id, customItem: "A" });
    await sync.enqueuePhotoUpload({
      localUri: "file:///picker/photo.jpg",
      fileName: "photo.jpg",
      mimeType: "image/jpeg",
      fileSize: 100,
      bucketId: "visit-photos",
      visitId: visit.$id,
    });

    mockDatabases.createDocument.mockRejectedValue(transientError());
    sync.setOnline();
    await sync.syncNow({ forcePull: true });

    expect(mockDatabases.createDocument).toHaveBeenCalledTimes(1);
    expect(mockStorage.createFile).not.toHaveBeenCalled();
    expect(sync.getPendingCount()).toBe(3);
    expect(sync.getSyncStatus()).toBe("error");
  });

  test("uses one stable ID to recover an ambiguous create response", async () => {
    const sync = require("../sync-manager") as typeof import("../sync-manager");
    await sync.initSync();

    mockDatabases.createDocument.mockRejectedValueOnce(transientError());
    const local = await sync.createDocument("visits", { customerId: "customer-1" });
    const reservedId = mockDatabases.createDocument.mock.calls[0][2];

    mockDatabases.createDocument.mockRejectedValueOnce(
      Object.assign(new Error("Document already exists"), { code: 409 })
    );
    mockDatabases.getDocument.mockResolvedValue(
      serverDoc("visits", reservedId, { customerId: "customer-1" })
    );
    await sync.syncNow({ forcePull: true });

    expect(local.$id).toMatch(/^local_/);
    expect(mockDatabases.createDocument.mock.calls[1][2]).toBe(reservedId);
    expect(mockDatabases.getDocument).toHaveBeenCalledWith("db", "visits", reservedId);
    expect(sync.getPendingCount()).toBe(0);
  });

  test("coalesces repeated edits into the pending create", async () => {
    const sync = require("../sync-manager") as typeof import("../sync-manager");
    await sync.initSync();
    sync.setOffline();

    const visit = await sync.createDocument("visits", { observations: "first" });
    await sync.updateDocument("visits", visit.$id, { observations: "second" });
    await sync.updateDocument("visits", visit.$id, {
      nextVisitDate: "2026-08-18T00:00:00.000Z",
      nextVisitTask: "call",
    });

    expect(sync.getPendingCount()).toBe(1);

    mockDatabases.createDocument.mockImplementation(
      async (_db: string, collectionId: string, documentId: string, data: Record<string, any>) =>
        serverDoc(collectionId, documentId, data)
    );
    sync.setOnline();
    await sync.syncNow({ forcePull: true });

    const payload = mockDatabases.createDocument.mock.calls[0][3];
    expect(payload).toMatchObject({
      observations: "second",
      nextVisitDate: "2026-08-18T00:00:00.000Z",
      nextVisitTask: "call",
    });
    expect(mockDatabases.createDocument).toHaveBeenCalledTimes(1);
  });

  test("persists an offline reminder update across restart and publishes it on reconnect", async () => {
    const previousDate = "2026-08-10T00:00:00.000Z";
    const updatedDate = "2026-08-18T00:00:00.000Z";
    const recentSync = new Date().toISOString();
    const originalVisit = serverDoc("visits", "visit-1", {
      customerId: "customer-1",
      nextVisitDate: previousDate,
      nextVisitTask: "Old task",
    });
    storageState.set("@fa_visits", JSON.stringify([originalVisit]));
    storageState.set("@fa_last_sync", recentSync);
    storageState.set("@fa_last_core_full_sync", recentSync);

    let sync = require("../sync-manager") as typeof import("../sync-manager");
    await sync.initSync();
    sync.setOffline();
    const onLocalChange = jest.fn();
    sync.addDataChangeListener(onLocalChange);
    await sync.updateDocument("visits", "visit-1", {
      nextVisitDate: updatedDate,
      nextVisitTask: "Check updated treatment",
    });

    expect(sync.getDocument("visits", "visit-1")).toMatchObject({
      nextVisitDate: updatedDate,
      nextVisitTask: "Check updated treatment",
      _pendingSync: true,
    });
    expect(sync.getPendingCount()).toBe(1);
    expect(onLocalChange).toHaveBeenCalled();

    // Simulate the app being terminated before connectivity returns. Both the
    // cache and queue must restore the reminder on the next launch.
    jest.resetModules();
    sync = require("../sync-manager") as typeof import("../sync-manager");
    await sync.initSync();
    expect(sync.getDocument("visits", "visit-1")?.nextVisitDate).toBe(updatedDate);
    expect(sync.getPendingCount()).toBe(1);

    let publishedVisit: any = originalVisit;
    mockDatabases.updateDocument.mockImplementation(
      async (_db: string, collectionId: string, documentId: string, data: Record<string, any>) => {
        publishedVisit = serverDoc(collectionId, documentId, {
          ...publishedVisit,
          ...data,
        });
        return publishedVisit;
      }
    );
    mockDatabases.listDocuments.mockImplementation(
      async (_db: string, collectionId: string, queries: string[]) => {
        if (collectionId === "visits") {
          return { documents: [publishedVisit], total: 1 };
        }
        return { documents: [], total: 0 };
      }
    );

    sync.setOnline();
    await sync.syncNow({ ensurePull: true });

    expect(mockDatabases.updateDocument).toHaveBeenCalledWith(
      "db",
      "visits",
      "visit-1",
      {
        nextVisitDate: updatedDate,
        nextVisitTask: "Check updated treatment",
      }
    );
    expect(publishedVisit).toMatchObject({
      nextVisitDate: updatedDate,
      nextVisitTask: "Check updated treatment",
    });
    expect(sync.getPendingCount()).toBe(0);
    expect(sync.getSyncStatus()).toBe("idle");
  });

  test("preserves explicit reminder deletion values in the offline queue", async () => {
    const recentSync = new Date().toISOString();
    const originalVisit = serverDoc("visits", "visit-1", {
      customerId: "customer-1",
      nextVisitDate: "2026-08-10T00:00:00.000Z",
      nextVisitTask: "Old task",
    });
    storageState.set("@fa_visits", JSON.stringify([originalVisit]));
    storageState.set("@fa_last_sync", recentSync);
    storageState.set("@fa_last_core_full_sync", recentSync);

    const sync = require("../sync-manager") as typeof import("../sync-manager");
    await sync.initSync();
    sync.setOffline();
    await sync.updateDocument("visits", "visit-1", {
      nextVisitDate: null,
      nextVisitTask: null,
    });

    const persistedQueue = JSON.parse(storageState.get("@fa_pending_queue")!);
    expect(persistedQueue[0].data).toEqual({
      nextVisitDate: null,
      nextVisitTask: null,
    });

    let publishedVisit: any = originalVisit;
    mockDatabases.updateDocument.mockImplementation(
      async (_db: string, collectionId: string, documentId: string, data: Record<string, any>) => {
        publishedVisit = serverDoc(collectionId, documentId, {
          ...publishedVisit,
          ...data,
        });
        return publishedVisit;
      }
    );
    mockDatabases.listDocuments.mockImplementation(
      async (_db: string, collectionId: string) =>
        collectionId === "visits"
          ? { documents: [publishedVisit], total: 1 }
          : { documents: [], total: 0 }
    );

    sync.setOnline();
    await sync.syncNow({ ensurePull: true });

    expect(mockDatabases.updateDocument).toHaveBeenCalledWith(
      "db",
      "visits",
      "visit-1",
      { nextVisitDate: null, nextVisitTask: null }
    );
    expect(publishedVisit.nextVisitDate).toBeNull();
    expect(publishedVisit.nextVisitTask).toBeNull();
    expect(sync.getPendingCount()).toBe(0);
  });

  test("deleting after a lost create response queues idempotent server cleanup", async () => {
    const sync = require("../sync-manager") as typeof import("../sync-manager");
    await sync.initSync();

    mockDatabases.createDocument.mockRejectedValueOnce(transientError());
    const local = await sync.createDocument("visits", { observations: "temporary" });
    const reservedId = mockDatabases.createDocument.mock.calls[0][2];

    await sync.deleteDocument("visits", local.$id);
    expect(sync.getPendingCount()).toBe(1);

    mockDatabases.deleteDocument.mockRejectedValueOnce(
      Object.assign(new Error("Not found"), { code: 404 })
    );
    await sync.syncNow({ forcePull: true });

    expect(mockDatabases.deleteDocument).toHaveBeenCalledWith("db", "visits", reservedId);
    expect(sync.getPendingCount()).toBe(0);
  });

  test("deleting a photo also removes its storage file", async () => {
    const sync = require("../sync-manager") as typeof import("../sync-manager");
    await sync.initSync();

    mockDatabases.createDocument.mockImplementation(
      async (_db: string, collectionId: string, documentId: string, data: Record<string, any>) =>
        serverDoc(collectionId, documentId, data)
    );
    await sync.enqueuePhotoUpload({
      localUri: "file:///picker/photo.jpg",
      fileName: "photo.jpg",
      mimeType: "image/jpeg",
      fileSize: 100,
      bucketId: "visit-photos",
      visitId: "visit-1",
    });
    const photo = sync.getCollection("visit_photos")[0];

    await sync.deleteDocument("visit_photos", photo.$id);

    expect(mockStorage.deleteFile).toHaveBeenCalledWith("visit-photos", expect.any(String));
    expect(sync.getCollection("visit_photos")).toHaveLength(0);
  });

  test("backs up corrupt queue data and recovers without crashing startup", async () => {
    storageState.set("@fa_pending_queue", "{not-json");
    const sync = require("../sync-manager") as typeof import("../sync-manager");

    await sync.initSync();

    expect(storageState.get("@fa_pending_queue_corrupt_backup")).toBe("{not-json");
    expect(sync.getPendingCount()).toBe(0);
  });

  test("removes an orphan placeholder left by an interrupted local transaction", async () => {
    storageState.set("@fa_visits", JSON.stringify([
      { $id: "local_orphan", observations: "never queued", _pendingSync: true },
    ]));
    const sync = require("../sync-manager") as typeof import("../sync-manager");

    await sync.initSync();

    expect(sync.getCollection("visits")).toHaveLength(0);
  });

  test("uses deltas and count probes instead of full scans for routine pulls", async () => {
    const customer = serverDoc("customers", "customer-1", { name: "A" });
    const sixMinutesAgo = new Date(Date.now() - 6 * 60 * 1000).toISOString();
    storageState.set("@fa_customers", JSON.stringify([customer]));
    storageState.set("@fa_last_sync", sixMinutesAgo);
    storageState.set("@fa_last_core_full_sync", new Date().toISOString());

    mockDatabases.listDocuments.mockImplementation(
      async (_db: string, collectionId: string, queries: string[]) => {
        if (queries.some((query) => query.startsWith("greaterThanEqual:"))) {
          return { documents: [], total: 0 };
        }
        if (queries.includes("limit:1")) {
          return collectionId === "customers"
            ? { documents: [customer], total: 1 }
            : { documents: [], total: 0 };
        }
        throw new Error(`Unexpected full scan for ${collectionId}`);
      }
    );

    const sync = require("../sync-manager") as typeof import("../sync-manager");
    await sync.initSync();
    await sync.syncNow();

    expect(sync.getSyncStatus()).toBe("idle");
    expect(mockDatabases.listDocuments).toHaveBeenCalledTimes(8);
    expect(mockDatabases.listDocuments.mock.calls.every(
      (call) =>
        call[2].includes("limit:1") ||
        call[2].some((query: string) => query.startsWith("greaterThanEqual:"))
    )).toBe(true);
  });

  test("reconciles another user's reminder update even when the last pull is recent", async () => {
    const recentSync = new Date().toISOString();
    const cachedVisit = serverDoc("visits", "visit-1", {
      customerId: "customer-1",
      nextVisitDate: "2026-08-10T00:00:00.000Z",
    });
    const sharedVisit = serverDoc("visits", "visit-1", {
      customerId: "customer-1",
      nextVisitDate: "2026-08-20T00:00:00.000Z",
    });
    storageState.set("@fa_visits", JSON.stringify([cachedVisit]));
    storageState.set("@fa_last_sync", recentSync);
    storageState.set("@fa_last_core_full_sync", recentSync);

    mockDatabases.listDocuments.mockImplementation(
      async (_db: string, collectionId: string, queries: string[]) => {
        if (collectionId !== "visits") return { documents: [], total: 0 };
        if (queries.some((query) => query.startsWith("greaterThanEqual:"))) {
          return { documents: [sharedVisit], total: 1 };
        }
        return { documents: [sharedVisit], total: 1 };
      }
    );

    const sync = require("../sync-manager") as typeof import("../sync-manager");
    await sync.initSync();
    await sync.syncNow({ ensurePull: true });

    expect(mockDatabases.listDocuments).toHaveBeenCalled();
    expect(sync.getDocument("visits", "visit-1")?.nextVisitDate).toBe(
      "2026-08-20T00:00:00.000Z"
    );
  });

  test("applies reminder realtime events from another user to the local cache", async () => {
    const sync = require("../sync-manager") as typeof import("../sync-manager");
    await sync.initSync();
    sync.startRealtime();

    expect(mockRealtimeCallback).not.toBeNull();
    mockRealtimeCallback!({
      events: ["databases.db.collections.visits.documents.visit-1.update"],
      payload: serverDoc("visits", "visit-1", {
        customerId: "customer-1",
        nextVisitDate: "2026-08-25T00:00:00.000Z",
        nextVisitTask: "Shared reminder",
      }),
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(sync.getDocument("visits", "visit-1")).toMatchObject({
      nextVisitDate: "2026-08-25T00:00:00.000Z",
      nextVisitTask: "Shared reminder",
    });
  });

  test("promotes a collection to a full scan when a delete changes its count", async () => {
    const visit = serverDoc("visits", "visit-1", { observations: "old" });
    const sixMinutesAgo = new Date(Date.now() - 6 * 60 * 1000).toISOString();
    storageState.set("@fa_visits", JSON.stringify([visit]));
    storageState.set("@fa_last_sync", sixMinutesAgo);
    storageState.set("@fa_last_core_full_sync", new Date().toISOString());

    mockDatabases.listDocuments.mockImplementation(
      async (_db: string, _collectionId: string, queries: string[]) => {
        if (queries.some((query) => query.startsWith("greaterThanEqual:"))) {
          return { documents: [], total: 0 };
        }
        return { documents: [], total: 0 };
      }
    );

    const sync = require("../sync-manager") as typeof import("../sync-manager");
    await sync.initSync();
    await sync.syncNow();

    expect(sync.getCollection("visits")).toHaveLength(0);
    expect(mockDatabases.listDocuments.mock.calls.some(
      (call) =>
        call[1] === "visits" &&
        call[2].includes("limit:1000") &&
        !call[2].some((query: string) => query.startsWith("greaterThanEqual:"))
    )).toBe(true);
  });
});
