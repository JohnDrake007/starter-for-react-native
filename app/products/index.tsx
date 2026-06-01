import { View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity, RefreshControl, ScrollView, Linking } from "react-native";
import { useState, useCallback } from "react";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, Search, Package, Tag, Beaker, Share2, Plus, X, Calendar, Clock } from "@/components/Icons";
import { ITEMS_COLLECTION_ID } from "@/lib/appwrite";
import { getCollection } from "@/lib/sync-manager";
import { useNetwork } from "@/lib/network-provider";

interface Item {
  $id: string;
  name: string;
  category?: string;
  unit?: string;
  tallyCode?: string;
  expiryDate?: string;
}

const categories = ["All", "Fertilizer", "Insecticide", "Fungicide", "Herbicide", "PGR", "Organic", "Micronutrient", "Other"];
const expirySteps = [7, 15, 30, 60, 90, 180, 365];

const getCategoryColor = (category: string | null | undefined) => {
  switch (category) {
    case "Fertilizer": return { bg: "#dcfce7", text: "#15803d" };
    case "Insecticide": return { bg: "#fecdd3", text: "#be123c" };
    case "Fungicide": return { bg: "#e9d5ff", text: "#7c3aed" };
    case "Herbicide": return { bg: "#fef3c7", text: "#b45309" };
    case "PGR": return { bg: "#cffafe", text: "#0e7490" };
    case "Organic": return { bg: "#ecfccb", text: "#4d7c0f" };
    case "Micronutrient": return { bg: "#fed7aa", text: "#c2410c" };
    default: return { bg: "#f3f4f6", text: "#6b7280" };
  }
};

const getCategoryIcon = (category: string | null | undefined) => {
  switch (category) {
    case "Fertilizer": return "🌱";
    case "Insecticide": return "🪲";
    case "Fungicide": return "🍄";
    case "Herbicide": return "🌿";
    case "PGR": return "📈";
    case "Organic": return "🍃";
    case "Micronutrient": return "💊";
    default: return "📦";
  }
};

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

  const fetchItems = useCallback(async () => {
    try {
      const allItems = getCollection(ITEMS_COLLECTION_ID).sort((a, b) => 
        new Date(b.$createdAt).getTime() - new Date(a.$createdAt).getTime()
      );
      setItems(allItems.map((d) => ({
        $id: d.$id,
        name: d.name,
        category: d.category || undefined,
        unit: d.unit || undefined,
        tallyCode: d.tallyCode || undefined,
        expiryDate: d.expiryDate || undefined,
      })));
    } catch {}
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { fetchItems(); }, [fetchItems]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await syncNow();
    await fetchItems();
    setRefreshing(false);
  }, [fetchItems, syncNow]);

  const filteredItems = items.filter((item) => {
    if (selectedCategory !== "All" && item.category !== selectedCategory) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!item.name.toLowerCase().includes(q) && !(item.tallyCode || "").toLowerCase().includes(q)) return false;
    }
    if (expiryDays !== null && item.expiryDate) {
      const daysUntil = Math.ceil((new Date(item.expiryDate).getTime() - Date.now()) / (1000 * 3600 * 24));
      if (daysUntil > expiryDays || daysUntil < 0) return false;
    }
    return true;
  });

  const shareProductWhatsApp = (item: Item) => {
    const lines: string[] = [];
    lines.push("📦 *Product Details*");
    lines.push("");
    lines.push(`📛 *Name:* ${item.name}`);
    if (item.category) lines.push(`🏷️ *Category:* ${item.category}`);
    if (item.unit) lines.push(`🧪 *Unit:* ${item.unit}`);
    if (item.tallyCode) lines.push(`🔢 *Tally Code:* ${item.tallyCode}`);
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
            {item.tallyCode && (
              <Text style={styles.tallyCode}>{item.tallyCode}</Text>
            )}
            {item.expiryDate && (() => {
              const daysUntil = Math.ceil((new Date(item.expiryDate).getTime() - Date.now()) / (1000 * 3600 * 24));
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
        <TouchableOpacity style={styles.headerAction} onPress={shareAllProducts}>
          <Share2 color="#16a34a" size={18} />
        </TouchableOpacity>
      </View>

      <View style={styles.searchContainer}>
        <View style={styles.searchBox}>
          <Search color="#9ca3af" size={16} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search products by name, Tally code..."
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
          <Text style={styles.emptyTitle}>No products found</Text>
          <Text style={styles.emptySub}>Try a different search or add a new product</Text>
        </View>
      ) : (
        <FlatList
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
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 12, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#e5e7eb" },
  headerBack: { width: 44, height: 44, justifyContent: "center", alignItems: "center", marginLeft: -8 },
  headerCenter: { flex: 1, alignItems: "center" },
  headerTitle: { fontSize: 16, fontWeight: "600", color: "#1a1a2e" },
  headerSub: { fontSize: 11, color: "#6b7280" },
  headerAction: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#ecfdf5", justifyContent: "center", alignItems: "center" },
  searchContainer: { paddingHorizontal: 16, paddingVertical: 12, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#e5e7eb" },
  searchBox: { flexDirection: "row", alignItems: "center", backgroundColor: "#f3f4f6", borderRadius: 14, paddingHorizontal: 12, height: 44 },
  searchInput: { flex: 1, marginLeft: 8, fontSize: 14, color: "#1a1a2e" },
  categoryScrollView: { backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#e5e7eb" },
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