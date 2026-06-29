import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, Alert, Image, Modal, Pressable, Linking, Platform, TextInput } from "react-native";
import { useState, useCallback, useRef } from "react";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { ArrowLeft, Calendar, Sprout, Package, Bell, Phone, MapPin, FileText, Camera, ExternalLink, Share2, Clock, ChevronRight, Pencil, Check, X, Trash2, PlusCircle, Search } from "@/components/Icons";
import { CUSTOMERS_COLLECTION_ID, VISITS_COLLECTION_ID, RECOMMENDATIONS_COLLECTION_ID, VISIT_PHOTOS_COLLECTION_ID, ITEMS_COLLECTION_ID, STORAGE_BUCKET_ID } from "@/lib/appwrite";
import { getCollection, getDocument, updateDocument, createDocument, deleteDocument, enqueuePhotoUpload } from "@/lib/sync-manager";
import { useNetwork } from "@/lib/network-provider";

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
  _deleted?: boolean;
  // Prescription section marker
  isSectionMarker?: boolean;
  sectionTitle?: string;
  sectionNote?: string;
}

interface PrescriptionSection {
  markerId: string;          // $id of the §HDR§ recommendation
  title: string;
  sectionNote: string;
  products: Recommendation[];
}

function decodeToPrescription(recs: Recommendation[]): PrescriptionSection[] {
  const sections: PrescriptionSection[] = [];
  let current: PrescriptionSection | null = null;
  for (const r of recs) {
    if (r.isSectionMarker) {
      if (current) sections.push(current);
      current = { markerId: r.$id, title: r.sectionTitle || "", sectionNote: r.sectionNote || "", products: [] };
    } else if (current) {
      current.products.push(r);
    } else {
      // Legacy recs without a section marker — bucket into a default section
      if (sections.length === 0) {
        current = { markerId: "legacy", title: "RECOMMENDATIONS", sectionNote: "", products: [] };
      }
      current!.products.push(r);
    }
  }
  if (current) sections.push(current);
  return sections;
}

interface Photo {
  $id: string;
  url: string;
  caption?: string;
  _isLocal?: boolean;
}

interface Item {
  $id: string;
  name: string;
  category?: string;
  unit?: string;
}

