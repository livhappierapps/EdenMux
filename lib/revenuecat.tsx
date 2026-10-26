import React, { createContext, useContext, useEffect, useRef, useMemo } from "react";
import { Platform, AppState, type AppStateStatus } from "react-native";
import Purchases, { LOG_LEVEL } from "react-native-purchases";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Constants from "expo-constants";
import { THEMES, THEME_ORDER, BUNDLE_PRODUCT_ID, CORE_UNLOCK_PRODUCT_ID, CORE_UNLOCK_ENTITLEMENT_ID } from "@/lib/theme-context";

const REVENUECAT_TEST_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_TEST_API_KEY ?? "";
const REVENUECAT_IOS_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY ?? "";
const REVENUECAT_ANDROID_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY ?? "";

export const PAID_THEME_IDS = THEME_ORDER.filter(id => id !== 'default');

function getRevenueCatApiKey(): string {
  if (__DEV__ || Constants.executionEnvironment === "storeClient") {
    return REVENUECAT_TEST_API_KEY;
  }
  if (Platform.OS === "ios") return REVENUECAT_IOS_API_KEY;
  if (Platform.OS === "android") return REVENUECAT_ANDROID_API_KEY;
  return REVENUECAT_TEST_API_KEY;
}

export function initializeRevenueCat() {
  // RevenueCat mobile SDK does not support web — skip silently
  if (Platform.OS === "web") return;

  const apiKey = getRevenueCatApiKey();
  if (!apiKey) {
    console.warn("[RevenueCat] No API key configured — purchases disabled.");
    return;
  }
  try {
    Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.ERROR);
    Purchases.configure({ apiKey });
  } catch {
    console.warn("[RevenueCat] Init failed.");
  }
}

const CUSTOMER_INFO_KEY = ["revenuecat", "customer-info"];
const OFFERINGS_KEY = ["revenuecat", "offerings"];

function useSubscriptionContext() {
  const qc = useQueryClient();
  const appState = useRef<AppStateStatus>(AppState.currentState);

  const customerInfoQuery = useQuery({
    queryKey: CUSTOMER_INFO_KEY,
    queryFn: async () => {
      const info = await Purchases.getCustomerInfo();
      return info;
    },
    staleTime: 60 * 1000,
    retry: false,
  });

  const offeringsQuery = useQuery({
    queryKey: OFFERINGS_KEY,
    queryFn: async () => {
      const offerings = await Purchases.getOfferings();
      return offerings;
    },
    staleTime: 300 * 1000,
    retry: false,
  });

  useEffect(() => {
    const sub = AppState.addEventListener("change", (next: AppStateStatus) => {
      if (appState.current.match(/inactive|background/) && next === "active") {
        qc.invalidateQueries({ queryKey: CUSTOMER_INFO_KEY });
      }
      appState.current = next;
    });
    return () => sub.remove();
  }, [qc]);

  const purchaseMutation = useMutation({
    mutationFn: async (packageToPurchase: any) => {
      const { customerInfo } = await Purchases.purchasePackage(packageToPurchase);
      return customerInfo;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: CUSTOMER_INFO_KEY }),
  });

  const restoreMutation = useMutation({
    mutationFn: async () => {
      return Purchases.restorePurchases();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: CUSTOMER_INFO_KEY }),
  });

  const activeEntitlements = customerInfoQuery.data?.entitlements.active ?? {};

  const hasCoreUnlock = CORE_UNLOCK_ENTITLEMENT_ID in activeEntitlements;

  const unlockedThemeIds = useMemo(() => {
    const ids: string[] = ['default'];
    for (const themeId of PAID_THEME_IDS) {
      const entId = THEMES[themeId]?.rcEntitlementId;
      if (entId && entId in activeEntitlements) {
        ids.push(themeId);
      }
    }
    return ids;
  }, [activeEntitlements]);

  const currentOffering = offeringsQuery.data?.current;

  const getPackageForProductId = (productId: string) => {
    return currentOffering?.availablePackages?.find(
      (p) => p.product.identifier === productId
    ) ?? null;
  };

  return {
    customerInfo: customerInfoQuery.data,
    offerings: offeringsQuery.data,
    currentOffering,
    isLoading: customerInfoQuery.isLoading || offeringsQuery.isLoading,
    hasCoreUnlock,
    unlockedThemeIds,
    getPackageForProductId,
    purchase: purchaseMutation.mutateAsync,
    restore: restoreMutation.mutateAsync,
    isPurchasing: purchaseMutation.isPending,
    isRestoring: restoreMutation.isPending,
    purchaseError: purchaseMutation.error,
    refetchCustomerInfo: () => qc.invalidateQueries({ queryKey: CUSTOMER_INFO_KEY }),
  };
}

type SubscriptionContextValue = ReturnType<typeof useSubscriptionContext>;
const Context = createContext<SubscriptionContextValue | null>(null);

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const value = useSubscriptionContext();
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useSubscription() {
  const ctx = useContext(Context);
  if (!ctx) throw new Error("useSubscription must be used within a SubscriptionProvider");
  return ctx;
}
