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
  client: { subscribe: jest.fn(() => jest.fn()) },
  databases: mockDatabases,
  storage: mockStorage,
  Query: {
    limit: (value: number) => `limit:${value}`,
    orderDesc: (value: string) => `orderDesc:${value}`,
    cursorAfter: (value: string) => `cursorAfter:${value}`,
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
    mockDatabases.listDocuments.mockResolvedValue({ documents: [] });
    mockStorage.createFile.mockImplementation(
      async (_bucketId: string, fileId: string) => ({ $id: fileId })
    );
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
    await sync.updateDocument("visits", visit.$id, { nextVisitTask: "call" });

    expect(sync.getPendingCount()).toBe(1);

    mockDatabases.createDocument.mockImplementation(
      async (_db: string, collectionId: string, documentId: string, data: Record<string, any>) =>
        serverDoc(collectionId, documentId, data)
    );
    sync.setOnline();
    await sync.syncNow({ forcePull: true });

    const payload = mockDatabases.createDocument.mock.calls[0][3];
    expect(payload).toMatchObject({ observations: "second", nextVisitTask: "call" });
    expect(mockDatabases.createDocument).toHaveBeenCalledTimes(1);
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
});
