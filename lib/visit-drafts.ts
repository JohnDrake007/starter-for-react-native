import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import { APPWRITE_STORAGE_NAMESPACE } from "./appwrite";

const DRAFT_VERSION = 1;
const NEW_VISIT_DRAFT_KEY = `${APPWRITE_STORAGE_NAMESPACE}:draft:new-visit`;
const VISIT_EDIT_DRAFT_PREFIX = `${APPWRITE_STORAGE_NAMESPACE}:draft:visit-edit:`;
const DRAFT_PHOTO_DIRECTORY = "visit-draft-photos";

export interface DraftPhoto {
  uri: string;
  caption?: string;
  name?: string;
  type?: string;
  size?: number;
}

export interface NewVisitDraftPayload {
  currentStep: number;
  selectedCustomerId: string;
  selectedCustomerName: string;
  customerSearch: string;
  visitDate: string;
  observations: string;
  latitude: number | null;
  longitude: number | null;
  locationName: string;
  photos: DraftPhoto[];
  sections: unknown[];
  nextVisitDate: string;
  nextVisitTask: string;
}

export interface VisitEditDraftPayload {
  visitId: string;
  observations: string;
  nextVisitDate: string;
  nextVisitTask: string;
  visitDate: string;
  latitude: number | null;
  longitude: number | null;
  locationName: string;
  newPhotos: DraftPhoto[];
  deletedPhotoIds: string[];
  recommendations: unknown[];
}

interface StoredDraft<T> {
  version: number;
  updatedAt: string;
  data: T;
}

function editDraftKey(visitId: string): string {
  return `${VISIT_EDIT_DRAFT_PREFIX}${visitId}`;
}

async function loadDraft<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const stored = JSON.parse(raw) as StoredDraft<T>;
    if (!stored || stored.version !== DRAFT_VERSION || !stored.data) return null;
    return stored.data;
  } catch (error) {
    console.warn(`[VisitDrafts] Could not restore ${key}:`, error);
    return null;
  }
}

async function saveDraft<T>(key: string, data: T): Promise<void> {
  const stored: StoredDraft<T> = {
    version: DRAFT_VERSION,
    updatedAt: new Date().toISOString(),
    data,
  };
  await AsyncStorage.setItem(key, JSON.stringify(stored));
}

export function loadNewVisitDraft(): Promise<NewVisitDraftPayload | null> {
  return loadDraft<NewVisitDraftPayload>(NEW_VISIT_DRAFT_KEY);
}

export function saveNewVisitDraft(data: NewVisitDraftPayload): Promise<void> {
  return saveDraft(NEW_VISIT_DRAFT_KEY, data);
}

export function loadVisitEditDraft(visitId: string): Promise<VisitEditDraftPayload | null> {
  return loadDraft<VisitEditDraftPayload>(editDraftKey(visitId));
}

export function saveVisitEditDraft(data: VisitEditDraftPayload): Promise<void> {
  return saveDraft(editDraftKey(data.visitId), data);
}

function draftPhotoDirectory(): string | null {
  return FileSystem.documentDirectory
    ? `${FileSystem.documentDirectory}${DRAFT_PHOTO_DIRECTORY}/`
    : null;
}

export async function stageDraftPhoto(photo: DraftPhoto): Promise<DraftPhoto> {
  const directory = draftPhotoDirectory();
  if (!directory || photo.uri.startsWith(directory)) return photo;

  try {
    await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
    const extension = (photo.name?.split(".").pop() || photo.uri.split(".").pop() || "jpg")
      .replace(/[^a-z0-9]/gi, "") || "jpg";
    const destination = `${directory}${Date.now()}_${Math.random().toString(36).slice(2)}.${extension}`;
    await FileSystem.copyAsync({ from: photo.uri, to: destination });
    const info = await FileSystem.getInfoAsync(destination);
    return {
      ...photo,
      uri: destination,
      size: info.exists && typeof info.size === "number" ? info.size : photo.size,
    };
  } catch (error) {
    // Some web/content URIs cannot be copied. Keeping the original still
    // preserves all text fields and lets the photo survive when its URI does.
    console.warn("[VisitDrafts] Could not stage draft photo:", error);
    return photo;
  }
}

export async function removeDraftPhoto(photo: DraftPhoto): Promise<void> {
  const directory = draftPhotoDirectory();
  if (!directory || !photo.uri.startsWith(directory)) return;
  try {
    await FileSystem.deleteAsync(photo.uri, { idempotent: true });
  } catch {}
}

export async function removeDraftPhotos(photos: DraftPhoto[]): Promise<void> {
  await Promise.all(photos.map(removeDraftPhoto));
}

export async function clearNewVisitDraft(extraPhotos: DraftPhoto[] = []): Promise<void> {
  const stored = await loadNewVisitDraft();
  await AsyncStorage.removeItem(NEW_VISIT_DRAFT_KEY);
  await removeDraftPhotos([...(stored?.photos || []), ...extraPhotos]);
}

export async function clearVisitEditDraft(
  visitId: string,
  extraPhotos: DraftPhoto[] = []
): Promise<void> {
  const stored = await loadVisitEditDraft(visitId);
  await AsyncStorage.removeItem(editDraftKey(visitId));
  await removeDraftPhotos([...(stored?.newPhotos || []), ...extraPhotos]);
}

export const visitDraftInternals = {
  DRAFT_VERSION,
  NEW_VISIT_DRAFT_KEY,
  editDraftKey,
};
