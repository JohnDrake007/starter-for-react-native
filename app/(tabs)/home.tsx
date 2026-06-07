import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity } from "react-native";
import { useState, useCallback } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Bell, Users, ClipboardList, Sprout, PlusCircle, UserPlus, MapPin, ArrowRight, ClipboardCheck } from "@/components/Icons";
import { CUSTOMERS_COLLECTION_ID, VISITS_COLLECTION_ID, RECOMMENDATIONS_COLLECTION_ID, ITEMS_COLLECTION_ID } from "@/lib/appwrite";
import { getCollection } from "@/lib/sync-manager";
import { useNetwork } from "@/lib/network-provider";
import SyncStatusIcon from "@/components/SyncStatusIcon";

interface VisitWithCustomer {
  $id: string;
  visitDate: string;
  observations?: string;
  nextVisitDate?: string;
  nextVisitTask?: string;
  customerId: string;
  customerName: string;
  cropType?: string;
  recommendationNames: string[];
}

interface Reminder {
  $id: string;
  visitId: string;
  customerName: string;
  cropType?: string;
  nextVisitDate: string;
  nextVisitTask: string;
  daysUntil: number;
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [stats, setStats] = useState({ totalCustomers: 0, totalVisits: 0, upcomingReminders: 0 });
  const [recentVisits, setRecentVisits] = useState<VisitWithCustomer[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { syncNow } = useNetwork();

  const loadData = useCallback(async () => {
    try {
      setError(null);
      const allCustomers = getCollection(CUSTOMERS_COLLECTION_ID);
      const allVisits = getCollection(VISITS_COLLECTION_ID).sort((a, b) => 
        new Date(b.$createdAt).getTime() - new Date(a.$createdAt).getTime()
      );

      const customerMap: Record<string, { name: string; cropType?: string }> = {};
      allCustomers.forEach((c) => {
        customerMap[c.$id] = { name: c.name, cropType: c.cropType };
      });

      const reminderDocs = allVisits.filter((d) => d.nextVisitDate);
      const remindersList: Reminder[] = reminderDocs.map((d) => {
        const customer = customerMap[d.customerId] || { name: "Unknown", cropType: undefined };
        const daysUntil = Math.ceil((new Date(d.nextVisitDate).getTime() - Date.now()) / (1000 * 3600 * 24));
        return {
          $id: d.$id,
          visitId: d.$id,
          customerName: customer.name,
          cropType: customer.cropType,
          nextVisitDate: d.nextVisitDate,
          nextVisitTask: d.nextVisitTask || "Follow up",
          daysUntil: daysUntil >= 0 ? daysUntil : 0,
        };
      }).sort((a, b) => a.daysUntil - b.daysUntil);

      setStats({
        totalCustomers: allCustomers.length,
        totalVisits: allVisits.length,
        upcomingReminders: remindersList.length,
      });
      setReminders(remindersList);

      let recsByVisit: Record<string, string[]> = {};
      try {
        const allVisitIds = allVisits.slice(0, 5).map((d) => d.$id);
        if (allVisitIds.length > 0) {
          const allRecs = getCollection(RECOMMENDATIONS_COLLECTION_ID);
          const allItems = getCollection(ITEMS_COLLECTION_ID);
          const itemNameMap: Record<string, string> = {};
          allItems.forEach((item: any) => { itemNameMap[item.$id] = item.name; });

          allRecs.forEach((r) => {
            if (allVisitIds.includes(r.visitId)) {
              if (!recsByVisit[r.visitId]) recsByVisit[r.visitId] = [];
              const name = r.customItem || (r.itemId ? (itemNameMap[r.itemId] || r.itemId) : "Item");
              recsByVisit[r.visitId].push(name);
            }
          });
        }
      } catch {}

      const visitsList: VisitWithCustomer[] = allVisits.slice(0, 5).map((d) => {
        const customer = customerMap[d.customerId] || { name: "Unknown", cropType: undefined };
        return {
          $id: d.$id,
          visitDate: d.visitDate,
          observations: d.observations,
          nextVisitDate: d.nextVisitDate,
          nextVisitTask: d.nextVisitTask,
          customerId: d.customerId || "",
          customerName: customer.name,
          cropType: customer.cropType,
          recommendationNames: recsByVisit[d.$id] || [],
        };
      });
      setRecentVisits(visitsList);
    } catch (e: any) {
      setError("Failed to load local data.");
    }
  }, []);

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

  const formatReminderDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const diffDays = Math.ceil((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Tomorrow";
    if (diffDays > 0 && diffDays <= 7) return `In ${diffDays} days`;
    return date.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  };

  const today = new Date();
  const greeting = today.getHours() < 12 ? "Good Morning" : today.getHours() < 17 ? "Good Afternoon" : "Good Evening";

  return (
    <View style={styles.outerContainer}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={["#16a34a"]} />}
      >
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.greeting}>{greeting} {"\u{1F44B}"}</Text>
            <Text style={styles.dateText}>
              {today.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            </Text>
          </View>
          <View style={styles.badge}>
            <SyncStatusIcon size={14} />
            <Sprout color="#16a34a" size={14} />
            <Text style={styles.badgeText}>CCS SmartVisit</Text>
          </View>
        </View>

        {error && (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <View style={styles.statsRow}>
          <TouchableOpacity style={[styles.statCard, { backgroundColor: "#ecfdf5" }]} onPress={() => router.push("/(tabs)/customers")} activeOpacity={0.75}>
            <View style={[styles.statIcon, { backgroundColor: "#d1fae5" }]}>
              <Users color="#059669" size={16} />
            </View>
            <Text style={[styles.statNumber, { color: "#047857" }]}>{stats.totalCustomers}</Text>
            <Text style={[styles.statLabel, { color: "#059669" }]}>Customers</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.statCard, { backgroundColor: "#fffbeb" }]} onPress={() => router.push("/visits" as any)} activeOpacity={0.75}>
            <View style={[styles.statIcon, { backgroundColor: "#fef3c7" }]}>
              <ClipboardList color="#b45309" size={16} />
            </View>
            <Text style={[styles.statNumber, { color: "#92400e" }]}>{stats.totalVisits}</Text>
            <Text style={[styles.statLabel, { color: "#b45309" }]}>Visits</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.statCard, { backgroundColor: "#fff1f2" }]} onPress={() => router.push("/(tabs)/calendar")} activeOpacity={0.75}>
            <View style={[styles.statIcon, { backgroundColor: "#fecdd3" }]}>
              <Bell color="#e11d48" size={16} />
            </View>
            <Text style={[styles.statNumber, { color: "#be123c" }]}>{stats.upcomingReminders}</Text>
            <Text style={[styles.statLabel, { color: "#e11d48" }]}>Reminders</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.quickActionsRow}>
          <TouchableOpacity style={styles.primaryButton} onPress={() => router.push("/(tabs)/new-visit")}>
            <PlusCircle color="#fff" size={16} />
            <Text style={styles.primaryButtonText}>New Visit</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.outlineButton} onPress={() => router.push("/customer/add")}>
            <UserPlus color="#16a34a" size={16} />
            <Text style={styles.outlineButtonText}>Add Customer</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Upcoming Reminders</Text>
          {reminders.length === 0 ? (
            <View style={styles.emptyCard}>
              <Bell color="#9ca3af" size={28} />
              <Text style={styles.emptyTitle}>No upcoming reminders</Text>
            </View>
          ) : (
            reminders.slice(0, 4).map((r) => {
              const urgency = r.daysUntil <= 2 ? "#e11d48" : r.daysUntil <= 7 ? "#f59e0b" : "#16a34a";
              const urgencyBg = r.daysUntil <= 2 ? "#fecdd3" : r.daysUntil <= 7 ? "#fef3c7" : "#dcfce7";
              return (
                <TouchableOpacity key={r.$id} style={styles.reminderCard} onPress={() => router.push(`/visit/${r.visitId}`)}>
                  <View style={[styles.reminderIcon, { backgroundColor: urgencyBg }]}>
                    <Bell color={urgency} size={16} />
                  </View>
                  <View style={styles.reminderInfo}>
                    <View style={styles.reminderHeader}>
                      <Text style={styles.reminderName} numberOfLines={1}>{r.customerName}</Text>
                      <View style={[styles.reminderBadge, { backgroundColor: urgencyBg }]}>
                        <Text style={[styles.reminderBadgeText, { color: urgency }]}>{formatReminderDate(r.nextVisitDate)}</Text>
                      </View>
                    </View>
                    <Text style={styles.reminderTask} numberOfLines={1}>{r.nextVisitTask}</Text>
                    {r.cropType ? (
                      <View style={styles.cropRow}>
                        <Sprout color="#6b7280" size={10} />
                        <Text style={styles.cropText}>{r.cropType}</Text>
                      </View>
                    ) : null}
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Visits</Text>
          {recentVisits.length === 0 ? (
            <View style={styles.emptyCard}>
              <ClipboardList color="#9ca3af" size={28} />
              <Text style={styles.emptyTitle}>No visits yet</Text>
              <Text style={styles.emptySub}>Create a new visit to get started</Text>
            </View>
          ) : (
            recentVisits.map((v) => {
              const visitDateLabel = v.visitDate
                ? new Date(v.visitDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })
                : "";
              return (
                <TouchableOpacity key={v.$id} style={styles.visitCard} onPress={() => router.push(`/visit/${v.$id}`)}>
                  <View style={styles.visitAvatar}>
                    <MapPin color="#16a34a" size={16} />
                  </View>
                  <View style={styles.visitInfo}>
                    <View style={styles.visitHeader}>
                      <Text style={styles.visitCustomer} numberOfLines={1}>{v.customerName}</Text>
                      <Text style={styles.visitDate}>{visitDateLabel}</Text>
                    </View>
                    {v.observations ? (
                      <Text style={styles.visitObs} numberOfLines={1}>{v.observations.length > 60 ? v.observations.substring(0, 60) + "..." : v.observations}</Text>
                    ) : null}
                    {v.recommendationNames.length > 0 ? (
                      <View style={styles.recRow}>
                        {v.recommendationNames.slice(0, 2).map((name, idx) => (
                          <View key={idx} style={styles.recPill}>
                            <Text style={styles.recPillText}>{name}</Text>
                          </View>
                        ))}
                        {v.recommendationNames.length > 2 ? (
                          <View style={styles.recPill}>
                            <Text style={styles.recPillText}>+{v.recommendationNames.length - 2}</Text>
                          </View>
                        ) : null}
                      </View>
                    ) : null}
                  </View>
                  <ArrowRight color="#9ca3af" size={16} />
                </TouchableOpacity>
              );
            })
          )}
          <TouchableOpacity style={styles.viewAllButton} onPress={() => router.push("/visits" as any)}>
            <ClipboardCheck color="#16a34a" size={16} />
            <Text style={styles.viewAllText}>View All Visits</Text>
            <ArrowRight color="#16a34a" size={16} />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  outerContainer: { flex: 1, backgroundColor: "#fafafa" },
  container: { flex: 1, padding: 16 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 },
  greeting: { fontSize: 22, fontWeight: "700", color: "#1a1a2e" },
  dateText: { fontSize: 13, color: "#6b7280", marginTop: 2 },
  badge: { flexDirection: "row", alignItems: "center", backgroundColor: "#dcfce7", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, gap: 4 },
  badgeText: { fontSize: 12, fontWeight: "600", color: "#16a34a" },
  statsRow: { flexDirection: "row", gap: 10, marginBottom: 20 },
  statCard: { flex: 1, borderRadius: 14, padding: 14, alignItems: "center", borderWidth: 1, borderColor: "rgba(0,0,0,0.04)" },
  statIcon: { width: 34, height: 34, borderRadius: 10, justifyContent: "center", alignItems: "center", marginBottom: 6 },
  statNumber: { fontSize: 24, fontWeight: "700" },
  statLabel: { fontSize: 11, fontWeight: "600" },
  quickActionsRow: { flexDirection: "row", gap: 10, marginBottom: 24 },
  primaryButton: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#16a34a", borderRadius: 14, padding: 14, elevation: 3 },
  primaryButtonText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  outlineButton: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1.5, borderColor: "#16a34a40", borderRadius: 14, padding: 14 },
  outlineButtonText: { color: "#16a34a", fontSize: 15, fontWeight: "600" },
  viewAllButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderRadius: 14, borderWidth: 1.5, borderColor: "#16a34a30", marginTop: 8 },
  viewAllText: { fontSize: 14, fontWeight: "600", color: "#16a34a" },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 16, fontWeight: "600", color: "#1a1a2e", marginBottom: 10 },
  errorCard: { backgroundColor: "#fef2f2", borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: "#fecaca" },
  errorText: { color: "#b91c1c", fontSize: 13, lineHeight: 18 },
  emptyCard: { backgroundColor: "#fff", borderRadius: 14, padding: 24, alignItems: "center", borderWidth: 1, borderColor: "#e5e7eb" },
  emptyTitle: { fontSize: 14, fontWeight: "500", color: "#1a1a2e", marginTop: 8 },
  emptySub: { fontSize: 12, color: "#9ca3af" },
  reminderCard: { flexDirection: "row", alignItems: "flex-start", gap: 10, backgroundColor: "#fff", borderRadius: 14, padding: 12, borderWidth: 1, borderColor: "#e5e7eb", marginBottom: 8 },
  reminderIcon: { width: 36, height: 36, borderRadius: 18, justifyContent: "center", alignItems: "center" },
  reminderInfo: { flex: 1, gap: 2 },
  reminderHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  reminderName: { fontSize: 14, fontWeight: "600", color: "#1a1a2e", flex: 1 },
  reminderBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  reminderBadgeText: { fontSize: 10, fontWeight: "600" },
  reminderTask: { fontSize: 12, color: "#6b7280" },
  cropRow: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 2 },
  cropText: { fontSize: 10, color: "#6b7280" },
  visitCard: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#fff", borderRadius: 14, padding: 12, borderWidth: 1, borderColor: "#e5e7eb", marginBottom: 8 },
  visitAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#dcfce780", justifyContent: "center", alignItems: "center" },
  visitInfo: { flex: 1, gap: 2 },
  visitHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  visitCustomer: { fontSize: 14, fontWeight: "600", color: "#1a1a2e", flex: 1 },
  visitDate: { fontSize: 10, color: "#9ca3af", fontWeight: "500" },
  visitObs: { fontSize: 12, color: "#6b7280" },
  recRow: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 2 },
  recPill: { backgroundColor: "#dcfce780", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  recPillText: { fontSize: 10, fontWeight: "500", color: "#16a34a" },
});