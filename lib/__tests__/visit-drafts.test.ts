const storageState = new Map<string, string>();

const mockAsyncStorage = {
  getItem: jest.fn(async (key: string) => storageState.get(key) ?? null),
  setItem: jest.fn(async (key: string, value: string) => {
    storageState.set(key, value);
  }),
  removeItem: jest.fn(async (key: string) => {
    storageState.delete(key);
  }),
};

const mockMakeDirectory = jest.fn(async () => undefined);
const mockCopy = jest.fn(async () => undefined);
const mockDelete = jest.fn(async () => undefined);
const mockGetInfo = jest.fn(async () => ({ exists: true, size: 4321 }));

jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: mockAsyncStorage,
}));

jest.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///documents/",
  makeDirectoryAsync: mockMakeDirectory,
  copyAsync: mockCopy,
  deleteAsync: mockDelete,
  getInfoAsync: mockGetInfo,
}));

jest.mock("../appwrite", () => ({
  APPWRITE_STORAGE_NAMESPACE: "@fa:test-project:db",
}));

const {
  clearNewVisitDraft,
  clearVisitEditDraft,
  loadNewVisitDraft,
  loadVisitEditDraft,
  saveNewVisitDraft,
  saveVisitEditDraft,
  stageDraftPhoto,
  visitDraftInternals,
} = require("../visit-drafts") as typeof import("../visit-drafts");

type NewVisitDraftPayload = import("../visit-drafts").NewVisitDraftPayload;

const newVisitDraft: NewVisitDraftPayload = {
  currentStep: 3,
  selectedCustomerId: "customer-1",
  selectedCustomerName: "Asha",
  customerSearch: "",
  visitDate: "2026-08-30",
  observations: "1. Checked the north field",
  latitude: 12.34,
  longitude: 76.54,
  locationName: "North field",
  photos: [],
  sections: [{ id: "section-1", title: "SPRAYING", products: [] }],
  nextVisitDate: "2026-09-06",
  nextVisitTask: "Check pest pressure",
};

describe("visit draft persistence", () => {
  beforeEach(() => {
    storageState.clear();
    jest.clearAllMocks();
  });

  test("round-trips every new-visit field through namespaced storage", async () => {
    await saveNewVisitDraft(newVisitDraft);

    await expect(loadNewVisitDraft()).resolves.toEqual(newVisitDraft);
    expect(mockAsyncStorage.setItem).toHaveBeenCalledWith(
      visitDraftInternals.NEW_VISIT_DRAFT_KEY,
      expect.any(String)
    );
  });

  test("keeps existing-visit drafts isolated by visit ID", async () => {
    await saveVisitEditDraft({
      visitId: "visit-1",
      observations: "Unsaved edit",
      nextVisitDate: "",
      nextVisitTask: "",
      visitDate: "2026-08-30",
      latitude: null,
      longitude: null,
      locationName: "",
      newPhotos: [],
      deletedPhotoIds: [],
      recommendations: [],
    });

    expect((await loadVisitEditDraft("visit-1"))?.observations).toBe("Unsaved edit");
    await expect(loadVisitEditDraft("visit-2")).resolves.toBeNull();
  });

  test("copies picker photos into durable app storage", async () => {
    const staged = await stageDraftPhoto({
      uri: "file:///temporary/camera.jpg",
      name: "camera.jpg",
      type: "image/jpeg",
    });

    expect(mockMakeDirectory).toHaveBeenCalled();
    expect(mockCopy).toHaveBeenCalledWith(expect.objectContaining({
      from: "file:///temporary/camera.jpg",
      to: expect.stringMatching(/^file:\/\/\/documents\/visit-draft-photos\/.+\.jpg$/),
    }));
    expect(staged.uri).toMatch(/^file:\/\/\/documents\/visit-draft-photos\//);
    expect(staged.size).toBe(4321);
  });

  test("clearing drafts also removes their staged photos", async () => {
    const newPhoto = { uri: "file:///documents/visit-draft-photos/new.jpg" };
    await saveNewVisitDraft({ ...newVisitDraft, photos: [newPhoto] });
    await clearNewVisitDraft();

    await expect(loadNewVisitDraft()).resolves.toBeNull();
    expect(mockDelete).toHaveBeenCalledWith(newPhoto.uri, { idempotent: true });

    const editPhoto = { uri: "file:///documents/visit-draft-photos/edit.jpg" };
    await saveVisitEditDraft({
      visitId: "visit-1",
      observations: "",
      nextVisitDate: "",
      nextVisitTask: "",
      visitDate: "",
      latitude: null,
      longitude: null,
      locationName: "",
      newPhotos: [editPhoto],
      deletedPhotoIds: [],
      recommendations: [],
    });
    await clearVisitEditDraft("visit-1");

    await expect(loadVisitEditDraft("visit-1")).resolves.toBeNull();
    expect(mockDelete).toHaveBeenCalledWith(editPhoto.uri, { idempotent: true });
  });
});
