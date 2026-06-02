import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator, Platform } from "react-native";
import { useState, useRef } from "react";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, Plus, Hash, Calendar, X } from "@/components/Icons";
import { ITEMS_COLLECTION_ID } from "@/lib/appwrite";
import { createDocument } from "@/lib/sync-manager";
import DateTimePicker from "@react-native-community/datetimepicker";

const categories = ["Fertilizer", "Insecticide", "Fungicide", "Herbicide", "PGR", "Organic", "Micronutrient", "Other"];
const units = ["kg", "g", "L", "ml", "packet", "bottle", "bag", "tablet", "piece"];

export default function AddProductScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [unit, setUnit] = useState("");
  const [tallyCode, setTallyCode] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [saving, setSaving] = useState(false);
  // Guard against Android DateTimePicker double-fire
  const datePickerHandled = useRef(false);

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert("Error", "Product name is required");
      return;
    }
    setSaving(true);
    try {
      await createDocument(ITEMS_COLLECTION_ID, {
        name: name.trim(),
        category: category || null,
        unit: unit || null,
        tallyCode: tallyCode.trim() || null,
        expiryDate: expiryDate || null,
      });
      router.back();
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to add product");
    } finally {
      setSaving(false);
    }
  };

  const openDatePicker = () => {
    datePickerHandled.current = false;
    setShowDatePicker(true);
  };

  const onDateChange = (_event: any, date?: Date) => {
    if (datePickerHandled.current) return;
    datePickerHandled.current = true;
    setShowDatePicker(false);
    if (date) {
      setExpiryDate(date.toISOString().split("T")[0]);
    }
  };

  const formatDisplayDate = (d: string) => {
    if (!d) return "";
    try {
      return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
    } catch { return d; }
  };

  return (
    <View style={styles.outerContainer}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity style={styles.headerBack} onPress={() => router.back()}>
          <ArrowLeft color="#1a1a2e" size={22} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Add Product</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 80, gap: 20 }}>
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Product Name *</Text>
          <View style={styles.inputRow}>
            <Plus color="#9ca3af" size={16} />
            <TextInput
              style={styles.input}
              placeholder="e.g. Urea 46%, Imidacloprid 17.8% SL"
              placeholderTextColor="#9ca3af"
              value={name}
              onChangeText={setName}
            />
          </View>
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Category</Text>
          <View style={styles.chipRow}>
            {categories.map((cat) => (
              <TouchableOpacity
                key={cat}
                style={[styles.chip, category === cat && styles.chipActive]}
                onPress={() => setCategory(category === cat ? "" : cat)}
              >
                <Text style={[styles.chipText, category === cat && styles.chipTextActive]}>{cat}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Unit</Text>
          <View style={styles.chipRow}>
            {units.map((u) => (
              <TouchableOpacity
                key={u}
                style={[styles.chip, unit === u && styles.chipActive]}
                onPress={() => setUnit(unit === u ? "" : u)}
              >
                <Text style={[styles.chipText, unit === u && styles.chipTextActive]}>{u}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Tally Code</Text>
          <View style={styles.inputRow}>
            <Hash color="#9ca3af" size={16} />
            <TextInput
              style={styles.input}
              placeholder="e.g. FER001"
              placeholderTextColor="#9ca3af"
              value={tallyCode}
              onChangeText={setTallyCode}
              autoCapitalize="characters"
            />
          </View>
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Expiry Date</Text>
          <TouchableOpacity style={styles.inputRow} onPress={openDatePicker}>
            <Calendar color={expiryDate ? "#16a34a" : "#9ca3af"} size={16} />
            <Text style={[styles.input, { flex: 1 }, expiryDate ? styles.dateSelected : styles.datePlaceholder]}>
              {expiryDate ? formatDisplayDate(expiryDate) : "Select expiry date"}
            </Text>
            {expiryDate ? (
              <TouchableOpacity onPress={() => setExpiryDate("")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <X color="#9ca3af" size={14} />
              </TouchableOpacity>
            ) : null}
          </TouchableOpacity>
          {showDatePicker && (
            <DateTimePicker
              value={expiryDate ? new Date(expiryDate) : new Date()}
              mode="date"
              display={Platform.OS === "ios" ? "inline" : "default"}
              onChange={onDateChange}
            />
          )}
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <TouchableOpacity
          style={[styles.saveBtn, (!name.trim() || saving) && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={!name.trim() || saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" size={18} />
          ) : (
            <>
              <Plus color="#fff" size={18} />
              <Text style={styles.saveBtnText}>Add Product</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outerContainer: { flex: 1, backgroundColor: "#fafafa" },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 12, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#e5e7eb" },
  headerBack: { width: 44, height: 44, justifyContent: "center", alignItems: "center", marginLeft: -8 },
  headerTitle: { flex: 1, textAlign: "center", fontSize: 16, fontWeight: "600", color: "#1a1a2e" },
  scrollView: { flex: 1 },
  fieldGroup: { gap: 8 },
  label: { fontSize: 13, fontWeight: "600", color: "#374151" },
  inputRow: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#fff", borderRadius: 14, paddingHorizontal: 14, height: 48, borderWidth: 1, borderColor: "#e5e7eb" },
  input: { flex: 1, fontSize: 14, color: "#1a1a2e" },
  dateSelected: { color: "#1a1a2e" },
  datePlaceholder: { color: "#9ca3af" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 20, backgroundColor: "#f3f4f6", borderWidth: 1, borderColor: "transparent" },
  chipActive: { backgroundColor: "#ecfdf5", borderColor: "#16a34a40" },
  chipText: { fontSize: 13, fontWeight: "500", color: "#6b7280" },
  chipTextActive: { color: "#16a34a", fontWeight: "600" },
  footer: { paddingHorizontal: 16, paddingTop: 12, backgroundColor: "#fff", borderTopWidth: 1, borderTopColor: "#e5e7eb" },
  saveBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#16a34a", borderRadius: 14, height: 50 },
  saveBtnDisabled: { backgroundColor: "#9ca3af" },
  saveBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});