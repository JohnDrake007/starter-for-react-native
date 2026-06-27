import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Alert, Image, Platform } from "react-native";
import { useState, useEffect, useCallback, useRef } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { Search, MapPin, PlusCircle, Check, Package, Sprout, Calendar, ChevronRight, ChevronLeft, Camera, X, Trash2, Clock, ArrowLeft } from "@/components/Icons";
import { CUSTOMERS_COLLECTION_ID, VISITS_COLLECTION_ID, ITEMS_COLLECTION_ID, RECOMMENDATIONS_COLLECTION_ID, VISIT_PHOTOS_COLLECTION_ID, STORAGE_BUCKET_ID } from "@/lib/appwrite";
import { getCollection, createDocument, enqueuePhotoUpload } from "@/lib/sync-manager";

// ── Prescription Data Types ───────────────────────────────────────────────────

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

interface PrescriptionProduct {
  id: string;          // local unique key
  itemId?: string;
  customItem?: string;
  name: string;
  quantity: string;    // e.g. "100 ml"
  subLabel: string;    // e.g. "(PSEUDOMONAS)" shown below name
  isCustom: boolean;
  unit?: string;
  category?: string;
}

interface PrescriptionSection {
  id: string;
  title: string;       // e.g. "SPRAYING"
  sectionNote: string; // e.g. "Mix with: 200 Ltr Water"
  products: PrescriptionProduct[];
}

interface PhotoData {
  uri: string;
  caption?: string;
  name?: string;
  type?: string;
  size?: number;
}

// ── Encode / Decode helpers (section markers stored as customItem with §-prefix) ──
// Each section emits:
//   1 marker rec:  customItem = "§HDR§<title>§<sectionNote>"  dosage="" quantity="" notes=""
//   N product recs: as usual  notes = subLabel
function encodePrescriptionToRecs(sections: PrescriptionSection[]): {
  itemId?: string;
  customItem?: string;
  dosage?: string;
  quantity?: string;
  notes?: string;
}[] {
  const out: any[] = [];
  for (const sec of sections) {
    // section header marker
    out.push({
      customItem: `§HDR§${sec.title}§${sec.sectionNote}`,
      dosage: undefined,
      quantity: undefined,
      notes: undefined,
    });
    for (const p of sec.products) {
      out.push({
        itemId: p.isCustom ? undefined : p.itemId,
        customItem: p.isCustom ? p.customItem : undefined,
        dosage: undefined,
        quantity: p.quantity || undefined,
        notes: p.subLabel || undefined,
      });
    }
  }
  return out;
}

const steps = [
  { num: 1, label: "Customer" },
  { num: 2, label: "Details" },
  { num: 3, label: "Products" },
  { num: 4, label: "Schedule" },
];

function uid() { return `${Date.now()}_${Math.random().toString(36).slice(2)}`; }

function emptySection(title = ""): PrescriptionSection {
  return { id: uid(), title, sectionNote: "", products: [] };
}

