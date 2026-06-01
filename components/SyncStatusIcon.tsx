import React, { useEffect, useRef } from "react";
import { Animated } from "react-native";
import { WifiOff, RefreshCw, CloudOff, CloudCheck } from "./Icons";
import { useNetwork } from "@/lib/network-provider";

/**
 * Small inline sync status icon for embedding in screen headers.
 * - Offline: amber WifiOff
 * - Syncing: green spinning RefreshCw
 * - Error: red CloudOff
 * - Online/Idle: green CloudCheck
 */
export default function SyncStatusIcon({ size = 16 }: { size?: number }) {
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
      spinRef.current?.stop();
      spinAnim.setValue(0);
    }
  }, [syncStatus, spinAnim]);

  const spin = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  if (syncStatus === "syncing") {
    return (
      <Animated.View style={{ transform: [{ rotate: spin }] }}>
        <RefreshCw color="#16a34a" size={size} />
      </Animated.View>
    );
  }

  if (syncStatus === "error") {
    return <CloudOff color="#dc2626" size={size} />;
  }

  if (!isOnline) {
    return <WifiOff color="#f59e0b" size={size} />;
  }

  return <CloudCheck color="#16a34a" size={size} />;
}
