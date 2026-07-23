import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, Alert, Linking, TextInput } from "react-native";
import { useState, useCallback } from "react";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, Package, Tag, Beaker, Clock, Pencil, Check, X, Share2 } from "@/components/Icons";
import { INVENTORY_ITEMS_COLLECTION_ID, INVENTORY_BATCHES_COLLECTION_ID } from "@/lib/appwrite";
import { getDocument, updateDocument, getCollection, syncInventoryCollections } from "@/lib/sync-manager";
import { useNetwork } from "@/lib/network-provider";
import { normalizeCategory, parseQty } from "@/lib/inventory-utils";

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

interface InventoryBatch {
  $id: string;
  item_guid: string;
  batch_no: string;
  mfg_date?: string;
  expiry_date?: string;
  godown?: string;
  qty: number;
  rate: number;
  value: number;
  daysUntilExpiry?: number | null;
}

// Month abbreviation lookup for Tally's dd-Mon-YYYY format
const MONTH_ABBR: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

// Parse Tally date formats: "20250630", "30-06-2025", "1-Dec-2025", "1-Dec-25",
// "1 Dec 2025", or ISO. Tally's EXPIRYPERIOD is often dd-Mon-YY (2-digit year),
// which Hermes' Date parser rejects — so we handle it explicitly rather than
// relying on the new Date() fallback.
function parseTallyDate(dateStr: string): Date | null {
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

function formatDisplayDate(dateStr: string): string {
  if (!dateStr) return "—";
  const d = parseTallyDate(dateStr);
  if (!d) return dateStr;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { syncNow } = useNetwork();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [product, setProduct] = useState<any>(null);
  const [inventoryItem, setInventoryItem] = useState<any>(null);
  const [batches, setBatches] = useState<InventoryBatch[]>([]);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [editName, setEditName] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editUnit, setEditUnit] = useState("");

  const loadData = useCallback(async () => {
    if (!id) return;
    try {
      const allInvItems = getCollection(INVENTORY_ITEMS_COLLECTION_ID);
      const allBatches = getCollection(INVENTORY_BATCHES_COLLECTION_ID);

      // The product IS an inventory_items document (the catalog's only source now)
      const invItem: any = getDocument(INVENTORY_ITEMS_COLLECTION_ID, id) ||
        allInvItems.find((i: any) => i.$id === id);

      if (invItem) {
        const doc = {
          $id: invItem.$id,
          name: invItem.item_name || "",
          category: normalizeCategory(invItem.stock_group),
          unit: invItem.base_unit || undefined,
          tallyCode: invItem.guid || undefined,
          closing_qty: invItem.closing_qty,
          opening_qty: invItem.opening_qty,
          closing_value: invItem.closing_value,
        };
        setProduct(doc);
        setInventoryItem(invItem);
        setEditName(doc.name);
        setEditCategory(doc.category || "");
        setEditUnit(doc.unit || "");

        const itemBatches = allBatches
          .filter((b: any) => b.item_guid === invItem.guid)
          .map((b: any) => {
            let daysUntilExpiry: number | null = null;
            if (b.expiry_date) {
              const parsed = parseTallyDate(b.expiry_date);
              if (parsed) {
                daysUntilExpiry = Math.ceil((parsed.getTime() - Date.now()) / (1000 * 3600 * 24));
              }
            }
            return { ...b, daysUntilExpiry };
          })
          .sort((a: any, b: any) => {
            if (!a.expiry_date && !b.expiry_date) return 0;
            if (!a.expiry_date) return 1;
            if (!b.expiry_date) return -1;
            const aDate = parseTallyDate(a.expiry_date);
            const bDate = parseTallyDate(b.expiry_date);
            if (!aDate && !bDate) return 0;
            if (!aDate) return 1;
            if (!bDate) return -1;
            return aDate.getTime() - bDate.getTime();
          });
        setBatches(itemBatches);
      }
    } catch {}
    setLoading(false);
  }, [id]);

  useFocusEffect(useCallback(() => {
    loadData();
  }, [loadData]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await syncNow();
    await syncInventoryCollections();
    await loadData();
    setRefreshing(false);
  }, [loadData, syncNow]);

  const startEditing = () => {
    if (!product) return;
    setEditName(product.name || "");
    setEditCategory(product.category || "");
    setEditUnit(product.unit || "");
    setEditing(true);
  };

  const cancelEditing = () => {
    setEditing(false);
  };

  const saveEdits = async () => {
    if (!editName.trim()) { Alert.alert("Error", "Product name is required"); return; }
    setSaving(true);
    try {
      // Write back to inventory_items (stock_group holds the category, base_unit the unit)
      await updateDocument(INVENTORY_ITEMS_COLLECTION_ID, id, {
        item_name: editName.trim(),
        stock_group: editCategory || "",
        base_unit: editUnit || "",
      });
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
    lines.push("📛 *Name:* " + product.name);
    if (product.category) lines.push("🏷️ *Category:* " + product.category);
    if (product.unit) lines.push("🧪 *Unit:* " + product.unit);
    const shareTotalQty = batches.reduce((sum, b) => sum + parseQty(b.qty), 0);
    if (shareTotalQty > 0 || batches.length > 0) {
      lines.push("📊 *Total Qty:* " + (shareTotalQty % 1 === 0 ? shareTotalQty : shareTotalQty.toFixed(2)) + (product.unit ? " " + product.unit : ""));
    }
    if (batches.length > 0) {
      lines.push("\n🗃️ *Batches (" + batches.length + "):*");
      batches.slice(0, 5).forEach((b) => {
        let bLine = "  • " + b.batch_no;
        if (b.qty !== undefined && b.qty !== null) bLine += " — Qty: " + b.qty;
        if (b.expiry_date) bLine += " — Exp: " + formatDisplayDate(b.expiry_date);
        lines.push(bLine);
      });
    }
    Linking.openURL("https://wa.me/?text=" + encodeURIComponent(lines.join("\n")));
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
  // Product-level stock = sum of every batch's current (closing) qty.
  const totalBatchQty = batches.reduce((sum, b) => sum + parseQty(b.qty), 0);
  const unitLabel = inventoryItem?.base_unit || product.unit || "";

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
                  <Tag color="#6b7280" size={16} />
                  <Text style={styles.detailLabel}>GUID</Text>
                  <Text style={[styles.detailValue, styles.mono]} numberOfLines={1}>{product.tallyCode}</Text>
                </View>
              )}
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Stock</Text>
              <View style={styles.stockGrid}>
                <View style={[styles.stockCard, styles.stockCardHighlight]}>
                  <Text style={styles.stockCardLabel}>Total Qty</Text>
                  <Text style={[styles.stockCardValue, styles.stockCardValueGreen]}>
                    {totalBatchQty % 1 === 0 ? totalBatchQty : totalBatchQty.toFixed(2)}
                    {unitLabel ? ` ${unitLabel}` : ""}
                  </Text>
                  <Text style={styles.stockCardSub}>
                    {batches.length > 0
                      ? `Sum of ${batches.length} batch${batches.length === 1 ? "" : "es"}`
                      : "No batches"}
                  </Text>
                </View>
              </View>
            </View>

            {batches.length > 0 && (
              <View style={styles.card}>
                <View style={styles.batchHeaderRow}>
                  <Text style={styles.sectionTitle}>🗃️ Batches ({batches.length})</Text>
                  <View style={styles.fefoBadge}>
                    <Text style={styles.fefoBadgeText}>FEFO</Text>
                  </View>
                </View>
                <Text style={styles.fefoHint}>Sorted: earliest expiry first</Text>
                {batches.map((batch, idx) => {
                  const isExpiredBatch = batch.daysUntilExpiry !== null && batch.daysUntilExpiry !== undefined && batch.daysUntilExpiry < 0;
                  const isUrgentBatch = batch.daysUntilExpiry !== null && batch.daysUntilExpiry !== undefined && batch.daysUntilExpiry >= 0 && batch.daysUntilExpiry <= 30;
                  return (
                    <View
                      key={batch.$id}
                      style={[
                        styles.batchCard,
                        idx < batches.length - 1 && styles.batchCardBorder,
                        isExpiredBatch && styles.batchCardExpired,
                        isUrgentBatch && styles.batchCardUrgent,
                      ]}
                    >
                      <View style={styles.batchTopRow}>
                        <View style={styles.batchNoWrap}>
                          <Text style={styles.batchNoLabel}>Batch</Text>
                          <Text style={styles.batchNo}>{batch.batch_no}</Text>
                        </View>
                        {batch.expiry_date ? (
                          <View style={[
                            styles.batchExpiryBadge,
                            isExpiredBatch && styles.batchExpiryBadgeExpired,
                            isUrgentBatch && styles.batchExpiryBadgeUrgent,
                          ]}>
                            <Clock
                              color={isExpiredBatch ? "#dc2626" : isUrgentBatch ? "#b45309" : "#16a34a"}
                              size={10}
                            />
                            <Text style={[
                              styles.batchExpiryBadgeText,
                              isExpiredBatch && { color: "#dc2626" },
                              isUrgentBatch && { color: "#b45309" },
                            ]}>
                              {isExpiredBatch
                                ? "Expired " + Math.abs(batch.daysUntilExpiry!) + "d ago"
                                : batch.daysUntilExpiry === 0
                                  ? "Expires today"
                                  : batch.daysUntilExpiry + "d left"}
                            </Text>
                          </View>
                        ) : null}
                      </View>

                      <View style={styles.batchDetails}>
                        {batch.expiry_date ? (
                          <View style={styles.batchDetailItem}>
                            <Text style={styles.batchDetailKey}>Expiry</Text>
                            <Text style={[styles.batchDetailVal, isExpiredBatch && { color: "#dc2626" }]}>
                              {formatDisplayDate(batch.expiry_date)}
                            </Text>
                          </View>
                        ) : null}
                        {batch.mfg_date ? (
                          <View style={styles.batchDetailItem}>
                            <Text style={styles.batchDetailKey}>Mfg</Text>
                            <Text style={styles.batchDetailVal}>{formatDisplayDate(batch.mfg_date)}</Text>
                          </View>
                        ) : null}
                        {batch.qty !== undefined && batch.qty !== null && (
                          <View style={styles.batchDetailItem}>
                            <Text style={styles.batchDetailKey}>Qty</Text>
                            <Text style={styles.batchDetailVal}>{batch.qty} {inventoryItem?.base_unit || ""}</Text>
                          </View>
                        )}
                        {batch.rate ? (
                          <View style={styles.batchDetailItem}>
                            <Text style={styles.batchDetailKey}>Rate</Text>
                            <Text style={styles.batchDetailVal}>₹{Number(batch.rate).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
                          </View>
                        ) : null}
                        {batch.value ? (
                          <View style={styles.batchDetailItem}>
                            <Text style={styles.batchDetailKey}>Value</Text>
                            <Text style={styles.batchDetailVal}>₹{Number(batch.value).toLocaleString("en-IN", { maximumFractionDigits: 0 })}</Text>
                          </View>
                        ) : null}
                        {batch.godown ? (
                          <View style={styles.batchDetailItem}>
                            <Text style={styles.batchDetailKey}>Godown</Text>
                            <Text style={styles.batchDetailVal}>{batch.godown}</Text>
                          </View>
                        ) : null}
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

            {inventoryItem && batches.length === 0 && (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>🗃️ Batches</Text>
                <Text style={styles.noBatchText}>No batch records found for this item</Text>
              </View>
            )}

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
  sectionTitle: { fontSize: 14, fontWeight: "600", color: "#1a1a2e", marginBottom: 2 },
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
  stockGrid: { flexDirection: "row", gap: 10 },
  stockCard: { flex: 1, backgroundColor: "#f9fafb", borderRadius: 12, padding: 12, borderWidth: 1, borderColor: "#e5e7eb", gap: 3 },
  stockCardHighlight: { backgroundColor: "#ecfdf5", borderColor: "#bbf7d0" },
  stockCardLabel: { fontSize: 11, color: "#9ca3af", fontWeight: "500" },
  stockCardValue: { fontSize: 16, fontWeight: "700", color: "#1a1a2e" },
  stockCardValueGreen: { color: "#16a34a" },
  stockCardSub: { fontSize: 11, color: "#6b7280", fontWeight: "500" },
  stockGroupRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingTop: 4 },
  stockGroupLabel: { fontSize: 12, color: "#9ca3af", fontWeight: "500" },
  stockGroupValue: { fontSize: 12, color: "#6b7280", fontWeight: "500" },
  batchHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  fefoBadge: { backgroundColor: "#ede9fe", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  fefoBadgeText: { fontSize: 10, fontWeight: "700", color: "#7c3aed", letterSpacing: 0.5 },
  fefoHint: { fontSize: 11, color: "#9ca3af", marginTop: -6, marginBottom: 4 },
  batchCard: { paddingVertical: 10, gap: 8 },
  batchCardBorder: { borderBottomWidth: 1, borderBottomColor: "#f3f4f6" },
  batchCardExpired: { backgroundColor: "#fef2f2", borderRadius: 10, padding: 10, marginHorizontal: -4, borderWidth: 1, borderColor: "#fecdd3" },
  batchCardUrgent: { backgroundColor: "#fffbeb", borderRadius: 10, padding: 10, marginHorizontal: -4, borderWidth: 1, borderColor: "#fde68a" },
  batchTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  batchNoWrap: { gap: 1 },
  batchNoLabel: { fontSize: 10, color: "#9ca3af", fontWeight: "500" },
  batchNo: { fontSize: 13, fontWeight: "700", color: "#1a1a2e", fontFamily: "monospace" },
  batchExpiryBadge: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8, backgroundColor: "#dcfce7" },
  batchExpiryBadgeExpired: { backgroundColor: "#fecdd3" },
  batchExpiryBadgeUrgent: { backgroundColor: "#fef3c7" },
  batchExpiryBadgeText: { fontSize: 10, fontWeight: "600", color: "#16a34a" },
  batchDetails: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  batchDetailItem: { gap: 1, minWidth: 80 },
  batchDetailKey: { fontSize: 10, color: "#9ca3af", fontWeight: "500" },
  batchDetailVal: { fontSize: 12, fontWeight: "600", color: "#374151" },
  noBatchText: { fontSize: 13, color: "#9ca3af", textAlign: "center", paddingVertical: 8 },
});