function emptyProduct(name = "", itemId?: string, unit?: string, category?: string, isCustom = false): PrescriptionProduct {
  return { id: uid(), itemId, customItem: isCustom ? name : undefined, name, quantity: "", subLabel: "", isCustom, unit, category };
}

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

  // ── Prescription State ──────────────────────────────────────────────────────
  const [sections, setSections] = useState<PrescriptionSection[]>([emptySection("SPRAYING")]);
  // Active search: tracks which section + product is being searched
  const [searchState, setSearchState] = useState<{ sectionId: string; productId: string; query: string } | null>(null);
  const [suggestions, setSuggestions] = useState<Item[]>([]);

  const [nextVisitDate, setNextVisitDate] = useState("");
  const [showNextVisitDatePicker, setShowNextVisitDatePicker] = useState(false);
  const [nextVisitTask, setNextVisitTask] = useState("");

  const visitDatePickerHandled = useRef(false);
  const nextVisitDatePickerHandled = useRef(false);

  useFocusEffect(
    useCallback(() => {
      try { setCustomers(getCollection(CUSTOMERS_COLLECTION_ID) as Customer[]); } catch {}
      try { setItems(getCollection(ITEMS_COLLECTION_ID) as Item[]); } catch {}
    }, [])
  );

  // ── Suggestion filtering ────────────────────────────────────────────────────
  useEffect(() => {
    if (!searchState?.query || searchState.query.length < 1) { setSuggestions([]); return; }
    const q = searchState.query.toLowerCase();
    setSuggestions(
      items.filter((i) => i.name.toLowerCase().includes(q) || (i.category && i.category.toLowerCase().includes(q))).slice(0, 8)
    );
  }, [searchState, items]);

  const filteredCustomers = customerSearch
    ? customers.filter((c) => c.name.toLowerCase().includes(customerSearch.toLowerCase()) || c.phone.includes(customerSearch))
    : customers;

  // ── GPS / Photos ────────────────────────────────────────────────────────────
  const captureGPS = useCallback(async () => {
    setCapturingGPS(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") { Alert.alert("Permission denied", "Location access is needed to capture GPS"); return; }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setLatitude(pos.coords.latitude);
      setLongitude(pos.coords.longitude);
      setLocationName(`${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`);
    } catch { setLocationName("GPS unavailable"); }
    finally { setCapturingGPS(false); }
  }, []);

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7, allowsMultipleSelection: true, allowsEditing: false });
      if (!result.canceled) setPhotos((prev) => [...prev, ...result.assets.map((a) => ({ uri: a.uri, name: a.fileName || undefined, type: a.mimeType || undefined, size: a.fileSize || undefined }))]);
    } catch { Alert.alert("Error", "Could not open gallery"); }
  };

  const takePhoto = async () => {
    try {
      const permResult = await ImagePicker.requestCameraPermissionsAsync();
      if (!permResult.granted) { Alert.alert("Permission required", "Camera access is needed to take photos"); return; }
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7, allowsEditing: false });
      if (!result.canceled && result.assets[0]) {
        const a = result.assets[0];
        setPhotos((prev) => [...prev, { uri: a.uri, name: a.fileName || undefined, type: a.mimeType || undefined, size: a.fileSize || undefined }]);
      }
    } catch { Alert.alert("Error", "Could not open camera"); }
  };

  const removePhoto = (idx: number) => setPhotos(photos.filter((_, i) => i !== idx));

  // ── Section / Product helpers ───────────────────────────────────────────────
  const addSection = () => setSections((prev) => [...prev, emptySection("")]);

  const removeSection = (sId: string) => {
    if (sections.length === 1) { Alert.alert("Cannot remove", "At least one section is required."); return; }
    setSections((prev) => prev.filter((s) => s.id !== sId));
  };

  const updateSectionTitle = (sId: string, val: string) =>
    setSections((prev) => prev.map((s) => s.id === sId ? { ...s, title: val } : s));

  const updateSectionNote = (sId: string, val: string) =>
    setSections((prev) => prev.map((s) => s.id === sId ? { ...s, sectionNote: val } : s));

  const addEmptyProduct = (sId: string) =>
    setSections((prev) => prev.map((s) => s.id === sId ? { ...s, products: [...s.products, emptyProduct()] } : s));

  const removeProduct = (sId: string, pId: string) =>
    setSections((prev) => prev.map((s) => s.id === sId ? { ...s, products: s.products.filter((p) => p.id !== pId) } : s));

  const updateProduct = (sId: string, pId: string, field: keyof PrescriptionProduct, val: string) =>
    setSections((prev) => prev.map((s) => s.id === sId
      ? { ...s, products: s.products.map((p) => p.id === pId ? { ...p, [field]: val } : p) }
      : s));

  const pickSuggestion = (sId: string, pId: string, item: Item) => {
    setSections((prev) => prev.map((s) => s.id === sId
      ? { ...s, products: s.products.map((p) => p.id === pId
          ? { ...p, itemId: item.$id, customItem: undefined, name: item.name, unit: item.unit, category: item.category, isCustom: false }
          : p) }
      : s));
    setSearchState(null);
    setSuggestions([]);
  };

  // ── Submit ──────────────────────────────────────────────────────────────────
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
      const visitDoc = await createDocument(VISITS_COLLECTION_ID, visitData);
      const visitId = visitDoc.$id;

      const recsToSave = encodePrescriptionToRecs(sections);
      for (const rec of recsToSave) {
        try {
          await createDocument(RECOMMENDATIONS_COLLECTION_ID, { visitId, ...rec });
        } catch (e) { console.warn("Failed to save recommendation:", e); }
      }

      for (const photo of photos) {
        try {
          const fileExt = photo.uri.split(".").pop() || "jpg";
          const mimeType = photo.type || (fileExt === "png" ? "image/png" : "image/jpeg");
          await enqueuePhotoUpload({ localUri: photo.uri, fileName: photo.name || `visit_${visitId}_${Date.now()}.${fileExt}`, mimeType, fileSize: photo.size || 1024, bucketId: STORAGE_BUCKET_ID, visitId, caption: photo.caption });
        } catch (e) { console.warn("Failed to upload photo:", e); }
      }

      Alert.alert("Visit Saved", "Visit created successfully!", [{
        text: "OK", onPress: () => {
          setCurrentStep(1); setSelectedCustomerId(""); setSelectedCustomerName(""); setObservations("");
          setSections([emptySection("SPRAYING")]); setNextVisitDate(""); setNextVisitTask("");
          setLatitude(null); setLongitude(null); setLocationName(""); setPhotos([]);
          router.dismissTo("/(tabs)/home");
          router.push(`/visit/${visitId}`);
        },
      }]);
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to create visit");
    } finally {
      setSubmitting(false);
    }
  };

  const canProceed = () => { if (currentStep === 1) return !!selectedCustomerId; return true; };
  const totalProducts = sections.reduce((acc, s) => acc + s.products.length, 0);

  // ── Step 1 ──────────────────────────────────────────────────────────────────
  const renderStep1 = () => (
    <View style={s.stepContent}>
      <Text style={s.stepTitle}>Select Customer</Text>
      <View style={s.searchBox}>
        <Search color="#9ca3af" size={16} />
        <TextInput style={s.searchInput} placeholder="Search farmers..." placeholderTextColor="#9ca3af" value={customerSearch} onChangeText={setCustomerSearch} />
      </View>
      {selectedCustomerId && selectedCustomerName && (
        <View style={s.selectedCard}>
          <View style={s.selectedAvatar}><Text style={s.selectedAvatarText}>{selectedCustomerName.split(" ").map((n) => n[0]).join("").substring(0, 2)}</Text></View>
          <View style={{ flex: 1 }}><Text style={s.selectedName}>{selectedCustomerName}</Text><Text style={s.selectedLabel}>Selected</Text></View>
          <TouchableOpacity onPress={() => { setSelectedCustomerId(""); setSelectedCustomerName(""); }} style={s.clearSelectBtn}><X color="#9ca3af" size={16} /></TouchableOpacity>
        </View>
      )}
      {filteredCustomers.map((customer) => (
        <TouchableOpacity key={customer.$id} style={[s.customerItem, selectedCustomerId === customer.$id && s.customerItemActive]}
          onPress={() => { setSelectedCustomerId(customer.$id); setSelectedCustomerName(customer.name); }}>
          <View style={[s.miniAvatar, { backgroundColor: "#dcfce7" }]}><Text style={s.miniAvatarText}>{customer.name.split(" ").map((n) => n[0]).join("").substring(0, 2)}</Text></View>
          <View style={{ flex: 1 }}><Text style={s.customerItemName}>{customer.name}</Text><Text style={s.customerItemPhone}>{customer.phone}</Text></View>
          {customer.cropType && <View style={s.cropChip}><Text style={s.cropChipText}>{customer.cropType}</Text></View>}
        </TouchableOpacity>
      ))}
      {customerSearch.length > 0 && filteredCustomers.length === 0 && (
        <View style={s.emptyList}><Text style={s.emptyListText}>No customers found</Text></View>
      )}
    </View>
  );

  // ── Step 2 ──────────────────────────────────────────────────────────────────
  const renderStep2 = () => (
    <View style={s.stepContent}>
      <Text style={s.stepTitle}>Visit Details</Text>

      <Text style={s.label}>Visit Date</Text>
      <TouchableOpacity style={s.dateInputRow} onPress={() => { visitDatePickerHandled.current = false; setShowVisitDatePicker(true); }}>
        <Calendar color="#9ca3af" size={16} />
        <Text style={[s.input, { flex: 1, marginLeft: 8 }, visitDate && { color: "#1a1a2e" }]}>{visitDate || "Select date"}</Text>
      </TouchableOpacity>
      {showVisitDatePicker && (
        <DateTimePicker value={visitDate ? new Date(visitDate) : new Date()} mode="date" display={Platform.OS === "ios" ? "inline" : "default"}
          onChange={(_event, date) => { if (visitDatePickerHandled.current) return; visitDatePickerHandled.current = true; setShowVisitDatePicker(false); if (date) setVisitDate(date.toISOString().split("T")[0]); }} />
      )}

      <Text style={s.label}>GPS Location</Text>
      <TouchableOpacity style={s.gpsButton} onPress={captureGPS} disabled={capturingGPS}>
        <MapPin color={latitude ? "#16a34a" : "#6b7280"} size={16} />
        <Text style={[s.gpsButtonText, latitude ? { color: "#16a34a" } as const : null]}>
          {capturingGPS ? "Capturing..." : latitude ? `\u{1F4CD} ${latitude.toFixed(4)}, ${longitude?.toFixed(4)}` : "Capture Current Location"}
        </Text>
      </TouchableOpacity>

      <Text style={s.label}>Observations</Text>
      <TextInput style={[s.input, s.textArea]} value={observations} onChangeText={(text) => {
        const lines = text.split("\n");
        const prevLines = observations.split("\n");
        if (lines.length > prevLines.length) {
          const lastNonEmpty = lines.slice(0, -1).filter((l) => l.trim()).pop() || "";
          const numMatch = lastNonEmpty.match(/^(\d+)[\.\)\s]/);
          if (numMatch && lines[lines.length - 1] === "") { setObservations([...lines.slice(0, -1), `${parseInt(numMatch[1]) + 1}. `].join("\n")); return; }
        }
        setObservations(text);
      }} placeholder="Describe crop conditions, symptoms, field observations..." placeholderTextColor="#9ca3af" multiline numberOfLines={5} textAlignVertical="top" />
      <Text style={s.obsHint}>Tip: Type "1. " to start auto-numbering. Press Enter to continue.</Text>

      <Text style={s.label}>Photos</Text>
      <View style={s.photosRow}>
        {photos.map((photo, idx) => (
          <View key={idx} style={s.photoThumb}>
            <Image source={{ uri: photo.uri }} style={s.photoImage} />
            <TouchableOpacity style={s.photoRemove} onPress={() => removePhoto(idx)}><X color="#fff" size={10} /></TouchableOpacity>
          </View>
        ))}
        <TouchableOpacity style={s.photoAddButton} onPress={takePhoto}><Camera color="#9ca3af" size={20} /><Text style={s.photoAddLabel}>Camera</Text></TouchableOpacity>
        <TouchableOpacity style={s.photoAddButton} onPress={pickImage}><Camera color="#9ca3af" size={20} /><Text style={s.photoAddLabel}>Gallery</Text></TouchableOpacity>
      </View>
    </View>
  );

  // ── Step 3 — Prescription Builder ───────────────────────────────────────────
  const renderStep3 = () => (
    <View style={s.stepContent}>
      <Text style={s.stepTitle}>Prescription</Text>
      <Text style={s.stepSubtitle}>Build spray / foliar schedules section by section</Text>

      {sections.map((sec, secIdx) => {
        const isOnlySection = sections.length === 1;
        return (
          <View key={sec.id} style={s.prescriptionSection}>
            {/* Section Header */}
            <View style={s.sectionHeaderRow}>
              <View style={s.sectionHeaderLeft}>
                <Text style={s.sectionIndex}>{secIdx + 1}</Text>
                <TextInput
                  style={s.sectionTitleInput}
                  value={sec.title}
                  onChangeText={(v) => updateSectionTitle(sec.id, v.toUpperCase())}
                  placeholder="SECTION TITLE (e.g. SPRAYING)"
                  placeholderTextColor="#9ca3af"
                  autoCapitalize="characters"
                />
              </View>
              {!isOnlySection && (
                <TouchableOpacity onPress={() => removeSection(sec.id)} style={s.sectionDeleteBtn}>
                  <X color="#dc2626" size={14} />
                </TouchableOpacity>
              )}
            </View>

            {/* Products in prescription format */}
            <View style={s.productsList}>
              {sec.products.length === 0 && (
                <Text style={s.noProductsHint}>No products yet — add one below</Text>
              )}
              {sec.products.map((prod, pIdx) => {
                const isSearchingThis = searchState?.sectionId === sec.id && searchState?.productId === prod.id;
                return (
                  <View key={prod.id}>
                    {/* + separator between products */}
                    {pIdx > 0 && (
                      <View style={s.plusRow}>
                        <View style={s.plusLine} />
                        <Text style={s.plusSign}>+</Text>
                        <View style={s.plusLine} />
                      </View>
                    )}

                    {/* Product row */}
                    <View style={s.productCard}>
                      <View style={s.productMainRow}>
                        {/* Product name — tapping opens suggestion search */}
                        <TouchableOpacity
                          style={s.productNameArea}
                          onPress={() => setSearchState({ sectionId: sec.id, productId: prod.id, query: prod.name })}
                          activeOpacity={0.7}
                        >
                          {prod.name ? (
                            <Text style={s.productName} numberOfLines={1}>{prod.name.toUpperCase()}</Text>
                          ) : (
                            <Text style={s.productNamePlaceholder}>TAP TO SELECT PRODUCT</Text>
                          )}
                          {prod.category && <Text style={s.productCategory}>{prod.category}{prod.unit ? ` · ${prod.unit}` : ""}</Text>}
                        </TouchableOpacity>

                        {/* Dash */}
                        <Text style={s.dashSep}>—</Text>

                        {/* Quantity input */}
                        <TextInput
                          style={s.quantityInput}
                          value={prod.quantity}
                          onChangeText={(v) => updateProduct(sec.id, prod.id, "quantity", v)}
                          placeholder="100 ml"
                          placeholderTextColor="#9ca3af"
                        />

                        {/* Remove */}
                        <TouchableOpacity onPress={() => removeProduct(sec.id, prod.id)} style={s.productRemoveBtn}>
                          <Trash2 color="#dc2626" size={13} />
                        </TouchableOpacity>
                      </View>

                      {/* Sub-label (optional) */}
                      <TextInput
                        style={s.subLabelInput}
                        value={prod.subLabel}
                        onChangeText={(v) => updateProduct(sec.id, prod.id, "subLabel", v)}
                        placeholder="(optional note, e.g. PSEUDOMONAS)"
                        placeholderTextColor="#c4b5c4"
                        multiline
                        numberOfLines={3}
                        textAlignVertical="top"
                      />

                      {/* Inline search overlay */}
                      {isSearchingThis && (
                        <View style={s.suggestionBox}>
                          <View style={s.suggestionSearchRow}>
                            <Search color="#9ca3af" size={14} />
                            <TextInput
                              style={s.suggestionSearchInput}
                              value={searchState.query}
                              onChangeText={(q) => setSearchState({ ...searchState, query: q })}
                              placeholder="Search product catalog..."
                              placeholderTextColor="#9ca3af"
                              autoFocus
                            />
                            <TouchableOpacity onPress={() => { setSearchState(null); setSuggestions([]); }}>
                              <X color="#9ca3af" size={14} />
                            </TouchableOpacity>
                          </View>
                          {/* Custom item option */}
                          {searchState.query.length > 0 && (
                            <TouchableOpacity
                              style={s.suggestionAddCustom}
                              onPress={() => {
                                setSections((prev) => prev.map((sc) => sc.id === sec.id
                                  ? { ...sc, products: sc.products.map((p) => p.id === prod.id
                                      ? { ...p, name: searchState.query, customItem: searchState.query, isCustom: true, itemId: undefined }
                                      : p) }
                                  : sc));
                                setSearchState(null);
                                setSuggestions([]);
                              }}
                            >
                              <PlusCircle color="#16a34a" size={14} />
                              <Text style={s.suggestionAddCustomText}>Use "<Text style={{ fontWeight: "700" }}>{searchState.query}</Text>" as custom</Text>
                            </TouchableOpacity>
                          )}
                          {suggestions.map((item) => (
                            <TouchableOpacity key={item.$id} style={s.suggestionItem} onPress={() => pickSuggestion(sec.id, prod.id, item)}>
                              <Package color="#16a34a" size={13} />
                              <View style={{ flex: 1 }}>
                                <Text style={s.suggestionName}>{item.name}</Text>
                                {item.category && <Text style={s.suggestionCategory}>{item.category}{item.unit ? ` · ${item.unit}` : ""}</Text>}
                              </View>
                            </TouchableOpacity>
                          ))}
                          {suggestions.length === 0 && searchState.query.length > 0 && (
                            <Text style={s.suggestionEmpty}>No matches in catalog</Text>
                          )}
                        </View>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>

            {/* Add product button */}
            <TouchableOpacity style={s.addProductBtn} onPress={() => {
              const newProd = emptyProduct();
              setSections((prev) => prev.map((sc) => sc.id === sec.id ? { ...sc, products: [...sc.products, newProd] } : sc));
              // Open search immediately for the new product
              setTimeout(() => setSearchState({ sectionId: sec.id, productId: newProd.id, query: "" }), 50);
            }}>
              <PlusCircle color="#16a34a" size={15} />
              <Text style={s.addProductBtnText}>Add Product</Text>
            </TouchableOpacity>

            {/* Section note (e.g. Mix with water) */}
            <View style={s.sectionNoteRow}>
              <Text style={s.sectionNoteLabel}>Section Note</Text>
              <TextInput
                style={s.sectionNoteInput}
                value={sec.sectionNote}
                onChangeText={(v) => updateSectionNote(sec.id, v)}
                placeholder="e.g. Mix with: 200 Ltr Water"
                placeholderTextColor="#9ca3af"
              />
            </View>
          </View>
        );
      })}

      {/* Add section */}
      <TouchableOpacity style={s.addSectionBtn} onPress={addSection}>
        <PlusCircle color="#7c3aed" size={15} />
        <Text style={s.addSectionBtnText}>Add New Section</Text>
        <Text style={s.addSectionBtnHint}>(e.g. FOLIAR, SOIL DRENCH)</Text>
      </TouchableOpacity>

      {/* Preview */}
      {totalProducts > 0 && (
        <View style={s.previewCard}>
          <Text style={s.previewTitle}>Preview</Text>
          {sections.map((sec) => {
            if (sec.products.length === 0) return null;
            return (
              <View key={sec.id} style={s.previewSection}>
                {sec.title ? <Text style={s.previewSectionTitle}>{sec.title}</Text> : null}
                {sec.products.map((p, pi) => (
                  <View key={p.id}>
                    {pi > 0 && <Text style={s.previewPlus}>+</Text>}
                    <Text style={s.previewProduct}>
                      {p.name ? p.name.toUpperCase() : "—"}{p.quantity ? `      ${p.quantity}` : ""}
                    </Text>
                    {p.subLabel ? <Text style={s.previewSubLabel}>{p.subLabel}</Text> : null}
                  </View>
                ))}
                {sec.sectionNote ? <Text style={s.previewNote}>{sec.sectionNote}</Text> : null}
              </View>
            );
          })}
        </View>
      )}
    </View>
  );

  // ── Step 4 ──────────────────────────────────────────────────────────────────
  const renderStep4 = () => (
    <View style={s.stepContent}>
      <Text style={s.stepTitle}>Schedule Follow-up</Text>

      <Text style={s.label}>Next Visit Date</Text>
      <TouchableOpacity style={s.dateInputRow} onPress={() => { nextVisitDatePickerHandled.current = false; setShowNextVisitDatePicker(true); }}>
        <Calendar color="#9ca3af" size={16} />
        <Text style={[s.input, { flex: 1, marginLeft: 8 }, nextVisitDate && { color: "#1a1a2e" }]}>{nextVisitDate || "Select date"}</Text>
      </TouchableOpacity>
      {showNextVisitDatePicker && (
        <DateTimePicker value={nextVisitDate ? new Date(nextVisitDate) : new Date()} mode="date" display={Platform.OS === "ios" ? "inline" : "default"}
          onChange={(_event, date) => { if (nextVisitDatePickerHandled.current) return; nextVisitDatePickerHandled.current = true; setShowNextVisitDatePicker(false); if (date) setNextVisitDate(date.toISOString().split("T")[0]); }} />
      )}

      <View style={s.quickRow}>
        {[7, 14, 30].map((days) => (
          <TouchableOpacity key={days} style={[s.quickBtn, nextVisitDate === new Date(Date.now() + days * 86400000).toISOString().split("T")[0] && s.quickBtnActive]}
            onPress={() => { const d = new Date(); d.setDate(d.getDate() + days); setNextVisitDate(d.toISOString().split("T")[0]); }}>
            <Clock color={nextVisitDate === new Date(Date.now() + days * 86400000).toISOString().split("T")[0] ? "#16a34a" : "#6b7280"} size={12} />
            <Text style={[s.quickBtnText, nextVisitDate === new Date(Date.now() + days * 86400000).toISOString().split("T")[0] && s.quickBtnTextActive]}>{days} days</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={s.label}>Task for Next Visit</Text>
      <TextInput style={[s.input, { minHeight: 80, textAlignVertical: "top" }]} multiline numberOfLines={3}
        placeholder="Describe what needs to be checked..." placeholderTextColor="#9ca3af" value={nextVisitTask} onChangeText={setNextVisitTask} />

      <View style={s.summaryCard}>
        <Text style={s.summaryTitle}>Visit Summary</Text>
        <View style={s.summaryRow}><Sprout color="#16a34a" size={12} /><Text style={s.summaryLabel}>Customer:</Text><Text style={s.summaryValue}>{selectedCustomerName || "Not selected"}</Text></View>
        <View style={s.summaryRow}><Calendar color="#16a34a" size={12} /><Text style={s.summaryLabel}>Date:</Text><Text style={s.summaryValue}>{visitDate}</Text></View>
        {latitude ? <View style={s.summaryRow}><MapPin color="#16a34a" size={12} /><Text style={s.summaryLabel}>GPS:</Text><Text style={s.summaryValue}>{latitude.toFixed(4)}, {longitude?.toFixed(4)}</Text></View> : null}
        <View style={s.summaryRow}><Package color="#16a34a" size={12} /><Text style={s.summaryLabel}>Products:</Text><Text style={s.summaryValue}>{totalProducts} in {sections.filter(s => s.products.length > 0).length} section(s)</Text></View>
        {nextVisitDate && <View style={s.summaryRow}><Clock color="#16a34a" size={12} /><Text style={s.summaryLabel}>Follow-up:</Text><Text style={s.summaryValue}>{nextVisitDate}</Text></View>}
      </View>
    </View>
  );

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <View style={s.outerContainer}>
      <View style={[s.stickyHeader, { paddingTop: insets.top + 12 }]}>
        <View style={s.headerRow}>
          <TouchableOpacity style={{ width: 40, height: 40, justifyContent: "center", alignItems: "center" }} onPress={() => router.back()}>
            <ArrowLeft color="#1a1a2e" size={22} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>New Visit</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={s.progressRow}>{steps.map((step) => <View key={step.num} style={s.progressSegment}><View style={[s.progressBar, currentStep >= step.num && s.progressBarActive]} /></View>)}</View>
        <View style={s.progressLabels}>{steps.map((step) => <Text key={step.num} style={[s.progressLabel, currentStep >= step.num && s.progressLabelActive]}>{step.label}</Text>)}</View>
      </View>

      <ScrollView style={s.scrollView} contentContainerStyle={{ padding: 16, paddingBottom: 16 }} keyboardShouldPersistTaps="handled">
        {currentStep === 1 && renderStep1()}
        {currentStep === 2 && renderStep2()}
        {currentStep === 3 && renderStep3()}
        {currentStep === 4 && renderStep4()}
      </ScrollView>

      <View style={[s.navRow, { paddingBottom: insets.bottom + 12, paddingHorizontal: 16, backgroundColor: "#fff", borderTopWidth: 1, borderTopColor: "#e5e7eb" }]}>
        {currentStep > 1 && (
          <TouchableOpacity style={[s.navButton, s.navButtonOutline]} onPress={() => setCurrentStep(currentStep - 1)}>
            <ChevronLeft color="#1a1a2e" size={16} /><Text style={s.navButtonOutlineText}>Back</Text>
          </TouchableOpacity>
        )}
        {currentStep < 4 ? (
          <TouchableOpacity style={[s.navButton, s.navButtonPrimary, !canProceed() && s.navButtonDisabled]}
            onPress={() => canProceed() && setCurrentStep(currentStep + 1)} disabled={!canProceed()}>
            <Text style={s.navButtonPrimaryText}>Next</Text><ChevronRight color="#fff" size={16} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={[s.navButton, s.navButtonPrimary, submitting && s.navButtonDisabled]} onPress={handleSubmit} disabled={submitting}>
            <Check color="#fff" size={16} /><Text style={s.navButtonPrimaryText}>{submitting ? "Saving..." : "Submit Visit"}</Text>
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
  stepTitle: { fontSize: 18, fontWeight: "700", color: "#1a1a2e", marginBottom: 0 },
  stepSubtitle: { fontSize: 12, color: "#6b7280", marginTop: -6 },
  // Customer step
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
  // Step 2
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
  obsHint: { fontSize: 10, color: "#9ca3af", marginTop: 4, fontStyle: "italic" },
  // ── Prescription builder ───────────────────────────────────────────────────
  prescriptionSection: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 14,
    gap: 10,
  },
  sectionHeaderRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  sectionHeaderLeft: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  sectionIndex: { width: 22, height: 22, borderRadius: 11, backgroundColor: "#16a34a", color: "#fff", fontSize: 11, fontWeight: "700", textAlign: "center", lineHeight: 22 },
  sectionTitleInput: { flex: 1, fontSize: 15, fontWeight: "700", color: "#1a1a2e", letterSpacing: 1.5, borderBottomWidth: 1.5, borderBottomColor: "#16a34a30", paddingVertical: 4 },
  sectionDeleteBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: "#fef2f2", justifyContent: "center", alignItems: "center" },
  productsList: { gap: 0 },
  noProductsHint: { fontSize: 12, color: "#9ca3af", textAlign: "center", paddingVertical: 8, fontStyle: "italic" },
  // Product row
  productCard: { gap: 6 },
  productMainRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  productNameArea: { flex: 1, paddingVertical: 6, paddingHorizontal: 8, backgroundColor: "#f9fafb", borderRadius: 8, borderWidth: 1, borderColor: "#e5e7eb" },
  productName: { fontSize: 13, fontWeight: "700", color: "#1a1a2e", letterSpacing: 0.5 },
  productNamePlaceholder: { fontSize: 11, color: "#9ca3af", letterSpacing: 0.3 },
  productCategory: { fontSize: 9, color: "#9ca3af", marginTop: 1 },
  dashSep: { fontSize: 15, fontWeight: "600", color: "#6b7280", paddingHorizontal: 2 },
  quantityInput: {
    width: 80,
    backgroundColor: "#f9fafb",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    paddingVertical: 6,
    paddingHorizontal: 8,
    fontSize: 13,
    fontWeight: "600",
    color: "#16a34a",
    textAlign: "center",
  },
  productRemoveBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: "#fef2f2", justifyContent: "center", alignItems: "center" },
  subLabelInput: { fontSize: 13, color: "#7c3aed", fontStyle: "italic", minHeight: 60, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 6, borderWidth: 1, borderColor: "#ede9fe", backgroundColor: "#faf5ff" },
  // Plus separator
  plusRow: { flexDirection: "row", alignItems: "center", marginVertical: 4, gap: 8 },
  plusLine: { flex: 1, height: 1, backgroundColor: "#e5e7eb" },
  plusSign: { fontSize: 18, fontWeight: "700", color: "#16a34a", lineHeight: 22 },
  // Suggestion dropdown
  suggestionBox: { backgroundColor: "#fff", borderRadius: 12, borderWidth: 1.5, borderColor: "#16a34a30", overflow: "hidden", marginTop: 2 },
  suggestionSearchRow: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderBottomWidth: 1, borderBottomColor: "#f3f4f6" },
  suggestionSearchInput: { flex: 1, fontSize: 13, color: "#1a1a2e" },
  suggestionItem: { flexDirection: "row", alignItems: "center", gap: 10, padding: 10, borderBottomWidth: 1, borderBottomColor: "#f9fafb" },
  suggestionName: { fontSize: 13, fontWeight: "600", color: "#1a1a2e" },
  suggestionCategory: { fontSize: 10, color: "#6b7280" },
  suggestionAddCustom: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderBottomWidth: 1, borderBottomColor: "#f3f4f6", backgroundColor: "#f0fdf4" },
  suggestionAddCustomText: { fontSize: 12, color: "#16a34a" },
  suggestionEmpty: { fontSize: 12, color: "#9ca3af", textAlign: "center", padding: 12 },
  // Add product / section
  addProductBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5, borderColor: "#16a34a40", borderStyle: "dashed" },
  addProductBtnText: { fontSize: 13, color: "#16a34a", fontWeight: "600" },
  sectionNoteRow: { gap: 4, paddingTop: 4, borderTopWidth: 1, borderTopColor: "#f3f4f6" },
  sectionNoteLabel: { fontSize: 10, fontWeight: "600", color: "#6b7280", letterSpacing: 0.5 },
  sectionNoteInput: { fontSize: 13, color: "#374151", paddingVertical: 6, paddingHorizontal: 8, borderRadius: 8, borderWidth: 1, borderColor: "#e5e7eb", backgroundColor: "#f9fafb" },
  addSectionBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderRadius: 14, borderWidth: 1.5, borderColor: "#7c3aed40", borderStyle: "dashed", backgroundColor: "#faf5ff" },
  addSectionBtnText: { fontSize: 13, color: "#7c3aed", fontWeight: "700" },
  addSectionBtnHint: { fontSize: 10, color: "#a78bfa" },
  // Preview card
  previewCard: { backgroundColor: "#1a1a2e", borderRadius: 14, padding: 16, gap: 4 },
  previewTitle: { fontSize: 9, fontWeight: "700", color: "#9ca3af", letterSpacing: 2, marginBottom: 6 },
  previewSection: { gap: 2, marginBottom: 10 },
  previewSectionTitle: { fontSize: 13, fontWeight: "800", color: "#16a34a", letterSpacing: 2, marginBottom: 4 },
  previewProduct: { fontSize: 13, fontFamily: "monospace", color: "#f9fafb", letterSpacing: 0.5 },
  previewPlus: { fontSize: 14, color: "#6b7280", paddingVertical: 2, paddingLeft: 4 },
  previewSubLabel: { fontSize: 11, color: "#a78bfa", fontStyle: "italic", paddingLeft: 4 },
  previewNote: { fontSize: 12, color: "#9ca3af", fontStyle: "italic", marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: "#374151" },
  // Step 4
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
  // Nav
  navRow: { flexDirection: "row", gap: 10, paddingTop: 12 },
  navButton: { flex: 1, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 4, height: 46, borderRadius: 14 },
  navButtonOutline: { borderWidth: 1, borderColor: "#e5e7eb", backgroundColor: "#fff" },
  navButtonOutlineText: { fontSize: 14, fontWeight: "600", color: "#1a1a2e" },
  navButtonPrimary: { backgroundColor: "#16a34a" },
  navButtonPrimaryText: { fontSize: 14, fontWeight: "600", color: "#fff" },
  navButtonDisabled: { opacity: 0.5 },
});