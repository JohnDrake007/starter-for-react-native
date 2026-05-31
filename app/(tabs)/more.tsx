import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from "react-native";
import { Package, Database, Leaf, Info } from "@/components/Icons";
import { ping } from "@/lib/appwrite";
import { useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

export default function MoreScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [pingStatus, setPingStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  const handlePing = async () => {
    setPingStatus("loading");
    try {
      await ping();
      setPingStatus("success");
    } catch {
      setPingStatus("error");
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24, padding: 16, gap: 12 }}>
      <Text style={styles.title}>More</Text>

      <TouchableOpacity style={styles.menuCard} onPress={() => router.push("/products")}>
        <View style={[styles.menuIcon, { backgroundColor: "#dcfce7" }]}>
          <Package color="#16a34a" size={20} />
        </View>
        <View style={styles.menuInfo}>
          <Text style={styles.menuTitle}>Product Catalog</Text>
          <Text style={styles.menuSub}>View all products & items</Text>
        </View>
      </TouchableOpacity>

      <View style={styles.menuCard}>
        <View style={[styles.menuIcon, { backgroundColor: "#dcfce7" }]}>
          <Database color="#16a34a" size={20} />
        </View>
        <View style={styles.menuInfo}>
          <Text style={styles.menuTitle}>Demo Data</Text>
          <Text style={styles.menuSub}>Load sample farmers & visits</Text>
        </View>
      </View>

      <TouchableOpacity
        style={[styles.pingButton, pingStatus === "success" && styles.pingSuccess, pingStatus === "error" && styles.pingError]}
        onPress={handlePing}
        disabled={pingStatus === "loading"}
      >
        <Text style={styles.pingButtonText}>
          {pingStatus === "loading" ? "Connecting..." : pingStatus === "success" ? "Connected!" : pingStatus === "error" ? "Connection Failed" : "Test Appwrite Connection"}
        </Text>
      </TouchableOpacity>

      <View style={styles.aboutCard}>
        <View style={styles.aboutHeader}>
          <View style={[styles.menuIcon, { backgroundColor: "#dcfce7" }]}>
            <Leaf color="#16a34a" size={20} />
          </View>
          <View style={styles.menuInfo}>
            <Text style={styles.menuTitle}>AgriField Agent</Text>
            <Text style={styles.menuSub}>Field Service & Crop Advisory Tracker</Text>
          </View>
        </View>
        <View style={styles.aboutRows}>
          <View style={styles.aboutRow}>
            <Info color="#9ca3af" size={14} />
            <Text style={styles.aboutLabel}>Version</Text>
            <Text style={styles.aboutValue}>1.0.0</Text>
          </View>
          <View style={styles.aboutRow}>
            <Database color="#9ca3af" size={14} />
            <Text style={styles.aboutLabel}>Backend</Text>
            <Text style={styles.aboutValue}>Appwrite</Text>
          </View>
        </View>
      </View>

      <View style={styles.aboutCard}>
        <View style={styles.aboutHeader}>
          <Leaf color="#16a34a" size={16} />
          <Text style={styles.aboutTitle}>About</Text>
        </View>
        <Text style={styles.aboutText}>
          AgriField Agent helps agricultural field agents manage farmer visits, diagnose crop issues,
          prescribe fertilizers and pesticides, and schedule follow-up visits. Built for the Kerala
          hill district farming community.
        </Text>
        <View style={styles.cropTags}>
          {["Cardamom", "Pepper", "Coffee", "Tea"].map((crop) => (
            <View key={crop} style={styles.cropTag}>
              <Leaf color="#16a34a" size={10} />
              <Text style={styles.cropTagText}>{crop}</Text>
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fafafa" },
  title: { fontSize: 22, fontWeight: "700", color: "#1a1a2e", marginBottom: 8 },
  menuCard: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#fff", borderRadius: 14, padding: 14, borderWidth: 1, borderColor: "#e5e7eb" },
  menuIcon: { width: 40, height: 40, borderRadius: 12, justifyContent: "center", alignItems: "center" },
  menuInfo: { flex: 1 },
  menuTitle: { fontSize: 14, fontWeight: "600", color: "#1a1a2e" },
  menuSub: { fontSize: 12, color: "#6b7280" },
  pingButton: { backgroundColor: "#16a34a", borderRadius: 14, padding: 14, alignItems: "center", marginTop: 4 },
  pingSuccess: { backgroundColor: "#059669" },
  pingError: { backgroundColor: "#dc2626" },
  pingButtonText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  aboutCard: { backgroundColor: "#fff", borderRadius: 14, padding: 16, borderWidth: 1, borderColor: "#e5e7eb" },
  aboutHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  aboutTitle: { fontSize: 15, fontWeight: "600", color: "#1a1a2e" },
  aboutRows: { gap: 8 },
  aboutRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  aboutLabel: { fontSize: 12, color: "#9ca3af", flex: 1 },
  aboutValue: { fontSize: 12, fontWeight: "500", color: "#1a1a2e" },
  aboutText: { fontSize: 13, color: "#6b7280", lineHeight: 19 },
  cropTags: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
  cropTag: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "#dcfce7", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  cropTagText: { fontSize: 10, fontWeight: "500", color: "#15803d" },
});