export default function VisitDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { syncNow } = useNetwork();
  const [visitData, setVisitData] = useState<any>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [allItems, setAllItems] = useState<Item[]>([]);

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Basic edit fields
  const [editObservations, setEditObservations] = useState("");
  const [editNextVisitDate, setEditNextVisitDate] = useState("");
  const [editNextVisitTask, setEditNextVisitTask] = useState("");
  const [editVisitDate, setEditVisitDate] = useState("");
  const [showEditVisitDatePicker, setShowEditVisitDatePicker] = useState(false);
  const [showEditNextVisitDatePicker, setShowEditNextVisitDatePicker] = useState(false);
  const [capturingGPS, setCapturingGPS] = useState(false);
  const [editLatitude, setEditLatitude] = useState<number | null>(null);
  const [editLongitude, setEditLongitude] = useState<number | null>(null);
  const [editLocationName, setEditLocationName] = useState("");

  // Photo editing state
  const [newPhotos, setNewPhotos] = useState<{ uri: string; name?: string; type?: string; size?: number }[]>([]);
  const [deletedPhotoIds, setDeletedPhotoIds] = useState<string[]>([]);

  // Recommendations editing state
  const [editRecs, setEditRecs] = useState<Recommendation[]>([]);
  const [itemSearch, setItemSearch] = useState("");
  const [showCustomItem, setShowCustomItem] = useState<string | false>(false); // markerId of open section
  const [customItemName, setCustomItemName] = useState("");
  const [showItemSearch, setShowItemSearch] = useState<string | false>(false); // markerId of open section

  // Ref guards to prevent DateTimePicker double-fire on Android
  const editVisitDatePickerHandled = useRef(false);
  const editNextVisitDatePickerHandled = useRef(false);

  const [showShareMenu, setShowShareMenu] = useState(false);

  const loadData = useCallback(async () => {
    if (!id) return;
    try {
      const visitDoc = getDocument(VISITS_COLLECTION_ID, id);
      setVisitData(visitDoc);

      let customerData: Customer = { name: "Unknown", phone: "" };
      if (visitDoc?.customerId) {
        try {
          const cDoc = getDocument(CUSTOMERS_COLLECTION_ID, visitDoc.customerId);
          if (cDoc) {
            customerData = { name: cDoc.name, phone: cDoc.phone || cDoc.mobile || "", address: cDoc.address, cropType: cDoc.cropType };
          }
        } catch {}
      }
      setCustomer(customerData);

      // Load items catalog
      try {
        const itemsRes = getCollection(ITEMS_COLLECTION_ID);
        setAllItems(itemsRes as Item[]);
      } catch {}

      try {
        const recsRes = getCollection(RECOMMENDATIONS_COLLECTION_ID)
          .filter((r: any) => r.visitId === id)
          // Cache is stored newest-first (createDocument unshifts; server pulls orderDesc).
          // Section decoding requires creation order (markers before their products), so sort ascending.
          .sort((a: any, b: any) => {
            const ta = a.$createdAt ? new Date(a.$createdAt).getTime() : 0;
            const tb = b.$createdAt ? new Date(b.$createdAt).getTime() : 0;
            return ta - tb;
          });

        // Build item name map
        const itemMap: Record<string, { name: string; category?: string; unit?: string }> = {};
        try {
          const itemsRes = getCollection(ITEMS_COLLECTION_ID);
          itemsRes.forEach((item: any) => { itemMap[item.$id] = { name: item.name, category: item.category, unit: item.unit }; });
        } catch {}

        const recs: Recommendation[] = recsRes.map((r: any) => {
          // Detect §HDR§ section markers
          if (r.customItem && r.customItem.startsWith("§HDR§")) {
            const parts = r.customItem.split("§");
            // parts: ["", "HDR", title, sectionNote]
            return {
              $id: r.$id, itemId: undefined, customItem: r.customItem,
              name: "", dosage: "", quantity: "", notes: "", isCustom: true,
              isSectionMarker: true, sectionTitle: parts[2] || "", sectionNote: parts[3] || "",
            };
          }
          const itemInfo = r.itemId ? itemMap[r.itemId] : null;
          return {
            $id: r.$id,
            itemId: r.itemId || undefined,
            customItem: r.customItem || undefined,
            name: r.customItem ? r.customItem : (itemInfo ? itemInfo.name : r.itemId || "Unknown"),
            dosage: r.dosage || "",
            quantity: r.quantity || "",
            notes: r.notes || "",
            isCustom: !!r.customItem,
            category: itemInfo?.category,
            unit: itemInfo?.unit,
          };
        });
        setRecommendations(recs);
      } catch {
        setRecommendations([]);
      }

      try {
        const photosRes = getCollection(VISIT_PHOTOS_COLLECTION_ID).filter(p => p.visitId === id);
        setPhotos(
          photosRes.map((p) => ({
            $id: p.$id,
            url: p.url,
            caption: p.caption || undefined,
            _isLocal: p._isLocalPhoto,
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
    if (!visitData) return;
    setEditObservations(visitData.observations || "");
    setEditNextVisitDate(visitData.nextVisitDate ? visitData.nextVisitDate.split("T")[0] : "");
    setEditNextVisitTask(visitData.nextVisitTask || "");
    setEditVisitDate(visitData.visitDate ? visitData.visitDate.split("T")[0] : "");
    setEditLatitude(visitData.latitude || null);
    setEditLongitude(visitData.longitude || null);
    setEditLocationName(visitData.locationName || "");
    setNewPhotos([]);
    setDeletedPhotoIds([]);
    setEditRecs([...recommendations]);
    setItemSearch("");
    setShowCustomItem(false);
    setCustomItemName("");
    setShowItemSearch(false);
    setEditing(true);
  };

  const cancelEditing = () => {
    setEditing(false);
    setDeletedPhotoIds([]);
  };

  const captureGPS = async () => {
    setCapturingGPS(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission denied", "Location access is needed to capture GPS");
        setCapturingGPS(false);
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setEditLatitude(pos.coords.latitude);
      setEditLongitude(pos.coords.longitude);
      setEditLocationName(`${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`);
    } catch {
      setEditLocationName("GPS unavailable");
    } finally {
      setCapturingGPS(false);
    }
  };

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.7,
        allowsMultipleSelection: true,
        allowsEditing: false,
      });
      if (!result.canceled && result.assets.length > 0) {
        const newPicks = result.assets.map((asset) => ({
          uri: asset.uri,
          name: asset.fileName || undefined,
          type: asset.mimeType || undefined,
          size: asset.fileSize || undefined,
        }));
        setNewPhotos((prev) => [...prev, ...newPicks]);
      }
    } catch {
      Alert.alert("Error", "Could not open gallery");
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
        allowsEditing: false,
      });
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        setNewPhotos((prev) => [...prev, { uri: asset.uri, name: asset.fileName || undefined, type: asset.mimeType || undefined, size: asset.fileSize || undefined }]);
      }
    } catch {
      Alert.alert("Error", "Could not open camera");
    }
  };

  const removeNewPhoto = (idx: number) => setNewPhotos(newPhotos.filter((_, i) => i !== idx));

  const markPhotoDeleted = (photoId: string) => {
    setDeletedPhotoIds((prev) => [...prev, photoId]);
  };

  // ── Recommendation editing helpers ──────────────────────────────────────────
  const filteredItems = itemSearch
    ? allItems.filter(
        (i) =>
          i.name.toLowerCase().includes(itemSearch.toLowerCase()) ||
          (i.category && i.category.toLowerCase().includes(itemSearch.toLowerCase()))
      )
    : [];

  const addItemToRecs = (item: Item) => {
    if (editRecs.find((r) => r.itemId === item.$id && !r._deleted)) return;
    setEditRecs((prev) => [
      ...prev,
      {
        $id: `new_${Date.now()}_${Math.random()}`,
        itemId: item.$id,
        name: item.name,
        category: item.category,
        unit: item.unit,
        dosage: "",
        quantity: "",
        notes: "",
        isCustom: false,
      },
    ]);
    setItemSearch("");
    setShowItemSearch(false);
  };

  const addCustomRec = () => {
    if (!customItemName.trim()) return;
    setEditRecs((prev) => [
      ...prev,
      {
        $id: `new_${Date.now()}_${Math.random()}`,
        customItem: customItemName.trim(),
        name: customItemName.trim(),
        dosage: "",
        quantity: "",
        notes: "",
        isCustom: true,
      },
    ]);
    setCustomItemName("");
    setShowCustomItem(false);
  };

  const removeEditRec = (idx: number) => {
    setEditRecs((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateEditRec = (idx: number, field: string, value: string) => {
    const updated = [...editRecs];
    updated[idx] = { ...updated[idx], [field]: value };
    setEditRecs(updated);
  };

  // ── Save ─────────────────────────────────────────────────────────────────────
  const saveEdits = async () => {
    if (!visitData) return;
    setSaving(true);
    try {
      // 1. Update visit fields
      const updateData: any = {};
      if (editObservations !== (visitData.observations || "")) updateData.observations = editObservations || undefined;
      if (editVisitDate && editVisitDate !== (visitData.visitDate || "").split("T")[0]) updateData.visitDate = new Date(editVisitDate).toISOString();
      if (editNextVisitDate) {
        updateData.nextVisitDate = new Date(editNextVisitDate).toISOString();
      } else if (visitData.nextVisitDate) {
        updateData.nextVisitDate = undefined;
      }
      if (editNextVisitTask !== (visitData.nextVisitTask || "")) updateData.nextVisitTask = editNextVisitTask || undefined;
      if (editLatitude !== null && editLatitude !== visitData.latitude) updateData.latitude = editLatitude;
      if (editLongitude !== null && editLongitude !== visitData.longitude) updateData.longitude = editLongitude;
      if (editLocationName !== (visitData.locationName || "")) updateData.locationName = editLocationName || undefined;

      if (Object.keys(updateData).length > 0) {
        await updateDocument(VISITS_COLLECTION_ID, id, updateData);
      }

      // 2. Handle deleted photos
      for (const photoId of deletedPhotoIds) {
        try {
          await deleteDocument(VISIT_PHOTOS_COLLECTION_ID, photoId);
        } catch (e) {
          console.warn("Failed to delete photo:", e);
        }
      }

      // 3. Upload new photos
      for (const photo of newPhotos) {
        try {
          const fileExt = photo.uri.split(".").pop() || "jpg";
          const mimeType = photo.type || (fileExt === "png" ? "image/png" : "image/jpeg");
          const fileName = photo.name || `visit_${id}_${Date.now()}.${fileExt}`;
          const fileSize = photo.size || 1024;
          await enqueuePhotoUpload({
            localUri: photo.uri,
            fileName,
            mimeType,
            fileSize,
            bucketId: STORAGE_BUCKET_ID,
            visitId: id,
          });
        } catch (photoErr) {
          console.warn("Failed to queue photo:", photoErr);
        }
      }

      // 4 & 5. Rebuild recommendations only if the prescription changed.
      // We delete + recreate the whole set in on-screen order so that $createdAt
      // ordering always matches the section/product order (the cache is read back
      // sorted by $createdAt). This also persists section title/note edits and
      // products added into a specific section, which an in-place diff would miss.
      const recSignature = (recs: Recommendation[]) =>
        recs
          .map((r) =>
            r.isSectionMarker
              ? `H|${r.sectionTitle || ""}|${r.sectionNote || ""}`
              : `P|${r.itemId || ""}|${r.customItem || ""}|${r.dosage || ""}|${r.quantity || ""}|${r.notes || ""}`
          )
          .join("\n");

      const currentEditRecs = editRecs.filter((r) => !r._deleted);
      if (recSignature(recommendations) !== recSignature(currentEditRecs)) {
        // Delete every existing recommendation for this visit
        for (const orig of recommendations) {
          try {
            await deleteDocument(RECOMMENDATIONS_COLLECTION_ID, orig.$id);
          } catch (e) {
            console.warn("Failed to delete recommendation:", e);
          }
        }
        // Recreate the full set in order
        for (const rec of currentEditRecs) {
          try {
            await createDocument(RECOMMENDATIONS_COLLECTION_ID, {
              visitId: id,
              itemId: rec.isSectionMarker ? undefined : rec.isCustom ? undefined : rec.itemId,
              customItem: rec.isSectionMarker
                ? `§HDR§${rec.sectionTitle || ""}§${rec.sectionNote || ""}`
                : rec.isCustom
                ? rec.customItem
                : undefined,
              dosage: rec.dosage || undefined,
              quantity: rec.quantity || undefined,
              notes: rec.notes || undefined,
            });
          } catch (e) {
            console.warn("Failed to create recommendation:", e);
          }
        }
      }

      setNewPhotos([]);
      setDeletedPhotoIds([]);
      setEditing(false);
      await loadData();
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to save changes");
    } finally {
      setSaving(false);
    }
  };

  const openMaps = () => {
    const lat = editing ? editLatitude : visitData?.latitude;
    const lng = editing ? editLongitude : visitData?.longitude;
    if (!lat || !lng) return;
    const url = Platform.OS === "ios"
      ? `maps://maps.apple.com/?ll=${lat},${lng}`
      : `https://maps.google.com/?q=${lat},${lng}`;
    Linking.openURL(url).catch(() => Alert.alert("Error", "Could not open maps"));
  };

  const buildPrescriptionText = (sections: PrescriptionSection[]): string => {
    const lines: string[] = [];
    for (const sec of sections) {
      if (sec.products.length === 0) continue;
      lines.push("");
      if (sec.title) lines.push(sec.title);
      lines.push("");
      sec.products.forEach((p, i) => {
        if (i > 0) lines.push("+");
        const namePadded = p.name.toUpperCase().padEnd(14);
        lines.push(p.quantity ? `${namePadded} - ${p.quantity}` : p.name.toUpperCase());
        if (p.notes) lines.push(`(${p.notes.replace(/^\(|\)$/g, "")})`);
      });
      if (sec.sectionNote) {
        lines.push("");
        lines.push(sec.sectionNote);
      }
    }
    return lines.join("\n");
  };

  const shareViaWhatsApp = () => {
    if (!visitData || !customer) return;
    const prescSections = decodeToPrescription(recommendations);
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
    if (prescSections.some((s) => s.products.length > 0)) {
      lines.push("*Recommendations:*");
      lines.push(buildPrescriptionText(prescSections));
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

  const shareShopReport = () => {
    if (!visitData || !customer) return;
    const prescSections = decodeToPrescription(recommendations);
    const lines: string[] = [];
    lines.push(`*${customer.name}*`);
    if (customer.cropType) lines.push(`Crop: ${customer.cropType}`);
    lines.push(`Ph: ${customer.phone}`);
    lines.push("");
    if (visitData.observations) {
      lines.push("*Observations:*");
      lines.push(visitData.observations);
      lines.push("");
    }
    if (prescSections.some((s) => s.products.length > 0)) {
      lines.push(buildPrescriptionText(prescSections));
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
        <TouchableOpacity style={styles.backBtn} onPress={() => router.canGoBack() ? router.back() : router.replace("/(tabs)/home")}>
          <ArrowLeft color="#16a34a" size={18} />
          <Text style={styles.backBtnText}>Go Home</Text>
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

  const displayLat = editing ? editLatitude : visitData.latitude;
  const displayLng = editing ? editLongitude : visitData.longitude;

  // Visible photos in edit mode (exclude deleted ones)
  const visiblePhotos = editing
    ? photos.filter((p) => !deletedPhotoIds.includes(p.$id))
    : photos;

  return (
    <View style={styles.outerContainer}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity style={styles.headerBack} onPress={() => router.canGoBack() ? router.back() : router.replace("/(tabs)/home")}>
          <ArrowLeft color="#1a1a2e" size={22} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>{editing ? "Edit Visit" : "Visit Details"}</Text>
          <Text style={styles.headerSub}>{formatDate(editing ? (editVisitDate || visitData.visitDate) : visitData.visitDate)}</Text>
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
            <TouchableOpacity style={styles.headerAction} onPress={() => setShowShareMenu(!showShareMenu)}>
              <Share2 color="#16a34a" size={18} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.headerAction} onPress={startEditing}>
              <Pencil color="#16a34a" size={18} />
            </TouchableOpacity>
          </View>
        )}
        {showShareMenu && (
          <View style={styles.shareMenu}>
            <TouchableOpacity style={styles.shareMenuItem} onPress={() => { setShowShareMenu(false); shareViaWhatsApp(); }}>
              <Text style={styles.shareMenuTitle}>Full Report</Text>
              <Text style={styles.shareMenuDesc}>Farmer details, GPS, observations, recommendations & next visit</Text>
            </TouchableOpacity>
            <View style={styles.shareMenuDivider} />
            <TouchableOpacity style={styles.shareMenuItem} onPress={() => { setShowShareMenu(false); shareShopReport(); }}>
              <Text style={styles.shareMenuTitle}>Shop Report</Text>
              <Text style={styles.shareMenuDesc}>Farmer details, observations & recommendations only</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{ paddingBottom: insets.bottom + 40, padding: 16, gap: 12 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={["#16a34a"]} />}
        keyboardShouldPersistTaps="handled"
      >
        {/* Customer Card */}
        <TouchableOpacity
          style={styles.customerCard}
          onPress={() => { if (visitData?.customerId) router.push(`/customer/${visitData.customerId}`); }}
          disabled={!visitData?.customerId}
          activeOpacity={0.7}
        >
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
        </TouchableOpacity>

        {/* ── EDIT MODE ─────────────────────────────────────────────────── */}
        {editing ? (
          <>
            {/* Visit Date */}
            <View style={styles.card}>
              <Text style={styles.editLabel}>Visit Date</Text>
              <TouchableOpacity style={styles.dateInputRow} onPress={() => { editVisitDatePickerHandled.current = false; setShowEditVisitDatePicker(true); }}>
                <Calendar color="#9ca3af" size={16} />
                <Text style={[styles.editInput, { flex: 1, marginLeft: 8 }, editVisitDate && { color: "#1a1a2e" }]}>{editVisitDate || "Select date"}</Text>
              </TouchableOpacity>
              {showEditVisitDatePicker && (
                <DateTimePicker
                  value={editVisitDate ? new Date(editVisitDate) : new Date()}
                  mode="date"
                  display={Platform.OS === "ios" ? "inline" : "default"}
                  onChange={(_event, date) => {
                    if (editVisitDatePickerHandled.current) return;
                    editVisitDatePickerHandled.current = true;
                    setShowEditVisitDatePicker(false);
                    if (date) setEditVisitDate(date.toISOString().split("T")[0]);
                  }}
                />
              )}
            </View>

            {/* GPS */}
            <View style={styles.card}>
              <Text style={styles.editLabel}>GPS Location</Text>
              <TouchableOpacity style={styles.gpsButton} onPress={captureGPS} disabled={capturingGPS}>
                <MapPin color={editLatitude ? "#16a34a" : "#6b7280"} size={16} />
                <Text style={[styles.gpsButtonText, editLatitude ? { color: "#16a34a" } as const : null]}>
                  {capturingGPS ? "Capturing..." : editLatitude ? `📍 ${editLatitude.toFixed(4)}, ${editLongitude?.toFixed(4)}` : "Capture Current Location"}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Observations */}
            <View style={styles.card}>
              <Text style={styles.editLabel}>Observations</Text>
              <TextInput
                style={[styles.editInput, styles.editTextArea]}
                value={editObservations}
                onChangeText={(text) => {
                  const lines = text.split("\n");
                  const prevLines = editObservations.split("\n");
                  if (lines.length > prevLines.length) {
                    const newLastLine = lines[lines.length - 1];
                    const prevNonEmpty = lines.slice(0, -1).filter(l => l.trim());
                    const lastNonEmpty = prevNonEmpty[prevNonEmpty.length - 1] || "";
                    const numMatch = lastNonEmpty.match(/^(\d+)[\.)\s]/);
                    if (numMatch && newLastLine === "") {
                      const nextNum = parseInt(numMatch[1]) + 1;
                      const updated = [...lines.slice(0, -1), `${nextNum}. `];
                      setEditObservations(updated.join("\n"));
                      return;
                    }
                  }
                  setEditObservations(text);
                }}
                placeholder="Describe crop conditions, symptoms, field observations..."
                placeholderTextColor="#9ca3af"
                multiline
                numberOfLines={5}
                textAlignVertical="top"
              />
              <Text style={styles.obsHint}>Tip: Type "1. " to start auto-numbering. Press Enter to continue.</Text>
            </View>

            {/* ── Photos (Edit Mode) ──────────────────────────────────────── */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={[styles.cardIconSmall, { backgroundColor: "#fecdd3" }]}>
                  <Camera color="#e11d48" size={14} />
                </View>
                <Text style={styles.cardTitle}>
                  Photos ({visiblePhotos.length + newPhotos.length})
                </Text>
              </View>
              <View style={styles.photosGrid}>
                {/* Existing photos with delete button */}
                {visiblePhotos.map((photo) => (
                  <View key={photo.$id} style={styles.photoThumbContainer}>
                    <Image source={{ uri: photo.url }} style={styles.photoImage} />
                    <TouchableOpacity style={styles.photoRemove} onPress={() => markPhotoDeleted(photo.$id)}>
                      <Trash2 color="#fff" size={10} />
                    </TouchableOpacity>
                  </View>
                ))}
                {/* New photos to upload */}
                {newPhotos.map((photo, idx) => (
                  <View key={`new-${idx}`} style={styles.photoThumbContainer}>
                    <Image source={{ uri: photo.uri }} style={styles.photoImage} />
                    <View style={styles.photoPendingBadge}>
                      <Text style={styles.photoPendingText}>NEW</Text>
                    </View>
                    <TouchableOpacity style={styles.photoRemove} onPress={() => removeNewPhoto(idx)}>
                      <X color="#fff" size={10} />
                    </TouchableOpacity>
                  </View>
                ))}
                <TouchableOpacity style={styles.photoAddButton} onPress={takePhoto}>
                  <Camera color="#9ca3af" size={20} />
                  <Text style={styles.photoAddText}>Camera</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.photoAddButton} onPress={pickImage}>
                  <Camera color="#9ca3af" size={20} />
                  <Text style={styles.photoAddText}>Gallery</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* ── Recommended Products (Edit Mode) ────────────────────────── */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={[styles.cardIconSmall, { backgroundColor: "#dcfce7" }]}>
                  <Package color="#16a34a" size={14} />
                </View>
                <Text style={styles.cardTitle}>Recommended Products ({editRecs.length})</Text>
              </View>


              {/* Section-aware editable rec list */}
              {(() => {

                const editSections = decodeToPrescription(editRecs.filter(r => !r._deleted));
                return editSections.length === 0 ? (
                  <Text style={styles.emptyText}>No products added yet</Text>
                ) : (
                  editSections.map((sec, secIdx) => (
                    <View key={sec.markerId} style={[styles.editSection, secIdx > 0 && styles.editSectionGap]}>
                      {/* Section header */}
                      <View style={styles.editSectionHeader}>
                        <View style={styles.editSectionIndexBadge}>
                          <Text style={styles.editSectionIndexText}>{secIdx + 1}</Text>
                        </View>
                        <TextInput
                          style={styles.editSectionTitleInput}
                          value={sec.title}
                          onChangeText={(val) => {
                            setEditRecs(prev => prev.map(r =>
                              r.$id === sec.markerId
                                ? { ...r, sectionTitle: val.toUpperCase(), customItem: `§HDR§${val.toUpperCase()}§${sec.sectionNote}` }
                                : r
                            ));
                          }}
                          placeholder="SECTION TITLE"
                          placeholderTextColor="#9ca3af"
                          autoCapitalize="characters"
                        />
                        {editSections.length > 1 && (
                          <TouchableOpacity
                            onPress={() => {
                              // Remove the section marker + all its products
                              const toDelete = [sec.markerId, ...sec.products.map(p => p.$id)];
                              setEditRecs(prev => prev.filter(r => !toDelete.includes(r.$id)));
                            }}
                            style={styles.editSectionDeleteBtn}
                          >
                            <X color="#dc2626" size={14} />
                          </TouchableOpacity>
                        )}
                      </View>
                      {/* Section note */}
                      <TextInput
                        style={styles.editSectionNoteInput}
                        value={sec.sectionNote}
                        onChangeText={(val) => {
                          setEditRecs(prev => prev.map(r =>
                            r.$id === sec.markerId
                              ? { ...r, sectionNote: val, customItem: `§HDR§${sec.title}§${val}` }
                              : r
                          ));
                        }}
                        placeholder="Section note (e.g. Mix with 200L water)"
                        placeholderTextColor="#9ca3af"
                      />
                      {/* Products in this section */}
                      {sec.products.map((rec, idx) => (
                        <View key={rec.$id} style={[styles.editRecCard, idx < sec.products.length - 1 && styles.editRecCardBorder]}>
                          <View style={styles.editRecHeader}>
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flex: 1 }}>
                              <View style={[styles.recIcon, { backgroundColor: "#dcfce7" }]}>
                                <Package color="#16a34a" size={12} />
                              </View>
                              <Text style={styles.recName} numberOfLines={1}>{rec.name}</Text>
                              {rec.isCustom && <View style={styles.customBadge}><Text style={styles.customBadgeText}>Custom</Text></View>}
                              {rec.$id.startsWith("new_") && <View style={styles.newBadge}><Text style={styles.newBadgeText}>NEW</Text></View>}
                            </View>
                            <TouchableOpacity
                              onPress={() => {
                                setEditRecs(prev => prev.filter(r => r.$id !== rec.$id));
                              }}
                              style={styles.recDeleteBtn}
                            >
                              <Trash2 color="#dc2626" size={14} />
                            </TouchableOpacity>
                          </View>
                          {rec.category && <Text style={styles.recCategory}>{rec.category}</Text>}
                          {/* Dosage (the per-item optional note) — larger, full-width */}
                          <Text style={styles.fieldLabel}>Dosage</Text>
                          <TextInput
                            style={[styles.fieldInput, styles.fieldInputLarge]}
                            placeholder={rec.unit ? `e.g. 5 ${rec.unit}/L` : "e.g. 2ml/L"}
                            placeholderTextColor="#9ca3af"
                            value={rec.notes}
                            onChangeText={(t) => {
                              setEditRecs(prev => prev.map(r => r.$id === rec.$id ? { ...r, notes: t } : r));
                            }}
                            multiline
                            numberOfLines={3}
                            textAlignVertical="top"
                          />
                          <Text style={styles.fieldLabel}>Quantity</Text>
                          <TextInput
                            style={styles.fieldInput}
                            placeholder="e.g. 500ml"
                            placeholderTextColor="#9ca3af"
                            value={rec.quantity}
                            onChangeText={(t) => {
                              setEditRecs(prev => prev.map(r => r.$id === rec.$id ? { ...r, quantity: t } : r));
                            }}
                          />
                        </View>
                      ))}
                      {/* Add product to this section */}
                      <View style={styles.addRecRow}>
                        <TouchableOpacity
                          style={styles.addRecBtn}
                          onPress={() => setShowItemSearch(showItemSearch === sec.markerId ? false : sec.markerId as any)}
                        >
                          <Search color="#16a34a" size={14} />
                          <Text style={styles.addRecBtnText}>Search Products</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.addRecBtn}
                          onPress={() => setShowCustomItem(showCustomItem ? false : sec.markerId as any)}
                        >
                          <PlusCircle color="#16a34a" size={14} />
                          <Text style={styles.addRecBtnText}>Custom Item</Text>
                        </TouchableOpacity>
                      </View>
                      {/* Inline product search for this section */}
                      {showItemSearch === (sec.markerId as any) && (
                        <View style={{ gap: 8 }}>
                          <View style={styles.searchBox}>
                            <Search color="#9ca3af" size={14} />
                            <TextInput
                              style={styles.searchInput}
                              placeholder="Search products..."
                              placeholderTextColor="#9ca3af"
                              value={itemSearch}
                              onChangeText={setItemSearch}
                              autoFocus
                            />
                            <TouchableOpacity onPress={() => { setShowItemSearch(false); setItemSearch(""); }}>
                              <X color="#9ca3af" size={14} />
                            </TouchableOpacity>
                          </View>
                          {itemSearch.length > 0 && filteredItems.map((item) => (
                            <TouchableOpacity
                              key={item.$id}
                              style={styles.itemRow}
                              onPress={() => {
                                if (editRecs.find(r => r.itemId === item.$id && !r._deleted)) return;
                                // Insert after the last product of this section (before next section marker)
                                const markerIdx = editRecs.findIndex(r => r.$id === sec.markerId);
                                const nextMarkerIdx = editRecs.findIndex((r, i) => i > markerIdx && r.isSectionMarker);
                                const insertAt = nextMarkerIdx === -1 ? editRecs.length : nextMarkerIdx;
                                const newRec: Recommendation = {
                                  $id: `new_${Date.now()}_${Math.random()}`,
                                  itemId: item.$id, name: item.name, category: item.category,
                                  unit: item.unit, dosage: "", quantity: "", notes: "", isCustom: false,
                                };
                                setEditRecs(prev => [
                                  ...prev.slice(0, insertAt),
                                  newRec,
                                  ...prev.slice(insertAt),
                                ]);
                                setItemSearch(""); setShowItemSearch(false);
                              }}
                            >
                              <Package color="#16a34a" size={14} />
                              <View style={{ flex: 1 }}>
                                <Text style={styles.itemName}>{item.name}</Text>
                                {item.category && <Text style={styles.itemCategory}>{item.category}{item.unit ? ` · ${item.unit}` : ""}</Text>}
                              </View>
                              <PlusCircle color="#16a34a" size={16} />
                            </TouchableOpacity>
                          ))}
                          {itemSearch.length > 0 && filteredItems.length === 0 && (
                            <Text style={styles.emptyText}>No products found</Text>
                          )}
                        </View>
                      )}
                      {/* Inline custom item for this section */}
                      {showCustomItem === (sec.markerId as any) && (
                        <View style={styles.customItemRow}>
                          <TextInput
                            style={[styles.editInput, { flex: 1 }]}
                            placeholder="Enter custom product name"
                            placeholderTextColor="#9ca3af"
                            value={customItemName}
                            onChangeText={setCustomItemName}
                          />
                          <TouchableOpacity
                            style={styles.customAddBtn}
                            onPress={() => {
                              if (!customItemName.trim()) return;
                              const markerIdx = editRecs.findIndex(r => r.$id === sec.markerId);
                              const nextMarkerIdx = editRecs.findIndex((r, i) => i > markerIdx && r.isSectionMarker);
                              const insertAt = nextMarkerIdx === -1 ? editRecs.length : nextMarkerIdx;
                              const newRec: Recommendation = {
                                $id: `new_${Date.now()}_${Math.random()}`,
                                customItem: customItemName.trim(), name: customItemName.trim(),
                                dosage: "", quantity: "", notes: "", isCustom: true,
                              };
                              setEditRecs(prev => [
                                ...prev.slice(0, insertAt),
                                newRec,
                                ...prev.slice(insertAt),
                              ]);
                              setCustomItemName(""); setShowCustomItem(false);
                            }}
                          >
                            <Text style={styles.customAddBtnText}>Add</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.customCancelBtn}
                            onPress={() => { setShowCustomItem(false); setCustomItemName(""); }}
                          >
                            <X color="#6b7280" size={16} />
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  ))
                );
              })()}
              {/* Add section button */}
              <TouchableOpacity
                style={styles.addSectionBtn}
                onPress={() => {
                  const newMarker: Recommendation = {
                    $id: `new_${Date.now()}_${Math.random()}`,
                    customItem: `§HDR§NEW SECTION§`,
                    name: "", dosage: "", quantity: "", notes: "", isCustom: true,
                    isSectionMarker: true, sectionTitle: "NEW SECTION", sectionNote: "",
                  };
                  setEditRecs(prev => [...prev, newMarker]);
                }}
              >
                <PlusCircle color="#7c3aed" size={14} />
                <Text style={styles.addSectionBtnText}>Add Section</Text>
              </TouchableOpacity>
            </View>

            {/* Follow-up (Edit) */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={[styles.cardIconSmall, { backgroundColor: "#fef3c7" }]}>
                  <Bell color="#b45309" size={14} />
                </View>
                <Text style={styles.cardTitle}>Follow-up Schedule</Text>
              </View>
              <Text style={styles.editLabel}>Next Visit Date</Text>
              <TouchableOpacity style={styles.dateInputRow} onPress={() => { editNextVisitDatePickerHandled.current = false; setShowEditNextVisitDatePicker(true); }}>
                <Calendar color="#9ca3af" size={16} />
                <Text style={[styles.editInput, { flex: 1, marginLeft: 8 }, editNextVisitDate && { color: "#1a1a2e" }]}>{editNextVisitDate || "Select date"}</Text>
                {editNextVisitDate ? (
                  <TouchableOpacity onPress={() => setEditNextVisitDate("")}>
                    <X color="#9ca3af" size={14} />
                  </TouchableOpacity>
                ) : null}
              </TouchableOpacity>
              {showEditNextVisitDatePicker && (
                <DateTimePicker
                  value={editNextVisitDate ? new Date(editNextVisitDate) : new Date()}
                  mode="date"
                  display={Platform.OS === "ios" ? "inline" : "default"}
                  onChange={(_event, date) => {
                    if (editNextVisitDatePickerHandled.current) return;
                    editNextVisitDatePickerHandled.current = true;
                    setShowEditNextVisitDatePicker(false);
                    if (date) setEditNextVisitDate(date.toISOString().split("T")[0]);
                  }}
                />
              )}

              <View style={styles.quickRow}>
                {[7, 14, 30].map((days) => {
                  const d = new Date(); d.setDate(d.getDate() + days);
                  const ds = d.toISOString().split("T")[0];
                  return (
                    <TouchableOpacity key={days} style={[styles.quickBtn, editNextVisitDate === ds && styles.quickBtnActive]} onPress={() => setEditNextVisitDate(ds)}>
                      <Clock color={editNextVisitDate === ds ? "#16a34a" : "#6b7280"} size={12} />
                      <Text style={[styles.quickBtnText, editNextVisitDate === ds && styles.quickBtnTextActive]}>{days} days</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={[styles.editLabel, { marginTop: 12 }]}>Task for Next Visit</Text>
              <TextInput
                style={[styles.editInput, { minHeight: 80, textAlignVertical: "top" }]}
                value={editNextVisitTask}
                onChangeText={setEditNextVisitTask}
                placeholder="Describe what needs to be checked..."
                placeholderTextColor="#9ca3af"
                multiline
                numberOfLines={3}
              />
            </View>

            {/* Save button */}
            <TouchableOpacity
              style={[styles.saveButton, saving && styles.saveButtonDisabled]}
              onPress={saveEdits}
              disabled={saving}
            >
              <Check color="#fff" size={16} />
              <Text style={styles.saveButtonText}>{saving ? "Saving..." : "Save Changes"}</Text>
            </TouchableOpacity>
          </>
        ) : (
          /* ── VIEW MODE ──────────────────────────────────────────────────── */
          <>
            {/* Visit Date */}
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

            {/* GPS */}
            {displayLat && displayLng ? (
              <View style={styles.card}>
                <View style={styles.cardRow}>
                  <View style={[styles.cardIcon, { backgroundColor: "#dcfce7" }]}>
                    <MapPin color="#059669" size={18} />
                  </View>
                  <View style={styles.cardRowInfo}>
                    <Text style={styles.cardLabel}>GPS Location</Text>
                    <Text style={styles.cardValueBold}>
                      {Number(displayLat).toFixed(6)}, {Number(displayLng).toFixed(6)}
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

            {/* Observations */}
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
          </>
        )}

        {/* ── Photos (View Mode — always shown below edit fields) ──────── */}
        {!editing && photos.length > 0 && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={[styles.cardIconSmall, { backgroundColor: "#fecdd3" }]}>
                <Camera color="#e11d48" size={14} />
              </View>
              <Text style={styles.cardTitle}>Photos ({photos.length})</Text>
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
            </View>
          </View>
        )}

        {/* ── Prescription View (View Mode) ────────────────────────────── */}
        {!editing && (() => {
          const prescSections = decodeToPrescription(recommendations);
          const hasProducts = prescSections.some((s) => s.products.length > 0);
          return (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={[styles.cardIconSmall, { backgroundColor: "#dcfce7" }]}>
                  <Package color="#16a34a" size={14} />
                </View>
                <Text style={styles.cardTitle}>
                  Recommendations ({prescSections.filter((s) => s.products.length > 0).length} section{prescSections.filter((s) => s.products.length > 0).length !== 1 ? "s" : ""})
                </Text>
              </View>
              {!hasProducts ? (
                <Text style={styles.emptyText}>No products recommended in this visit</Text>
              ) : (
                <View style={styles.prescriptionContainer}>
                {prescSections.map((sec, secIdx) => {
                    if (sec.products.length === 0) return null;
                    // Use rendered index for gap (skip empty sections)
                    const renderedIdx = prescSections.slice(0, secIdx).filter(s => s.products.length > 0).length;
                    return (
                      <View key={sec.markerId} style={[styles.prescSection, renderedIdx > 0 && styles.prescSectionGap]}>
                        {/* Section title */}
                        {sec.title ? (
                          <Text style={styles.prescSectionTitle}>{sec.title}</Text>
                        ) : null}
                        {/* Products with + separator */}
                        {sec.products.map((p, pIdx) => (
                          <View key={p.$id}>
                            {pIdx > 0 && (
                              <View style={styles.prescPlusRow}>
                                <Text style={styles.prescPlus}>+</Text>
                              </View>
                            )}
                            <View style={styles.prescProductRow}>
                              <Text style={styles.prescProductName}>{p.name.toUpperCase()}</Text>
                              {p.quantity ? (
                                <Text style={styles.prescProductQty}>— {p.quantity}</Text>
                              ) : null}
                            </View>
                            {p.notes ? (
                              <Text style={styles.prescSubLabel}>({p.notes.replace(/^\(|\)$/g, "")})</Text>
                            ) : null}
                          </View>
                        ))}
                        {/* Section note */}
                        {sec.sectionNote ? (
                          <View style={styles.prescNoteRow}>
                            <Text style={styles.prescNote}>{sec.sectionNote}</Text>
                          </View>
                        ) : null}
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          );
        })()}

        {/* ── Follow-up ──────────────────────────────────────────────────── */}
        {!editing && (visitData.nextVisitDate ? (
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
        ))}

        {!editing && (
          <TouchableOpacity style={styles.editButton} onPress={startEditing}>
            <Pencil color="#16a34a" size={16} />
            <Text style={styles.editButtonText}>Edit Visit</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* Photo Lightbox */}
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
  headerBack: { width: 44, height: 44, justifyContent: "center", alignItems: "center", marginLeft: -8 },
  headerCenter: { flex: 1, alignItems: "center" },
  headerTitle: { fontSize: 16, fontWeight: "600", color: "#1a1a2e" },
  headerSub: { fontSize: 11, color: "#6b7280" },
  headerAction: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#dcfce780", justifyContent: "center", alignItems: "center" },
  headerActionGreen: { backgroundColor: "#16a34a" },
  headerActionDisabled: { opacity: 0.5 },
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
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  cardTitle: { fontSize: 14, fontWeight: "600", color: "#1a1a2e", flex: 1 },
  cardRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  cardRowInfo: { flex: 1, gap: 1 },
  cardIcon: { width: 40, height: 40, borderRadius: 12, justifyContent: "center", alignItems: "center" },
  cardIconSmall: { width: 28, height: 28, borderRadius: 8, justifyContent: "center", alignItems: "center" },
  cardLabel: { fontSize: 11, color: "#6b7280" },
  cardValueBold: { fontSize: 14, fontWeight: "600", color: "#1a1a2e" },
  cardValueSmall: { fontSize: 12, color: "#6b7280" },
  mapsButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 12, backgroundColor: "#ecfdf5", marginTop: 4 },
  mapsButtonText: { fontSize: 12, fontWeight: "600", color: "#059669" },
  obsText: { fontSize: 13, color: "#374151", lineHeight: 20 },
  photosGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  photoThumb: { width: "31%", aspectRatio: 1, borderRadius: 12, overflow: "hidden" },
  photoImage: { width: "100%", height: "100%", resizeMode: "cover" },
  photoCaption: { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: "rgba(0,0,0,0.5)", paddingHorizontal: 4, paddingVertical: 2 },
  photoCaptionText: { fontSize: 8, color: "#fff" },
  photoThumbContainer: { width: "31%", aspectRatio: 1, borderRadius: 12, overflow: "hidden", position: "relative" },
  photoRemove: { position: "absolute", top: 4, right: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: "rgba(220,38,38,0.85)", justifyContent: "center", alignItems: "center" },
  photoPendingBadge: { position: "absolute", bottom: 4, left: 4, backgroundColor: "#16a34a", paddingHorizontal: 5, paddingVertical: 2, borderRadius: 6 },
  photoPendingText: { fontSize: 8, color: "#fff", fontWeight: "700" },
  photoAddButton: { width: "31%", aspectRatio: 1, borderRadius: 12, borderWidth: 1.5, borderColor: "#d1d5db", borderStyle: "dashed", justifyContent: "center", alignItems: "center", gap: 4, backgroundColor: "#f9fafb" },
  photoAddText: { fontSize: 10, color: "#9ca3af" },
  emptyText: { fontSize: 12, color: "#9ca3af", textAlign: "center", paddingVertical: 12 },
  // Recommendations - view mode
  recCard: { paddingVertical: 10 },
  recCardBorder: { borderBottomWidth: 1, borderBottomColor: "#f3f4f6" },
  recTop: { flexDirection: "row", gap: 10 },
  recIcon: { width: 32, height: 32, borderRadius: 10, justifyContent: "center", alignItems: "center", flexShrink: 0 },
  recInfo: { flex: 1, gap: 3 },
  recNameRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  recName: { fontSize: 14, fontWeight: "600", color: "#1a1a2e" },
  recCategory: { fontSize: 10, color: "#6b7280", backgroundColor: "#f3f4f6", paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6, alignSelf: "flex-start" },
  recDetails: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  recDetail: { flexDirection: "row", alignItems: "center" },
  recDetailLabel: { fontSize: 10, color: "#6b7280" },
  recDetailValue: { fontSize: 12, fontWeight: "600", color: "#16a34a" },
  recDetailValueAmber: { fontSize: 12, fontWeight: "600", color: "#b45309" },
  recNotesCard: { backgroundColor: "#f9fafb", borderRadius: 8, padding: 8, marginTop: 2 },
  recNotesText: { fontSize: 12, color: "#6b7280" },
  // Recommendations - edit mode
  editRecCard: { paddingVertical: 12, gap: 8 },
  editRecCardBorder: { borderBottomWidth: 1, borderBottomColor: "#f3f4f6" },
  editRecHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  recDeleteBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: "#fef2f2", justifyContent: "center", alignItems: "center" },
  recEditFields: { flexDirection: "row", gap: 8 },
  addRecRow: { flexDirection: "row", gap: 8 },
  addRecBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1.5, borderColor: "#16a34a40", borderStyle: "dashed", borderRadius: 10, paddingVertical: 10 },
  addRecBtnText: { fontSize: 12, color: "#16a34a", fontWeight: "600" },
  searchBox: { flexDirection: "row", alignItems: "center", backgroundColor: "#f3f4f6", borderRadius: 10, paddingHorizontal: 10, height: 40, gap: 6 },
  searchInput: { flex: 1, fontSize: 13, color: "#1a1a2e" },
  itemRow: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#f9fafb", borderRadius: 10, padding: 10, borderWidth: 1, borderColor: "#e5e7eb" },
  itemName: { fontSize: 13, fontWeight: "500", color: "#1a1a2e" },
  itemCategory: { fontSize: 10, color: "#6b7280" },
  customItemRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  customAddBtn: { backgroundColor: "#16a34a", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, justifyContent: "center" },
  customAddBtnText: { color: "#fff", fontWeight: "600", fontSize: 13 },
  customCancelBtn: { paddingVertical: 10, paddingHorizontal: 8 },
  customBadge: { backgroundColor: "#fef3c7", paddingHorizontal: 5, paddingVertical: 1, borderRadius: 6 },
  customBadgeText: { fontSize: 9, color: "#92400e", fontWeight: "600" },
  newBadge: { backgroundColor: "#dcfce7", paddingHorizontal: 5, paddingVertical: 1, borderRadius: 6 },
  newBadgeText: { fontSize: 9, color: "#15803d", fontWeight: "700" },
  fieldLabel: { fontSize: 10, color: "#6b7280", marginBottom: 4 },
  fieldInput: { backgroundColor: "#f9fafb", borderRadius: 8, padding: 8, fontSize: 12, color: "#1a1a2e", borderWidth: 1, borderColor: "#e5e7eb" },
  fieldInputLarge: { minHeight: 64, fontSize: 14, paddingVertical: 10 },
  // Follow-up
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
  // Share menu
  shareMenu: { position: "absolute", top: 60, right: 16, backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: "#e5e7eb", shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 8, zIndex: 100, width: 260 },
  shareMenuItem: { padding: 12 },
  shareMenuTitle: { fontSize: 14, fontWeight: "600", color: "#1a1a2e" },
  shareMenuDesc: { fontSize: 11, color: "#6b7280", marginTop: 2 },
  shareMenuDivider: { height: 1, backgroundColor: "#f3f4f6" },
  // Lightbox
  lightbox: { flex: 1, backgroundColor: "rgba(0,0,0,0.9)", justifyContent: "center", alignItems: "center", padding: 16 },
  lightboxClose: { position: "absolute", top: 60, right: 20, width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.1)", justifyContent: "center", alignItems: "center", zIndex: 10 },
  lightboxCloseText: { color: "#fff", fontSize: 18 },
  lightboxImage: { width: "100%", height: "80%", borderRadius: 12 },
  // Edit inputs
  editLabel: { fontSize: 13, fontWeight: "500", color: "#374151", marginBottom: 4 },
  editInput: { backgroundColor: "#f9fafb", borderRadius: 12, padding: 12, fontSize: 14, color: "#1a1a2e", borderWidth: 1, borderColor: "#e5e7eb" },
  editTextArea: { minHeight: 100, textAlignVertical: "top" },
  dateInputRow: { flexDirection: "row", alignItems: "center", backgroundColor: "#f3f4f6", borderRadius: 14, paddingHorizontal: 12, height: 46 },
  gpsButton: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#f3f4f6", borderRadius: 14, paddingHorizontal: 12, height: 46, borderWidth: 1, borderColor: "#e5e7eb" },
  gpsButtonText: { fontSize: 14, color: "#6b7280", flex: 1 },
  quickRow: { flexDirection: "row", gap: 8, marginTop: 4 },
  quickBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: "#e5e7eb" },
  quickBtnActive: { borderColor: "#16a34a", backgroundColor: "#dcfce720" },
  quickBtnText: { fontSize: 12, color: "#6b7280", fontWeight: "500" },
  quickBtnTextActive: { color: "#16a34a" },
  // Save & Edit buttons
  saveButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 16, borderRadius: 14, backgroundColor: "#16a34a" },
  saveButtonDisabled: { opacity: 0.5 },
  saveButtonText: { fontSize: 15, fontWeight: "700", color: "#fff" },
  editButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 14, backgroundColor: "#ecfdf5", borderWidth: 1, borderColor: "#16a34a30" },
  editButtonText: { fontSize: 14, fontWeight: "600", color: "#16a34a" },
  obsHint: { fontSize: 10, color: "#9ca3af", marginTop: 2, fontStyle: "italic" },
  // ── Prescription view styles ──────────────────────────────────────────────
  prescriptionContainer: { gap: 0 },
  prescSection: { gap: 2 },
  prescSectionGap: { marginTop: 20, paddingTop: 20, borderTopWidth: 1, borderTopColor: "#f3f4f6" },
  prescSectionTitle: { fontSize: 13, fontWeight: "800", color: "#1a1a2e", letterSpacing: 2, marginBottom: 8, textTransform: "uppercase" },
  prescProductRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", paddingVertical: 4 },
  prescProductName: { fontSize: 14, fontWeight: "700", color: "#1a1a2e", flex: 1, letterSpacing: 0.5, fontVariant: ["tabular-nums"] },
  prescProductQty: { fontSize: 14, fontWeight: "600", color: "#16a34a", marginLeft: 8 },
  prescSubLabel: { fontSize: 12, color: "#6b7280", fontStyle: "italic", paddingLeft: 2, marginTop: -2, marginBottom: 2 },
  prescPlusRow: { alignItems: "flex-start", paddingVertical: 4, paddingLeft: 2 },
  prescPlus: { fontSize: 18, fontWeight: "700", color: "#9ca3af", lineHeight: 22 },
  prescNoteRow: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: "#f3f4f6" },
  prescNote: { fontSize: 13, color: "#6b7280", fontStyle: "italic" },
  // ── Section edit styles ───────────────────────────────────────────────────
  editSection: { gap: 8 },
  editSectionGap: { marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: "#e5e7eb" },
  editSectionHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  editSectionIndexBadge: { width: 24, height: 24, borderRadius: 12, backgroundColor: "#1a1a2e", alignItems: "center", justifyContent: "center" },
  editSectionIndexText: { fontSize: 11, fontWeight: "800", color: "#fff" },
  editSectionTitleInput: { flex: 1, backgroundColor: "#f9fafb", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7, fontSize: 13, fontWeight: "700", color: "#1a1a2e", borderWidth: 1, borderColor: "#e5e7eb", letterSpacing: 1 },
  editSectionDeleteBtn: { padding: 4 },
  editSectionNoteInput: { backgroundColor: "#f9fafb", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7, fontSize: 12, color: "#6b7280", borderWidth: 1, borderColor: "#e5e7eb" },
  addSectionBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 8, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderStyle: "dashed", borderColor: "#7c3aed40" },
  addSectionBtnText: { fontSize: 12, color: "#7c3aed", fontWeight: "600" },
});