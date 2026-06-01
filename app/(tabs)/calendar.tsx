import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, Modal, FlatList } from "react-native";
import { useState, useCallback } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Bell, Calendar, Sprout, ChevronLeft, ChevronRight, ChevronDown, X } from "@/components/Icons";
import { VISITS_COLLECTION_ID, CUSTOMERS_COLLECTION_ID } from "@/lib/appwrite";
import { getCollection } from "@/lib/sync-manager";
import { useNetwork } from "@/lib/network-provider";

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

const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default function CalendarScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [pickerYear, setPickerYear] = useState(new Date().getFullYear());
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [visitDates, setVisitDates] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const { syncNow } = useNetwork();

  const loadData = useCallback(async () => {
    try {
      const visitsRes = getCollection(VISITS_COLLECTION_ID);
      const customersRes = getCollection(CUSTOMERS_COLLECTION_ID);

      const customerMap: CustomerMap = {};
      customersRes.forEach((c) => {
        customerMap[c.$id] = { name: c.name, cropType: c.cropType };
      });
      const dates = new Set<string>();
      visitsRes.forEach((d) => {
        if (d.visitDate) dates.add(new Date(d.visitDate).toISOString().split("T")[0]);
        if (d.nextVisitDate) dates.add(new Date(d.nextVisitDate).toISOString().split("T")[0]);
      });
      setVisitDates(dates);
      const reminderDocs = visitsRes.filter((d) => d.nextVisitDate);
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

  const dayLabels = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevMonthDays = new Date(year, month, 0).getDate();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split("T")[0];

  const calendarDays: { date: number; isCurrentMonth: boolean; isToday: boolean; isMarked: boolean; isSelected: boolean; fullDate: string }[] = [];
  for (let i = firstDay - 1; i >= 0; i--) {
    const d = prevMonthDays - i;
    const dt = new Date(year, month - 1, d);
    const fd = dt.toISOString().split("T")[0];
    calendarDays.push({ date: d, isCurrentMonth: false, isToday: false, isMarked: visitDates.has(fd), isSelected: fd === selectedDate, fullDate: fd });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const dt = new Date(year, month, d);
    const fd = dt.toISOString().split("T")[0];
    calendarDays.push({ date: d, isCurrentMonth: true, isToday: fd === todayStr, isMarked: visitDates.has(fd), isSelected: fd === selectedDate, fullDate: fd });
  }
  const remaining = 42 - calendarDays.length;
  for (let d = 1; d <= remaining; d++) {
    const dt = new Date(year, month + 1, d);
    const fd = dt.toISOString().split("T")[0];
    calendarDays.push({ date: d, isCurrentMonth: false, isToday: false, isMarked: visitDates.has(fd), isSelected: fd === selectedDate, fullDate: fd });
  }

  const filteredReminders = selectedDate
    ? reminders.filter((r) => {
        const rd = new Date(r.nextVisitDate).toISOString().split("T")[0];
        return rd === selectedDate;
      })
    : reminders;

  const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  const getDaysUntil = (dateStr: string) => Math.ceil((new Date(dateStr).getTime() - Date.now()) / (1000 * 3600 * 24));
  const getDaysLabel = (days: number) => days <= 0 ? "Overdue" : days === 1 ? "Tomorrow" : `${days} days away`;

  const handleDayPress = (fd: string) => {
    setSelectedDate((prev) => prev === fd ? null : fd);
  };

  const handleMonthSelect = (m: number) => {
    setCurrentMonth(new Date(pickerYear, m, 1));
    setShowMonthPicker(false);
  };

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
          <TouchableOpacity style={styles.monthBtn} onPress={() => { setPickerYear(year); setShowMonthPicker(true); }}>
            <Text style={styles.monthText}>
              {currentMonth.toLocaleDateString("en-IN", { month: "long", year: "numeric" })}
            </Text>
            <ChevronDown color="#6b7280" size={16} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setCurrentMonth(new Date(year, month + 1, 1))} style={styles.navBtn}>
            <ChevronRight color="#1a1a2e" size={20} />
          </TouchableOpacity>
        </View>

        {selectedDate && (
          <View style={styles.selectedBar}>
            <Text style={styles.selectedBarText}>
              {new Date(selectedDate + "T00:00:00").toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            </Text>
            <TouchableOpacity onPress={() => setSelectedDate(null)}>
              <X color="#6b7280" size={16} />
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.dayLabelsRow}>
          {dayLabels.map((d) => (
            <Text key={d} style={styles.dayLabel}>{d}</Text>
          ))}
        </View>
        <View style={styles.calendarGrid}>
          {calendarDays.map((day, idx) => (
            <TouchableOpacity
              key={idx}
              style={[
                styles.dayCell,
                day.isToday && !day.isSelected && styles.dayCellToday,
                day.isSelected && styles.dayCellSelected,
              ]}
              onPress={() => handleDayPress(day.fullDate)}
              activeOpacity={0.7}
            >
              <Text style={[
                styles.dayText,
                !day.isCurrentMonth && styles.dayTextMuted,
                day.isToday && !day.isSelected && styles.dayTextToday,
                day.isSelected && styles.dayTextSelected,
              ]}>
                {day.date}
              </Text>
              {day.isMarked && !day.isToday && !day.isSelected && <View style={styles.dot} />}
              {day.isMarked && day.isSelected && <View style={[styles.dot, { backgroundColor: "#fff" }]} />}
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.legendRow}>
          <View style={styles.legendItem}>
            <View style={styles.legendDot} />
            <Text style={styles.legendText}>Visit / Reminder</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={styles.legendToday}>
              <Text style={styles.legendTodayText}>T</Text>
            </View>
            <Text style={styles.legendText}>Today</Text>
          </View>
        </View>
      </View>

      <View style={styles.reminderHeader}>
        <Text style={styles.sectionTitle}>
          {selectedDate ? `Reminders on ${new Date(selectedDate + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : "Upcoming Reminders"}
        </Text>
        {filteredReminders.length > 0 && (
          <Text style={styles.reminderCount}>{filteredReminders.length}</Text>
        )}
      </View>
      {loading ? (
        <Text style={styles.loadingText}>Loading...</Text>
      ) : filteredReminders.length === 0 ? (
        <View style={styles.emptyCard}>
          <Calendar color="#9ca3af" size={32} />
          <Text style={styles.emptyTitle}>{selectedDate ? "No reminders on this date" : "No upcoming reminders"}</Text>
        </View>
      ) : (
        filteredReminders.slice(0, 10).map((r) => {
          const daysUntil = getDaysUntil(r.nextVisitDate);
          const urgency = daysUntil <= 2 ? "#e11d48" : daysUntil <= 7 ? "#f59e0b" : "#16a34a";
          return (
            <TouchableOpacity key={r.$id} style={styles.reminderCard} onPress={() => router.push(`/visit/${r.visitId}`)}>
              <View style={[styles.reminderIcon, { backgroundColor: daysUntil <= 2 ? "#fecdd3" : daysUntil <= 7 ? "#fef3c7" : "#dcfce7" }]}>
                <Bell color={urgency} size={16} />
              </View>
              <View style={styles.reminderInfo}>
<View style={styles.reminderSection}>
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
                <Text style={[styles.daysAwayText, { color: urgency }]}>
                  {getDaysLabel(daysUntil)}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })
      )}

      <Modal visible={showMonthPicker} animationType="slide" transparent onRequestClose={() => setShowMonthPicker(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Month</Text>
              <TouchableOpacity onPress={() => setShowMonthPicker(false)}>
                <X color="#1a1a2e" size={22} />
              </TouchableOpacity>
            </View>
            <View style={styles.yearNav}>
              <TouchableOpacity style={styles.yearBtn} onPress={() => setPickerYear(pickerYear - 1)}>
                <ChevronLeft color="#1a1a2e" size={20} />
              </TouchableOpacity>
              <Text style={styles.yearText}>{pickerYear}</Text>
              <TouchableOpacity style={styles.yearBtn} onPress={() => setPickerYear(pickerYear + 1)}>
                <ChevronRight color="#1a1a2e" size={20} />
              </TouchableOpacity>
            </View>
            <View style={styles.monthGrid}>
              {monthNames.map((m, idx) => {
                const isCurrent = pickerYear === new Date().getFullYear() && idx === new Date().getMonth();
                const isSelected = pickerYear === year && idx === month;
                return (
                  <TouchableOpacity
                    key={m}
                    style={[
                      styles.monthItem,
                      isSelected && styles.monthItemSelected,
                      isCurrent && !isSelected && styles.monthItemCurrent,
                    ]}
                    onPress={() => handleMonthSelect(idx)}
                  >
                    <Text style={[
                      styles.monthItemText,
                      isSelected && styles.monthItemTextSelected,
                    ]}>{m.slice(0, 3)}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fafafa" },
  title: { fontSize: 22, fontWeight: "700", color: "#1a1a2e", marginBottom: 14 },
  calendarCard: { backgroundColor: "#fff", borderRadius: 16, padding: 16, borderWidth: 1, borderColor: "#e5e7eb", marginBottom: 16 },
  monthNav: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  monthBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  navBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: "#f3f4f6", justifyContent: "center", alignItems: "center" },
  monthText: { fontSize: 15, fontWeight: "600", color: "#1a1a2e" },
  selectedBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "#ecfdf5", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6, marginBottom: 8 },
  selectedBarText: { fontSize: 13, fontWeight: "500", color: "#059669", flex: 1 },
  dayLabelsRow: { flexDirection: "row", justifyContent: "space-around", marginBottom: 4 },
  dayLabel: { fontSize: 10, fontWeight: "500", color: "#9ca3af", width: 40, textAlign: "center" },
  calendarGrid: { flexDirection: "row", flexWrap: "wrap" },
  dayCell: { width: "14.28%", height: 40, justifyContent: "center", alignItems: "center", position: "relative" },
  dayCellToday: { borderRadius: 20, backgroundColor: "#16a34a" },
  dayCellSelected: { borderRadius: 20, backgroundColor: "#059669" },
  dayText: { fontSize: 14, color: "#1a1a2e" },
  dayTextMuted: { color: "#d1d5db" },
  dayTextToday: { color: "#fff", fontWeight: "700" },
  dayTextSelected: { color: "#fff", fontWeight: "700" },
  dot: { position: "absolute", bottom: 4, width: 6, height: 6, borderRadius: 3, backgroundColor: "#16a34a" },
  legendRow: { flexDirection: "row", alignItems: "center", gap: 16, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: "#f3f4f6" },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#16a34a" },
  legendToday: { width: 16, height: 16, borderRadius: 8, backgroundColor: "#16a34a", justifyContent: "center", alignItems: "center" },
  legendTodayText: { color: "#fff", fontSize: 8, fontWeight: "700" },
  legendText: { fontSize: 10, color: "#9ca3af" },
  reminderSection: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  sectionTitle: { fontSize: 16, fontWeight: "600", color: "#1a1a2e" },
  reminderCount: { fontSize: 12, fontWeight: "500", color: "#6b7280", backgroundColor: "#f3f4f6", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
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
  daysAwayText: { fontSize: 10, fontWeight: "500", marginTop: 2 },
  emptyCard: { backgroundColor: "#fff", borderRadius: 14, padding: 24, alignItems: "center", borderWidth: 1, borderColor: "#e5e7eb" },
  emptyTitle: { fontSize: 14, color: "#9ca3af", marginTop: 8 },
  loadingText: { color: "#9ca3af", textAlign: "center", marginTop: 20 },
  modalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
  modalContent: { backgroundColor: "#fff", borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 20, paddingBottom: 40, paddingTop: 16 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: "700", color: "#1a1a2e" },
  yearNav: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 20, marginBottom: 16 },
  yearBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#f3f4f6", justifyContent: "center", alignItems: "center" },
  yearText: { fontSize: 20, fontWeight: "700", color: "#1a1a2e", minWidth: 60, textAlign: "center" },
  monthGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  monthItem: { width: "23%", aspectRatio: 1.6, justifyContent: "center", alignItems: "center", borderRadius: 12, backgroundColor: "#f9fafb", borderWidth: 1, borderColor: "#e5e7eb" },
  monthItemSelected: { backgroundColor: "#16a34a", borderColor: "#16a34a" },
  monthItemCurrent: { borderColor: "#16a34a", borderWidth: 2 },
  monthItemText: { fontSize: 14, fontWeight: "500", color: "#1a1a2e" },
  monthItemTextSelected: { color: "#fff", fontWeight: "700" },
});