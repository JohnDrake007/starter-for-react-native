import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import NetInfo, { NetInfoState } from "@react-native-community/netinfo";
import {
  initSync,
  syncNow,
  getSyncStatus,
  getLastSyncTime,
  getPendingCount,
  addSyncListener,
  setOffline,
  setOnline,
  type SyncStatus,
} from "./sync-manager";

// ── Context Types ─────────────────────────────────────────────────────────────
interface NetworkContextValue {
  isOnline: boolean;
  syncStatus: SyncStatus;
  lastSyncTime: string | null;
  pendingCount: number;
  syncNow: () => Promise<void>;
  initialized: boolean;
}

const NetworkContext = createContext<NetworkContextValue>({
  isOnline: true,
  syncStatus: "idle",
  lastSyncTime: null,
  pendingCount: 0,
  syncNow: async () => {},
  initialized: false,
});

export function useNetwork(): NetworkContextValue {
  return useContext(NetworkContext);
}

// ── Provider ──────────────────────────────────────────────────────────────────
export function NetworkProvider({ children }: { children: React.ReactNode }) {
  const [isOnline, setIsOnline] = useState(true);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [initialized, setInitialized] = useState(false);
  const wasOfflineRef = useRef(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Initialize sync on mount ──
  useEffect(() => {
    let mounted = true;

    async function init() {
      await initSync();
      if (!mounted) return;

      setLastSync(getLastSyncTime());
      setPendingCount(getPendingCount());
      setInitialized(true);

      // Check current connectivity and do initial sync if online
      const state = await NetInfo.fetch();
      const online = !!(state.isConnected && state.isInternetReachable !== false);
      setIsOnline(online);

      if (online) {
        // Do an initial sync to pull latest data
        try {
          await syncNow();
          if (mounted) {
            setLastSync(getLastSyncTime());
            setPendingCount(getPendingCount());
          }
        } catch {}
      } else {
        setOffline();
      }
    }

    init();
    return () => {
      mounted = false;
    };
  }, []);

  // ── Listen for sync status changes ──
  useEffect(() => {
    const unsub = addSyncListener((status, _info) => {
      setSyncStatus(status);
      setLastSync(getLastSyncTime());
      setPendingCount(getPendingCount());
    });
    return unsub;
  }, []);

  // ── Listen for connectivity changes ──
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      const online = !!(state.isConnected && state.isInternetReachable !== false);

      // Debounce rapid changes (common in rural areas with unstable signal)
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      debounceTimerRef.current = setTimeout(async () => {
        setIsOnline(online);

        if (online) {
          setOnline();
          // Auto-sync when transitioning from offline → online
          if (wasOfflineRef.current) {
            try {
              await syncNow();
              setLastSync(getLastSyncTime());
              setPendingCount(getPendingCount());
            } catch {}
          }
          wasOfflineRef.current = false;
        } else {
          wasOfflineRef.current = true;
          setOffline();
        }
      }, 1500); // 1.5s debounce
    });

    return () => {
      unsubscribe();
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // ── Manual sync handler ──
  const handleSyncNow = useCallback(async () => {
    try {
      await syncNow();
      setLastSync(getLastSyncTime());
      setPendingCount(getPendingCount());
    } catch {}
  }, []);

  return (
    <NetworkContext.Provider
      value={{
        isOnline,
        syncStatus,
        lastSyncTime: lastSync,
        pendingCount,
        syncNow: handleSyncNow,
        initialized,
      }}
    >
      {children}
    </NetworkContext.Provider>
  );
}
