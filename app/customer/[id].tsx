import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, Alert, Linking, Platform, TextInput } from "react-native";
import { useState, useCallback } from "react";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, Phone, MapPin, Sprout, Calendar, Package, Share2, Pencil, Check, X, PlusCircle, ExternalLink, Eye, Camera, ArrowRight, Users, TrendingUp, TrendingDown, IndianRupee } from "@/components/Icons";
import { CUSTOMERS_COLLECTION_ID, VISITS_COLLECTION_ID, RECOMMENDATIONS_COLLECTION_ID, ITEMS_COLLECTION_ID } from "@/lib/appwrite";
import { getCollection, getDocument, updateDocument } from "@/lib/sync-manager";
import { useNetwork } from "@/lib/network-provider";

interface VisitItem {
  $id: string;
  visitDate: string;
  observations?: string;
  nextVisitDate?: string;
  nextVisitTask?: string;
  latitude?: number;
  longitude?: number;
  recommendations: { name: string; dosage?: string }[];
  photoCount: number;
}

export default function CustomerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { syncNow } = useNetwork();
  const [customer, setCustomer] = useState<any>(null);
  const [visits, setVisits] = useState<VisitItem[]>([]);

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editCropType, setEditCropType] = useState("");

  const cropColors: Record<string, { bg: string; text: string }> = {
    Cardamom: { bg: "#dcfce7", text: "#15803d" },
    Pepper: { bg: "#fef3c7", text: "#92400e" },
    Coffee: { bg: "#ffedd5", text: "#9a3412" },
    Tea: { bg: "#ecfccb", text: "#3f6212" },
    Rubber: { bg: "#f5f5f4", text: "#57534e" },
    Coconut: { bg: "#fef9c3", text: "#854d0e" },
    Rice: { bg: "#e0f2fe", text: "#0369a1" },
    Other: { bg: "#f3f4f6", text: "#374151" },
  };
  const cropOptions = ["Cardamom", "Pepper", "Coffee", "Tea", "Rubber", "Coconut", "Rice", "Other"];

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

  const loadData = useCallback(async () => {
    if (!id) return;
    try {
      const cDoc = getDocument(CUSTOMERS_COLLECTION_ID, id);
      setCustomer(cDoc);

      let visitsRes = getCollection(VISITS_COLLECTION_ID).sort((a, b) => 
        new Date(b.$createdAt).getTime() - new Date(a.$createdAt).getTime()
      );
      visitsRes = visitsRes.filter(v => v.customerId === id).slice(0, 50);

      let allItemNames: Record<string, { name: string; category?: string }> = {};
      try {
        const itemsRes = getCollection(ITEMS_COLLECTION_ID);
        itemsRes.forEach((item) => { allItemNames[item.$id] = { name: item.name, category: item.category }; });
      } catch {}

      const visitItems: VisitItem[] = [];
      for (const v of visitsRes) {
        let recommendations: VisitItem["recommendations"] = [];
        let photoCount = 0;
        try {
          const recsRes = getCollection(RECOMMENDATIONS_COLLECTION_ID).filter(r => r.visitId === v.$id);
          recommendations = recsRes.map((r: any) => ({
            name: r.customItem || (r.itemId && allItemNames[r.itemId]?.name) || "Unknown",
            dosage: r.dosage || undefined,
          }));
        } catch {}
        try {
          const photosRes = getCollection("visit_photos").filter(p => p.visitId === v.$id);
          photoCount = photosRes.length;
        } catch {}

        visitItems.push({
          $id: v.$id,
          visitDate: v.visitDate,
          observations: v.observations || undefined,
          nextVisitDate: v.nextVisitDate || undefined,
          nextVisitTask: v.nextVisitTask || undefined,
          latitude: v.latitude || undefined,
          longitude: v.longitude || undefined,
          recommendations,
          photoCount,
        });
      }
      setVisits(visitItems);
    } catch {
      setCustomer(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

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

  const startEditing = () => {
    if (!customer) return;
    setEditName(customer.name || "");
    setEditPhone(customer.phone || "");
    setEditAddress(customer.address || "");
    setEditCropType(customer.cropType || "");
    setEditing(true);
  };

  const saveEdits = async () => {
    if (!customer) return;
    if (!editName.trim()) { Alert.alert("Required", "Name is required"); return; }
    if (!editPhone.trim()) { Alert.alert("Required", "Phone is required"); return; }
    setSaving(true);
    try {
      const updateData: any = { name: editName.trim(), phone: editPhone.trim() };
      updateData.address = editAddress.trim() || undefined;
      updateData.cropType = editCropType || undefined;
      await updateDocument(CUSTOMERS_COLLECTION_ID, id, updateData);
      setEditing(false);
      await loadData();
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to save changes");
    } finally {
      setSaving(false);
    }
  };

  const callPhone = () => {
    if (!customer?.phone) return;
    Linking.openURL(`tel:${customer.phone}`).catch(() => {});
  };

  const shareViaWhatsApp = () => {
    if (!customer) return;
    const lines = ["*Customer Details*", ""];
    lines.push(`*Name:* ${customer.name}`);
    lines.push(`*Phone:* ${customer.phone}`);
    if (customer.address) lines.push(`*Address:* ${customer.address}`);
    if (customer.contactName) lines.push(`*Contact Person:* ${customer.contactName}${customer.contactPhone ? ` (${customer.contactPhone})` : ""}`);
    if (customer.cropType) lines.push(`*Crop:* ${customer.cropType}`);
    if (customer.latitude && customer.longitude) {
      lines.push(`*GPS:* ${Number(customer.latitude).toFixed(4)}, ${Number(customer.longitude).toFixed(4)}`);
      lines.push(`*Map:* https://maps.google.com/?q=${customer.latitude},${customer.longitude}`);
    }
    if (visits.length > 0) {
      lines.push("", `*Total Visits:* ${visits.length}`);
    }
    const text = lines.join("\n");
    Linking.openURL(`https://wa.me/?text=${encodeURIComponent(text)}`).catch(() => {});
  };

  const openMaps = () => {
    if (!customer?.latitude || !customer?.longitude) return;
    const url = Platform.OS === "ios"
      ? `maps://maps.apple.com/?ll=${customer.latitude},${customer.longitude}`
      : `https://maps.google.com/?q=${customer.latitude},${customer.longitude}`;
    Linking.openURL(url).catch(() => {});
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
    } catch { return dateStr; }
  };

  const formatShortDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
    } catch { return dateStr; }
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { paddingTop: insets.top }]}>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  if (!customer) {
    return (
      <View style={[styles.loadingContainer, { paddingTop: insets.top }]}>
        <Text style={styles.loadingText}>Farmer not found</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <ArrowLeft color="#16a34a" size={18} />
          <Text style={styles.backBtnText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.outerContainer}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity style={styles.headerBack} onPress={() => router.back()}>
          <ArrowLeft color="#1a1a2e" size={22} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>{customer.name}</Text>
        </View>
        {editing ? (
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TouchableOpacity style={styles.headerAction} onPress={() => setEditing(false)}>
              <X color="#dc2626" size={18} />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.headerAction, styles.headerActionGreen, saving && styles.headerActionDisabled]} onPress={saveEdits} disabled={saving}>
              <Check color="#fff" size={18} />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TouchableOpacity style={styles.headerAction} onPress={shareViaWhatsApp}>
              <Share2 color="#16a34a" size={18} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.headerAction} onPress={startEditing}>
              <Pencil color="#16a34a" size={18} />
            </TouchableOpacity>
          </View>
        )}
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{ paddingBottom: insets.bottom + 40, padding: 16, gap: 12 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={["#16a34a"]} />}
      >
        {/* Farmer Info Card */}
        <View style={styles.infoCard}>
          <View style={styles.avatarRow}>
            <View style={[styles.avatarLarge, { backgroundColor: getAvatarColor(customer.name) }]}>
              <Text style={styles.avatarLargeText}>{getInitials(customer.name)}</Text>
            </View>
            <View style={styles.avatarTextCol}>
              <Text style={styles.profileName} numberOfLines={1}>{editing ? editName : customer.name}</Text>
              {customer.cropType ? (
                <View style={[styles.cropBadge, { backgroundColor: cropColors[customer.cropType]?.bg || "#f3f4f6" }]}>
                  <Sprout color={cropColors[customer.cropType]?.text || "#6b7280"} size={10} />
                  <Text style={[styles.cropBadgeText, { color: cropColors[customer.cropType]?.text || "#374151" }]}>{customer.cropType} Farmer</Text>
                </View>
              ) : null}
            </View>
          </View>

          {editing ? (
            <View style={styles.editFields}>
              <View style={styles.editField}>
                <Text style={styles.editLabel}>Name *</Text>
                <TextInput style={styles.editInput} value={editName} onChangeText={setEditName} placeholder="Farmer's name" placeholderTextColor="#9ca3af" />
              </View>
              <View style={styles.editField}>
                <Text style={styles.editLabel}>Phone *</Text>
                <TextInput style={styles.editInput} value={editPhone} onChangeText={setEditPhone} placeholder="+91 98765 43210" placeholderTextColor="#9ca3af" keyboardType="phone-pad" />
              </View>
              <View style={styles.editField}>
                <Text style={styles.editLabel}>Address</Text>
                <TextInput style={styles.editInput} value={editAddress} onChangeText={setEditAddress} placeholder="Village/Town, District" placeholderTextColor="#9ca3af" />
              </View>
              <View style={styles.editField}>
                <Text style={styles.editLabel}>Crop Type</Text>
                <View style={styles.cropGrid}>
                  {cropOptions.map((crop) => (
                    <TouchableOpacity
                      key={crop}
                      style={[styles.cropChip, editCropType === crop && { backgroundColor: cropColors[crop]?.bg, borderColor: cropColors[crop]?.text }]}
                      onPress={() => setEditCropType(editCropType === crop ? "" : crop)}
                    >
                      <Sprout color={editCropType === crop ? cropColors[crop]?.text : "#6b7280"} size={12} />
                      <Text style={[styles.cropChipText, editCropType === crop && { color: cropColors[crop]?.text, fontWeight: "600" }]}>{crop}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>
          ) : (
            <View style={styles.infoDetails}>
              <TouchableOpacity style={styles.infoRow} onPress={callPhone}>
                <View style={styles.infoIcon}>
                  <Phone color="#16a34a" size={16} />
                </View>
                <View style={styles.infoTextCol}>
                  <Text style={styles.infoLabel}>Phone</Text>
                  <Text style={styles.phoneLink}>{customer.phone}</Text>
                </View>
              </TouchableOpacity>

              {customer.address ? (
                <View style={styles.infoRow}>
                  <View style={styles.infoIcon}>
                    <MapPin color="#16a34a" size={16} />
                  </View>
                  <View style={styles.infoTextCol}>
                    <Text style={styles.infoLabel}>Address</Text>
                    <Text style={styles.infoValue} numberOfLines={2}>{customer.address}</Text>
                  </View>
                </View>
              ) : null}

              {customer.contactName ? (
                <View style={styles.infoRow}>
                  <View style={styles.infoIcon}>
                    <Users color="#16a34a" size={16} />
                  </View>
                  <View style={styles.infoTextCol}>
                    <Text style={styles.infoLabel}>Contact Person</Text>
                    <Text style={styles.infoValue}>{customer.contactName}{customer.contactPhone ? ` — ${customer.contactPhone}` : ""}</Text>
                  </View>
                </View>
              ) : null}

              {customer.latitude && customer.longitude ? (
                <TouchableOpacity style={styles.mapsLink} onPress={openMaps}>
                  <MapPin color="#059669" size={14} />
                  <Text style={styles.mapsLinkText}>{Number(customer.latitude).toFixed(4)}, {Number(customer.longitude).toFixed(4)}</Text>
                  <ExternalLink color="#059669" size={12} />
                  <Text style={styles.mapsLinkAction}>Open in Maps</Text>
                </TouchableOpacity>
              ) : null}

              {/* Opening / Closing Balance */}
              {(customer.opening_balance !== undefined || customer.openingBalance !== undefined ||
                customer.closing_balance !== undefined) && (
                <View style={styles.balanceSection}>
                  <View style={styles.balanceSectionHeader}>
                    <IndianRupee color="#6b7280" size={13} />
                    <Text style={styles.balanceSectionTitle}>Tally Balances</Text>
                  </View>
                  <View style={styles.balanceRow}>
                    {(() => {
                      const openBal = customer.opening_balance ?? customer.openingBalance ?? null;
                      const closeBal = customer.closing_balance ?? null;
                      return (
                        <>
                          {openBal !== null && (
                            <View style={styles.balanceCard}>
                              <Text style={styles.balanceCardLabel}>Opening Balance</Text>
                              <View style={styles.balanceAmtRow}>
                                {openBal < 0 ? <TrendingDown color="#dc2626" size={14} /> : <TrendingUp color="#16a34a" size={14} />}
                                <Text style={[styles.balanceAmt, openBal < 0 && styles.balanceAmtDr]}>
                                  ₹{Math.abs(openBal).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </Text>
                              </View>
                              <Text style={[styles.balanceDrCr, openBal < 0 ? styles.drText : styles.crText]}>
                                {openBal < 0 ? "Dr" : "Cr"}
                              </Text>
                            </View>
                          )}
                          {closeBal !== null && (
                            <View style={styles.balanceCard}>
                              <Text style={styles.balanceCardLabel}>Closing Balance</Text>
                              <View style={styles.balanceAmtRow}>
                                {closeBal < 0 ? <TrendingDown color="#dc2626" size={14} /> : <TrendingUp color="#16a34a" size={14} />}
                                <Text style={[styles.balanceAmt, closeBal < 0 && styles.balanceAmtDr]}>
                                  ₹{Math.abs(closeBal).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </Text>
                              </View>
                              <Text style={[styles.balanceDrCr, closeBal < 0 ? styles.drText : styles.crText]}>
                                {closeBal < 0 ? "Dr" : "Cr"}
                              </Text>
                            </View>
                          )}
                        </>
                      );
                    })()}
                  </View>
                </View>
              )}
            </View>
          )}
        </View>

        {/* New Visit Button */}
        {!editing && (
          <TouchableOpacity style={styles.newVisitButton} onPress={() => router.push({ pathname: "/(tabs)/new-visit", params: { customerId: customer.$id, customerName: customer.name } })}>
            <PlusCircle color="#fff" size={18} />
            <Text style={styles.newVisitText}>New Visit to {customer.name.split(" ")[0]}</Text>
          </TouchableOpacity>
        )}

        {/* Separator */}
        <View style={styles.separator} />

        {/* Visit History */}
        <Text style={styles.sectionTitle}>Visit History</Text>

        {visits.length === 0 ? (
          <View style={styles.emptyCard}>
            <Eye color="#9ca3af" size={28} />
            <Text style={styles.emptyTitle}>No visits recorded yet</Text>
          </View>
        ) : (
          <View style={styles.timelineContainer}>
            <View style={styles.timelineLine} />
            {visits.slice(0, 5).map((visit, idx) => {
              const hasFollowUp = !!visit.nextVisitDate;
              const daysUntil = visit.nextVisitDate
                ? Math.ceil((new Date(visit.nextVisitDate).getTime() - Date.now()) / (1000 * 3600 * 24))
                : null;
              return (
                <View key={visit.$id} style={styles.timelineItem}>
                  <View style={[styles.timelineDot, idx === 0 && styles.timelineDotActive]} />
                  <TouchableOpacity style={styles.visitCard} onPress={() => router.push(`/visit/${visit.$id}`)}>
                    <View style={styles.visitTop}>
                      <View style={styles.visitDateRow}>
                        <Calendar color="#16a34a" size={14} />
                        <Text style={styles.visitDateText}>{formatDate(visit.visitDate)}</Text>
                      </View>
                      {hasFollowUp && (
                        <View style={[
                          styles.followBadge,
                          daysUntil !== null && daysUntil <= 0 ? styles.followBadgeRed : daysUntil !== null && daysUntil <= 3 ? styles.followBadgeAmber : styles.followBadgeGreen,
                        ]}>
                          <Text style={[styles.followBadgeText, daysUntil !== null && daysUntil <= 0 ? { color: "#e11d48" } : daysUntil !== null && daysUntil <= 3 ? { color: "#b45309" } : { color: "#16a34a" }]}>
                            Follow-up: {formatShortDate(visit.nextVisitDate!)}
                          </Text>
                        </View>
                      )}
                    </View>

                    {visit.observations ? (
                      <Text style={styles.visitObs} numberOfLines={2}>{visit.observations}</Text>
                    ) : null}

                    {visit.recommendations.length > 0 && (
                      <View style={styles.recChips}>
                        {visit.recommendations.slice(0, 3).map((rec, i) => (
                          <View key={i} style={styles.recChip}>
                            <Package color="#16a34a" size={10} />
                            <Text style={styles.recChipText} numberOfLines={1}>{rec.name}</Text>
                          </View>
                        ))}
                        {visit.recommendations.length > 3 && (
                          <Text style={styles.moreText}>+{visit.recommendations.length - 3} more</Text>
                        )}
                      </View>
                    )}

                    <View style={styles.quickInfo}>
                      {visit.photoCount > 0 && (
                        <View style={styles.quickChipRow}>
                          <Camera color="#9ca3af" size={10} />
                          <Text style={styles.quickChipText}>{visit.photoCount}</Text>
                        </View>
                      )}
                      {visit.latitude && visit.longitude && (
                        <View style={styles.quickChipRow}>
                          <MapPin color="#9ca3af" size={10} />
                          <Text style={styles.quickChipText}>GPS</Text>
                        </View>
                      )}
                      {visit.recommendations.length > 0 && (
                        <View style={styles.quickChipRow}>
                          <Package color="#9ca3af" size={10} />
                          <Text style={styles.quickChipText}>{visit.recommendations.length} product{visit.recommendations.length > 1 ? "s" : ""}</Text>
                        </View>
                      )}
                    </View>
                  </TouchableOpacity>
                </View>
              );
            })}
            </View>
        )}

        {visits.length > 5 && (
          <TouchableOpacity style={styles.viewAllButton} onPress={() => router.push({ pathname: "/visits" as any, params: { customerId: customer.$id, customerName: customer.name } })}>
            <Calendar color="#16a34a" size={16} />
            <Text style={styles.viewAllText}>View All Visits ({visits.length})</Text>
            <ArrowRight color="#16a34a" size={16} />
          </TouchableOpacity>
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
  headerAction: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#dcfce780", justifyContent: "center", alignItems: "center" },
  headerActionGreen: { backgroundColor: "#16a34a" },
  headerActionDisabled: { opacity: 0.5 },
  scrollView: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#fafafa" },
  loadingText: { fontSize: 14, color: "#9ca3af" },
  backBtn: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 12 },
  backBtnText: { fontSize: 14, color: "#16a34a", fontWeight: "500" },
  infoCard: { backgroundColor: "#fff", borderRadius: 16, padding: 16, borderWidth: 1, borderColor: "#e5e7eb", gap: 16 },
  avatarRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  avatarLarge: { width: 56, height: 56, borderRadius: 28, justifyContent: "center", alignItems: "center" },
  avatarLargeText: { color: "#fff", fontSize: 20, fontWeight: "700" },
  avatarTextCol: { flex: 1, gap: 4 },
  profileName: { fontSize: 18, fontWeight: "700", color: "#1a1a2e" },
  cropBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, alignSelf: "flex-start" },
  cropBadgeText: { fontSize: 11, fontWeight: "600" },
  infoDetails: { gap: 12 },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  infoIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: "#ecfdf5", justifyContent: "center", alignItems: "center" },
  infoTextCol: { flex: 1, gap: 1 },
  infoLabel: { fontSize: 11, color: "#9ca3af" },
  phoneLink: { fontSize: 14, fontWeight: "500", color: "#16a34a" },
  infoValue: { fontSize: 14, fontWeight: "500", color: "#1a1a2e" },
  mapsLink: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14, backgroundColor: "#ecfdf5" },
  mapsLinkText: { fontSize: 12, fontWeight: "500", color: "#059669" },
  mapsLinkAction: { fontSize: 12, fontWeight: "500", color: "#059669", marginLeft: "auto" },
  editFields: { gap: 12 },
  editField: { gap: 4 },
  editLabel: { fontSize: 12, fontWeight: "500", color: "#6b7280" },
  editInput: { backgroundColor: "#f9fafb", borderRadius: 10, padding: 10, fontSize: 14, color: "#1a1a2e", borderWidth: 1, borderColor: "#e5e7eb" },
  cropGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  cropChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, backgroundColor: "#f3f4f6", borderWidth: 1, borderColor: "transparent" },
  cropChipText: { fontSize: 12, color: "#6b7280", fontWeight: "500" },
  newVisitButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#16a34a", borderRadius: 14, paddingVertical: 14 },
  newVisitText: { fontSize: 14, fontWeight: "600", color: "#fff" },
  separator: { height: 1, backgroundColor: "#e5e7eb" },
  sectionTitle: { fontSize: 16, fontWeight: "600", color: "#1a1a2e" },
  emptyCard: { alignItems: "center", padding: 24, backgroundColor: "#fff", borderRadius: 14, borderWidth: 1, borderColor: "#e5e7eb", gap: 6 },
  emptyTitle: { fontSize: 14, fontWeight: "500", color: "#1a1a2e" },
  timelineContainer: { position: "relative", paddingLeft: 24, gap: 12 },
  timelineLine: { position: "absolute", left: 7, top: 12, bottom: 12, width: 2, backgroundColor: "#e5e7eb" },
  timelineItem: { position: "relative", gap: 0 },
  timelineDot: { position: "absolute", left: -24, top: 16, width: 12, height: 12, borderRadius: 6, backgroundColor: "#9ca3af", borderWidth: 2, borderColor: "#fafafa", zIndex: 2 },
  timelineDotActive: { backgroundColor: "#16a34a" },
  visitCard: { backgroundColor: "#fff", borderRadius: 14, padding: 12, borderWidth: 1, borderColor: "#e5e7eb", gap: 6 },
  visitTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  visitDateRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  visitDateText: { fontSize: 12, fontWeight: "600", color: "#059669" },
  followBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10, borderWidth: 1, borderColor: "#fde68a" },
  followBadgeRed: { borderColor: "#fecdd3", backgroundColor: "#fecdd380" },
  followBadgeAmber: { borderColor: "#fde68a", backgroundColor: "#fef3c780" },
  followBadgeGreen: { borderColor: "#bbf7d0", backgroundColor: "#dcfce780" },
  followBadgeText: { fontSize: 10, fontWeight: "600" },
  visitObs: { fontSize: 12, color: "#6b7280", lineHeight: 18 },
  recChips: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  recChip: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "#ecfdf5", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  recChipText: { fontSize: 10, color: "#059669", fontWeight: "500", maxWidth: 100 },
  moreText: { fontSize: 10, color: "#9ca3af", fontWeight: "500" },
  quickInfo: { flexDirection: "row", gap: 10, marginTop: 2 },
  quickChipRow: { flexDirection: "row", alignItems: "center", gap: 3 },
  quickChipText: { fontSize: 10, color: "#9ca3af", fontWeight: "500" },
  viewAllButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderRadius: 14, borderWidth: 1.5, borderColor: "#16a34a30", backgroundColor: "#fff" },
  viewAllText: { fontSize: 14, fontWeight: "600", color: "#16a34a" },
  balanceSection: { borderTopWidth: 1, borderTopColor: "#f3f4f6", paddingTop: 12, gap: 8 },
  balanceSectionHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  balanceSectionTitle: { fontSize: 12, fontWeight: "600", color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.5 },
  balanceRow: { flexDirection: "row", gap: 10 },
  balanceCard: { flex: 1, backgroundColor: "#f9fafb", borderRadius: 12, padding: 12, borderWidth: 1, borderColor: "#e5e7eb", gap: 4 },
  balanceCardLabel: { fontSize: 11, color: "#9ca3af", fontWeight: "500" },
  balanceAmtRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  balanceAmt: { fontSize: 15, fontWeight: "700", color: "#16a34a" },
  balanceAmtDr: { color: "#dc2626" },
  balanceDrCr: { fontSize: 10, fontWeight: "700", paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4, alignSelf: "flex-start" },
  crText: { color: "#15803d", backgroundColor: "#dcfce7" },
  drText: { color: "#b91c1c", backgroundColor: "#fecdd3" },
});