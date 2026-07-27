// Shared helpers for working with the inventory_items / inventory_batches
// collections (the single source of truth for products, synced from Tally and
// also written to by the app's Add/Edit Product flows).

export interface InvItemProduct {
  $id: string;
  name: string;
  category?: string;
  unit?: string;
  tallyCode?: string;
  earliestBatchExpiry?: Date | null;
}

// Map a Tally stock_group (PARENT tag) to category name.
// Returns the exact stock group name (e.g., "AGRO CHEMICALS", "CHEMICAL FERTILIZERS")
export function normalizeCategory(stockGroup: string | null | undefined): string | undefined {
  if (!stockGroup) return undefined;
  const g = stockGroup.trim();
  if (!g || g.includes("Primary") || g === "&#4; Primary") return "GENERAL";
  return g;
}

// Parse a Tally quantity string like "421.00 NOS" → number 421.
export function parseQty(q: any): number {
  if (typeof q === "number") return q;
  if (!q) return 0;
  const n = parseFloat(String(q).replace(/[^\d.-]/g, ""));
  return isNaN(n) ? 0 : n;
}

// Map an inventory_items document to the app's product shape used by the
// catalog and product detail screens.
export function toProductItem(inv: any, earliestBatchExpiry?: Date | null): InvItemProduct {
  return {
    $id: inv.$id,
    name: inv.item_name || "",
    category: normalizeCategory(inv.stock_group),
    unit: inv.base_unit || undefined,
    tallyCode: inv.guid || undefined,
    earliestBatchExpiry,
  };
}

// Generate a unique guid for app-created inventory items. Prefixed `app_` so
// they never collide with Tally-managed guids and are never overwritten by a
// Tally sync (Tally upserts by guid and only touches items present in Tally).
export function generateAppGuid(): string {
  return `app_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export interface InvItemLookupEntry {
  name: string;
  category?: string;
  unit?: string;
}

// Build $id + guid → product info maps (case-insensitive keys).
export function buildItemLookup(items: any[]): {
  byId: Record<string, InvItemLookupEntry>;
  byGuid: Record<string, InvItemLookupEntry>;
} {
  const byId: Record<string, InvItemLookupEntry> = {};
  const byGuid: Record<string, InvItemLookupEntry> = {};
  for (const i of items) {
    if (!i) continue;
    const entry: InvItemLookupEntry = {
      name: i.item_name || i.name || "",
      category: normalizeCategory(i.stock_group || i.category),
      unit: i.base_unit || i.unit || undefined,
    };
    if (!entry.name) continue;
    if (i.$id) byId[String(i.$id).toLowerCase()] = entry;
    if (i.guid) byGuid[String(i.guid).toLowerCase()] = entry;
  }
  return { byId, byGuid };
}

// Optional durable cache fallback (itemId → name) for after inventory re-imports.
export type CachedNameLookup = (id: string) => string;

// Resolve a recommendation row to a human product name.
// Prefer denormalized customItem (always stored for catalog picks going forward);
// fall back to inventory lookup by itemId ($id or guid), then durable cache.
// Never return a raw id.
export function resolveRecProductName(
  r: { itemId?: string | null; customItem?: string | null },
  lookup?: { byId: Record<string, InvItemLookupEntry>; byGuid: Record<string, InvItemLookupEntry> },
  cachedName?: CachedNameLookup,
): string {
  const custom = (r.customItem || "").trim();
  if (custom.startsWith("§HDR§")) return "";
  // Denormalized name (catalog or custom product). Catalog saves now write the
  // product name into customItem alongside itemId so visits render without a
  // live inventory cache.
  if (custom) return custom;
  const id = (r.itemId || "").trim();
  if (!id) return "";
  const key = id.toLowerCase();
  if (lookup) {
    const fromInv = lookup.byId[key]?.name || lookup.byGuid[key]?.name || "";
    if (fromInv) return fromInv;
  }
  if (cachedName) {
    const fromCache = cachedName(id);
    if (fromCache) return fromCache;
  }
  return "";
}

export function resolveRecProductMeta(
  r: { itemId?: string | null; customItem?: string | null },
  lookup?: { byId: Record<string, InvItemLookupEntry>; byGuid: Record<string, InvItemLookupEntry> },
): InvItemLookupEntry | null {
  const id = (r.itemId || "").trim();
  if (!id || !lookup) return null;
  const key = id.toLowerCase();
  return lookup.byId[key] || lookup.byGuid[key] || null;
}

// Tally batch rows often store opening qty while inventory_items.closing_qty is
// the live stock. Scale batch.qty so batches sum to item closing (display-time
// fix until the next desktop sync rewrites batch docs).
export function alignBatchQtysToClosing<T extends { qty?: any }>(
  batches: T[],
  closingQty: any,
): (T & { qty: number })[] {
  if (!batches.length) return [];
  const target = parseQty(closingQty);
  const withQty = batches.map((b) => ({ ...b, qty: parseQty(b.qty) }));
  const sum = withQty.reduce((s, b) => s + b.qty, 0);
  if (!isFinite(target) || Math.abs(sum - target) < 0.001) return withQty;

  if (withQty.length === 1) {
    withQty[0].qty = target;
    return withQty;
  }

  const weights = withQty.map((b) => Math.abs(b.qty));
  const weightSum = weights.reduce((s, w) => s + w, 0);
  let allocated = 0;
  for (let i = 0; i < withQty.length; i++) {
    if (i === withQty.length - 1) {
      withQty[i].qty = Math.round((target - allocated) * 1000) / 1000;
    } else if (weightSum > 0) {
      const q = Math.round((target * (weights[i] / weightSum)) * 1000) / 1000;
      withQty[i].qty = q;
      allocated += q;
    } else {
      withQty[i].qty = i === 0 ? target : 0;
      allocated += withQty[i].qty;
    }
  }
  return withQty;
}