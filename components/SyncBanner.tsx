import React, { useEffect, useRef } from "react";
import { View, StyleSheet, Animated } from "react-native";
import { WifiOff, RefreshCw, CloudOff, CloudCheck } from "./Icons";
import { useNetwork } from "@/lib/network-provider";

export default function SyncBanner() {
  const { isOnline, syncStatus } = useNetwork();
  
  const spinAnim = useRef(new Animated.Value(0)).current;
  const spinRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (syncStatus === "syncing") {
      spinAnim.setValue(0);
      spinRef.current = Animated.loop(
        Animated.timing(spinAnim, {
          toValue: 1,
          duration: 1200,
          useNativeDriver: true,
        })
      );
      spinRef.current.start();
    } else {
      if (spinRef.current) {
        spinRef.current.stop();
      }
      spinAnim.setValue(0);
    }
  }, [syncStatus, spinAnim]);

  const spin = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  let bgColor = "#f59e0b";
  let icon = <WifiOff color="#fff" size={12} />;

  if (syncStatus === "syncing") {
    bgColor = "#16a34a";
    icon = (
      <Animated.View style={{ transform: [{ rotate: spin }] }}>
        <RefreshCw color="#fff" size={12} />
      </Animated.View>
    );
  } else if (syncStatus === "error") {
    bgColor = "#dc2626";
    icon = <CloudOff color="#fff" size={12} />;
  } else if (isOnline) {
    bgColor = "#16a34a";
    icon = <CloudCheck color="#fff" size={12} />;
  }

  return (
    <View style={[styles.iconBubble, { backgroundColor: bgColor }]}>
      {icon}
    </View>
  );
}

const styles = StyleSheet.create({
  iconBubble: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
});
