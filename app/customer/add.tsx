import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Alert, Platform } from "react-native";
import { useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as Location from "expo-location";
import { ArrowLeft, UserPlus, Phone, MapPin, Sprout, Check } from "@/components/Icons";
import { CUSTOMERS_COLLECTION_ID } from "@/lib/appwrite";
import { createDocument } from "@/lib/sync-manager";

const cropOptions = ["Cardamom", "Pepper", "Coffee", "Tea", "Rubber", "Coconut", "Rice", "Other"];

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

export default function AddCustomerScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [submitting, setSubmitting] = useState(false);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [cropType, setCropType] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [capturingGPS, setCapturingGPS] = useState(false);
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);

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
      setLatitude(pos.coords.latitude);
      setLongitude(pos.coords.longitude);
    } catch {
      Alert.alert("Error", "Could not capture GPS location");
    } finally {
      setCapturingGPS(false);
    }
  };

  const handleSubmit = async () => {
    if (!name.trim()) { Alert.alert("Required", "Please enter the farmer's name"); return; }
    if (!phone.trim()) { Alert.alert("Required", "Please enter the phone number"); return; }
    setSubmitting(true);
    try {
      await createDocument(CUSTOMERS_COLLECTION_ID, {
        name: name.trim(),
        phone: phone.trim(),
        address: address.trim() || undefined,
        cropType: cropType || undefined,
        contactName: contactName.trim() || undefined,
        contactPhone: contactPhone.trim() || undefined,
        latitude: latitude || undefined,
        longitude: longitude || undefined,
      });
      Alert.alert("Success", "Farmer added successfully!", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to add farmer");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={s.outerContainer}>
      <View style={[s.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity style={s.headerBack} onPress={() => router.back()}>
          <ArrowLeft color="#1a1a2e" size={22} />
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <Text style={s.headerTitle}>Add Farmer</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={s.scrollView} contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40, gap: 16 }}>
        <View style={s.avatarCircle}>
          <UserPlus color="#16a34a" size={32} />
        </View>

        <View style={s.card}>
          <Text style={s.label}>Full Name *</Text>
          <TextInput
            style={s.input}
            value={name}
            onChangeText={setName}
            placeholder="Farmer's full name"
            placeholderTextColor="#9ca3af"
          />
        </View>

        <View style={s.card}>
          <Text style={s.label}>Phone Number *</Text>
          <View style={s.phoneRow}>
            <Phone color="#9ca3af" size={16} />
            <TextInput
              style={[s.input, { flex: 1, marginLeft: 8 }]}
              value={phone}
              onChangeText={setPhone}
              placeholder="+91 98765 43210"
              placeholderTextColor="#9ca3af"
              keyboardType="phone-pad"
            />
          </View>
        </View>

        <View style={s.card}>
          <Text style={s.label}>Address</Text>
          <View style={s.phoneRow}>
            <MapPin color="#9ca3af" size={16} />
            <TextInput
              style={[s.input, { flex: 1, marginLeft: 8 }]}
              value={address}
              onChangeText={setAddress}
              placeholder="Village/Town, District"
              placeholderTextColor="#9ca3af"
            />
          </View>
        </View>

        <View style={s.card}>
          <Text style={s.label}>Contact Person Name</Text>
          <TextInput
            style={s.input}
            value={contactName}
            onChangeText={setContactName}
            placeholder="Person to contact at the farm"
            placeholderTextColor="#9ca3af"
          />
        </View>

        <View style={s.card}>
          <Text style={s.label}>Contact Person Phone</Text>
          <View style={s.phoneRow}>
            <Phone color="#9ca3af" size={16} />
            <TextInput
              style={[s.input, { flex: 1, marginLeft: 8 }]}
              value={contactPhone}
              onChangeText={setContactPhone}
              placeholder="+91 98765 43210"
              placeholderTextColor="#9ca3af"
              keyboardType="phone-pad"
            />
          </View>
        </View>

        <View style={s.card}>
          <Text style={s.label}>Crop Type</Text>
          <View style={s.cropGrid}>
            {cropOptions.map((crop) => (
              <TouchableOpacity
                key={crop}
                style={[
                  s.cropChip,
                  cropType === crop && { backgroundColor: cropColors[crop]?.bg, borderColor: cropColors[crop]?.text },
                ]}
                onPress={() => setCropType(cropType === crop ? "" : crop)}
              >
                <Sprout color={cropType === crop ? cropColors[crop]?.text : "#6b7280"} size={12} />
                <Text style={[
                  s.cropChipText,
                  cropType === crop && { color: cropColors[crop]?.text, fontWeight: "600" },
                ]}>{crop}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={s.card}>
          <Text style={s.label}>GPS Location</Text>
          <TouchableOpacity style={s.gpsButton} onPress={captureGPS} disabled={capturingGPS}>
            <MapPin color={latitude ? "#16a34a" : "#6b7280"} size={16} />
            <Text style={[s.gpsButtonText, latitude ? { color: "#16a34a" } as const : null]}>
              {capturingGPS ? "Capturing..." : latitude ? `📍 ${latitude.toFixed(4)}, ${longitude?.toFixed(4)}` : "Capture Current Location"}
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[s.submitButton, submitting && s.submitDisabled]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          <Check color="#fff" size={18} />
          <Text style={s.submitText}>{submitting ? "Saving..." : "Add Farmer"}</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  outerContainer: { flex: 1, backgroundColor: "#fafafa" },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 12, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#e5e7eb" },
  headerBack: { width: 44, height: 44, justifyContent: "center", alignItems: "center", marginLeft: -8 },
  headerCenter: { flex: 1, alignItems: "center" },
  headerTitle: { fontSize: 16, fontWeight: "600", color: "#1a1a2e" },
  scrollView: { flex: 1 },
  avatarCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: "#dcfce780", justifyContent: "center", alignItems: "center", alignSelf: "center" },
  card: { backgroundColor: "#fff", borderRadius: 14, padding: 14, borderWidth: 1, borderColor: "#e5e7eb", gap: 8 },
  label: { fontSize: 13, fontWeight: "500", color: "#374151" },
  input: { backgroundColor: "#f9fafb", borderRadius: 12, padding: 12, fontSize: 14, color: "#1a1a2e", borderWidth: 1, borderColor: "#e5e7eb" },
  phoneRow: { flexDirection: "row", alignItems: "center" },
  cropGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  cropChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: "#f3f4f6", borderWidth: 1, borderColor: "transparent" },
  cropChipText: { fontSize: 13, color: "#6b7280", fontWeight: "500" },
  gpsButton: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#f3f4f6", borderRadius: 14, paddingHorizontal: 12, height: 46, borderWidth: 1, borderColor: "#e5e7eb" },
  gpsButtonText: { fontSize: 14, color: "#6b7280" },
  submitButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#16a34a", borderRadius: 14, paddingVertical: 14 },
  submitDisabled: { opacity: 0.5 },
  submitText: { fontSize: 16, fontWeight: "600", color: "#fff" },
});