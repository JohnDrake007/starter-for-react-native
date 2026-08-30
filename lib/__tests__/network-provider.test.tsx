import React from "react";
import TestRenderer, { act } from "react-test-renderer";

const mockNetInfoFetch = jest.fn(async () => ({
  isConnected: true,
  isInternetReachable: true,
}));
const mockNetInfoSubscribe = jest.fn(() => jest.fn());
const mockAppStateSubscribe = jest.fn(() => ({ remove: jest.fn() }));

let mockStatus: "idle" | "syncing" | "error" | "offline" = "idle";
const mockInitSync = jest.fn(async () => undefined);
const mockCoreSync = jest.fn(async () => {
  mockStatus = "idle";
});
const mockInventorySync = jest.fn<Promise<void>, [unknown]>();
const mockStartRealtime = jest.fn();
const mockStopRealtime = jest.fn();

jest.mock("@react-native-community/netinfo", () => ({
  __esModule: true,
  default: {
    fetch: mockNetInfoFetch,
    addEventListener: mockNetInfoSubscribe,
  },
}));

jest.mock("react-native", () => {
  return {
    AppState: {
      addEventListener: mockAppStateSubscribe,
    },
  };
});

jest.mock("../sync-manager", () => ({
  initSync: mockInitSync,
  syncNow: mockCoreSync,
  getSyncStatus: jest.fn(() => mockStatus),
  getLastSyncTime: jest.fn(() => null),
  getPendingCount: jest.fn(() => 0),
  syncInventoryCollections: mockInventorySync,
  addSyncListener: jest.fn(() => jest.fn()),
  addDataChangeListener: jest.fn(() => jest.fn()),
  setOffline: jest.fn(),
  setOnline: jest.fn(),
  startRealtime: mockStartRealtime,
  stopRealtime: mockStopRealtime,
}));

describe("NetworkProvider lifecycle sync", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockStatus = "idle";
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("retries a failed cold-launch inventory pull without retaining full-scan flags", async () => {
    mockInventorySync
      .mockImplementationOnce(async () => {
        mockStatus = "error";
        throw new Error("Inventory temporarily unavailable");
      })
      .mockImplementationOnce(async () => {
        mockStatus = "idle";
      });

    const { NetworkProvider } = require("../network-provider") as typeof import("../network-provider");
    let renderer: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(
        <NetworkProvider><></></NetworkProvider>
      );
    });

    expect(mockCoreSync).toHaveBeenNthCalledWith(1, { ensurePull: true });
    expect(mockInventorySync).toHaveBeenNthCalledWith(1, { ensurePull: true });

    await act(async () => {
      await jest.advanceTimersByTimeAsync(3000);
    });

    expect(mockCoreSync).toHaveBeenNthCalledWith(2, { ensurePull: true });
    expect(mockInventorySync).toHaveBeenNthCalledWith(2, { ensurePull: true });
    expect(mockCoreSync).not.toHaveBeenCalledWith({ forcePull: true });
    expect(mockInventorySync).not.toHaveBeenCalledWith({ forceFull: true });

    await act(async () => {
      renderer!.unmount();
    });
  });
});
