import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity } from "react-native";
import { useState, useEffect, useCallback } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Bell, Calendar, Sprout, ChevronLeft, ChevronRight } from "@/components/Icons";
import { databases, Query, DATABASE_ID, VISITS_COLLECTION_ID, CUSTOMERS_COLLECTION_ID } from "@/lib/appwrite";

interface CustomerMap {
  [key: string]: { name: string; cropType?: string };
}

interface Reminder {
  $id: string;
  visitId: string;
  nextVisitDate: string;
  nextVisitTask?: string;
  customerId: string;
  customerName?: string;
  cropType?: string;
}

export default function CalendarScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [visitDates, setVisitDates] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [visitsRes, customersRes] = await Promise.all([
        databases.listDocuments(DATABASE_ID, VISITS_COLLECTION_ID, [Query.limit(100)]),
        databases.listDocuments(DATABASE_ID, CUSTOMERS_COLLECTION_ID, [Query.limit(100)]),
      ]);
      const customerMap: CustomerMap = {};
      (customersRes.documents as any[]).forEach((c) => {
        customerMap[c.$id] = { name: c.name, cropType: c.cropType };
      });
      const dates = new Set<string>();
      (visitsRes.documents as any[]).forEach((d) => {
        if (d.visitDate) dates.add(new Date(d.visitDate).toISOString().split("T")[0]);
        if (d.nextVisitDate) dates.add(new Date(d.nextVisitDate).toISOString().split("T")[0]);
      });
      setVisitDates(dates);
      const reminderDocs = (visitsRes.documents as any[]).filter((d) => d.nextVisitDate);
      setReminders(
        reminderDocs.map((d) => {
          const customer = customerMap[d.customerId] || { name: "Unknown", cropType: undefined };
          return {
            $id: d.$id,
            visitId: d.$id,
            nextVisitDate: d.nextVisitDate,
            nextVisitTask: d.nextVisitTask,
            customerId: d.customerId || "",
            customerName: customer.name,
            cropType: customer.cropType,
          };
        })
      );
    } catch {
      setReminders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const dayLabels = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevMonthDays = new Date(year, month, 0).getDate();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const calendarDays: { date: number; isCurrentMonth: boolean; isToday: boolean; isMarked: boolean; fullDate: string }[] = [];
  for (let i = firstDay - 1; i >= 0; i--) {
    const d = prevMonthDays - i;
    const dt = new Date(year, month - 1, d);
    const fd = dt.toISOString().split("T")[0];
    calendarDays.push({ date: d, isCurrentMonth: false, isToday: false, isMarked: visitDates.has(fd), fullDate: fd });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const dt = new Date(year, month, d);
    const fd = dt.toISOString().split("T")[0];
    calendarDays.push({ date: d, isCurrentMonth: true, isToday: dt.getTime() === today.getTime(), isMarked: visitDates.has(fd), fullDate: fd });
  }
  const remaining = 42 - calendarDays.length;
  for (let d = 1; d <= remaining; d++) {
    const dt = new Date(year, month + 1, d);
    const fd = dt.toISOString().split("T")[0];
    calendarDays.push({ date: d, isCurrentMonth: false, isToday: false, isMarked: visitDates.has(fd), fullDate: fd });
  }

  const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  const getDaysUntil = (dateStr: string) => Math.ceil((new Date(dateStr).getTime() - Date.now()) / (1000 * 3600 * 24));

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24, padding: 16 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={["#16a34a"]} />}
    >
      <Text style={styles.title}>Calendar</Text>
      <View style={styles.calendarCard}>
        <View style={styles.monthNav}>
          <TouchableOpacity onPress={() => setCurrentMonth(new Date(year, month - 1, 1))} style={styles.navBtn}>
            <ChevronLeft color="#1a1a2e" size={20} />
          </TouchableOpacity>
          <Text style={styles.monthText}>
            {currentMonth.toLocaleDateString("en-IN", { month: "long", year: "numeric" })}
          </Text>
          <TouchableOpacity onPress={() => setCurrentMonth(new Date(year, month + 1, 1))} style={styles.navBtn}>
            <ChevronRight color="#1a1a2e" size={20} />
          </TouchableOpacity>
        </View>
        <View style={styles.dayLabelsRow}>
          {dayLabels.map((d) => (
            <Text key={d} style={styles.dayLabel}>{d}</Text>
          ))}
        </View>
        <View style={styles.calendarGrid}>
          {calendarDays.map((day, idx) => (
            <View
              key={idx}
              style={[
                styles.dayCell,
                day.isToday && styles.dayCellToday,
              ]}
            >
              <Text style={[
                styles.dayText,
                !day.isCurrentMonth && styles.dayTextMuted,
                day.isToday && styles.dayTextToday,
              ]}>
                {day.date}
              </Text>
              {day.isMarked && !day.isToday && <View style={styles.dot} />}
            </View>
          ))}
        </View>
      </View>

      <Text style={styles.sectionTitle}>Upcoming Reminders</Text>
      {loading ? (
        <Text style={styles.loadingText}>Loading...</Text>
      ) : reminders.length === 0 ? (
        <View style={styles.emptyCard}>
          <Calendar color="#9ca3af" size={32} />
          <Text style={styles.emptyTitle}>No upcoming reminders</Text>
        </View>
      ) : (
        reminders.slice(0, 10).map((r) => {
          const daysUntil = getDaysUntil(r.nextVisitDate);
          const urgency = daysUntil <= 2 ? "#e11d48" : daysUntil <= 7 ? "#f59e0b" : "#16a34a";
          return (
            <TouchableOpacity key={r.$id} style={styles.reminderCard} onPress={() => router.push(`/visit/${r.visitId}`)}>
              <View style={[styles.reminderIcon, { backgroundColor: daysUntil <= 2 ? "#fecdd3" : daysUntil <= 7 ? "#fef3c7" : "#dcfce7" }]}>
                <Bell color={urgency} size={16} />
              </View>
              <View style={styles.reminderInfo}>
                <View style={styles.reminderHeader}>
                  <Text style={styles.reminderName} numberOfLines={1}>{r.customerName || "Unknown"}</Text>
                  <View style={[styles.reminderBadge, { backgroundColor: daysUntil <= 2 ? "#fecdd3" : daysUntil <= 7 ? "#fef3c7" : "#dcfce7" }]}>
                    <Text style={[styles.reminderBadgeText, { color: urgency }]}>{formatDate(r.nextVisitDate)}</Text>
                  </View>
                </View>
                <Text style={styles.reminderTask} numberOfLines={1}>{r.nextVisitTask || "Follow up"}</Text>
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fafafa" },
  title: { fontSize: 22, fontWeight: "700", color: "#1a1a2e", marginBottom: 14 },
  calendarCard: { backgroundColor: "#fff", borderRadius: 16, padding: 16, borderWidth: 1, borderColor: "#e5e7eb", marginBottom: 16 },
  monthNav: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  navBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: "#f3f4f6", justifyContent: "center", alignItems: "center" },
  monthText: { fontSize: 15, fontWeight: "600", color: "#1a1a2e" },
  dayLabelsRow: { flexDirection: "row", justifyContent: "space-around", marginBottom: 4 },
  dayLabel: { fontSize: 10, fontWeight: "500", color: "#9ca3af", width: 40, textAlign: "center" },
  calendarGrid: { flexDirection: "row", flexWrap: "wrap" },
  dayCell: { width: "14.28%", height: 40, justifyContent: "center", alignItems: "center", position: "relative" },
  dayCellToday: { borderRadius: 20, backgroundColor: "#16a34a" },
  dayText: { fontSize: 14, color: "#1a1a2e" },
  dayTextMuted: { color: "#d1d5db" },
  dayTextToday: { color: "#fff", fontWeight: "700" },
  dot: { position: "absolute", bottom: 4, width: 6, height: 6, borderRadius: 3, backgroundColor: "#16a34a" },
  sectionTitle: { fontSize: 16, fontWeight: "600", color: "#1a1a2e", marginBottom: 10 },
  reminderCard: { flexDirection: "row", alignItems: "flex-start", gap: 10, backgroundColor: "#fff", borderRadius: 14, padding: 12, borderWidth: 1, borderColor: "#e5e7eb", marginBottom: 8 },
  reminderIcon: { width: 36, height: 36, borderRadius: 18, justifyContent: "center", alignItems: "center" },
  reminderInfo: { flex: 1, gap: 2 },
  reminderHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  reminderName: { fontSize: 14, fontWeight: "600", color: "#1a1a2e", flex: 1 },
  reminderBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  reminderBadgeText: { fontSize: 10, fontWeight: "600" },
  reminderTask: { fontSize: 12, color: "#6b7280" },
  cropRow: { flexDirection: "row", alignItems: "center", gap: 3 },
  cropText: { fontSize: 10, color: "#6b7280" },
  emptyCard: { backgroundColor: "#fff", borderRadius: 14, padding: 24, alignItems: "center", borderWidth: 1, borderColor: "#e5e7eb" },
  emptyTitle: { fontSize: 14, color: "#9ca3af", marginTop: 8 },
  loadingText: { color: "#9ca3af", textAlign: "center", marginTop: 20 },
});