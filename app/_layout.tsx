import { Stack } from "expo-router";
import { useEffect } from "react";
import { ping } from "@/lib/appwrite";

export default function RootLayout() {
  useEffect(() => {
    ping().catch(console.error);
  }, []);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="visit/[id]" options={{ headerShown: false, animation: "slide_from_right" }} />
    </Stack>
  );
}