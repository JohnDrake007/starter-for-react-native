import { View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity, RefreshControl } from "react-native";
import { useState, useCallback } from "react";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Search, Calendar, Package, Sprout, MapPin, ArrowLeft, Filter, X, ChevronLeft, ChevronRight } from "@/components/Icons";
import { CUSTOMERS_COLLECTION_ID, VISITS_COLLECTION_ID, RECOMMENDATIONS_COLLECTION_ID, ITEMS_COLLECTION_ID } from "@/lib/appwrite";
import { getCollection } from "@/lib/sync-manager";
import { useNetwork } from "@/lib/network-provider";

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
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [calMonth, setCalMonth] = useState(new Date());

  const { syncNow } = useNetwork();

  const loadData = useCallback(async () => {
    try {
      const customersRes = getCollection(CUSTOMERS_COLLECTION_ID);
      const cMap: Record<string, { name: string; cropType?: string }> = {};
      customersRes.forEach((c) => {
        cMap[c.$id] = { name: c.name, cropType: c.cropType };
      });
      setCustomers(cMap);

      let visitsRes = getCollection(VISITS_COLLECTION_ID).sort((a, b) => 
        new Date(b.$createdAt).getTime() - new Date(a.$createdAt).getTime()
      );
      if (selectedCustomerId) {
        visitsRes = visitsRes.filter(v => v.customerId === selectedCustomerId);
      }

      let allRecNames: Record<string, string[]> = {};
      try {
        const itemNameMap: Record<string, string> = {};
        getCollection(ITEMS_COLLECTION_ID).forEach((item: any) => { itemNameMap[item.$id] = item.name; });
        const recsRes = getCollection(RECOMMENDATIONS_COLLECTION_ID);
        recsRes.forEach((r) => {
          // Skip §HDR§ section markers — only show actual product names
          if (r.customItem && r.customItem.startsWith("§HDR§")) return;
          const name = r.customItem || (r.itemId ? itemNameMap[r.itemId] : "");
          if (!name) return; // skip unresolved item ids / empties
          if (!allRecNames[r.visitId]) allRecNames[r.visitId] = [];
          allRecNames[r.visitId].push(name);
        });
      } catch {}

      const visitItems: VisitItem[] = visitsRes.map((v) => {
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

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await syncNow();
    await loadData();
    setRefreshing(false);
  }, [loadData, syncNow]);

  const filteredVisits = visits.filter((v) => {
    if (selectedCustomerId && v.customerId !== selectedCustomerId) return false;
    if (search && !selectedCustomerId) {
      const q = search.toLowerCase();
      if (!v.customerName.toLowerCase().includes(q) && !(v.observations || "").toLowerCase().includes(q)) return false;
    }
    if (dateFrom) {
      const visitDate = new Date(v.visitDate).toISOString().split("T")[0];
      if (visitDate < dateFrom) return false;
    }
    if (dateTo) {
      const visitDate = new Date(v.visitDate).toISOString().split("T")[0];
      if (visitDate > dateTo) return false;
    }
    return true;
  });

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
    } catch { return dateStr; }
  };

  const clearDateFilter = () => {
    setDateFrom("");
    setDateTo("");
  };

  const setQuickDate = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() - days + 1);
    setDateFrom(d.toISOString().split("T")[0]);
    setDateTo(new Date().toISOString().split("T")[0]);
  };

  const setDateToday = () => {
    const today = new Date().toISOString().split("T")[0];
    setDateFrom(today);
    setDateTo(today);
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

  const hasDateFilter = !!(dateFrom || dateTo);

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
            <TextInput style={styles.searchInput} placeholder="Search by farmer name..." placeholderTextColor="#9ca3af" value={search} onChangeText={(t) => { setSearch(t); if (selectedCustomerId) { setSelectedCustomerId(""); } }} />
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

          <View style={styles.sectionDivider} />

          <Text style={styles.filterSectionTitle}>Date</Text>

          {hasDateFilter && (
            <View style={styles.activeFilter}>
              <Calendar color="#16a34a" size={12} />
              <Text style={styles.activeFilterText}>
                {dateFrom && dateTo ? `${dateFrom} — ${dateTo}` : dateFrom ? `From ${dateFrom}` : `Until ${dateTo}`}
              </Text>
              <TouchableOpacity style={styles.activeFilterClear} onPress={clearDateFilter}>
                <Text style={styles.activeFilterClearText}>Clear</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.calCard}>
            <View style={styles.calNav}>
              <TouchableOpacity style={styles.calNavBtn} onPress={() => { const d = new Date(calMonth); d.setMonth(d.getMonth() - 1); setCalMonth(d); }}>
                <ChevronLeft color="#1a1a2e" size={18} />
              </TouchableOpacity>
              <Text style={styles.calMonthText}>{calMonth.toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</Text>
              <TouchableOpacity style={styles.calNavBtn} onPress={() => { const d = new Date(calMonth); d.setMonth(d.getMonth() + 1); setCalMonth(d); }}>
                <ChevronRight color="#1a1a2e" size={18} />
              </TouchableOpacity>
            </View>
            <View style={styles.calDayLabels}>
              {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
                <Text key={d} style={styles.calDayLabel}>{d}</Text>
              ))}
            </View>
            <View style={styles.calGrid}>
              {(() => {
                const year = calMonth.getFullYear();
                const month = calMonth.getMonth();
                const firstDay = new Date(year, month, 1).getDay();
                const daysInMonth = new Date(year, month + 1, 0).getDate();
                const prevDays = new Date(year, month, 0).getDate();
                const todayStr = new Date().toISOString().split("T")[0];
                const cells: React.ReactNode[] = [];
                const fromMs = dateFrom ? new Date(dateFrom).getTime() : Infinity;
                const toMs = dateTo ? new Date(dateTo).getTime() : -Infinity;
                const rangeStart = Math.min(fromMs, toMs);
                const rangeEnd = Math.max(fromMs, toMs);
                for (let i = firstDay - 1; i >= 0; i--) {
                  cells.push(<View key={`p${i}`} style={styles.calCell}><Text style={styles.calDayMuted}>{prevDays - i}</Text></View>);
                }
                for (let d = 1; d <= daysInMonth; d++) {
                  const dt = new Date(year, month, d);
                  const ds = dt.toISOString().split("T")[0];
                  const ms = dt.getTime();
                  const isToday = ds === todayStr;
                  const isStart = ds === dateFrom;
                  const isEnd = ds === dateTo;
                  const isInRange = hasDateFilter && ms >= rangeStart && ms <= rangeEnd;
                  const isSelected = isStart || isEnd;
                  cells.push(
                    <TouchableOpacity
                      key={d}
                      style={[
                        styles.calCell,
                        isToday && !isSelected && styles.calCellToday,
                        isSelected && styles.calCellSelected,
                        isInRange && !isSelected && styles.calCellInRange,
                      ]}
                      onPress={() => {
                        if (!dateFrom || (dateFrom && dateTo)) {
                          setDateFrom(ds);
                          setDateTo("");
                        } else {
                          if (ds < dateFrom) {
                            setDateFrom(ds);
                            setDateTo(dateFrom);
                          } else {
                            setDateTo(ds);
                          }
                        }
                      }}
                    >
                      <Text style={[
                        styles.calDayText,
                        !isToday && !isSelected && !isInRange && styles.calDayDefault,
                        isToday && !isSelected && styles.calDayToday,
                        isSelected && styles.calDaySelected,
                        isInRange && !isSelected && styles.calDayInRange,
                      ]}>{d}</Text>
                    </TouchableOpacity>
                  );
                }
                const totalCells = firstDay + daysInMonth;
                const remaining = totalCells <= 35 ? 35 - totalCells : 42 - totalCells;
                for (let d = 1; d <= remaining; d++) {
                  cells.push(<View key={`n${d}`} style={styles.calCell}><Text style={styles.calDayMuted}>{d}</Text></View>);
                }
                return cells;
              })()}
            </View>
          </View>

          <View style={styles.quickDateRow}>
            <TouchableOpacity style={styles.quickDateBtn} onPress={setDateToday}>
              <Text style={styles.quickDateBtnText}>Today</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.quickDateBtn} onPress={() => setQuickDate(7)}>
              <Text style={styles.quickDateBtnText}>Last 7d</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.quickDateBtn} onPress={() => setQuickDate(30)}>
              <Text style={styles.quickDateBtnText}>Last 30d</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.quickDateBtn} onPress={clearDateFilter}>
              <Text style={styles.quickDateBtnText}>All</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.sectionDivider} />

          <Text style={styles.filterSectionTitle}>Filter by Farmer</Text>
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
  headerBack: { width: 44, height: 44, justifyContent: "center", alignItems: "center", marginLeft: -8 },
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
  sectionDivider: { height: 1, backgroundColor: "#f3f4f6", marginVertical: 4 },
  filterSectionTitle: { fontSize: 12, fontWeight: "600", color: "#374151", marginTop: 4 },
  calCard: { backgroundColor: "#f9fafb", borderRadius: 12, borderWidth: 1, borderColor: "#e5e7eb", padding: 10 },
  calNav: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  calNavBtn: { width: 32, height: 32, borderRadius: 8, backgroundColor: "#fff", justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: "#e5e7eb" },
  calMonthText: { fontSize: 13, fontWeight: "600", color: "#1a1a2e" },
  calDayLabels: { flexDirection: "row", justifyContent: "space-around", marginBottom: 4 },
  calDayLabel: { fontSize: 10, fontWeight: "500", color: "#9ca3af", width: 36, textAlign: "center" },
  calGrid: { flexDirection: "row", flexWrap: "wrap" },
  calCell: { width: "14.28%", height: 36, justifyContent: "center", alignItems: "center", borderRadius: 18 },
  calCellToday: { backgroundColor: "#f0fdf4" },
  calCellSelected: { backgroundColor: "#16a34a" },
  calCellInRange: { backgroundColor: "#bbf7d0" },
  calDayText: { fontSize: 13, fontWeight: "500" },
  calDayDefault: { color: "#1a1a2e" },
  calDayMuted: { fontSize: 13, color: "#d1d5db" },
  calDayToday: { color: "#16a34a", fontWeight: "700" },
  calDaySelected: { color: "#fff", fontWeight: "700" },
  calDayInRange: { color: "#166534", fontWeight: "500" },
  quickDateRow: { flexDirection: "row", gap: 8 },
  quickDateBtn: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, backgroundColor: "#f3f4f6", borderWidth: 1, borderColor: "#e5e7eb" },
  quickDateBtnText: { fontSize: 12, fontWeight: "500", color: "#6b7280" },
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