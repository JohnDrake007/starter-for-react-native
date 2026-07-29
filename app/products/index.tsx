import { View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity, RefreshControl, ScrollView, Linking, Platform, ActivityIndicator } from "react-native";
import { useState, useCallback, useMemo } from "react";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, Search, Package, Tag, Beaker, Share2, Plus, X, Calendar, Clock, RefreshCw } from "@/components/Icons";
import { INVENTORY_ITEMS_COLLECTION_ID, INVENTORY_BATCHES_COLLECTION_ID } from "@/lib/appwrite";
import { getCollection, syncInventoryCollections } from "@/lib/sync-manager";
import { useNetwork, useDataChange } from "@/lib/network-provider";
import { normalizeCategory, parseQty } from "@/lib/inventory-utils";

interface Item {
  $id: string;
  name: string;
  category?: string;
  unit?: string;
  tallyCode?: string;
  earliestBatchExpiry?: Date | null; // FEFO: earliest batch expiry date
  inStock?: boolean; // true → has non-zero total batch closing qty
  totalQty?: number; // sum of all batch closing qtys
}

const DEFAULT_CATEGORIES = [
  "All",
  "AGRO CHEMICALS",
  "CHEMICAL FERTILIZERS",
  "BIO PRODUCTS",
  "AGRICULTURAL IMPLIMENTS",
  "GENERAL",
  "SPRAYER",
];
const expirySteps = [0, 7, 15, 30, 60, 90, 180, 365];

const getCategoryColor = (category: string | null | undefined) => {
  if (!category) return { bg: "#f3f4f6", text: "#6b7280" };
  const cat = category.toUpperCase();
  if (cat.includes("AGRO CHEMICALS")) return { bg: "#fecdd3", text: "#be123c" }; // rose
  if (cat.includes("CHEMICAL FERTILIZERS") || cat.includes("FERTILIZER")) return { bg: "#dcfce7", text: "#15803d" }; // green
  if (cat.includes("BIO PRODUCTS") || cat.includes("ORGANIC")) return { bg: "#ecfccb", text: "#4d7c0f" }; // lime
  if (cat.includes("AGRICULTURAL IMPLIMENTS") || cat.includes("IMPLIMENTS")) return { bg: "#cffafe", text: "#0e7490" }; // cyan
  if (cat.includes("SPRAYER")) return { bg: "#e9d5ff", text: "#7c3aed" }; // purple
  if (cat.includes("GENERAL")) return { bg: "#fef3c7", text: "#b45309" }; // amber
  return { bg: "#f3f4f6", text: "#6b7280" };
};

const getCategoryIcon = (category: string | null | undefined) => {
  if (!category) return "📦";
  const cat = category.toUpperCase();
  if (cat.includes("AGRO CHEMICALS")) return "🧪";
  if (cat.includes("CHEMICAL FERTILIZERS") || cat.includes("FERTILIZER")) return "🌱";
  if (cat.includes("BIO PRODUCTS") || cat.includes("ORGANIC")) return "🍃";
  if (cat.includes("AGRICULTURAL IMPLIMENTS") || cat.includes("IMPLIMENTS")) return "🚜";
  if (cat.includes("SPRAYER")) return "💦";
  if (cat.includes("GENERAL")) return "📦";
  return "📦";
};

// Month abbreviation lookup for Tally's dd-Mon-YYYY format
const MONTH_ABBR: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

