import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { useFonts, JetBrainsMono_400Regular, JetBrainsMono_700Bold } from "@expo-google-fonts/jetbrains-mono";
import { Cinzel_400Regular, Cinzel_700Bold } from "@expo-google-fonts/cinzel";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { UpdateRequired } from "@/components/UpdateRequired";
import { queryClient } from "@/lib/query-client";
import { TerminalProvider } from "@/lib/terminal-context";
import { AuthProvider } from "@/lib/auth-context";
import { EdenProvider } from "@/lib/eden-context";
import { ThemeProvider } from "@/lib/theme-context";
import { AppConfigProvider, useAppConfig } from "@/lib/app-config-context";
import { SubscriptionProvider, initializeRevenueCat } from "@/lib/revenuecat";

SplashScreen.preventAutoHideAsync();

try { initializeRevenueCat(); } catch {}

function AppStack() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#1a1015' } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="screenshot-studio" />
    </Stack>
  );
}

function AppGate() {
  const { isLoaded, isUpdateRequired } = useAppConfig();

  if (!isLoaded) {
    return null;
  }

  if (isUpdateRequired) {
    return <UpdateRequired />;
  }

  return (
    <SubscriptionProvider>
      <AuthProvider>
        <EdenProvider>
          <TerminalProvider>
            <AppStack />
          </TerminalProvider>
        </EdenProvider>
      </AuthProvider>
    </SubscriptionProvider>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    JetBrainsMono_400Regular,
    JetBrainsMono_700Bold,
    Cinzel_400Regular,
    Cinzel_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AppConfigProvider>
          <ThemeProvider>
            <GestureHandlerRootView>
              <KeyboardProvider>
                <AppGate />
              </KeyboardProvider>
            </GestureHandlerRootView>
          </ThemeProvider>
        </AppConfigProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
