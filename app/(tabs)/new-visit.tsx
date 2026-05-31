import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Alert, Image, Platform } from "react-native";
import { useState, useEffect, useCallback } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { Search, MapPin, PlusCircle, Check, Package, Sprout, Calendar, ChevronRight, ChevronLeft, Camera, X, Trash2, Clock } from "@/components/Icons";
import { databases, storage, Query, ID, DATABASE_ID, CUSTOMERS_COLLECTION_ID, VISITS_COLLECTION_ID, ITEMS_COLLECTION_ID, RECOMMENDATIONS_COLLECTION_ID, VISIT_PHOTOS_COLLECTION_ID, STORAGE_BUCKET_ID } from "@/lib/appwrite";

interface Customer {
  $id: string;
  name: string;
  phone: string;
  cropType?: string;
}

interface Item {
  $id: string;
  name: string;
  category?: string;
  unit?: string;
}

interface RecItem {
  itemId?: string;
  customItem?: string;
  name: string;
  dosage: string;
  quantity: string;
  notes: string;
  isCustom: boolean;
  unit?: string;
  category?: string;
}

interface PhotoData {
  uri: string;
  caption?: string;
  name?: string;
  type?: string;
  size?: number;
}

const steps = [
  { num: 1, label: "Customer" },
  { num: 2, label: "Details" },
  { num: 3, label: "Products" },
  { num: 4, label: "Schedule" },
];

