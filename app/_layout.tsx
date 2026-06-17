import { Stack, useRouter } from "expo-router";
import { View, ActivityIndicator, StyleSheet, Text, Image } from "react-native";
import { useEffect, useState, useRef } from "react";
import { NetworkProvider } from "@/lib/network-provider";
import { initSync } from "@/lib/sync-manager";
import * as Notifications from "expo-notifications";
import {
  configureNotificationHandler,
  scheduleVisitReminders,
} from "@/lib/notification-manager";

function AppContent() {
  const router = useRouter();

  // Navigate to the relevant visit when a notification is tapped
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const visitId = response.notification.request.content.data?.visitId;
      if (visitId) {
        router.push(`/visit/${visitId}`);
      }
    });
    return () => sub.remove();
  }, [router]);

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
      <Image
        source={require("../assets/images/icon.png")}
        style={splashStyles.logo}
        resizeMode="contain"
      />
      <Text style={splashStyles.title}>CCS SmartVisit</Text>
      <ActivityIndicator size="small" color="#3a5f3a" style={{ marginTop: 16 }} />
      <Text style={splashStyles.subtitle}>Loading...</Text>
    </View>
  );
}

export default function RootLayout() {
  const [ready, setReady] = useState(false);

  // Configure notification handler immediately (before any await)
  configureNotificationHandler();

  useEffect(() => {
    initSync().then(async () => {
      setReady(true);
      // Schedule device notifications after initial data is loaded
      await scheduleVisitReminders();
    });
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
    backgroundColor: "#ffffff",
  },
  logo: {
    width: 140,
    height: 140,
    marginBottom: 20,
    borderRadius: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: "#2d4a2d",
    letterSpacing: 0.3,
  },
  subtitle: {
    fontSize: 13,
    color: "#9ca3af",
    marginTop: 8,
  },
});