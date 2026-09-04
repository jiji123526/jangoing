"use client";

import type {
  FridgeSetupStatus,
} from "@jangoing/contracts";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import {
  acknowledgeInventoryAttention,
  getDashboardData,
  type DashboardData,
} from "../lib/api";

const emptyDashboard: DashboardData = {
  inventory: [],
  events: [],
  shoppingList: [],
};

interface KitchenDataContextValue {
  dashboard: DashboardData;
  setDashboard: Dispatch<SetStateAction<DashboardData>>;
  fridgeSetupStatus: FridgeSetupStatus | null;
  setFridgeSetupStatus: Dispatch<SetStateAction<FridgeSetupStatus | null>>;
  loading: boolean;
  loadError: string | null;
  acknowledgedAttentionItems: ReadonlySet<string>;
  acknowledgeAttentionItem: (itemName: string) => Promise<void>;
  clearAttentionAcknowledgement: (itemName: string) => void;
  refresh: () => Promise<void>;
}

const KitchenDataContext = createContext<KitchenDataContextValue | null>(null);

export function KitchenDataProvider({ children }: { children: ReactNode }) {
  const [dashboard, setDashboard] = useState<DashboardData>(emptyDashboard);
  const [fridgeSetupStatus, setFridgeSetupStatus] =
    useState<FridgeSetupStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [acknowledgedAttentionItems, setAcknowledgedAttentionItems] =
    useState<Set<string>>(() => new Set());
  const hasLoadedRef = useRef(false);

  async function refresh(): Promise<void> {
    if (!hasLoadedRef.current) setLoading(true);
    setLoadError(null);
    try {
      const snapshot = await getDashboardData();
      setDashboard(snapshot.dashboard);
      setFridgeSetupStatus(snapshot.fridgeSetupStatus);
      setAcknowledgedAttentionItems(
        new Set(snapshot.acknowledgedAttentionItems),
      );
      hasLoadedRef.current = true;
    } catch (caught) {
      const message =
        caught instanceof Error
          ? caught.message
          : "Could not load kitchen data.";
      setLoadError(message);
      throw caught;
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh().catch(() => undefined);
  }, []);

  async function acknowledgeAttentionItem(itemName: string): Promise<void> {
    await acknowledgeInventoryAttention(itemName);
    setAcknowledgedAttentionItems((current) => {
      const next = new Set(current);
      next.add(itemName);
      return next;
    });
  }

  function clearAttentionAcknowledgement(itemName: string): void {
    setAcknowledgedAttentionItems((current) => {
      if (!current.has(itemName)) return current;
      const next = new Set(current);
      next.delete(itemName);
      return next;
    });
  }

  return (
    <KitchenDataContext.Provider
      value={{
        dashboard,
        setDashboard,
        fridgeSetupStatus,
        setFridgeSetupStatus,
        loading,
        loadError,
        acknowledgedAttentionItems,
        acknowledgeAttentionItem,
        clearAttentionAcknowledgement,
        refresh,
      }}
    >
      {children}
    </KitchenDataContext.Provider>
  );
}

export function useKitchenData(): KitchenDataContextValue {
  const value = useContext(KitchenDataContext);
  if (!value) throw new Error("Kitchen data context is unavailable");
  return value;
}
