import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, Alert, Image, Modal, Pressable, Linking, Platform } from "react-native";
import { useState, useEffect, useCallback } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { ArrowLeft, Calendar, Sprout, Package, Bell, Phone, MapPin, FileText, Camera, ExternalLink, Share2, Clock, ChevronRight } from "@/components/Icons";
import { databases, Query, DATABASE_ID, VISITS_COLLECTION_ID, CUSTOMERS_COLLECTION_ID, RECOMMENDATIONS_COLLECTION_ID, VISIT_PHOTOS_COLLECTION_ID } from "@/lib/appwrite";

interface Customer {
  name: string;
  phone: string;
  address?: string;
  cropType?: string;
}

interface Recommendation {
  $id: string;
  itemId?: string;
  customItem?: string;
  name: string;
  dosage: string;
  quantity: string;
  notes: string;
  isCustom: boolean;
  category?: string;
  unit?: string;
}

interface Photo {
  $id: string;
  url: string;
  caption?: string;
}

export default function VisitDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [visitData, setVisitData] = useState<any>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!id) return;
    try {
      const visitDoc = await databases.getDocument(DATABASE_ID, VISITS_COLLECTION_ID, id);
      setVisitData(visitDoc);

      let customerData: Customer = { name: "Unknown", phone: "" };
      if (visitDoc.customerId) {
        try {
          const cDoc = await databases.getDocument(DATABASE_ID, CUSTOMERS_COLLECTION_ID, visitDoc.customerId);
          customerData = { name: cDoc.name, phone: cDoc.phone, address: cDoc.address, cropType: cDoc.cropType };
        } catch {}
      }
      setCustomer(customerData);

      try {
        const recsRes = await databases.listDocuments(DATABASE_ID, RECOMMENDATIONS_COLLECTION_ID, [
          Query.equal("visitId", id),
          Query.limit(50),
        ]);
        const recs: Recommendation[] = (recsRes.documents as any[]).map((r) => ({
          $id: r.$id,
          itemId: r.itemId || undefined,
          customItem: r.customItem || undefined,
          name: r.customItem || r.itemId || "Unknown",
          dosage: r.dosage || "",
          quantity: r.quantity || "",
          notes: r.notes || "",
          isCustom: !!r.customItem,
        }));

        if (recs.some((r) => r.itemId)) {
          const itemIds = recs.filter((r) => r.itemId).map((r) => r.itemId!);
          try {
            const itemsRes = await databases.listDocuments(DATABASE_ID, "items", [
              Query.limit(100),
            ]);
            const itemMap: Record<string, { name: string; category?: string; unit?: string }> = {};
            (itemsRes.documents as any[]).forEach((item) => {
              itemMap[item.$id] = { name: item.name, category: item.category, unit: item.unit };
            });
            recs.forEach((r) => {
              if (r.itemId && itemMap[r.itemId]) {
                r.name = r.isCustom ? r.customItem || r.name : itemMap[r.itemId].name;
                r.category = itemMap[r.itemId].category;
                r.unit = itemMap[r.itemId].unit;
              }
            });
          } catch {}
        }
        setRecommendations(recs);
      } catch {
        setRecommendations([]);
      }

      try {
        const photosRes = await databases.listDocuments(DATABASE_ID, VISIT_PHOTOS_COLLECTION_ID, [
          Query.equal("visitId", id),
          Query.limit(20),
        ]);
        setPhotos(
          (photosRes.documents as any[]).map((p) => ({
            $id: p.$id,
            url: p.url,
            caption: p.caption || undefined,
          }))
        );
      } catch {
        setPhotos([]);
      }
    } catch {
      setVisitData(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { loadData(); }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.7,
        allowsEditing: true,
      });
      if (!result.canceled && result.assets[0]) {
        setPhotos((prev) => [...prev, { $id: `local-${Date.now()}`, url: result.assets[0].uri, caption: undefined }]);
      }
    } catch (e) {
      Alert.alert("Error", "Could not open image picker");
    }
  };

  const takePhoto = async () => {
    try {
      const permResult = await ImagePicker.requestCameraPermissionsAsync();
      if (!permResult.granted) {
        Alert.alert("Permission required", "Camera access is needed to take photos");
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.7,
        allowsEditing: true,
      });
      if (!result.canceled && result.assets[0]) {
        setPhotos((prev) => [...prev, { $id: `local-${Date.now()}`, url: result.assets[0].uri, caption: undefined }]);
      }
    } catch (e) {
      Alert.alert("Error", "Could not open camera");
    }
  };

  const openMaps = () => {
    if (!visitData?.latitude || !visitData?.longitude) return;
    const url = Platform.OS === "ios"
      ? `maps://maps.apple.com/?ll=${visitData.latitude},${visitData.longitude}`
      : `https://maps.google.com/?q=${visitData.latitude},${visitData.longitude}`;
    Linking.openURL(url).catch(() => Alert.alert("Error", "Could not open maps"));
  };

  const shareViaWhatsApp = () => {
    if (!visitData || !customer) return;
    const lines: string[] = [];
    lines.push("*Visit Report*");
    lines.push("");
    lines.push(`*Farmer:* ${customer.name}`);
    if (customer.cropType) lines.push(`*Crop:* ${customer.cropType}`);
    lines.push(`*Phone:* ${customer.phone}`);
    if (customer.address) lines.push(`*Address:* ${customer.address}`);
    lines.push(`*Visit Date:* ${formatDate(visitData.visitDate)}`);
    lines.push("");
    if (visitData.latitude && visitData.longitude) {
      lines.push(`*GPS:* ${Number(visitData.latitude).toFixed(6)}, ${Number(visitData.longitude).toFixed(6)}`);
      lines.push(`*Map:* https://maps.google.com/?q=${visitData.latitude},${visitData.longitude}`);
      lines.push("");
    }
    if (visitData.observations) {
      lines.push("*Observations:*");
      lines.push(visitData.observations);
      lines.push("");
    }
    if (recommendations.length > 0) {
      lines.push("*Recommended Products:*");
      recommendations.forEach((rec, i) => {
        let line = `  ${i + 1}. ${rec.name}`;
        if (rec.dosage) line += ` — Dosage: ${rec.dosage}`;
        if (rec.quantity) line += ` — Qty: ${rec.quantity}`;
        lines.push(line);
      });
      lines.push("");
    }
    if (visitData.nextVisitDate) {
      lines.push(`*Next Visit:* ${formatDate(visitData.nextVisitDate)}`);
      if (visitData.nextVisitTask) lines.push(`*Task:* ${visitData.nextVisitTask}`);
    }
    const text = lines.join("\n");
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;
    Linking.openURL(whatsappUrl).catch(() => Linking.openURL(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`));
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { paddingTop: insets.top }]}>
        <Text style={styles.loadingText}>Loading visit...</Text>
      </View>
    );
  }

  if (!visitData) {
    return (
      <View style={[styles.loadingContainer, { paddingTop: insets.top }]}>
        <Text style={styles.loadingText}>Visit not found</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <ArrowLeft color="#16a34a" size={18} />
          <Text style={styles.backBtnText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "long", year: "numeric" });
    } catch { return dateStr; }
  };

  const formatTime = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
    } catch { return ""; }
  };

  const daysUntilNext = visitData.nextVisitDate
    ? Math.ceil((new Date(visitData.nextVisitDate).getTime() - Date.now()) / (1000 * 3600 * 24))
    : null;

  const hasGps = visitData.latitude && visitData.longitude;

  return (
    <View style={styles.outerContainer}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity style={styles.headerBack} onPress={() => router.back()}>
          <ArrowLeft color="#1a1a2e" size={22} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Visit Details</Text>
          <Text style={styles.headerSub}>{formatDate(visitData.visitDate)}</Text>
        </View>
        <TouchableOpacity style={styles.shareBtn} onPress={shareViaWhatsApp}>
          <Share2 color="#16a34a" size={20} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{ paddingBottom: insets.bottom + 40, padding: 16, gap: 12 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={["#16a34a"]} />}
      >
        <View style={styles.customerCard}>
          <View style={styles.customerAvatar}>
            <Sprout color="#16a34a" size={20} />
          </View>
          <View style={styles.customerInfo}>
            <Text style={styles.customerName} numberOfLines={1}>{customer?.name || "Unknown"}</Text>
            {customer?.phone ? (
              <View style={styles.phoneRow}>
                <Phone color="#9ca3af" size={10} />
                <Text style={styles.phoneText}>{customer.phone}</Text>
              </View>
            ) : null}
            {customer?.cropType ? (
              <View style={styles.cropBadge}>
                <Sprout color="#15803d" size={10} />
                <Text style={styles.cropBadgeText}>{customer.cropType}</Text>
              </View>
            ) : null}
          </View>
          <ChevronRight color="#9ca3af" size={18} />
        </View>

        <View style={styles.card}>
          <View style={styles.cardRow}>
            <View style={[styles.cardIcon, { backgroundColor: "#dcfce7" }]}>
              <Calendar color="#16a34a" size={18} />
            </View>
            <View>
              <Text style={styles.cardValueBold}>{formatDate(visitData.visitDate)}</Text>
              <Text style={styles.cardValueSmall}>{formatTime(visitData.visitDate)}</Text>
            </View>
          </View>
        </View>

        {hasGps ? (
          <View style={styles.card}>
            <View style={styles.cardRow}>
              <View style={[styles.cardIcon, { backgroundColor: "#dcfce7" }]}>
                <MapPin color="#059669" size={18} />
              </View>
              <View style={styles.cardRowInfo}>
                <Text style={styles.cardLabel}>GPS Location</Text>
                <Text style={styles.cardValueBold}>
                  {Number(visitData.latitude).toFixed(6)}, {Number(visitData.longitude).toFixed(6)}
                </Text>
                {visitData.locationName ? (
                  <Text style={styles.cardValueSmall}>{visitData.locationName}</Text>
                ) : null}
              </View>
            </View>
            <TouchableOpacity style={styles.mapsButton} onPress={openMaps}>
              <MapPin color="#059669" size={14} />
              <Text style={styles.mapsButtonText}>Open in Google Maps</Text>
              <ExternalLink color="#059669" size={12} />
            </TouchableOpacity>
          </View>
        ) : null}

        {visitData.observations ? (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={[styles.cardIconSmall, { backgroundColor: "#fef3c7" }]}>
                <FileText color="#b45309" size={14} />
              </View>
              <Text style={styles.cardTitle}>Observations</Text>
            </View>
            <Text style={styles.obsText}>{visitData.observations}</Text>
          </View>
        ) : null}

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={[styles.cardIconSmall, { backgroundColor: "#fecdd3" }]}>
              <Camera color="#e11d48" size={14} />
            </View>
            <Text style={styles.cardTitle}>Photos {photos.length > 0 ? `(${photos.length})` : ""}</Text>
          </View>
          <View style={styles.photosGrid}>
            {photos.map((photo) => (
              <TouchableOpacity key={photo.$id} style={styles.photoThumb} onPress={() => setSelectedPhoto(photo.url)}>
                <Image source={{ uri: photo.url }} style={styles.photoImage} />
                {photo.caption ? (
                  <View style={styles.photoCaption}>
                    <Text style={styles.photoCaptionText} numberOfLines={1}>{photo.caption}</Text>
                  </View>
                ) : null}
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.photoAddButton} onPress={pickImage}>
              <Camera color="#9ca3af" size={20} />
              <Text style={styles.photoAddText}>Gallery</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.photoAddButton} onPress={takePhoto}>
              <Camera color="#9ca3af" size={20} />
              <Text style={styles.photoAddText}>Camera</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={[styles.cardIconSmall, { backgroundColor: "#dcfce7" }]}>
              <Package color="#16a34a" size={14} />
            </View>
            <Text style={styles.cardTitle}>Recommended Products ({recommendations.length})</Text>
          </View>
          {recommendations.length === 0 ? (
            <Text style={styles.emptyText}>No products recommended in this visit</Text>
          ) : (
            recommendations.map((rec, idx) => (
              <View key={rec.$id || idx} style={[styles.recCard, idx < recommendations.length - 1 && styles.recCardBorder]}>
                <View style={styles.recTop}>
                  <View style={[styles.recIcon, { backgroundColor: "#dcfce7" }]}>
                    <Package color="#16a34a" size={14} />
                  </View>
                  <View style={styles.recInfo}>
                    <View style={styles.recNameRow}>
                      <Text style={styles.recName}>{rec.name}</Text>
                      {rec.isCustom && <View style={styles.customBadge}><Text style={styles.customBadgeText}>Custom</Text></View>}
                    </View>
                    {rec.category ? (
                      <Text style={styles.recCategory}>{rec.category}</Text>
                    ) : null}
                    <View style={styles.recDetails}>
                      {rec.dosage ? (
                        <View style={styles.recDetail}>
                          <Text style={styles.recDetailLabel}>Dosage: </Text>
                          <Text style={styles.recDetailValue}>{rec.dosage}</Text>
                        </View>
                      ) : null}
                      {rec.quantity ? (
                        <View style={styles.recDetail}>
                          <Text style={styles.recDetailLabel}>Qty: </Text>
                          <Text style={styles.recDetailValueAmber}>{rec.quantity}</Text>
                        </View>
                      ) : null}
                      {rec.unit ? (
                        <View style={styles.recDetail}>
                          <Text style={styles.recDetailLabel}>Unit: </Text>
                          <Text style={styles.recDetailValue}>{rec.unit}</Text>
                        </View>
                      ) : null}
                    </View>
                    {rec.notes ? (
                      <View style={styles.recNotesCard}>
                        <Text style={styles.recNotesText}>{rec.notes}</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              </View>
            ))
          )}
        </View>

        {visitData.nextVisitDate ? (
          <View style={[styles.card, styles.followupCard]}>
            <View style={styles.cardHeader}>
              <View style={[styles.cardIconSmall, { backgroundColor: "#fef3c7" }]}>
                <Bell color="#b45309" size={14} />
              </View>
              <Text style={styles.cardTitle}>Follow-up Scheduled</Text>
            </View>
            <View style={styles.followupBox}>
              <View style={styles.followupRow}>
                <Calendar color="#b45309" size={14} />
                <Text style={styles.followupDate}>{formatDate(visitData.nextVisitDate)}</Text>
              </View>
              {daysUntilNext !== null && (
                <View style={[
                  styles.urgencyBadge,
                  daysUntilNext <= 0 ? styles.urgencyBadgeRed :
                  daysUntilNext <= 3 ? styles.urgencyBadgeAmber :
                  styles.urgencyBadgeGreen,
                ]}>
                  <Clock color={daysUntilNext <= 0 ? "#e11d48" : daysUntilNext <= 3 ? "#b45309" : "#16a34a"} size={10} />
                  <Text style={[
                    styles.urgencyBadgeText,
                    daysUntilNext <= 0 ? { color: "#e11d48" } :
                    daysUntilNext <= 3 ? { color: "#b45309" } :
                    { color: "#16a34a" },
                  ]}>
                    {daysUntilNext <= 0 ? "Overdue" : daysUntilNext === 1 ? "Tomorrow" : `In ${daysUntilNext} days`}
                  </Text>
                </View>
              )}
              {visitData.nextVisitTask ? (
                <View style={styles.followupTaskSection}>
                  <Text style={styles.followupTaskLabel}>TASK</Text>
                  <Text style={styles.followupTaskText}>{visitData.nextVisitTask}</Text>
                </View>
              ) : null}
            </View>
          </View>
        ) : (
          <View style={styles.card}>
            <View style={styles.noFollowupRow}>
              <Bell color="#9ca3af" size={18} />
              <View>
                <Text style={styles.noFollowupTitle}>No follow-up scheduled</Text>
                <Text style={styles.noFollowupSub}>No next visit was set for this customer</Text>
              </View>
            </View>
          </View>
        )}
      </ScrollView>

      <Modal visible={!!selectedPhoto} transparent animationType="fade" onRequestClose={() => setSelectedPhoto(null)}>
        <Pressable style={styles.lightbox} onPress={() => setSelectedPhoto(null)}>
          <TouchableOpacity style={styles.lightboxClose} onPress={() => setSelectedPhoto(null)}>
            <Text style={styles.lightboxCloseText}>✕</Text>
          </TouchableOpacity>
          {selectedPhoto ? (
            <Image source={{ uri: selectedPhoto }} style={styles.lightboxImage} resizeMode="contain" />
          ) : null}
        </Pressable>
      </Modal>
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
  shareBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#dcfce780", justifyContent: "center", alignItems: "center" },
  scrollView: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#fafafa" },
  loadingText: { fontSize: 14, color: "#9ca3af" },
  backBtn: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 12 },
  backBtnText: { fontSize: 14, color: "#16a34a", fontWeight: "500" },
  customerCard: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#fff", borderRadius: 14, padding: 14, borderWidth: 1, borderColor: "#e5e7eb" },
  customerAvatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: "#dcfce780", justifyContent: "center", alignItems: "center" },
  customerInfo: { flex: 1, gap: 1 },
  customerName: { fontSize: 16, fontWeight: "700", color: "#1a1a2e" },
  phoneRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  phoneText: { fontSize: 12, color: "#6b7280" },
  cropBadge: { flexDirection: "row", alignItems: "center", gap: 2, backgroundColor: "#dcfce7", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, alignSelf: "flex-start", marginTop: 2 },
  cropBadgeText: { fontSize: 10, fontWeight: "600", color: "#15803d" },
  card: { backgroundColor: "#fff", borderRadius: 14, padding: 14, borderWidth: 1, borderColor: "#e5e7eb", gap: 10 },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  cardTitle: { fontSize: 14, fontWeight: "600", color: "#1a1a2e" },
  cardRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  cardRowInfo: { flex: 1, gap: 1 },
  cardIcon: { width: 40, height: 40, borderRadius: 12, justifyContent: "center", alignItems: "center" },
  cardIconSmall: { width: 28, height: 28, borderRadius: 8, justifyContent: "center", alignItems: "center" },
  cardLabel: { fontSize: 11, color: "#6b7280" },
  cardValueBold: { fontSize: 14, fontWeight: "600", color: "#1a1a2e" },
  cardValueSmall: { fontSize: 12, color: "#6b7280" },
  mapsButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 12, backgroundColor: "#ecfdf5", marginTop: 4 },
  mapsButtonText: { fontSize: 12, fontWeight: "600", color: "#059669" },
  obsText: { fontSize: 13, color: "#374151", lineHeight: 19 },
  photosGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  photoThumb: { width: "31%", aspectRatio: 1, borderRadius: 12, overflow: "hidden" },
  photoImage: { width: "100%", height: "100%", resizeMode: "cover" },
  photoCaption: { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: "rgba(0,0,0,0.5)", paddingHorizontal: 4, paddingVertical: 2 },
  photoCaptionText: { fontSize: 8, color: "#fff" },
  photoAddButton: { width: "31%", aspectRatio: 1, borderRadius: 12, borderWidth: 1, borderColor: "#e5e7eb", borderStyle: "dashed", justifyContent: "center", alignItems: "center", gap: 2, backgroundColor: "#f9fafb" },
  photoAddText: { fontSize: 10, color: "#9ca3af" },
  emptyText: { fontSize: 12, color: "#9ca3af", textAlign: "center", paddingVertical: 16 },
  recCard: { paddingVertical: 10 },
  recCardBorder: { borderBottomWidth: 1, borderBottomColor: "#f3f4f6" },
  recTop: { flexDirection: "row", gap: 10 },
  recIcon: { width: 32, height: 32, borderRadius: 10, justifyContent: "center", alignItems: "center" },
  recInfo: { flex: 1, gap: 3 },
  recNameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  recName: { fontSize: 14, fontWeight: "600", color: "#1a1a2e" },
  customBadge: { backgroundColor: "#fef3c7", paddingHorizontal: 5, paddingVertical: 1, borderRadius: 6 },
  customBadgeText: { fontSize: 9, color: "#92400e", fontWeight: "600" },
  recCategory: { fontSize: 10, color: "#6b7280", backgroundColor: "#f3f4f6", paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6, alignSelf: "flex-start" },
  recDetails: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  recDetail: { flexDirection: "row", alignItems: "center" },
  recDetailLabel: { fontSize: 10, color: "#6b7280" },
  recDetailValue: { fontSize: 12, fontWeight: "600", color: "#16a34a" },
  recDetailValueAmber: { fontSize: 12, fontWeight: "600", color: "#b45309" },
  recNotesCard: { backgroundColor: "#f9fafb", borderRadius: 8, padding: 8, marginTop: 4 },
  recNotesText: { fontSize: 12, color: "#6b7280" },
  followupCard: { borderColor: "#fde68a80" },
  followupBox: { backgroundColor: "#fffbeb", borderRadius: 12, padding: 12, gap: 8 },
  followupRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  followupDate: { fontSize: 14, fontWeight: "600", color: "#92400e" },
  followupTaskSection: { borderTopWidth: 1, borderTopColor: "#fde68a80", paddingTop: 8, marginTop: 4 },
  followupTaskLabel: { fontSize: 9, fontWeight: "600", color: "#b4530980", letterSpacing: 1 },
  followupTaskText: { fontSize: 13, color: "#92400e", marginTop: 2 },
  urgencyBadge: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12, alignSelf: "flex-start" },
  urgencyBadgeRed: { backgroundColor: "#fecdd3" },
  urgencyBadgeAmber: { backgroundColor: "#fef3c7" },
  urgencyBadgeGreen: { backgroundColor: "#dcfce7" },
  urgencyBadgeText: { fontSize: 11, fontWeight: "600" },
  noFollowupRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  noFollowupTitle: { fontSize: 14, fontWeight: "500", color: "#1a1a2e" },
  noFollowupSub: { fontSize: 12, color: "#9ca3af" },
  lightbox: { flex: 1, backgroundColor: "rgba(0,0,0,0.9)", justifyContent: "center", alignItems: "center", padding: 16 },
  lightboxClose: { position: "absolute", top: 60, right: 20, width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.1)", justifyContent: "center", alignItems: "center", zIndex: 10 },
  lightboxCloseText: { color: "#fff", fontSize: 18 },
  lightboxImage: { width: "100%", height: "80%", borderRadius: 12 },
});