// Parse Tally date formats: "20250630", "30-06-2025", "1-Dec-2025", "1-Dec-25",
// "1 Dec 2025", or ISO. Tally's EXPIRYPERIOD is often dd-Mon-YY (2-digit year),
// which Hermes' Date parser rejects — so we handle it explicitly rather than
// relying on the new Date() fallback.
function parseBatchDate(dateStr: string): Date | null {
  if (!dateStr || dateStr.trim() === "") return null;
  const s = dateStr.trim();
  // Tally sometimes sets EXPIRYPERIOD to a duration like "1 Days" when no real
  // expiry is configured — not a calendar date, so treat as "no expiry".
  if (/^\d+\s*Days?$/i.test(s)) return null;
  // YYYYMMDD (e.g. "20250630")
  if (/^\d{8}$/.test(s)) {
    const y = parseInt(s.slice(0, 4));
    const m = parseInt(s.slice(4, 6)) - 1;
    const d = parseInt(s.slice(6, 8));
    const dt = new Date(y, m, d);
    return isNaN(dt.getTime()) ? null : dt;
  }
  // dd-Mon-YYYY or dd-Mon-YY (Tally EXPIRYPERIOD, e.g. "1-Dec-2025" / "1-Dec-25").
  // Separators may be dash, slash, or space; month is 3-9 letters; year 2 or 4 digits.
  const dMonY = s.match(/^(\d{1,2})[\s\-\/]([A-Za-z]{3,9})[\s\-\/](\d{2,4})$/);
  if (dMonY) {
    const monthIdx = MONTH_ABBR[dMonY[2].slice(0, 3).toLowerCase()];
    if (monthIdx !== undefined) {
      let year = parseInt(dMonY[3]);
      if (year < 100) year += 2000; // 2-digit year pivot (expiries are recent/future)
      const dt = new Date(year, monthIdx, parseInt(dMonY[1]));
      return isNaN(dt.getTime()) ? null : dt;
    }
  }
  // DD-MM-YYYY or DD-MM-YY (numeric day-month-year)
  const dmy = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
  if (dmy) {
    let year = parseInt(dmy[3]);
    if (year < 100) year += 2000;
    const dt = new Date(year, parseInt(dmy[2]) - 1, parseInt(dmy[1]));
    return isNaN(dt.getTime()) ? null : dt;
  }
  // Fallback: ISO or any format Date() can parse
  const dt = new Date(s);
  return isNaN(dt.getTime()) ? null : dt;
}

