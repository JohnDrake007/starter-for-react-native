// Durable itemId/guid → product name map.
// Survives inventory wipe/re-import (merge-only; never cleared on sync) so
// historical recommendations can still resolve names after Tally re-sync
// recreates inventory_items with new Appwrite $ids.

import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "@fa_product_name_cache";

let mem: Record<string, string> = {};
let loaded = false;
let persistTimer: ReturnType<typeof setTimeout> | null = null;

function norm(id: string): string {
  return String(id || "").trim().toLowerCase();
}

export async function initProductNameCache(): Promise<void> {
  if (loaded) return;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) mem = { ...mem, ...JSON.parse(raw) };
  } catch {}
  loaded = true;
}

function schedulePersist() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(mem)).catch(() => {});
  }, 300);
}

/** Merge names into the durable cache. Existing keys are updated, never deleted. */
export function rememberProductNames(
  entries: { id?: string | null; guid?: string | null; name?: string | null }[],
): void {
  let changed = false;
  for (const e of entries) {
    const name = (e.name || "").trim();
    if (!name) continue;
    if (e.id) {
      const k = norm(e.id);
      if (k && mem[k] !== name) { mem[k] = name; changed = true; }
    }
    if (e.guid) {
      const k = norm(e.guid);
      if (k && mem[k] !== name) { mem[k] = name; changed = true; }
    }
  }
  if (changed) schedulePersist();
}

/** Remember a single pick immediately (call when user selects a catalog product). */
export function rememberProduct(id: string | undefined | null, name: string | undefined | null, guid?: string | null): void {
  rememberProductNames([{ id, name, guid }]);
}

export function lookupCachedProductName(id: string | undefined | null): string {
  if (!id) return "";
  return mem[norm(id)] || "";
}

/** Seed cache from a full inventory_items collection snapshot. */
export function seedProductNamesFromInventory(items: any[]): void {
  rememberProductNames(
    (items || []).map((i) => ({
      id: i.$id,
      guid: i.guid,
      name: i.item_name || i.name,
    })),
  );
}
