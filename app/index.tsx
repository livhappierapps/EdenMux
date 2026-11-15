import React, { useRef, useEffect, useCallback, useState } from 'react';
import { View, ScrollView, StyleSheet, Platform, StatusBar, Pressable, Text, Share, AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Updates from 'expo-updates';
import { useTerminalColors } from '@/lib/theme-context';
import { useTerminal } from '@/lib/terminal-context';
import { useAuth } from '@/lib/auth-context';
import { useEden } from '@/lib/eden-context';
import { useAppConfig } from '@/lib/app-config-context';
import TerminalOutput from '@/components/TerminalOutput';
import TerminalInput from '@/components/TerminalInput';
import SessionTabs from '@/components/SessionTabs';
import AuthGate from '@/components/AuthGate';
import EdenPanel from '@/components/EdenPanel';

const APPLE_NOTICE_KEY = '@edenmux_apple_notice_dismissed';

const titleFont = Platform.select({
  ios: 'Cinzel_700Bold',
  android: 'Cinzel_700Bold',
  default: 'Cinzel_700Bold',
});

const monoFont = Platform.select({
  ios: 'JetBrainsMono_400Regular',
  android: 'JetBrainsMono_400Regular',
  default: 'JetBrainsMono_400Regular',
});

function getDisplayPath(cwd: string): string {
  if (!cwd) return '~';
  const match = cwd.match(/Documents\/(.*)/);
  if (match) {
    const rel = match[1].replace(/\/$/, '');
    return rel ? `~/${rel}` : '~';
  }
  return '~';
}

function TerminalView() {
  const insets = useSafeAreaInsets();
  const tc = useTerminalColors();
  const { activeSession, clearTerminal, shellMode, setShellMode, shellConnected } = useTerminal();
  const shareTerminal = useCallback(async () => {
    const lines = activeSession.lines.slice(-100);
    const text = lines
      .map(l => l.type === 'input' ? `$ ${l.content}` : l.content)
      .join('\n');
    try { await Share.share({ message: text, title: 'EdenMux Terminal' }); } catch {}
  }, [activeSession.lines]);
  const { signOut } = useAuth();
  const { triggerError } = useEden();
  const { config } = useAppConfig();
  const scrollRef = useRef<ScrollView>(null);
  const [motdDismissed, setMotdDismissed] = useState(false);
  const [appleNoticeDismissed, setAppleNoticeDismissed] = useState(true); // default true to avoid flash
  const [updateBannerDismissed, setUpdateBannerDismissed] = useState(false);

  // OTA update banner — only relevant on real device builds (not dev or embedded launch)
  const { isUpdatePending, currentlyRunning } = Updates.useUpdates();
  const showUpdateBanner =
    !__DEV__ &&
    !currentlyRunning.isEmbeddedLaunch &&
    isUpdatePending &&
    !updateBannerDismissed;
  const updateCheckInFlight = useRef(false);

  useEffect(() => {
    if (__DEV__ || Platform.OS === 'web' || !Updates.isEnabled || currentlyRunning.isEmbeddedLaunch) {
      return;
    }

    let mounted = true;
    const checkForUpdates = async () => {
      if (!mounted || AppState.currentState !== 'active' || updateCheckInFlight.current) return;
      updateCheckInFlight.current = true;
      try {
        const result = await Updates.checkForUpdateAsync();
        if (mounted && result.isAvailable) {
          await Updates.fetchUpdateAsync();
        }
      } catch {
        console.warn('[Updates] Periodic check failed.');
      } finally {
        updateCheckInFlight.current = false;
      }
    };

    const interval = setInterval(() => void checkForUpdates(), 15 * 60 * 1000);
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') void checkForUpdates();
    });

    return () => {
      mounted = false;
      clearInterval(interval);
      subscription.remove();
    };
  }, [currentlyRunning.isEmbeddedLaunch]);

  const handleApplyUpdate = useCallback(async () => {
    try { await Updates.reloadAsync(); } catch {}
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    AsyncStorage.getItem(APPLE_NOTICE_KEY).then(val => {
      if (!val) setAppleNoticeDismissed(false);
    }).catch(() => {});
  }, []);

  const dismissAppleNotice = useCallback(() => {
    setAppleNoticeDismissed(true);
    AsyncStorage.setItem(APPLE_NOTICE_KEY, 'true').catch(() => {});
  }, []);

  const errorCountRef = useRef(0);
  useEffect(() => {
    const errorCount = activeSession.lines.filter(l => l.type === 'error').length;
    if (errorCount > errorCountRef.current) triggerError();
    errorCountRef.current = errorCount;
  }, [activeSession.lines, triggerError]);

  const webTopInset = Platform.OS === 'web' ? 67 : 0;
  const webBottomInset = Platform.OS === 'web' ? 34 : 0;

  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }, [activeSession.lines.length]);

  const handleScrollToEnd = useCallback(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, []);

  const shellDotColor = shellMode
    ? (shellConnected ? tc.success || '#4ade80' : tc.rose)
    : tc.accent;

  return (
    <View style={[styles.container, { backgroundColor: tc.bg }]}>
      <StatusBar barStyle="light-content" backgroundColor={tc.bg} />

      <View style={[
        styles.header,
        {
          paddingTop: (Platform.OS === 'web' ? webTopInset : insets.top) + 4,
          backgroundColor: tc.bg,
          borderBottomColor: tc.border,
        },
      ]}>
        <View style={styles.headerLeft}>
          {config.features.shellMode ? (
            <Pressable
              testID="shell-mode-toggle"
              onPress={() => setShellMode(!shellMode)}
              hitSlop={6}
              style={styles.shellDotWrap}
            >
              <View style={[styles.statusDot, { backgroundColor: shellDotColor }]} />
            </Pressable>
          ) : (
            <View style={[styles.shellDotWrap, { paddingLeft: 2 }]}>
              <View style={[styles.statusDot, { backgroundColor: tc.accent }]} />
            </View>
          )}
          <Text style={[styles.headerTitle, { fontFamily: titleFont, color: tc.text }]}>EdenMux</Text>
          {config.features.shellMode && shellMode && (
            <View style={[styles.shellBadge, { backgroundColor: `${tc.accent}22`, borderColor: `${tc.accent}44` }]}>
              <Text style={[styles.shellBadgeText, { fontFamily: monoFont, color: tc.accent }]}>
                {shellConnected ? 'bash' : '...'}
              </Text>
            </View>
          )}
        </View>
        <View style={styles.headerRight}>
          <Text style={[styles.cwdText, { fontFamily: monoFont, color: tc.textDim }]}>
            {config.features.shellMode && shellMode
              ? (shellConnected ? 'linux' : '···')
              : getDisplayPath(activeSession.cwd)}
          </Text>
          {config.features.screenshotStudio && (
            <Pressable
              testID="screenshot-studio-btn"
              onPress={() => router.push('/screenshot-studio')}
              style={({ pressed }) => [styles.headerBtn, pressed && { backgroundColor: tc.bgSecondary }]}
              hitSlop={4}
            >
              <Ionicons name="camera-outline" size={16} color={tc.textDim} />
            </Pressable>
          )}
          <Pressable
            testID="share-terminal-btn"
            onPress={shareTerminal}
            style={({ pressed }) => [styles.headerBtn, pressed && { backgroundColor: tc.bgSecondary }]}
            hitSlop={4}
          >
            <Ionicons name="share-outline" size={16} color={tc.textDim} />
          </Pressable>
          <Pressable
            testID="clear-terminal-btn"
            onPress={clearTerminal}
            style={({ pressed }) => [styles.headerBtn, pressed && { backgroundColor: tc.bgSecondary }]}
            hitSlop={4}
          >
            <Ionicons name="trash-outline" size={16} color={tc.textDim} />
          </Pressable>
          <Pressable
            testID="sign-out-btn"
            onPress={signOut}
            style={({ pressed }) => [styles.headerBtn, pressed && { backgroundColor: tc.bgSecondary }]}
            hitSlop={4}
          >
            <Ionicons name="log-out-outline" size={16} color={tc.textDim} />
          </Pressable>
        </View>
      </View>

      {/* Apple compliance notice — iOS only, first launch only */}
      {Platform.OS === 'ios' && !appleNoticeDismissed && (
        <Pressable
          onPress={dismissAppleNotice}
          style={[styles.appleNotice, { backgroundColor: `${tc.accent}18`, borderColor: `${tc.accent}35` }]}
        >
          <Ionicons name="shield-checkmark-outline" size={13} color={tc.accent} style={{ marginTop: 1 }} />
          <Text style={[styles.appleNoticeText, { fontFamily: monoFont, color: tc.cream }]}>
            {'EdenMux runs a fully sandboxed terminal on iOS — no code is downloaded or executed externally. All commands run locally inside Apple\'s secure container, in full compliance with App Store Guidelines. Ask Eden anything.'}
          </Text>
          <Ionicons name="close" size={13} color={tc.textDim} />
        </Pressable>
      )}

      {config.app.motd && !motdDismissed && (
        <Pressable
          onPress={() => setMotdDismissed(true)}
          style={[styles.motdBanner, { backgroundColor: `${tc.accent}1a`, borderColor: `${tc.accent}40` }]}
        >
          <Text style={[styles.motdText, { fontFamily: monoFont, color: tc.cream }]} numberOfLines={2}>
            {config.app.motd}
          </Text>
          <Ionicons name="close" size={13} color={tc.textDim} />
        </Pressable>
      )}

      {/* OTA update-ready banner — appears when expo-updates downloads a new bundle in the background */}
      {showUpdateBanner && (
        <View style={[styles.updateBanner, { backgroundColor: `${tc.success}18`, borderColor: `${tc.success}50` }]}>
          <Ionicons name="arrow-down-circle-outline" size={14} color={tc.success} style={{ marginTop: 1 }} />
          <Text style={[styles.updateBannerText, { fontFamily: monoFont, color: tc.cream }]}>
            Update ready — restart to apply the latest version.
          </Text>
          <Pressable
            onPress={handleApplyUpdate}
            hitSlop={6}
            style={[styles.updateBannerBtn, { backgroundColor: `${tc.success}30`, borderColor: `${tc.success}60` }]}
          >
            <Text style={[styles.updateBannerBtnText, { fontFamily: monoFont, color: tc.success }]}>Restart</Text>
          </Pressable>
          <Pressable onPress={() => setUpdateBannerDismissed(true)} hitSlop={8}>
            <Ionicons name="close" size={14} color={tc.textDim} />
          </Pressable>
        </View>
      )}

      <SessionTabs />

      <KeyboardAvoidingView
        style={styles.kavContainer}
        behavior="padding"
        keyboardVerticalOffset={0}
      >
        <ScrollView
          ref={scrollRef}
          style={[styles.scrollView, { backgroundColor: tc.bg }]}
          contentContainerStyle={styles.scrollContent}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={handleScrollToEnd}
          showsVerticalScrollIndicator={true}
          indicatorStyle="white"
        >
          <TerminalOutput lines={activeSession.lines} cwd={activeSession.cwd} />
        </ScrollView>

        <View style={{ paddingBottom: Platform.OS === 'web' ? webBottomInset : insets.bottom }}>
          <TerminalInput />
        </View>
      </KeyboardAvoidingView>

      <EdenPanel />
    </View>
  );
}

