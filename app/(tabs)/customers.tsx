import { View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity, RefreshControl, ScrollView } from "react-native";
import { useState, useCallback } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Search, Phone, MapPin, Sprout, UserPlus } from "@/components/Icons";
import { CUSTOMERS_COLLECTION_ID } from "@/lib/appwrite";
import { getCollection } from "@/lib/sync-manager";
import { useNetwork } from "@/lib/network-provider";

interface Customer {
  $id: string;
  name: string;
  phone: string;
  address?: string;
  cropType?: string;
}

const cropTypes = ["All", "Cardamom", "Pepper", "Coffee", "Tea", "Rubber", "Coconut"];

const cropColors: Record<string, { bg: string; text: string }> = {
  Cardamom: { bg: "#dcfce7", text: "#15803d" },
  Pepper: { bg: "#fef3c7", text: "#92400e" },
  Coffee: { bg: "#ffedd5", text: "#9a3412" },
  Tea: { bg: "#ecfccb", text: "#3f6212" },
  Rubber: { bg: "#f5f5f4", text: "#57534e" },
  Coconut: { bg: "#fef9c3", text: "#854d0e" },
};

export default function CustomersScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [selectedCrop, setSelectedCrop] = useState("All");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const { syncNow } = useNetwork();

  const fetchCustomers = useCallback(async () => {
    try {
      const allCustomers = getCollection(CUSTOMERS_COLLECTION_ID);
      // Fall back to the contact person's mobile when a customer has no phone
      const normalized = allCustomers.map((c: any) => ({ ...c, phone: c.phone || c.mobile || "" }));
      setCustomers(normalized as unknown as Customer[]);
    } catch {
      setCustomers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchCustomers();
    }, [fetchCustomers])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await syncNow();
    await fetchCustomers();
    setRefreshing(false);
  }, [fetchCustomers, syncNow]);

  const filteredCustomers = customers.filter((c) => {
    const matchesSearch = !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search);
    const matchesCrop = selectedCrop === "All" || c.cropType === selectedCrop;
    return matchesSearch && matchesCrop;
  });

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

  const renderCustomer = ({ item }: { item: Customer }) => (
    <TouchableOpacity style={styles.customerCard} onPress={() => router.push(`/customer/${item.$id}`)} activeOpacity={0.7}>
      <View style={[styles.avatar, { backgroundColor: getAvatarColor(item.name) }]}>
        <Text style={styles.avatarText}>{getInitials(item.name)}</Text>
      </View>
      <View style={styles.customerInfo}>
        <View style={styles.customerHeader}>
          <Text style={styles.customerName} numberOfLines={1}>{item.name}</Text>
          {item.cropType && (
            <View style={[styles.cropBadge, { backgroundColor: cropColors[item.cropType]?.bg || "#f3f4f6" }]}>
              <Sprout color={cropColors[item.cropType]?.text || "#6b7280"} size={10} />
              <Text style={[styles.cropBadgeText, { color: cropColors[item.cropType]?.text || "#374151" }]}>
                {item.cropType}
              </Text>
            </View>
          )}
        </View>
        <View style={styles.phoneRow}>
          <Phone color="#9ca3af" size={12} />
          <Text style={styles.phoneText}>{item.phone}</Text>
        </View>
        {item.address ? (
          <View style={styles.phoneRow}>
            <MapPin color="#9ca3af" size={12} />
            <Text style={styles.phoneText} numberOfLines={1}>{item.address}</Text>
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top + 16 }]}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Customers</Text>
        <TouchableOpacity style={styles.addButton} onPress={() => router.push("/customer/add")}>
          <UserPlus color="#fff" size={16} />
          <Text style={styles.addButtonText}>Add</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.searchContainer}>
        <Search color="#9ca3af" size={18} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search farmers by name, phone..."
          placeholderTextColor="#9ca3af"
          value={search}
          onChangeText={setSearch}
        />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow} contentContainerStyle={styles.filterRowContent}>
        {cropTypes.map((crop) => (
          <TouchableOpacity
            key={crop}
            onPress={() => setSelectedCrop(crop)}
            style={[styles.filterChip, selectedCrop === crop && styles.filterChipActive]}
          >
            {crop !== "All" && <Sprout color={selectedCrop === crop ? "#fff" : "#6b7280"} size={10} />}
            <Text style={[styles.filterText, selectedCrop === crop && styles.filterTextActive]}>{crop}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <Text style={styles.countText}>{filteredCustomers.length} farmer{filteredCustomers.length !== 1 ? "s" : ""}</Text>

      {loading ? (
        <View style={styles.loadingContainer}><Text style={styles.loadingText}>Loading...</Text></View>
      ) : filteredCustomers.length === 0 ? (
        <View style={styles.loadingContainer}>
          <Text style={styles.emptyTitle}>No farmers found</Text>
          <Text style={styles.emptySub}>Try a different search or add a new customer</Text>
        </View>
      ) : (
        <FlatList
          data={filteredCustomers}
          keyExtractor={(item) => item.$id}
          renderItem={renderCustomer}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={["#16a34a"]} />}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fafafa", paddingHorizontal: 16 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  title: { fontSize: 22, fontWeight: "700", color: "#1a1a2e" },
  addButton: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#16a34a", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  addButtonText: { fontSize: 13, fontWeight: "600", color: "#fff" },
  searchContainer: { flexDirection: "row", alignItems: "center", backgroundColor: "#f3f4f6", borderRadius: 14, paddingHorizontal: 12, height: 46, marginBottom: 10 },
  searchInput: { flex: 1, marginLeft: 8, fontSize: 14, color: "#1a1a2e" },
  filterRow: { marginBottom: 10, height: 44 },
  filterRowContent: { gap: 6, paddingHorizontal: 4, paddingVertical: 4, alignItems: "center", flexDirection: "row" },
  filterChip: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 20, backgroundColor: "#f3f4f6" },
  filterChipActive: { backgroundColor: "#16a34a" },
  filterText: { fontSize: 12, fontWeight: "500", color: "#6b7280" },
  filterTextActive: { color: "#fff" },
  countText: { fontSize: 12, color: "#9ca3af", marginBottom: 8, fontWeight: "500" },
  customerCard: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#fff", borderRadius: 14, padding: 12, borderWidth: 1, borderColor: "#e5e7eb" },
  avatar: { width: 44, height: 44, borderRadius: 22, justifyContent: "center", alignItems: "center" },
  avatarText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  customerInfo: { flex: 1, gap: 2 },
  customerHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  customerName: { fontSize: 14, fontWeight: "600", color: "#1a1a2e", flex: 1 },
  cropBadge: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 10 },
  cropBadgeText: { fontSize: 10, fontWeight: "600" },
  phoneRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  phoneText: { fontSize: 12, color: "#6b7280" },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText: { color: "#6b7280", fontSize: 14 },
  emptyTitle: { fontSize: 15, fontWeight: "600", color: "#1a1a2e", marginBottom: 4 },
  emptySub: { fontSize: 13, color: "#9ca3af" },
});