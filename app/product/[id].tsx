import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, Alert, Linking, TextInput, Platform } from "react-native";
import { useState, useCallback, useRef } from "react";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, Package, Tag, Beaker, Hash, Calendar, Clock, Pencil, Check, X, Share2 } from "@/components/Icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { ITEMS_COLLECTION_ID } from "@/lib/appwrite";
import { getDocument, updateDocument } from "@/lib/sync-manager";
import { useNetwork } from "@/lib/network-provider";

const categories = ["Fertilizer", "Insecticide", "Fungicide", "Herbicide", "PGR", "Organic", "Micronutrient", "Other"];
const units = ["kg", "g", "L", "ml", "packet", "bottle", "bag", "tablet", "piece"];

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

export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { syncNow } = useNetwork();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [product, setProduct] = useState<any>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [editName, setEditName] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editUnit, setEditUnit] = useState("");
  const [editTallyCode, setEditTallyCode] = useState("");
  const [editExpiryDate, setEditExpiryDate] = useState("");
  const [showExpiryDatePicker, setShowExpiryDatePicker] = useState(false);
  const expiryDatePickerHandled = useRef(false);

  const loadData = useCallback(async () => {
    if (!id) return;
    try {
      const doc = getDocument(ITEMS_COLLECTION_ID, id);
      if (doc) {
        setProduct(doc);
        setEditName(doc.name || "");
        setEditCategory(doc.category || "");
        setEditUnit(doc.unit || "");
        setEditTallyCode(doc.tallyCode || "");
        setEditExpiryDate(doc.expiryDate || "");
      }
    } catch {}
    setLoading(false);
  }, [id]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await syncNow();
    await loadData();
    setRefreshing(false);
  }, [loadData, syncNow]);

  const startEditing = () => {
    if (!product) return;
    setEditName(product.name || "");
    setEditCategory(product.category || "");
    setEditUnit(product.unit || "");
    setEditTallyCode(product.tallyCode || "");
    setEditExpiryDate(product.expiryDate || "");
    setEditing(true);
  };

  const cancelEditing = () => {
    setEditing(false);
    setShowExpiryDatePicker(false);
  };

  const openExpiryDatePicker = () => {
    expiryDatePickerHandled.current = false;
    setShowExpiryDatePicker(true);
  };

  const onExpiryDateChange = (_event: any, date?: Date) => {
    if (expiryDatePickerHandled.current) return;
    expiryDatePickerHandled.current = true;
    setShowExpiryDatePicker(false);
    if (date) {
      setEditExpiryDate(date.toISOString().split("T")[0]);
    }
  };

  const saveEdits = async () => {
    if (!editName.trim()) { Alert.alert("Error", "Product name is required"); return; }
    setSaving(true);
    try {
      await updateDocument(ITEMS_COLLECTION_ID, id, {
        name: editName.trim(),
        category: editCategory || null,
        unit: editUnit || null,
        tallyCode: editTallyCode.trim() || null,
        expiryDate: editExpiryDate.trim() || null,
      });
      await syncNow();
      setEditing(false);
      await loadData();
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const shareProduct = () => {
    if (!product) return;
    const lines: string[] = [];
    lines.push("📦 *Product Details*");
    lines.push("");
    lines.push(`📛 *Name:* ${product.name}`);
    if (product.category) lines.push(`🏷️ *Category:* ${product.category}`);
    if (product.unit) lines.push(`🧪 *Unit:* ${product.unit}`);
    if (product.tallyCode) lines.push(`🔢 *Tally Code:* ${product.tallyCode}`);
    if (product.expiryDate) {
      const daysUntil = Math.ceil((new Date(product.expiryDate).getTime() - Date.now()) / (1000 * 3600 * 24));
      lines.push(`📅 *Expiry:* ${new Date(product.expiryDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} (${daysUntil < 0 ? "Expired" : `${daysUntil} days left`})`);
    }
    Linking.openURL(`https://wa.me/?text=${encodeURIComponent(lines.join("\n"))}`);
  };

  const formatDate = (dateStr: string) => {
    try { return new Date(dateStr).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); }
    catch { return dateStr; }
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { paddingTop: insets.top }]}>
        <Text style={styles.loadingText}>Loading product...</Text>
      </View>
    );
  }

  if (!product) {
    return (
      <View style={[styles.loadingContainer, { paddingTop: insets.top }]}>
        <Text style={styles.loadingText}>Product not found</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <ArrowLeft color="#16a34a" size={18} />
          <Text style={styles.backBtnText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const colors = getCategoryColor(product.category);
  const daysUntilExpiry = product.expiryDate ? Math.ceil((new Date(product.expiryDate).getTime() - Date.now()) / (1000 * 3600 * 24)) : null;
  const isExpired = daysUntilExpiry !== null && daysUntilExpiry < 0;
  const isUrgent = daysUntilExpiry !== null && daysUntilExpiry >= 0 && daysUntilExpiry <= 30;

  return (
    <View style={styles.outerContainer}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity style={styles.headerBack} onPress={() => router.back()}>
          <ArrowLeft color="#1a1a2e" size={22} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Product Details</Text>
        </View>
        {editing ? (
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TouchableOpacity style={styles.headerAction} onPress={cancelEditing}>
              <X color="#dc2626" size={18} />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.headerAction, styles.headerActionGreen, saving && styles.headerActionDisabled]} onPress={saveEdits} disabled={saving}>
              <Check color="#fff" size={18} />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TouchableOpacity style={styles.headerAction} onPress={shareProduct}>
              <Share2 color="#16a34a" size={18} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.headerAction} onPress={startEditing}>
              <Pencil color="#16a34a" size={18} />
            </TouchableOpacity>
          </View>
        )}
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40, gap: 12 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={["#16a34a"]} />}>
        {editing ? (
          <>
            <View style={styles.card}>
              <Text style={styles.label}>Product Name *</Text>
              <View style={styles.inputRow}>
                <Package color="#9ca3af" size={16} />
                <TextInput style={styles.input} value={editName} onChangeText={setEditName} placeholder="Product name" placeholderTextColor="#9ca3af" />
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.label}>Category</Text>
              <View style={styles.chipRow}>
                {categories.map((cat) => (
                  <TouchableOpacity key={cat} style={[styles.chip, editCategory === cat && styles.chipActive]} onPress={() => setEditCategory(editCategory === cat ? "" : cat)}>
                    <Text style={[styles.chipText, editCategory === cat && styles.chipTextActive]}>{getCategoryIcon(cat)} {cat}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.label}>Unit</Text>
              <View style={styles.chipRow}>
                {units.map((u) => (
                  <TouchableOpacity key={u} style={[styles.chip, editUnit === u && styles.chipActive]} onPress={() => setEditUnit(editUnit === u ? "" : u)}>
                    <Text style={[styles.chipText, editUnit === u && styles.chipTextActive]}>{u}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.label}>Tally Code</Text>
              <View style={styles.inputRow}>
                <Hash color="#9ca3af" size={16} />
                <TextInput style={styles.input} value={editTallyCode} onChangeText={setEditTallyCode} placeholder="e.g. FER001" placeholderTextColor="#9ca3af" autoCapitalize="characters" />
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.label}>Expiry Date</Text>
              <TouchableOpacity style={styles.inputRow} onPress={openExpiryDatePicker}>
                <Calendar color={editExpiryDate ? "#16a34a" : "#9ca3af"} size={16} />
                <Text style={[styles.input, { flex: 1 }, editExpiryDate ? { color: "#1a1a2e" } : { color: "#9ca3af" }]}>
                  {editExpiryDate
                    ? new Date(editExpiryDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
                    : "Select expiry date"}
                </Text>
                {editExpiryDate ? (
                  <TouchableOpacity onPress={() => setEditExpiryDate("")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <X color="#9ca3af" size={14} />
                  </TouchableOpacity>
                ) : null}
              </TouchableOpacity>
              {showExpiryDatePicker && (
                <DateTimePicker
                  value={editExpiryDate ? new Date(editExpiryDate) : new Date()}
                  mode="date"
                  display={Platform.OS === "ios" ? "inline" : "default"}
                  onChange={onExpiryDateChange}
                />
              )}
              {editExpiryDate ? (
                <View style={[styles.expiryBadge, isExpired && styles.expiryBadgeExpired, isUrgent && styles.expiryBadgeUrgent]}>
                  <Clock color={isExpired ? "#dc2626" : isUrgent ? "#f59e0b" : "#16a34a"} size={12} />
                  <Text style={[styles.expiryBadgeText, isExpired && styles.expiryBadgeTextExpired, isUrgent && styles.expiryBadgeTextUrgent]}>
                    {isExpired ? "Expired" : `${daysUntilExpiry} days left`}
                  </Text>
                </View>
              ) : null}
            </View>
          </>
        ) : (
          <>
            <View style={styles.iconCard}>
              <View style={[styles.bigIcon, { backgroundColor: colors.bg }]}>
                <Text style={styles.bigIconEmoji}>{getCategoryIcon(product.category)}</Text>
              </View>
              <Text style={styles.productName} numberOfLines={2}>{product.name}</Text>
              {product.category && (
                <View style={[styles.categoryBadge, { backgroundColor: colors.bg }]}>
                  <Tag color={colors.text} size={12} />
                  <Text style={[styles.categoryBadgeText, { color: colors.text }]}>{product.category}</Text>
                </View>
              )}
            </View>

            <View style={styles.card}>
              <View style={styles.detailRow}>
                <Beaker color="#6b7280" size={16} />
                <Text style={styles.detailLabel}>Unit</Text>
                <Text style={styles.detailValue}>{product.unit || "—"}</Text>
              </View>
              {product.tallyCode && (
                <View style={styles.detailRow}>
                  <Hash color="#6b7280" size={16} />
                  <Text style={styles.detailLabel}>Tally Code</Text>
                  <Text style={[styles.detailValue, styles.mono]}>{product.tallyCode}</Text>
                </View>
              )}
              {product.expiryDate && (
                <View style={styles.detailRow}>
                  <Calendar color="#6b7280" size={16} />
                  <Text style={styles.detailLabel}>Expiry Date</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text style={styles.detailValue}>{formatDate(product.expiryDate)}</Text>
                    <View style={[styles.expiryBadge, isExpired && styles.expiryBadgeExpired, isUrgent && styles.expiryBadgeUrgent]}>
                      <Clock color={isExpired ? "#dc2626" : isUrgent ? "#f59e0b" : "#16a34a"} size={9} />
                      <Text style={[styles.expiryBadgeText, isExpired && styles.expiryBadgeTextExpired, isUrgent && styles.expiryBadgeTextUrgent]}>
                        {isExpired ? "Expired" : `${daysUntilExpiry}d`}
                      </Text>
                    </View>
                  </View>
                </View>
              )}
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Quick Actions</Text>
              <View style={styles.actionRow}>
                <TouchableOpacity style={styles.actionBtn} onPress={shareProduct}>
                  <Share2 color="#16a34a" size={16} />
                  <Text style={styles.actionBtnText}>Share via WhatsApp</Text>
                </TouchableOpacity>
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  outerContainer: { flex: 1, backgroundColor: "#fafafa" },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 12, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#e5e7eb" },
  headerBack: { width: 44, height: 44, justifyContent: "center", alignItems: "center", marginLeft: -8 },
  headerCenter: { flex: 1, alignItems: "center" },
  headerTitle: { fontSize: 16, fontWeight: "600", color: "#1a1a2e" },
  headerAction: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#ecfdf5", justifyContent: "center", alignItems: "center" },
  headerActionGreen: { backgroundColor: "#16a34a" },
  headerActionDisabled: { opacity: 0.5 },
  scrollView: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center", gap: 8 },
  loadingText: { color: "#9ca3af", fontSize: 14 },
  backBtn: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 12, paddingVertical: 8, paddingHorizontal: 12 },
  backBtnText: { fontSize: 14, color: "#16a34a", fontWeight: "500" },
  iconCard: { backgroundColor: "#fff", borderRadius: 16, padding: 20, alignItems: "center", borderWidth: 1, borderColor: "#e5e7eb", gap: 8 },
  bigIcon: { width: 64, height: 64, borderRadius: 20, justifyContent: "center", alignItems: "center" },
  bigIconEmoji: { fontSize: 28 },
  productName: { fontSize: 18, fontWeight: "700", color: "#1a1a2e", textAlign: "center" },
  categoryBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12 },
  categoryBadgeText: { fontSize: 12, fontWeight: "600" },
  card: { backgroundColor: "#fff", borderRadius: 14, padding: 16, borderWidth: 1, borderColor: "#e5e7eb", gap: 10 },
  sectionTitle: { fontSize: 14, fontWeight: "600", color: "#1a1a2e", marginBottom: 8 },
  detailRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#f3f4f6" },
  detailLabel: { fontSize: 13, color: "#6b7280", flex: 1 },
  detailValue: { fontSize: 14, fontWeight: "500", color: "#1a1a2e" },
  mono: { fontFamily: "monospace" },
  label: { fontSize: 13, fontWeight: "600", color: "#374151" },
  inputRow: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#f9fafb", borderRadius: 14, paddingHorizontal: 14, height: 48, borderWidth: 1, borderColor: "#e5e7eb" },
  input: { flex: 1, fontSize: 14, color: "#1a1a2e" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 20, backgroundColor: "#f3f4f6", borderWidth: 1, borderColor: "transparent" },
  chipActive: { backgroundColor: "#ecfdf5", borderColor: "#16a34a40" },
  chipText: { fontSize: 13, fontWeight: "500", color: "#6b7280" },
  chipTextActive: { color: "#16a34a", fontWeight: "600" },
  actionRow: { gap: 10 },
  actionBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#ecfdf5", borderRadius: 14, paddingVertical: 14, borderWidth: 1, borderColor: "#16a34a30" },
  actionBtnText: { fontSize: 14, fontWeight: "600", color: "#16a34a" },
  expiryBadge: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, backgroundColor: "#dcfce7" },
  expiryBadgeExpired: { backgroundColor: "#fecdd3" },
  expiryBadgeUrgent: { backgroundColor: "#fef3c7" },
  expiryBadgeText: { fontSize: 10, fontWeight: "600", color: "#16a34a" },
  expiryBadgeTextExpired: { color: "#dc2626" },
  expiryBadgeTextUrgent: { color: "#b45309" },
});