export default function TerminalScreen() {
  return (
    <AuthGate>
      <TerminalView />
    </AuthGate>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  shellDotWrap: { padding: 4 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  shellBadge: {
    borderWidth: 1, borderRadius: 4,
    paddingHorizontal: 5, paddingVertical: 1,
  },
  shellBadgeText: { fontSize: 9, letterSpacing: 0.5 },
  headerTitle: { fontSize: 15, letterSpacing: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cwdText: { fontSize: 11, marginRight: 4 },
  headerBtn: { width: 28, height: 28, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  kavContainer: { flex: 1 },
  scrollView: { flex: 1 },
  scrollContent: { paddingBottom: 16 },
  appleNotice: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    paddingHorizontal: 14, paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  appleNoticeText: { flex: 1, fontSize: 10, lineHeight: 15, letterSpacing: 0.15, opacity: 0.9 },
  motdBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingVertical: 7,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  motdText: { flex: 1, fontSize: 11, lineHeight: 16, letterSpacing: 0.2 },
  updateBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  updateBannerText: { flex: 1, fontSize: 11, lineHeight: 15, letterSpacing: 0.15 },
  updateBannerBtn: {
    borderWidth: 1, borderRadius: 5,
    paddingHorizontal: 9, paddingVertical: 3,
  },
  updateBannerBtnText: { fontSize: 11, letterSpacing: 0.3 },
});
