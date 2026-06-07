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
  const [deletedRecIds, setDeletedRecIds] = useState<string[]>([]);
  const [itemSearch, setItemSearch] = useState("");
  const [showCustomItem, setShowCustomItem] = useState(false);
  const [customItemName, setCustomItemName] = useState("");
  const [showItemSearch, setShowItemSearch] = useState(false);

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
            customerData = { name: cDoc.name, phone: cDoc.phone, address: cDoc.address, cropType: cDoc.cropType };
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
        const recsRes = getCollection(RECOMMENDATIONS_COLLECTION_ID).filter(r => r.visitId === id);
        const recs: Recommendation[] = recsRes.map((r) => ({
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
          try {
            const itemsRes = getCollection(ITEMS_COLLECTION_ID);
            const itemMap: Record<string, { name: string; category?: string; unit?: string }> = {};
            itemsRes.forEach((item) => {
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
    setDeletedRecIds([]);
    setItemSearch("");
    setShowCustomItem(false);
    setCustomItemName("");
    setShowItemSearch(false);
    setEditing(true);
  };

  const cancelEditing = () => {
    setEditing(false);
    setDeletedPhotoIds([]);
    setDeletedRecIds([]);
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
    const rec = editRecs[idx];
    // If it's an existing record (not newly added), mark for deletion
    if (!rec.$id.startsWith("new_")) {
      setDeletedRecIds((prev) => [...prev, rec.$id]);
    }
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

      // 4. Handle deleted recommendations
      for (const recId of deletedRecIds) {
        try {
          await deleteDocument(RECOMMENDATIONS_COLLECTION_ID, recId);
        } catch (e) {
          console.warn("Failed to delete recommendation:", e);
        }
      }

      // 5. Update existing recommendations & create new ones
      for (const rec of editRecs) {
        if (rec.$id.startsWith("new_")) {
          // New recommendation — create it
          try {
            await createDocument(RECOMMENDATIONS_COLLECTION_ID, {
              visitId: id,
              itemId: rec.isCustom ? undefined : rec.itemId,
              customItem: rec.isCustom ? rec.customItem : undefined,
              dosage: rec.dosage || undefined,
              quantity: rec.quantity || undefined,
              notes: rec.notes || undefined,
            });
          } catch (e) {
            console.warn("Failed to create recommendation:", e);
          }
        } else {
          // Existing recommendation — check if dosage/quantity/notes changed
          const original = recommendations.find((r) => r.$id === rec.$id);
          if (original) {
            const changed: any = {};
            if (rec.dosage !== original.dosage) changed.dosage = rec.dosage || undefined;
            if (rec.quantity !== original.quantity) changed.quantity = rec.quantity || undefined;
            if (rec.notes !== original.notes) changed.notes = rec.notes || undefined;
            if (Object.keys(changed).length > 0) {
              try {
                await updateDocument(RECOMMENDATIONS_COLLECTION_ID, rec.$id, changed);
              } catch (e) {
                console.warn("Failed to update recommendation:", e);
              }
            }
          }
        }
      }

      setNewPhotos([]);
      setDeletedPhotoIds([]);
      setDeletedRecIds([]);
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

  const shareShopReport = () => {
    if (!visitData || !customer) return;
    const lines: string[] = [];
    lines.push("*Farm Advisory*");
    lines.push("");
    lines.push(`*Farmer:* ${customer.name}`);
    if (customer.cropType) lines.push(`*Crop:* ${customer.cropType}`);
    lines.push(`*Phone:* ${customer.phone}`);
    lines.push("");
    if (visitData.observations) {
      lines.push("*Observations:*");
      lines.push(visitData.observations);
      lines.push("");
    }
    if (recommendations.length > 0) {
      lines.push("*Recommendations:*");
      recommendations.forEach((rec, i) => {
        let line = `  ${i + 1}. ${rec.name}`;
        if (rec.dosage) line += ` — ${rec.dosage}`;
        if (rec.quantity) line += ` (${rec.quantity})`;
        lines.push(line);
      });
      lines.push("");
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
  const daysUntilNext = (editing ? (editNextVisitDate ? new Date(editNextVisitDate) : null) : visitData.nextVisitDate ? new Date(visitData.nextVisitDate) : null)
    ? Math.ceil(((editing ? new Date(editNextVisitDate!) : new Date(visitData.nextVisitDate!)).getTime() - Date.now()) / (1000 * 3600 * 24))
    : null;

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

              {/* Product search */}
              {showItemSearch ? (
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
                    <TouchableOpacity key={item.$id} style={styles.itemRow} onPress={() => addItemToRecs(item)}>
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
              ) : null}

              {/* Custom item input */}
              {showCustomItem ? (
                <View style={styles.customItemRow}>
                  <TextInput
                    style={[styles.editInput, { flex: 1 }]}
                    placeholder="Enter custom product name"
                    placeholderTextColor="#9ca3af"
                    value={customItemName}
                    onChangeText={setCustomItemName}
                  />
                  <TouchableOpacity style={styles.customAddBtn} onPress={addCustomRec}>
                    <Text style={styles.customAddBtnText}>Add</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.customCancelBtn} onPress={() => { setShowCustomItem(false); setCustomItemName(""); }}>
                    <X color="#6b7280" size={16} />
                  </TouchableOpacity>
                </View>
              ) : null}

              {/* Add buttons */}
              {!showItemSearch && !showCustomItem && (
                <View style={styles.addRecRow}>
                  <TouchableOpacity style={styles.addRecBtn} onPress={() => setShowItemSearch(true)}>
                    <Search color="#16a34a" size={14} />
                    <Text style={styles.addRecBtnText}>Search Products</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.addRecBtn} onPress={() => setShowCustomItem(true)}>
                    <PlusCircle color="#16a34a" size={14} />
                    <Text style={styles.addRecBtnText}>Custom Item</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Editable rec list */}
              {editRecs.length === 0 ? (
                <Text style={styles.emptyText}>No products added yet</Text>
              ) : (
                editRecs.map((rec, idx) => (
                  <View key={rec.$id} style={[styles.editRecCard, idx < editRecs.length - 1 && styles.editRecCardBorder]}>
                    <View style={styles.editRecHeader}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flex: 1 }}>
                        <View style={[styles.recIcon, { backgroundColor: "#dcfce7" }]}>
                          <Package color="#16a34a" size={12} />
                        </View>
                        <Text style={styles.recName} numberOfLines={1}>{rec.name}</Text>
                        {rec.isCustom && <View style={styles.customBadge}><Text style={styles.customBadgeText}>Custom</Text></View>}
                        {rec.$id.startsWith("new_") && <View style={styles.newBadge}><Text style={styles.newBadgeText}>NEW</Text></View>}
                      </View>
                      <TouchableOpacity onPress={() => removeEditRec(idx)} style={styles.recDeleteBtn}>
                        <Trash2 color="#dc2626" size={14} />
                      </TouchableOpacity>
                    </View>
                    {rec.category && <Text style={styles.recCategory}>{rec.category}</Text>}
                    <View style={styles.recEditFields}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.fieldLabel}>Dosage</Text>
                        <TextInput
                          style={styles.fieldInput}
                          placeholder={rec.unit ? `e.g. 5 ${rec.unit}/L` : "e.g. 2ml/L"}
                          placeholderTextColor="#9ca3af"
                          value={rec.dosage}
                          onChangeText={(t) => updateEditRec(idx, "dosage", t)}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.fieldLabel}>Quantity</Text>
                        <TextInput
                          style={styles.fieldInput}
                          placeholder="e.g. 500ml"
                          placeholderTextColor="#9ca3af"
                          value={rec.quantity}
                          onChangeText={(t) => updateEditRec(idx, "quantity", t)}
                        />
                      </View>
                    </View>
                    <Text style={styles.fieldLabel}>Notes</Text>
                    <TextInput
                      style={styles.fieldInput}
                      placeholder="Application instructions..."
                      placeholderTextColor="#9ca3af"
                      value={rec.notes}
                      onChangeText={(t) => updateEditRec(idx, "notes", t)}
                    />
                  </View>
                ))
              )}
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

        {/* ── Recommended Products (View Mode) ────────────────────────── */}
        {!editing && (
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
        )}

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
});