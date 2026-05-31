import { View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity, RefreshControl } from "react-native";
import { useState, useEffect, useCallback } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Search, Calendar, Package, Sprout, MapPin, ArrowLeft, Filter } from "@/components/Icons";
import { databases, Query, DATABASE_ID, CUSTOMERS_COLLECTION_ID, VISITS_COLLECTION_ID, RECOMMENDATIONS_COLLECTION_ID, ITEMS_COLLECTION_ID } from "@/lib/appwrite";

interface VisitItem {
  $id: string;
  visitDate: string;
  observations?: string;
  nextVisitDate?: string;
  nextVisitTask?: string;
  latitude?: number;
  longitude?: number;
  customerId: string;
  customerName: string;
  cropType?: string;
  recommendationNames: string[];
  recommendationCount: number;
  photoCount: number;
}

export default function AllVisitsScreen() {
  const params = useLocalSearchParams<{ customerId?: string; customerName?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [visits, setVisits] = useState<VisitItem[]>([]);
  const [customers, setCustomers] = useState<Record<string, { name: string; cropType?: string }>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState(params.customerName || "");
  const [selectedCustomerId, setSelectedCustomerId] = useState(params.customerId || "");
  const [showFilters, setShowFilters] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const customersRes = await databases.listDocuments(DATABASE_ID, CUSTOMERS_COLLECTION_ID, [Query.limit(500)]);
      const cMap: Record<string, { name: string; cropType?: string }> = {};
      (customersRes.documents as any[]).forEach((c) => {
        cMap[c.$id] = { name: c.name, cropType: c.cropType };
      });
      setCustomers(cMap);

      const queries: any[] = [Query.limit(100), Query.orderDesc("$createdAt")];
      if (selectedCustomerId) {
        queries.push(Query.equal("customerId", selectedCustomerId));
      }
      const visitsRes = await databases.listDocuments(DATABASE_ID, VISITS_COLLECTION_ID, queries);

      let allRecNames: Record<string, string[]> = {};
      try {
        const recsRes = await databases.listDocuments(DATABASE_ID, RECOMMENDATIONS_COLLECTION_ID, [Query.limit(500)]);
        (recsRes.documents as any[]).forEach((r) => {
          if (!allRecNames[r.visitId]) allRecNames[r.visitId] = [];
          allRecNames[r.visitId].push(r.customItem || r.itemId || "Item");
        });
      } catch {}

      const visitItems: VisitItem[] = (visitsRes.documents as any[]).map((v) => {
        const c = cMap[v.customerId] || { name: "Unknown", cropType: undefined };
        return {
          $id: v.$id,
          visitDate: v.visitDate,
          observations: v.observations || undefined,
          nextVisitDate: v.nextVisitDate || undefined,
          nextVisitTask: v.nextVisitTask || undefined,
          latitude: v.latitude || undefined,
          longitude: v.longitude || undefined,
          customerId: v.customerId || "",
          customerName: c.name,
          cropType: c.cropType,
          recommendationNames: allRecNames[v.$id] || [],
          recommendationCount: (allRecNames[v.$id] || []).length,
          photoCount: 0,
        };
      });
      setVisits(visitItems);
    } catch {}
    setLoading(false);
  }, [selectedCustomerId]);

  useEffect(() => { loadData(); }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const filteredVisits = visits.filter((v) => {
    if (selectedCustomerId) return v.customerId === selectedCustomerId;
    if (!search) return true;
    const q = search.toLowerCase();
    return v.customerName.toLowerCase().includes(q) || (v.observations || "").toLowerCase().includes(q);
  });

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
    } catch { return dateStr; }
  };

  const getInitials = (name: string) => {
    const parts = name.split(" ");
    return parts.length >= 2 ? (parts[0][0] + parts[1][0]).toUpperCase() : name.substring(0, 2).toUpperCase();
  };

  const getAvatarColor = (name: string) => {
    const colors = ["#10b981", "#f59e0b", "#14b8a6", "#f97316", "#84cc16", "#0891b2", "#f43f5e", "#8b5cf6"];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  };

  const customerList = Object.entries(customers).sort((a, b) => a[1].name.localeCompare(b[1].name));

  return (
    <View style={styles.outerContainer}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity style={styles.headerBack} onPress={() => router.back()}>
          <ArrowLeft color="#1a1a2e" size={22} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>All Visits</Text>
          <Text style={styles.headerSub}>{filteredVisits.length} visit{filteredVisits.length !== 1 ? "s" : ""}</Text>
        </View>
        <TouchableOpacity style={styles.headerAction} onPress={() => setShowFilters(!showFilters)}>
          <Filter color={showFilters ? "#16a34a" : "#6b7280"} size={18} />
        </TouchableOpacity>
      </View>

      {showFilters && (
        <View style={styles.filterPanel}>
          <View style={styles.searchBox}>
            <Search color="#9ca3af" size={16} />
            <TextInput style={styles.searchInput} placeholder="Search by farmer name..." placeholderTextColor="#9ca3af" value={search} onChangeText={(t) => { setSearch(t); setSelectedCustomerId(""); }} />
          </View>
          {selectedCustomerId ? (
            <View style={styles.activeFilter}>
              <Sprout color="#16a34a" size={12} />
              <Text style={styles.activeFilterText} numberOfLines={1}>{customers[selectedCustomerId]?.name || "Unknown"}</Text>
              <TouchableOpacity style={styles.activeFilterClear} onPress={() => { setSelectedCustomerId(""); setSearch(""); }}>
                <Text style={styles.activeFilterClearText}>Clear</Text>
              </TouchableOpacity>
            </View>
          ) : null}
          <Text style={styles.filterLabel}>Filter by Farmer</Text>
          <FlatList
            data={customerList}
            keyExtractor={([id]) => id}
            renderItem={({ item: [id, c] }) => (
              <TouchableOpacity
                style={[styles.filterChip, selectedCustomerId === id && styles.filterChipActive]}
                onPress={() => { setSelectedCustomerId(id); setSearch(c.name); }}
              >
                <View style={[styles.filterAvatar, { backgroundColor: getAvatarColor(c.name) }]}>
                  <Text style={styles.filterAvatarText}>{getInitials(c.name)}</Text>
                </View>
                <Text style={[styles.filterChipText, selectedCustomerId === id && styles.filterChipTextActive]} numberOfLines={1}>{c.name}</Text>
                {c.cropType && <Text style={styles.filterCrop}>{c.cropType}</Text>}
              </TouchableOpacity>
            )}
            style={styles.filterList}
            keyboardShouldPersistTaps="handled"
          />
        </View>
      )}

      {loading ? (
        <View style={styles.loadingContainer}><Text style={styles.loadingText}>Loading...</Text></View>
      ) : filteredVisits.length === 0 ? (
        <View style={styles.loadingContainer}>
          <Calendar color="#9ca3af" size={32} />
          <Text style={styles.emptyTitle}>No visits found</Text>
          <Text style={styles.emptySub}>Try a different search or filter</Text>
        </View>
      ) : (
        <FlatList
          data={filteredVisits}
          keyExtractor={(item) => item.$id}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={["#16a34a"]} />}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          renderItem={({ item: v }) => {
            const visitDateLabel = v.visitDate
              ? new Date(v.visitDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })
              : "";
            const daysUntil = v.nextVisitDate
              ? Math.ceil((new Date(v.nextVisitDate).getTime() - Date.now()) / (1000 * 3600 * 24))
              : null;
            return (
              <TouchableOpacity style={styles.visitCard} onPress={() => router.push(`/visit/${v.$id}`)}>
                <View style={[styles.visitAvatar, { backgroundColor: getAvatarColor(v.customerName) }]}>
                  <Text style={styles.visitAvatarText}>{getInitials(v.customerName)}</Text>
                </View>
                <View style={styles.visitInfo}>
                  <View style={styles.visitHeader}>
                    <Text style={styles.visitCustomer} numberOfLines={1}>{v.customerName}</Text>
                    <Text style={styles.visitDate}>{visitDateLabel}</Text>
                  </View>
                  {v.cropType && (
                    <View style={styles.cropRow}>
                      <Sprout color="#6b7280" size={10} />
                      <Text style={styles.cropText}>{v.cropType}</Text>
                    </View>
                  )}
                  {v.observations ? (
                    <Text style={styles.visitObs} numberOfLines={1}>{v.observations.length > 60 ? v.observations.substring(0, 60) + "..." : v.observations}</Text>
                  ) : null}
                  {(v.recommendationCount > 0 || (v.latitude && v.longitude)) && (
                    <View style={styles.chipRow}>
                      {v.recommendationCount > 0 && (
                        <View style={styles.chip}>
                          <Package color="#16a34a" size={10} />
                          <Text style={styles.chipText}>{v.recommendationCount} product{v.recommendationCount > 1 ? "s" : ""}</Text>
                        </View>
                      )}
                      {v.latitude && v.longitude && (
                        <View style={styles.chip}>
                          <MapPin color="#9ca3af" size={10} />
                          <Text style={styles.chipText}>GPS</Text>
                        </View>
                      )}
                    </View>
                  )}
                  {daysUntil !== null ? (
                    <View style={[styles.followBadge, daysUntil <= 0 ? styles.followBadgeRed : daysUntil <= 3 ? styles.followBadgeAmber : styles.followBadgeGreen]}>
                      <Calendar color={daysUntil <= 0 ? "#e11d48" : daysUntil <= 3 ? "#b45309" : "#16a34a"} size={10} />
                      <Text style={[styles.followBadgeText, daysUntil <= 0 ? { color: "#e11d48" } : daysUntil <= 3 ? { color: "#b45309" } : { color: "#16a34a" }]}>
                        {daysUntil <= 0 ? "Overdue" : daysUntil === 1 ? "Tomorrow" : `In ${daysUntil}d`}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  outerContainer: { flex: 1, backgroundColor: "#fafafa" },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 12, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#e5e7eb" },
  headerBack: { padding: 4 },
  headerCenter: { flex: 1, alignItems: "center" },
  headerTitle: { fontSize: 16, fontWeight: "600", color: "#1a1a2e" },
  headerSub: { fontSize: 11, color: "#6b7280" },
  headerAction: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#f3f4f6", justifyContent: "center", alignItems: "center" },
  filterPanel: { backgroundColor: "#fff", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#e5e7eb", gap: 8 },
  searchBox: { flexDirection: "row", alignItems: "center", backgroundColor: "#f3f4f6", borderRadius: 14, paddingHorizontal: 12, height: 44 },
  searchInput: { flex: 1, marginLeft: 8, fontSize: 14, color: "#1a1a2e" },
  activeFilter: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#ecfdf5", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  activeFilterText: { fontSize: 13, fontWeight: "500", color: "#059669", flex: 1 },
  activeFilterClear: { paddingHorizontal: 8 },
  activeFilterClearText: { fontSize: 12, color: "#dc2626", fontWeight: "600" },
  filterLabel: { fontSize: 12, fontWeight: "500", color: "#6b7280" },
  filterList: { maxHeight: 200 },
  filterChip: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12, backgroundColor: "#f9fafb", borderWidth: 1, borderColor: "#e5e7eb", marginBottom: 4 },
  filterChipActive: { backgroundColor: "#ecfdf5", borderColor: "#16a34a30" },
  filterChipText: { fontSize: 13, fontWeight: "500", color: "#1a1a2e", flex: 1 },
  filterChipTextActive: { color: "#059669" },
  filterAvatar: { width: 28, height: 28, borderRadius: 14, justifyContent: "center", alignItems: "center" },
  filterAvatarText: { color: "#fff", fontSize: 10, fontWeight: "700" },
  filterCrop: { fontSize: 10, color: "#6b7280", backgroundColor: "#f3f4f6", paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6 },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center", gap: 4 },
  loadingText: { color: "#9ca3af", fontSize: 14 },
  emptyTitle: { fontSize: 15, fontWeight: "500", color: "#1a1a2e", marginTop: 8 },
  emptySub: { fontSize: 13, color: "#9ca3af" },
  visitCard: { flexDirection: "row", alignItems: "flex-start", gap: 12, backgroundColor: "#fff", borderRadius: 14, padding: 14, borderWidth: 1, borderColor: "#e5e7eb" },
  visitAvatar: { width: 40, height: 40, borderRadius: 20, justifyContent: "center", alignItems: "center" },
  visitAvatarText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  visitInfo: { flex: 1, gap: 2 },
  visitHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  visitCustomer: { fontSize: 14, fontWeight: "600", color: "#1a1a2e", flex: 1 },
  visitDate: { fontSize: 10, color: "#9ca3af", fontWeight: "500" },
  cropRow: { flexDirection: "row", alignItems: "center", gap: 3 },
  cropText: { fontSize: 10, color: "#6b7280" },
  visitObs: { fontSize: 12, color: "#6b7280" },
  chipRow: { flexDirection: "row", gap: 8, marginTop: 2 },
  chip: { flexDirection: "row", alignItems: "center", gap: 3 },
  chipText: { fontSize: 10, color: "#9ca3af", fontWeight: "500" },
  followBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, alignSelf: "flex-start", marginTop: 4 },
  followBadgeRed: { backgroundColor: "#fecdd380" },
  followBadgeAmber: { backgroundColor: "#fef3c780" },
  followBadgeGreen: { backgroundColor: "#dcfce780" },
  followBadgeText: { fontSize: 10, fontWeight: "600" },
});