import { Stack } from "expo-router";
import { View, ActivityIndicator, StyleSheet, Text } from "react-native";
import { useEffect, useState } from "react";
import { NetworkProvider } from "@/lib/network-provider";
import { initSync } from "@/lib/sync-manager";
import { Sprout } from "@/components/Icons";

function AppContent() {
  return (
    <View style={{ flex: 1 }}>
      <Stack
        screenOptions={{
          headerShown: false,
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="visit/[id]" options={{ headerShown: false, animation: "slide_from_right" }} />
        <Stack.Screen name="customer/[id]" options={{ headerShown: false, animation: "slide_from_right" }} />
        <Stack.Screen name="customer/add" options={{ headerShown: false, animation: "slide_from_right" }} />
        <Stack.Screen name="visits/index" options={{ headerShown: false, animation: "slide_from_right" }} />
        <Stack.Screen name="products/index" options={{ headerShown: false, animation: "slide_from_right" }} />
        <Stack.Screen name="product/add" options={{ headerShown: false, animation: "slide_from_right" }} />
        <Stack.Screen name="product/[id]" options={{ headerShown: false, animation: "slide_from_right" }} />
      </Stack>
    </View>
  );
}

function SplashScreen() {
  return (
    <View style={splashStyles.container}>
      <View style={splashStyles.iconContainer}>
        <Sprout color="#16a34a" size={48} />
      </View>
      <Text style={splashStyles.title}>Field Agent</Text>
      <ActivityIndicator size="small" color="#16a34a" style={{ marginTop: 16 }} />
      <Text style={splashStyles.subtitle}>Loading local data...</Text>
    </View>
  );
}

export default function RootLayout() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    initSync().then(() => setReady(true));
  }, []);

  if (!ready) {
    return <SplashScreen />;
  }

  return (
    <NetworkProvider>
      <AppContent />
    </NetworkProvider>
  );
}

const splashStyles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fafafa",
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: "#dcfce7",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: "#1a1a2e",
  },
  subtitle: {
    fontSize: 13,
    color: "#9ca3af",
    marginTop: 8,
  },
});