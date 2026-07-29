import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import { AppState, AppStateStatus } from "react-native";
import NetInfo, { NetInfoState } from "@react-native-community/netinfo";
import {
  initSync,
  syncNow,
  getSyncStatus,
  getLastSyncTime,
  getPendingCount,
  addSyncListener,
  addDataChangeListener,
  setOffline,
  setOnline,
  startRealtime,
  stopRealtime,
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

/**
 * Subscribe a screen to local-cache changes (realtime events, pulls, or pushed
 * mutations) so it re-reads its data live without needing a manual refresh or
 * re-focus. Pass a stable callback (e.g. wrapped in useCallback).
 */
export function useDataChange(onChange: () => void): void {
  useEffect(() => addDataChangeListener(onChange), [onChange]);
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
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCountRef = useRef(0);

  // A cold launch, a reconnect, or a foreground resume is each only ONE sync
  // attempt. If that attempt fails for a transient reason (e.g. the OS reports
  // "connected" a moment before the network path is actually usable), nothing
  // previously re-armed sync — mutations sat queued until a manual
  // pull-to-refresh called syncNow() directly. Retry with backoff instead so a
  // one-off transient failure doesn't strand pending changes indefinitely.
  const RETRY_DELAYS_MS = [3000, 8000, 20000, 45000];
  const MAINTENANCE_RETRY_MS = 5 * 60 * 1000;

  const clearRetry = useCallback(() => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    retryCountRef.current = 0;
  }, []);

  const attemptSync = useCallback(async () => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }

    try {
      await syncNow();
    } catch {}
    setLastSync(getLastSyncTime());
    setPendingCount(getPendingCount());

    const needsRetry = getPendingCount() > 0 || getSyncStatus() === "error";
    if (needsRetry) {
      const delay = retryCountRef.current < RETRY_DELAYS_MS.length
        ? RETRY_DELAYS_MS[retryCountRef.current]
        : MAINTENANCE_RETRY_MS;
      retryCountRef.current = Math.min(
        retryCountRef.current + 1,
        RETRY_DELAYS_MS.length
      );
      retryTimerRef.current = setTimeout(() => {
        attemptSync();
      }, delay);
    } else {
      retryCountRef.current = 0;
    }
  }, []);

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
        // Do an initial sync to pull latest data (retried on transient failure).
        await attemptSync();
        if (!mounted) return;
        // Subscribe to realtime so changes from other devices land live.
        startRealtime();
      } else {
        setOffline();
      }
    }

    init();
    return () => {
      mounted = false;
      stopRealtime();
      clearRetry();
    };
  }, [attemptSync, clearRetry]);

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
            await attemptSync();
          }
          wasOfflineRef.current = false;
          // (Re)subscribe to realtime now that we're back online.
          startRealtime();
        } else {
          wasOfflineRef.current = true;
          stopRealtime();
          setOffline();
          clearRetry();
        }
      }, 1500); // 1.5s debounce
    });

    return () => {
      unsubscribe();
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [attemptSync, clearRetry]);

  // ── Re-check connectivity and sync whenever the app returns to the foreground ──
  // NetInfo events can go unobserved while the JS thread is suspended (app
  // backgrounded, not killed) — e.g. the device reconnects while backgrounded.
  // Without this, offline edits made before backgrounding never auto-sync until
  // the user manually pulls-to-refresh a screen.
  //
  // NOTE: We deliberately do NOT tear down the realtime websocket here. The
  // Appwrite client manages its own reconnect/backoff; calling stopRealtime()
  // + startRealtime() on every AppState "active" churned the websocket on every
  // app resume and burned through the free-tier realtime connection quota.
  // The realtime socket is only torn down when the device goes offline (in the
  // NetInfo handler below); startRealtime() here is idempotent and will re-arm
  // the socket only if a previous offline event had torn it down.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", async (nextState: AppStateStatus) => {
      if (nextState !== "active") return;

      const state = await NetInfo.fetch();
      const online = !!(state.isConnected && state.isInternetReachable !== false);
      setIsOnline(online);

      if (online) {
        setOnline();
        wasOfflineRef.current = false;
        // Re-arm realtime only if it isn't already running (no-op if active).
        startRealtime();
        await attemptSync();
      } else {
        wasOfflineRef.current = true;
        setOffline();
        clearRetry();
      }
    });

    return () => subscription.remove();
  }, [attemptSync, clearRetry]);

  // ── Manual sync handler ──
  const handleSyncNow = useCallback(async () => {
    try {
      await syncNow({ forcePull: true });
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
