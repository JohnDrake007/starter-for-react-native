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

// Map a Tally stock_group name to the app's product category taxonomy.
// Pass-through for app-created items whose stock_group already holds a
// normalized category (e.g. "Fertilizer") — normalizeCategory("Fertilizer")
// still returns "Fertilizer".
export function normalizeCategory(stockGroup: string | null | undefined): string | undefined {
  if (!stockGroup) return undefined;
  const g = stockGroup.toUpperCase();
  if (g.includes("FERTILIZER") || g.includes("FERTILISER")) return "Fertilizer";
  if (g.includes("INSECTICIDE") || g.includes("PESTICIDE")) return "Insecticide";
  if (g.includes("FUNGICIDE")) return "Fungicide";
  if (g.includes("HERBICIDE") || g.includes("WEEDICIDE")) return "Herbicide";
  if (g.includes("PGR") || g.includes("GROWTH")) return "PGR";
  if (g.includes("ORGANIC") || g.includes("BIO")) return "Organic";
  if (g.includes("MICRO") || g.includes("NUTRIENT")) return "Micronutrient";
  return "Other";
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