export default function NewVisitScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ customerId?: string; customerName?: string }>();
  const [currentStep, setCurrentStep] = useState(params.customerId ? 2 : 1);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const [selectedCustomerId, setSelectedCustomerId] = useState(params.customerId || "");
  const [selectedCustomerName, setSelectedCustomerName] = useState(params.customerName || "");
  const [customerSearch, setCustomerSearch] = useState("");

  const [visitDate, setVisitDate] = useState(new Date().toISOString().split("T")[0]);
  const [showVisitDatePicker, setShowVisitDatePicker] = useState(false);
  const [observations, setObservations] = useState("");
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [locationName, setLocationName] = useState("");
  const [capturingGPS, setCapturingGPS] = useState(false);
  const [photos, setPhotos] = useState<PhotoData[]>([]);

  const [itemSearch, setItemSearch] = useState("");
  const [recommendations, setRecommendations] = useState<RecItem[]>([]);
  const [showCustomItem, setShowCustomItem] = useState(false);
  const [customItemName, setCustomItemName] = useState("");

  const [nextVisitDate, setNextVisitDate] = useState("");
  const [showNextVisitDatePicker, setShowNextVisitDatePicker] = useState(false);
  const [nextVisitTask, setNextVisitTask] = useState("");

  useEffect(() => {
    databases.listDocuments(DATABASE_ID, CUSTOMERS_COLLECTION_ID, [Query.limit(500)])
      .then((res) => setCustomers(res.documents as unknown as Customer[]))
      .catch(() => setCustomers([]));
    databases.listDocuments(DATABASE_ID, ITEMS_COLLECTION_ID, [Query.limit(500)])
      .then((res) => setItems(res.documents as unknown as Item[]))
      .catch(() => setItems([]));
  }, []);

  const filteredCustomers = customerSearch
    ? customers.filter((c) =>
        c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
        c.phone.includes(customerSearch)
      )
    : customers;

  const filteredItems = itemSearch
    ? items.filter((i) =>
        i.name.toLowerCase().includes(itemSearch.toLowerCase()) ||
        (i.category && i.category.toLowerCase().includes(itemSearch.toLowerCase()))
      )
    : [];

  const captureGPS = useCallback(async () => {
    setCapturingGPS(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission denied", "Location access is needed to capture GPS");
        setCapturingGPS(false);
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setLatitude(pos.coords.latitude);
      setLongitude(pos.coords.longitude);
      setLocationName(`${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`);
    } catch {
      setLocationName("GPS unavailable");
    } finally {
      setCapturingGPS(false);
    }
  }, []);

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
        setPhotos((prev) => [...prev, ...newPicks]);
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
        setPhotos((prev) => [...prev, { uri: asset.uri, name: asset.fileName || undefined, type: asset.mimeType || undefined, size: asset.fileSize || undefined }]);
      }
    } catch {
      Alert.alert("Error", "Could not open camera");
    }
  };

  const removePhoto = (idx: number) => setPhotos(photos.filter((_, i) => i !== idx));

  const addItem = (item: Item) => {
    if (recommendations.find((r) => r.itemId === item.$id)) return;
    setRecommendations([...recommendations, {
      itemId: item.$id, name: item.name, unit: item.unit || "", category: item.category || "", dosage: "", quantity: "", notes: "", isCustom: false,
    }]);
    setItemSearch("");
  };

  const addCustomItem = () => {
    if (!customItemName.trim()) return;
    setRecommendations([...recommendations, {
      customItem: customItemName.trim(), name: customItemName.trim(), dosage: "", quantity: "", notes: "", isCustom: true,
    }]);
    setCustomItemName("");
    setShowCustomItem(false);
  };

  const removeRec = (idx: number) => setRecommendations(recommendations.filter((_, i) => i !== idx));
  const updateRec = (idx: number, field: string, value: string) => {
    const updated = [...recommendations];
    updated[idx] = { ...updated[idx], [field]: value };
    setRecommendations(updated);
  };

  const setQuickReminder = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    setNextVisitDate(d.toISOString().split("T")[0]);
  };

  const handleSubmit = async () => {
    if (!selectedCustomerId) { Alert.alert("Error", "Please select a customer"); return; }
    setSubmitting(true);
    try {
      const visitData: any = {
        customerId: selectedCustomerId,
        visitDate: new Date(visitDate).toISOString(),
        observations: observations || undefined,
        latitude: latitude || undefined,
        longitude: longitude || undefined,
        locationName: locationName || undefined,
        nextVisitDate: nextVisitDate ? new Date(nextVisitDate).toISOString() : undefined,
        nextVisitTask: nextVisitTask || undefined,
      };
      const visitDoc = await databases.createDocument(DATABASE_ID, VISITS_COLLECTION_ID, ID.unique(), visitData);
      const visitId = visitDoc.$id;

      for (const rec of recommendations) {
        try {
          await databases.createDocument(DATABASE_ID, RECOMMENDATIONS_COLLECTION_ID, ID.unique(), {
            visitId,
            itemId: rec.isCustom ? undefined : rec.itemId,
            customItem: rec.isCustom ? rec.customItem : undefined,
            dosage: rec.dosage || undefined,
            quantity: rec.quantity || undefined,
            notes: rec.notes || undefined,
          });
        } catch (recErr) {
          console.warn("Failed to save recommendation:", recErr);
        }
      }

      for (const photo of photos) {
        try {
          const fileExt = photo.uri.split(".").pop() || "jpg";
          const mimeType = photo.type || (fileExt === "png" ? "image/png" : "image/jpeg");
          const fileName = photo.name || `visit_${visitId}_${Date.now()}.${fileExt}`;
          const fileSize = photo.size || 1024;
          
          const uploaded = await storage.createFile(STORAGE_BUCKET_ID, ID.unique(), {
            name: fileName,
            type: mimeType,
            size: fileSize,
            uri: photo.uri,
          });
          const fileUrl = storage.getFileView(STORAGE_BUCKET_ID, uploaded.$id).toString();
          await databases.createDocument(DATABASE_ID, VISIT_PHOTOS_COLLECTION_ID, ID.unique(), {
            visitId: visitId,
            url: fileUrl,
            caption: photo.caption || undefined,
          });
        } catch (photoErr) {
          console.warn("Failed to upload photo:", photoErr);
        }
      }

      Alert.alert("Success", "Visit created successfully!", [
        { text: "OK", onPress: () => {
          setCurrentStep(1); setSelectedCustomerId(""); setSelectedCustomerName(""); setObservations("");
          setRecommendations([]); setNextVisitDate(""); setNextVisitTask("");
          setLatitude(null); setLongitude(null); setLocationName(""); setPhotos([]);
          router.replace(`/visit/${visitId}`);
        }},
      ]);
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to create visit");
    } finally {
      setSubmitting(false);
    }
  };

  const canProceed = () => {
    if (currentStep === 1) return !!selectedCustomerId;
    return true;
  };

  const renderStep1 = () => (
    <View style={s.stepContent}>
      <Text style={s.stepTitle}>Select Customer</Text>
      <View style={s.searchBox}>
        <Search color="#9ca3af" size={16} />
        <TextInput
          style={s.searchInput}
          placeholder="Search farmers..."
          placeholderTextColor="#9ca3af"
          value={customerSearch}
          onChangeText={setCustomerSearch}
        />
      </View>

      {selectedCustomerId && selectedCustomerName && (
        <View style={s.selectedCard}>
          <View style={s.selectedAvatar}>
            <Text style={s.selectedAvatarText}>{selectedCustomerName.split(" ").map((n) => n[0]).join("").substring(0, 2)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.selectedName}>{selectedCustomerName}</Text>
            <Text style={s.selectedLabel}>Selected</Text>
          </View>
          <TouchableOpacity onPress={() => { setSelectedCustomerId(""); setSelectedCustomerName(""); }} style={s.clearSelectBtn}>
            <X color="#9ca3af" size={16} />
          </TouchableOpacity>
        </View>
      )}

      {filteredCustomers.map((customer) => (
        <TouchableOpacity
          key={customer.$id}
          style={[s.customerItem, selectedCustomerId === customer.$id && s.customerItemActive]}
          onPress={() => { setSelectedCustomerId(customer.$id); setSelectedCustomerName(customer.name); }}
        >
          <View style={[s.miniAvatar, { backgroundColor: "#dcfce7" }]}>
            <Text style={s.miniAvatarText}>{customer.name.split(" ").map((n) => n[0]).join("").substring(0, 2)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.customerItemName}>{customer.name}</Text>
            <Text style={s.customerItemPhone}>{customer.phone}</Text>
          </View>
          {customer.cropType && <View style={s.cropChip}><Text style={s.cropChipText}>{customer.cropType}</Text></View>}
        </TouchableOpacity>
      ))}
      {customerSearch.length > 0 && filteredCustomers.length === 0 && (
        <View style={s.emptyList}>
          <Text style={s.emptyListText}>No customers found</Text>
        </View>
      )}
    </View>
  );

  const renderStep2 = () => (
    <View style={s.stepContent}>
      <Text style={s.stepTitle}>Visit Details</Text>

      <Text style={s.label}>Visit Date</Text>
      <TouchableOpacity style={s.dateInputRow} onPress={() => setShowVisitDatePicker(true)}>
        <Calendar color="#9ca3af" size={16} />
        <Text style={[s.input, { flex: 1, marginLeft: 8 }, visitDate && { color: "#1a1a2e" }]}>{visitDate || "Select date"}</Text>
      </TouchableOpacity>
      {showVisitDatePicker && (
        <DateTimePicker
          value={visitDate ? new Date(visitDate) : new Date()}
          mode="date"
          display={Platform.OS === "ios" ? "inline" : "default"}
          onValueChange={(_event, date) => {
            if (date) setVisitDate(date.toISOString().split("T")[0]);
          }}
          onDismiss={() => setShowVisitDatePicker(false)}
        />
      )}

      <Text style={s.label}>GPS Location</Text>
      <TouchableOpacity style={s.gpsButton} onPress={captureGPS} disabled={capturingGPS}>
        <MapPin color={latitude ? "#16a34a" : "#6b7280"} size={16} />
        <Text style={[s.gpsButtonText, latitude ? { color: "#16a34a" } as const : null]}>
          {capturingGPS ? "Capturing..." : latitude ? `\u{1F4CD} ${latitude.toFixed(4)}, ${longitude?.toFixed(4)}` : "Capture Current Location"}
        </Text>
      </TouchableOpacity>

      <Text style={s.label}>Observations</Text>
      <TextInput
        style={[s.input, s.textArea]}
        value={observations}
        onChangeText={setObservations}
        placeholder="Describe crop conditions, symptoms, field observations..."
        placeholderTextColor="#9ca3af"
        multiline
        numberOfLines={5}
        textAlignVertical="top"
      />

      <Text style={s.label}>Photos</Text>
      <View style={s.photosRow}>
        {photos.map((photo, idx) => (
          <View key={idx} style={s.photoThumb}>
            <Image source={{ uri: photo.uri }} style={s.photoImage} />
            <TouchableOpacity style={s.photoRemove} onPress={() => removePhoto(idx)}>
              <X color="#fff" size={10} />
            </TouchableOpacity>
          </View>
        ))}
        <TouchableOpacity style={s.photoAddButton} onPress={takePhoto}>
          <Camera color="#9ca3af" size={20} />
          <Text style={s.photoAddLabel}>Camera</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.photoAddButton} onPress={pickImage}>
          <Camera color="#9ca3af" size={20} />
          <Text style={s.photoAddLabel}>Gallery</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderStep3 = () => (
    <View style={s.stepContent}>
      <Text style={s.stepTitle}>Product Recommendations</Text>
      <View style={s.searchBox}>
        <Search color="#9ca3af" size={16} />
        <TextInput
          style={s.searchInput}
          placeholder="Search fertilizers, pesticides..."
          placeholderTextColor="#9ca3af"
          value={itemSearch}
          onChangeText={setItemSearch}
        />
      </View>

      {itemSearch.length > 0 && filteredItems.map((item) => (
        <TouchableOpacity key={item.$id} style={s.itemRow} onPress={() => addItem(item)}>
          <Package color="#16a34a" size={16} />
          <View style={{ flex: 1 }}>
            <Text style={s.itemName}>{item.name}</Text>
            {item.category && <Text style={s.itemCategory}>{item.category}{item.unit ? ` · ${item.unit}` : ""}</Text>}
          </View>
          <PlusCircle color="#9ca3af" size={18} />
        </TouchableOpacity>
      ))}

      {itemSearch.length > 0 && filteredItems.length === 0 && (
        <View style={s.emptyList}>
          <Text style={s.emptyListText}>No items found</Text>
        </View>
      )}

      {!showCustomItem ? (
        <TouchableOpacity style={s.addCustomBtn} onPress={() => setShowCustomItem(true)}>
          <PlusCircle color="#9ca3af" size={16} />
          <Text style={s.addCustomText}>Add Custom Item</Text>
        </TouchableOpacity>
      ) : (
        <View style={s.customItemRow}>
          <TextInput
            style={[s.input, { flex: 1 }]}
            placeholder="Enter custom product name"
            placeholderTextColor="#9ca3af"
            value={customItemName}
            onChangeText={setCustomItemName}
          />
          <TouchableOpacity style={s.customAddBtn} onPress={addCustomItem}>
            <Text style={s.customAddBtnText}>Add</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.customCancelBtn} onPress={() => { setShowCustomItem(false); setCustomItemName(""); }}>
            <X color="#6b7280" size={16} />
          </TouchableOpacity>
        </View>
      )}

      {recommendations.length > 0 && (
        <View style={{ gap: 8, marginTop: 8 }}>
          <Text style={s.recCount}>{recommendations.length} product(s) added</Text>
          {recommendations.map((rec, idx) => (
            <View key={idx} style={s.recCard}>
              <View style={s.recHeader}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <View style={[s.recIcon, { backgroundColor: "#dcfce7" }]}>
                    <Package color="#16a34a" size={12} />
                  </View>
                  <Text style={s.recName}>{rec.name}</Text>
                  {rec.isCustom && <View style={s.customBadge}><Text style={s.customBadgeText}>Custom</Text></View>}
                </View>
                <TouchableOpacity onPress={() => removeRec(idx)}>
                  <Trash2 color="#dc2626" size={14} />
                </TouchableOpacity>
              </View>
              {rec.category && <Text style={s.recCategory}>{rec.category}</Text>}
              <View style={s.recFields}>
                <View style={{ flex: 1 }}>
                  <Text style={s.fieldLabel}>Dosage</Text>
                  <TextInput style={s.fieldInput} placeholder={rec.unit ? `e.g. 5 ${rec.unit}/L` : "e.g. 2ml/L"} placeholderTextColor="#9ca3af" value={rec.dosage} onChangeText={(t) => updateRec(idx, "dosage", t)} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.fieldLabel}>Quantity</Text>
                  <TextInput style={s.fieldInput} placeholder="e.g. 500ml" placeholderTextColor="#9ca3af" value={rec.quantity} onChangeText={(t) => updateRec(idx, "quantity", t)} />
                </View>
              </View>
              <Text style={s.fieldLabel}>Notes</Text>
              <TextInput style={s.fieldInput} placeholder="Application instructions..." placeholderTextColor="#9ca3af" value={rec.notes} onChangeText={(t) => updateRec(idx, "notes", t)} />
            </View>
          ))}
        </View>
      )}

      {recommendations.length === 0 && !itemSearch && (
        <View style={s.emptyBox}>
          <Package color="#9ca3af" size={28} />
          <Text style={s.emptyTitle}>No products added yet</Text>
          <Text style={s.emptySub}>Search for items or add a custom product</Text>
        </View>
      )}
    </View>
  );

  const renderStep4 = () => (
    <View style={s.stepContent}>
      <Text style={s.stepTitle}>Schedule Follow-up</Text>

      <Text style={s.label}>Next Visit Date</Text>
      <TouchableOpacity style={s.dateInputRow} onPress={() => setShowNextVisitDatePicker(true)}>
        <Calendar color="#9ca3af" size={16} />
        <Text style={[s.input, { flex: 1, marginLeft: 8 }, nextVisitDate && { color: "#1a1a2e" }]}>{nextVisitDate || "Select date"}</Text>
      </TouchableOpacity>
      {showNextVisitDatePicker && (
        <DateTimePicker
          value={nextVisitDate ? new Date(nextVisitDate) : new Date()}
          mode="date"
          display={Platform.OS === "ios" ? "inline" : "default"}
          onValueChange={(_event, date) => {
            if (date) setNextVisitDate(date.toISOString().split("T")[0]);
          }}
          onDismiss={() => setShowNextVisitDatePicker(false)}
        />
      )}

      <View style={s.quickRow}>
        {[7, 14, 30].map((days) => (
          <TouchableOpacity
            key={days}
            style={[s.quickBtn, nextVisitDate === new Date(Date.now() + days * 86400000).toISOString().split("T")[0] && s.quickBtnActive]}
            onPress={() => setQuickReminder(days)}
          >
            <Clock color={nextVisitDate === new Date(Date.now() + days * 86400000).toISOString().split("T")[0] ? "#16a34a" : "#6b7280"} size={12} />
            <Text style={[s.quickBtnText, nextVisitDate === new Date(Date.now() + days * 86400000).toISOString().split("T")[0] && s.quickBtnTextActive]}>{days} days</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={s.label}>Task for Next Visit</Text>
      <TextInput
        style={[s.input, { minHeight: 80, textAlignVertical: "top" }]}
        multiline
        numberOfLines={3}
        placeholder="Describe what needs to be checked..."
        placeholderTextColor="#9ca3af"
        value={nextVisitTask}
        onChangeText={setNextVisitTask}
      />

      <View style={s.summaryCard}>
        <Text style={s.summaryTitle}>Visit Summary</Text>
        <View style={s.summaryRow}>
          <Sprout color="#16a34a" size={12} />
          <Text style={s.summaryLabel}>Customer:</Text>
          <Text style={s.summaryValue}>{selectedCustomerName || "Not selected"}</Text>
        </View>
        <View style={s.summaryRow}>
          <Calendar color="#16a34a" size={12} />
          <Text style={s.summaryLabel}>Date:</Text>
          <Text style={s.summaryValue}>{visitDate}</Text>
        </View>
        {latitude ? (
          <View style={s.summaryRow}>
            <MapPin color="#16a34a" size={12} />
            <Text style={s.summaryLabel}>GPS:</Text>
            <Text style={s.summaryValue}>{latitude.toFixed(4)}, {longitude?.toFixed(4)}</Text>
          </View>
        ) : null}
        <View style={s.summaryRow}>
          <Package color="#16a34a" size={12} />
          <Text style={s.summaryLabel}>Products:</Text>
          <Text style={s.summaryValue}>{recommendations.length} recommended</Text>
        </View>
        {nextVisitDate && (
          <View style={s.summaryRow}>
            <Clock color="#16a34a" size={12} />
            <Text style={s.summaryLabel}>Follow-up:</Text>
            <Text style={s.summaryValue}>{nextVisitDate}</Text>
          </View>
        )}
      </View>
    </View>
  );

  return (
    <View style={s.outerContainer}>
      <View style={[s.stickyHeader, { paddingTop: insets.top + 12 }]}>
        <View style={s.headerRow}>
          <View style={{ width: 40 }} />
          <Text style={s.headerTitle}>New Visit</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={s.progressRow}>
          {steps.map((step) => (
            <View key={step.num} style={s.progressSegment}>
              <View style={[s.progressBar, currentStep >= step.num && s.progressBarActive]} />
            </View>
          ))}
        </View>
        <View style={s.progressLabels}>
          {steps.map((step) => (
            <Text key={step.num} style={[s.progressLabel, currentStep >= step.num && s.progressLabelActive]}>
              {step.label}
            </Text>
          ))}
        </View>
      </View>

      <ScrollView style={s.scrollView} contentContainerStyle={{ padding: 16, paddingBottom: 16 }}>
        {currentStep === 1 && renderStep1()}
        {currentStep === 2 && renderStep2()}
        {currentStep === 3 && renderStep3()}
        {currentStep === 4 && renderStep4()}
      </ScrollView>

      <View style={[s.navRow, { paddingBottom: insets.bottom + 12, paddingHorizontal: 16, backgroundColor: "#fff", borderTopWidth: 1, borderTopColor: "#e5e7eb" }]}>
        {currentStep > 1 && (
          <TouchableOpacity style={[s.navButton, s.navButtonOutline]} onPress={() => setCurrentStep(currentStep - 1)}>
            <ChevronLeft color="#1a1a2e" size={16} />
            <Text style={s.navButtonOutlineText}>Back</Text>
          </TouchableOpacity>
        )}
        {currentStep < 4 ? (
          <TouchableOpacity
            style={[s.navButton, s.navButtonPrimary, !canProceed() && s.navButtonDisabled]}
            onPress={() => canProceed() && setCurrentStep(currentStep + 1)}
            disabled={!canProceed()}
          >
            <Text style={s.navButtonPrimaryText}>Next</Text>
            <ChevronRight color="#fff" size={16} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[s.navButton, s.navButtonPrimary, submitting && s.navButtonDisabled]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            <Check color="#fff" size={16} />
            <Text style={s.navButtonPrimaryText}>{submitting ? "Saving..." : "Submit Visit"}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  outerContainer: { flex: 1, backgroundColor: "#fafafa" },
  stickyHeader: { backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#e5e7eb", paddingBottom: 12, paddingHorizontal: 16 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  headerTitle: { fontSize: 16, fontWeight: "600", color: "#1a1a2e" },
  progressRow: { flexDirection: "row", gap: 4, marginBottom: 6 },
  progressSegment: { flex: 1 },
  progressBar: { height: 6, borderRadius: 3, backgroundColor: "#e5e7eb" },
  progressBarActive: { backgroundColor: "#16a34a" },
  progressLabels: { flexDirection: "row", justifyContent: "space-between" },
  progressLabel: { fontSize: 10, fontWeight: "500", color: "#9ca3af" },
  progressLabelActive: { color: "#16a34a", fontWeight: "600" },
  scrollView: { flex: 1 },
  stepContent: { gap: 12 },
  stepTitle: { fontSize: 18, fontWeight: "600", color: "#1a1a2e", marginBottom: 4 },
  searchBox: { flexDirection: "row", alignItems: "center", backgroundColor: "#f3f4f6", borderRadius: 14, paddingHorizontal: 12, height: 46 },
  searchInput: { flex: 1, marginLeft: 8, fontSize: 14, color: "#1a1a2e" },
  selectedCard: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#dcfce7", borderRadius: 14, padding: 12, borderWidth: 1, borderColor: "#16a34a30" },
  selectedAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#16a34a", justifyContent: "center", alignItems: "center" },
  selectedAvatarText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  selectedName: { fontSize: 14, fontWeight: "600", color: "#1a1a2e" },
  selectedLabel: { fontSize: 11, color: "#16a34a" },
  clearSelectBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: "#f3f4f6", justifyContent: "center", alignItems: "center" },
  customerItem: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#fff", borderRadius: 12, padding: 10, borderWidth: 1, borderColor: "#e5e7eb" },
  customerItemActive: { borderColor: "#16a34a30", backgroundColor: "#dcfce720" },
  miniAvatar: { width: 32, height: 32, borderRadius: 16, justifyContent: "center", alignItems: "center" },
  miniAvatarText: { fontSize: 10, fontWeight: "700", color: "#16a34a" },
  customerItemName: { fontSize: 13, fontWeight: "500", color: "#1a1a2e" },
  customerItemPhone: { fontSize: 11, color: "#6b7280" },
  cropChip: { backgroundColor: "#dcfce7", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  cropChipText: { fontSize: 10, color: "#15803d", fontWeight: "600" },
  emptyList: { padding: 20, alignItems: "center", backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: "#e5e7eb" },
  emptyListText: { fontSize: 13, color: "#9ca3af" },
  label: { fontSize: 13, fontWeight: "500", color: "#374151", marginBottom: 4 },
  input: { backgroundColor: "#fff", borderRadius: 12, padding: 12, fontSize: 14, color: "#1a1a2e", borderWidth: 1, borderColor: "#e5e7eb" },
  textArea: { minHeight: 100 },
  dateInputRow: { flexDirection: "row", alignItems: "center", backgroundColor: "#f3f4f6", borderRadius: 14, paddingHorizontal: 12, height: 46 },
  gpsButton: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#f3f4f6", borderRadius: 14, paddingHorizontal: 12, height: 46, borderWidth: 1, borderColor: "#e5e7eb" },
  gpsButtonText: { fontSize: 14, color: "#6b7280" },
  photosRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  photoThumb: { width: 72, height: 72, borderRadius: 12, overflow: "hidden", position: "relative" },
  photoImage: { width: 72, height: 72, borderRadius: 12, resizeMode: "cover" },
  photoRemove: { position: "absolute", top: 4, right: 4, width: 20, height: 20, borderRadius: 10, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center" },
  photoAddButton: { width: 72, height: 72, borderRadius: 12, borderWidth: 2, borderColor: "#d1d5db", borderStyle: "dashed", justifyContent: "center", alignItems: "center", gap: 2, backgroundColor: "#f9fafb" },
  photoAddLabel: { fontSize: 10, color: "#9ca3af" },
  itemRow: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#fff", borderRadius: 12, padding: 10, borderWidth: 1, borderColor: "#e5e7eb" },
  itemName: { fontSize: 13, fontWeight: "500", color: "#1a1a2e" },
  itemCategory: { fontSize: 10, color: "#6b7280" },
  addCustomBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1, borderColor: "#e5e7eb", borderStyle: "dashed", borderRadius: 14, padding: 12 },
  addCustomText: { fontSize: 13, color: "#6b7280" },
  customItemRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  customAddBtn: { backgroundColor: "#16a34a", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, justifyContent: "center" },
  customAddBtnText: { color: "#fff", fontWeight: "600", fontSize: 13 },
  customCancelBtn: { paddingVertical: 10, paddingHorizontal: 8 },
  recCount: { fontSize: 11, color: "#6b7280", fontWeight: "500" },
  recCard: { backgroundColor: "#fff", borderRadius: 12, padding: 12, borderWidth: 1, borderColor: "#e5e7eb", gap: 6 },
  recHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  recIcon: { width: 28, height: 28, borderRadius: 8, justifyContent: "center", alignItems: "center" },
  recName: { fontSize: 14, fontWeight: "600", color: "#1a1a2e" },
  recCategory: { fontSize: 10, color: "#6b7280", backgroundColor: "#f3f4f6", paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6, alignSelf: "flex-start" },
  customBadge: { backgroundColor: "#fef3c7", paddingHorizontal: 5, paddingVertical: 1, borderRadius: 6 },
  customBadgeText: { fontSize: 9, color: "#92400e", fontWeight: "600" },
  recFields: { flexDirection: "row", gap: 8 },
  fieldLabel: { fontSize: 10, color: "#6b7280", marginBottom: 2 },
  fieldInput: { backgroundColor: "#f9fafb", borderRadius: 8, padding: 8, fontSize: 12, color: "#1a1a2e", borderWidth: 1, borderColor: "#e5e7eb" },
  emptyBox: { alignItems: "center", padding: 24, backgroundColor: "#fff", borderRadius: 14, borderWidth: 1, borderColor: "#e5e7eb" },
  emptyTitle: { fontSize: 14, fontWeight: "500", color: "#1a1a2e", marginTop: 8 },
  emptySub: { fontSize: 12, color: "#9ca3af" },
  quickRow: { flexDirection: "row", gap: 8, marginTop: 4 },
  quickBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: "#e5e7eb" },
  quickBtnActive: { borderColor: "#16a34a", backgroundColor: "#dcfce720" },
  quickBtnText: { fontSize: 12, color: "#6b7280", fontWeight: "500" },
  quickBtnTextActive: { color: "#16a34a" },
  summaryCard: { backgroundColor: "#ecfdf5", borderRadius: 14, padding: 14, borderWidth: 1, borderColor: "#16a34a20", gap: 8 },
  summaryTitle: { fontSize: 14, fontWeight: "600", color: "#1a1a2e", marginBottom: 4 },
  summaryRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  summaryLabel: { fontSize: 12, color: "#6b7280" },
  summaryValue: { fontSize: 12, fontWeight: "500", color: "#1a1a2e" },
  navRow: { flexDirection: "row", gap: 10, paddingTop: 12 },
  navButton: { flex: 1, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 4, height: 46, borderRadius: 14 },
  navButtonOutline: { borderWidth: 1, borderColor: "#e5e7eb", backgroundColor: "#fff" },
  navButtonOutlineText: { fontSize: 14, fontWeight: "600", color: "#1a1a2e" },
  navButtonPrimary: { backgroundColor: "#16a34a" },
  navButtonPrimaryText: { fontSize: 14, fontWeight: "600", color: "#fff" },
  navButtonDisabled: { opacity: 0.5 },
});