export default function ProductCatalogScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<Item[]>([]);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [expiryDays, setExpiryDays] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { syncNow } = useNetwork();

  const categories = useMemo(() => {
    const set = new Set(DEFAULT_CATEGORIES);
    items.forEach((i) => {
      if (i.category) set.add(i.category);
    });
    return Array.from(set);
  }, [items]);

  const fetchItems = useCallback(async () => {
    try {
      // NOTE: We no longer auto-pull inventory here when the cache is empty.
      // Pulling on every focus drained the Appwrite free-tier read quota
      // (each call = 2 paginated listDocuments reads) and only ever fired
      // on a fresh install / cache wipe, after which it never ran again —
      // so the cost-per-useful-pull ratio was extremely poor. Inventory is
      // kept live by the realtime subscription (see sync-manager.ts) and is
      // pulled on explicit pull-to-refresh (onRefresh below) / Sync Now.
      // First-launch UX shows an empty list with a hint to pull-to-refresh.
      const allInvItems = getCollection(INVENTORY_ITEMS_COLLECTION_ID);
      const allBatches = getCollection(INVENTORY_BATCHES_COLLECTION_ID);

      // Collect earliest batch expiry + sum of closing qty per item_guid
      const batchesByGuid: Record<string, Date[]> = {};
      const qtyByGuid: Record<string, number> = {};
      allBatches.forEach((b: any) => {
        if (!b.item_guid) return;
        qtyByGuid[b.item_guid] = (qtyByGuid[b.item_guid] || 0) + parseQty(b.qty);
        if (!b.expiry_date) return;
        const d = parseBatchDate(b.expiry_date);
        if (!d) return;
        if (!batchesByGuid[b.item_guid]) batchesByGuid[b.item_guid] = [];
        batchesByGuid[b.item_guid].push(d);
      });
      const earliestForGuid = (guid: string | undefined): Date | null => {
        if (!guid || !batchesByGuid[guid]?.length) return null;
        return batchesByGuid[guid].slice().sort((a, b) => a.getTime() - b.getTime())[0];
      };

      const out: Item[] = allInvItems
        .filter((inv: any) => inv.item_name)
        .map((inv: any) => {
          // Item closing_qty is Tally live stock (authoritative, includes 0).
          // Batch sum can still be opening until desktop re-syncs aligned qtys.
          const hasClosing = inv.closing_qty !== undefined && inv.closing_qty !== null && String(inv.closing_qty).trim() !== "";
          const batchSum = inv.guid ? (qtyByGuid[inv.guid] || 0) : 0;
          const totalQty = hasClosing ? parseQty(inv.closing_qty) : batchSum;
          return {
            $id: inv.$id,
            name: inv.item_name,
            category: normalizeCategory(inv.stock_group),
            unit: inv.base_unit || undefined,
            tallyCode: inv.guid || undefined,
            earliestBatchExpiry: earliestForGuid(inv.guid),
            totalQty,
            inStock: totalQty > 0,
          };
        });

      // In-stock first, then alphabetical
      out.sort((a, b) => {
        if (a.inStock !== b.inStock) return a.inStock ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

      setItems(out);
    } catch {}
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => {
    fetchItems();
    if (Platform.OS === "web" || getCollection(INVENTORY_ITEMS_COLLECTION_ID).length === 0) {
      syncInventoryCollections().then(() => fetchItems());
    }
  }, [fetchItems]));

  // Live-refresh when data changes (realtime events / sync).
  useDataChange(fetchItems);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await syncNow();
    await syncInventoryCollections(true);
    await fetchItems();
    setRefreshing(false);
  }, [fetchItems, syncNow]);

  // FEFO filter: filter by batch-level expiry (earliest expiring batch)
  const filteredItems = items
    .filter((item) => {
      if (selectedCategory !== "All" && item.category !== selectedCategory) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!item.name.toLowerCase().includes(q)) return false;
      }
      if (expiryDays !== null) {
        // FEFO: filter by the earliest batch expiry date (no item-level expiry anymore)
        const expiryRef = item.earliestBatchExpiry;
        if (!expiryRef) return false; // filter active but no batch expiry — exclude
        const daysUntil = Math.ceil((expiryRef.getTime() - Date.now()) / (1000 * 3600 * 24));
        if (expiryDays === 0) {
          // "Expired" filter: show only already-expired stock
          if (daysUntil >= 0) return false;
        } else {
          // N-day window: show stock expiring within N days (not yet expired)
          if (daysUntil > expiryDays || daysUntil < 0) return false;
        }
      }
      return true;
    })
    // When FEFO filter is active, sort by earliest expiry ascending
    .sort((a, b) => {
      if (expiryDays === null) return 0; // default order when no filter
      if (!a.earliestBatchExpiry && !b.earliestBatchExpiry) return 0;
      if (!a.earliestBatchExpiry) return 1;
      if (!b.earliestBatchExpiry) return -1;
      return a.earliestBatchExpiry.getTime() - b.earliestBatchExpiry.getTime();
    });

  const shareProductWhatsApp = (item: Item) => {
    const lines: string[] = [];
    lines.push("📦 *Product Details*");
    lines.push("");
    lines.push(`📛 *Name:* ${item.name}`);
    if (item.category) lines.push(`🏷️ *Category:* ${item.category}`);
    if (item.unit) lines.push(`🧪 *Unit:* ${item.unit}`);
    Linking.openURL(`https://wa.me/?text=${encodeURIComponent(lines.join("\n"))}`);
  };

  const shareAllProducts = () => {
    const lines: string[] = [];
    lines.push("📦 *Product Catalog*");
    lines.push(`📋 *Total Products:* ${filteredItems.length}`);
    lines.push("");
    const grouped: Record<string, Item[]> = {};
    filteredItems.forEach((item) => {
      const cat = item.category || "Other";
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(item);
    });
    Object.entries(grouped).forEach(([cat, catItems]) => {
      lines.push(`*${getCategoryIcon(cat)} ${cat}:*`);
      catItems.forEach((item) => {
        let line = `  • ${item.name}`;
        if (item.unit) line += ` (${item.unit})`;
        lines.push(line);
      });
      lines.push("");
    });
    Linking.openURL(`https://wa.me/?text=${encodeURIComponent(lines.join("\n"))}`);
  };

  const renderItem = ({ item }: { item: Item }) => {
    const colors = getCategoryColor(item.category);
    return (
      <TouchableOpacity style={styles.productCard} onPress={() => router.push(`/product/${item.$id}`)} activeOpacity={0.6}>
        <View style={[styles.productIcon, { backgroundColor: colors.bg }]}>
          <Package color={colors.text} size={20} />
        </View>
        <View style={styles.productInfo}>
          <Text style={styles.productName} numberOfLines={1}>{item.name}</Text>
          <View style={styles.productMeta}>
            {item.category && (
              <View style={[styles.categoryBadge, { backgroundColor: colors.bg }]}>
                <Tag color={colors.text} size={10} />
                <Text style={[styles.categoryBadgeText, { color: colors.text }]}>{item.category}</Text>
              </View>
            )}
            {item.unit && (
              <View style={styles.unitRow}>
                <Beaker color="#9ca3af" size={10} />
                <Text style={styles.unitText}>{item.unit}</Text>
              </View>
            )}
            {item.totalQty !== undefined && item.totalQty > 0 && (
              <View style={styles.qtyBadge}>
                <Text style={styles.qtyBadgeText}>
                  {item.totalQty % 1 === 0 ? item.totalQty : item.totalQty.toFixed(2)}
                  {item.unit ? ` ${item.unit}` : ""}
                </Text>
              </View>
            )}
            {(() => {
              // Show expiry badge from the earliest batch (FEFO) — expiry lives
              // only in inventory_batches now; there is no item-level expiryDate.
              const expiryRef = item.earliestBatchExpiry;
              if (!expiryRef) return null;
              const daysUntil = Math.ceil((expiryRef.getTime() - Date.now()) / (1000 * 3600 * 24));
              if (isNaN(daysUntil)) return null;
              const isExpired = daysUntil < 0;
              const isUrgent = daysUntil >= 0 && daysUntil <= 30;
              return (
                <View style={[styles.expiryBadge, isExpired && styles.expiryBadgeExpired, isUrgent && styles.expiryBadgeUrgent]}>
                  <Clock color={isExpired ? "#dc2626" : isUrgent ? "#f59e0b" : "#16a34a"} size={9} />
                  <Text style={[styles.expiryBadgeText, isExpired && styles.expiryBadgeTextExpired, isUrgent && styles.expiryBadgeTextUrgent]}>
                    {isExpired ? "Expired" : `${daysUntil}d`}
                  </Text>
                </View>
              );
            })()}
          </View>
        </View>
        <TouchableOpacity style={styles.shareBtn} onPress={() => shareProductWhatsApp(item)}>
          <Share2 color="#9ca3af" size={16} />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.outerContainer}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity style={styles.headerBack} onPress={() => router.back()}>
          <ArrowLeft color="#1a1a2e" size={22} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Product Catalog</Text>
          <Text style={styles.headerSub}>{filteredItems.length} product{filteredItems.length !== 1 ? "s" : ""}</Text>
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <TouchableOpacity style={styles.headerAction} onPress={onRefresh} disabled={refreshing}>
            {refreshing ? <ActivityIndicator size="small" color="#16a34a" /> : <RefreshCw color="#16a34a" size={18} />}
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerAction} onPress={shareAllProducts}>
            <Share2 color="#16a34a" size={18} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.searchContainer}>
        <View style={styles.searchBox}>
          <Search color="#9ca3af" size={16} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search products by name..."
            placeholderTextColor="#9ca3af"
            value={search}
            onChangeText={setSearch}
          />
          {search ? (
            <TouchableOpacity onPress={() => setSearch("")}>
              <X color="#9ca3af" size={16} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      <View style={styles.categoryScrollWrapper}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScrollView} contentContainerStyle={styles.categoryList}>
          {categories.map((cat) => {
            const isActive = selectedCategory === cat;
            return (
              <TouchableOpacity
                key={cat}
                style={[styles.categoryPill, isActive && styles.categoryPillActive]}
                onPress={() => setSelectedCategory(cat)}
              >
                {cat !== "All" && <Text style={styles.categoryIcon}>{getCategoryIcon(cat)}</Text>}
                <Text style={[styles.categoryPillText, isActive && styles.categoryPillTextActive]}>{cat}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <View style={styles.expiryFilterContainer}>
        <View style={styles.expiryFilterHeader}>
          <Clock color="#6b7280" size={14} />
          <Text style={styles.expiryFilterLabel}>Expiring within</Text>
          {expiryDays !== null ? (
            <TouchableOpacity onPress={() => setExpiryDays(null)}>
              <Text style={styles.expiryClear}>Clear</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        <View style={styles.expirySliderRow}>
          {expirySteps.map((d) => (
            <TouchableOpacity
              key={d}
              style={[styles.expiryStep, expiryDays === d && styles.expiryStepActive]}
              onPress={() => setExpiryDays(expiryDays === d ? null : d)}
            >
              <Text style={[styles.expiryStepText, expiryDays === d && styles.expiryStepTextActive]}>{d === 0 ? "Expired" : `${d}d`}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      ) : filteredItems.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIcon}>
            <Package color="#9ca3af" size={28} />
          </View>
          {items.length === 0 ? (
            <>
              <Text style={styles.emptyTitle}>No products loaded</Text>
              <Text style={styles.emptySub}>Pull down to refresh and load inventory</Text>
            </>
          ) : (
            <>
              <Text style={styles.emptyTitle}>No products found</Text>
              <Text style={styles.emptySub}>Try a different search or add a new product</Text>
            </>
          )}
        </View>
      ) : (
        <FlatList
          style={styles.list}
          data={filteredItems}
          keyExtractor={(item) => item.$id}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 80 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={["#16a34a"]} />}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          renderItem={renderItem}
          ListHeaderComponent={() => (
            <Text style={styles.listHeader}>{filteredItems.length} product{filteredItems.length !== 1 ? "s" : ""}</Text>
          )}
        />
      )}

      <TouchableOpacity
        style={[styles.fab, { bottom: insets.bottom + 16 }]}
        onPress={() => router.push("/product/add")}
      >
        <Plus color="#fff" size={24} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  outerContainer: { flex: 1, backgroundColor: "#fafafa" },
  list: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 12, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#e5e7eb" },
  headerBack: { width: 44, height: 44, justifyContent: "center", alignItems: "center", marginLeft: -8 },
  headerCenter: { flex: 1, alignItems: "center" },
  headerTitle: { fontSize: 16, fontWeight: "600", color: "#1a1a2e" },
  headerSub: { fontSize: 11, color: "#6b7280" },
  headerAction: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#ecfdf5", justifyContent: "center", alignItems: "center" },
  searchContainer: { paddingHorizontal: 16, paddingVertical: 12, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#e5e7eb" },
  searchBox: { flexDirection: "row", alignItems: "center", backgroundColor: "#f3f4f6", borderRadius: 14, paddingHorizontal: 12, height: 44 },
  searchInput: { flex: 1, marginLeft: 8, fontSize: 14, color: "#1a1a2e" },
  categoryScrollWrapper: { height: 48, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#e5e7eb" },
  categoryScrollView: { flex: 1 },
  categoryList: { paddingHorizontal: 16, paddingVertical: 8, gap: 6, alignItems: "center" },
  categoryPill: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 7, paddingHorizontal: 12, borderRadius: 20, backgroundColor: "#f3f4f6", borderWidth: 1, borderColor: "transparent" },
  categoryPillActive: { backgroundColor: "#16a34a", borderColor: "#16a34a" },
  categoryPillText: { fontSize: 12, fontWeight: "500", color: "#6b7280" },
  categoryPillTextActive: { color: "#fff" },
  categoryIcon: { fontSize: 10 },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText: { color: "#9ca3af", fontSize: 14 },
  emptyContainer: { flex: 1, justifyContent: "center", alignItems: "center", gap: 4 },
  emptyIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: "#f3f4f6", justifyContent: "center", alignItems: "center" },
  emptyTitle: { fontSize: 15, fontWeight: "500", color: "#1a1a2e", marginTop: 8 },
  emptySub: { fontSize: 13, color: "#9ca3af" },
  listHeader: { fontSize: 12, color: "#6b7280", fontWeight: "500", marginBottom: 8 },
  productCard: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#fff", borderRadius: 14, padding: 12, borderWidth: 1, borderColor: "#e5e7eb" },
  productIcon: { width: 40, height: 40, borderRadius: 12, justifyContent: "center", alignItems: "center" },
  productInfo: { flex: 1, gap: 4 },
  productName: { fontSize: 14, fontWeight: "600", color: "#1a1a2e" },
  productMeta: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  categoryBadge: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  categoryBadgeText: { fontSize: 10, fontWeight: "600" },
  unitRow: { flexDirection: "row", alignItems: "center", gap: 2 },
  unitText: { fontSize: 10, color: "#9ca3af" },
  qtyBadge: { backgroundColor: "#ecfdf5", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, borderWidth: 1, borderColor: "#bbf7d0" },
  qtyBadgeText: { fontSize: 10, fontWeight: "700", color: "#16a34a" },
  tallyCode: { fontSize: 10, color: "#9ca3af", fontFamily: "monospace" },
  shareBtn: { width: 32, height: 32, borderRadius: 16, justifyContent: "center", alignItems: "center" },
  expiryFilterContainer: { backgroundColor: "#fff", paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#e5e7eb" },
  expiryFilterHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 },
  expiryFilterLabel: { fontSize: 12, fontWeight: "500", color: "#374151", flex: 1 },
  expiryClear: { fontSize: 12, color: "#dc2626", fontWeight: "600" },
  expirySliderRow: { flexDirection: "row", gap: 6 },
  expiryStep: { paddingVertical: 5, paddingHorizontal: 10, borderRadius: 16, backgroundColor: "#f3f4f6", borderWidth: 1, borderColor: "transparent" },
  expiryStepActive: { backgroundColor: "#dcfce7", borderColor: "#16a34a30" },
  expiryStepText: { fontSize: 11, fontWeight: "500", color: "#6b7280" },
  expiryStepTextActive: { color: "#16a34a", fontWeight: "600" },
  expiryBadge: { flexDirection: "row", alignItems: "center", gap: 2, paddingHorizontal: 4, paddingVertical: 1, borderRadius: 6, backgroundColor: "#dcfce7" },
  expiryBadgeExpired: { backgroundColor: "#fecdd3" },
  expiryBadgeUrgent: { backgroundColor: "#fef3c7" },
  expiryBadgeText: { fontSize: 9, fontWeight: "600", color: "#16a34a" },
  expiryBadgeTextExpired: { color: "#dc2626" },
  expiryBadgeTextUrgent: { color: "#b45309" },
  fab: { position: "absolute", right: 16, width: 56, height: 56, borderRadius: 28, backgroundColor: "#16a34a", justifyContent: "center", alignItems: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 8 },
});
