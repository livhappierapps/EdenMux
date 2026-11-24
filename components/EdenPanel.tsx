import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, ScrollView, StyleSheet, Pressable,
  Animated, Image, Platform, ActivityIndicator, Switch, Linking, PanResponder,
  Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import { fetch } from 'expo/fetch';
import * as Updates from 'expo-updates';
import { useEden, type EdenMessage } from '@/lib/eden-context';
import { getApiUrl } from '@/lib/query-client';
import { useTheme, useTerminalColors } from '@/lib/theme-context';
import { useAuth } from '@/lib/auth-context';
import { useAppConfig } from '@/lib/app-config-context';
import ThemeShop from '@/components/ThemeShop';
import PaywallModal from '@/components/PaywallModal';
import { useSubscription } from '@/lib/revenuecat';

const monoFont = Platform.select({ ios: 'JetBrainsMono_400Regular', default: 'JetBrainsMono_400Regular' });
const titleFont = Platform.select({ ios: 'Cinzel_700Bold', default: 'Cinzel_700Bold' });

function EdenBubble({ msg, accent, cream, textDim }: { msg: EdenMessage; accent: string; cream: string; textDim: string }) {
  const isEden = msg.role === 'eden';
  const displayContent = msg.content.replace(/\[WARN\]/g, '').trim();
  return (
    <View style={[bubbleStyles.row, isEden ? bubbleStyles.rowEden : bubbleStyles.rowUser]}>
      <View style={[
        bubbleStyles.bubble,
        isEden
          ? { backgroundColor: `${accent}1e`, borderColor: `${accent}40` }
          : { backgroundColor: `${textDim}26`, borderColor: `${textDim}33` },
        isEden ? bubbleStyles.bubbleEden : bubbleStyles.bubbleUser,
      ]}>
        <Text style={[
          bubbleStyles.text, { fontFamily: monoFont },
          isEden ? { color: cream } : { color: textDim },
        ]}>
          {displayContent}
        </Text>
      </View>
    </View>
  );
}

function ThinkingDots({ accent }: { accent: string }) {
  const dot1 = useRef(new Animated.Value(0.3)).current;
  const dot2 = useRef(new Animated.Value(0.3)).current;
  const dot3 = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animate = (dot: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, { toValue: 1, duration: 400, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0.3, duration: 400, useNativeDriver: true }),
        ])
      );
    const animations = [animate(dot1, 0), animate(dot2, 150), animate(dot3, 300)];
    animations.forEach(animation => animation.start());
    return () => animations.forEach(animation => animation.stop());
  }, [dot1, dot2, dot3]);

  return (
    <View style={bubbleStyles.row}>
      <View style={[bubbleStyles.bubble, bubbleStyles.bubbleEden, { backgroundColor: `${accent}1e`, borderColor: `${accent}40`, flexDirection: 'row', gap: 4, paddingVertical: 10, paddingHorizontal: 14, alignItems: 'center' }]}>
        {[dot1, dot2, dot3].map((dot, i) => (
          <Animated.View key={i} style={[bubbleStyles.dot, { opacity: dot, backgroundColor: accent }]} />
        ))}
      </View>
    </View>
  );
}

function VolumeSlider({ volume, onChange, rose }: { volume: number; onChange: (v: number) => void; rose: string }) {
  const trackWidthRef = useRef(0);
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => {
      if (!trackWidthRef.current) return;
      onChangeRef.current(Math.max(0, Math.min(1, e.nativeEvent.locationX / trackWidthRef.current)));
    },
    onPanResponderMove: (e) => {
      if (!trackWidthRef.current) return;
      onChangeRef.current(Math.max(0, Math.min(1, e.nativeEvent.locationX / trackWidthRef.current)));
    },
  })).current;

  return (
    <View
      style={{ flex: 1, height: 20, justifyContent: 'center' }}
      onLayout={(e) => { trackWidthRef.current = e.nativeEvent.layout.width; }}
      {...panResponder.panHandlers}
    >
      <View style={{ height: 3, borderRadius: 2, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.12)' }}>
        <View style={{ height: '100%', width: `${Math.round(volume * 100)}%`, backgroundColor: rose, borderRadius: 2 }} />
      </View>
      <View style={[StyleSheet.absoluteFillObject, { justifyContent: 'center', alignItems: 'flex-start' }]}>
        <View style={{ width: `${Math.round(volume * 100)}%`, alignItems: 'flex-end' }}>
          <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: rose, transform: [{ translateX: 6 }] }} />
        </View>
      </View>
    </View>
  );
}

function SettingsDrawer({
  edenMode, isHidden, isAutoSpeak, setEdenMode, setHidden, setAutoSpeak, onThemesPress, themeShopEnabled,
  onRestore, hasCoreAccess, onVoiceLocked,
}: {
  edenMode: 'sugar' | 'spice'; isHidden: boolean; isAutoSpeak: boolean;
  setEdenMode: (v: 'sugar' | 'spice') => void; setHidden: (v: boolean) => void;
  setAutoSpeak: (v: boolean) => void;
  onThemesPress: () => void;
  themeShopEnabled: boolean;
  onRestore: () => void;
  hasCoreAccess: boolean;
  onVoiceLocked: () => void;
}) {
  const tc = useTerminalColors();
  const { user, redeemCode } = useAuth();
  const { isRestoring } = useSubscription();
  const [codeInput, setCodeInput] = useState('');
  const [codeStatus, setCodeStatus] = useState<'idle' | 'ok' | 'fail'>('idle');
  const [codeLoading, setCodeLoading] = useState(false);
  const { currentlyRunning } = Updates.useUpdates();
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error' | 'current'>('idle');

  const handleCheckUpdate = async () => {
    if (updateStatus === 'checking' || updateStatus === 'downloading') return;
    setUpdateStatus('checking');
    try {
      const checkResult = await Updates.checkForUpdateAsync();
      if (checkResult.isAvailable) {
        setUpdateStatus('available');
        const fetchResult = await Updates.fetchUpdateAsync();
        if (fetchResult.isNew) {
          setUpdateStatus('ready');
        } else {
          // Rollback-to-embedded or no new bundle — treat as error so user can retry
          setUpdateStatus('error');
          setTimeout(() => setUpdateStatus('idle'), 3000);
        }
      } else {
        setUpdateStatus('current');
        setTimeout(() => setUpdateStatus('idle'), 3000);
      }
    } catch {
      setUpdateStatus('error');
      setTimeout(() => setUpdateStatus('idle'), 3000);
    }
  };

  const handleApplyUpdate = async () => {
    try { await Updates.reloadAsync(); } catch {}
  };

  const updateId = currentlyRunning.updateId
    ? currentlyRunning.updateId.slice(0, 8)
    : currentlyRunning.isEmbeddedLaunch ? 'embedded' : 'dev';

  const handleRedeem = async () => {
    if (!codeInput.trim() || codeLoading) return;
    setCodeLoading(true);
    const ok = await redeemCode(codeInput.trim());
    setCodeStatus(ok ? 'ok' : 'fail');
    setCodeLoading(false);
    if (ok) setCodeInput('');
  };

  return (
    <View style={settingsStyles.drawer}>
      <View style={settingsStyles.row}>
        <View style={settingsStyles.textCol}>
          <Text style={[settingsStyles.label, { fontFamily: titleFont, color: tc.cream }]}>Auto-Speak</Text>
          <Text style={[settingsStyles.desc, { fontFamily: monoFont, color: tc.textDim }]}>
            Eden reads every response aloud automatically. ON by default — great for hands-free use.
          </Text>
        </View>
        {hasCoreAccess ? (
          <Switch
            value={isAutoSpeak}
            onValueChange={setAutoSpeak}
            trackColor={{ false: 'rgba(255,255,255,0.1)', true: `${tc.accent}80` }}
            thumbColor={isAutoSpeak ? tc.rose : 'rgba(255,255,255,0.4)'}
          />
        ) : (
          <Pressable onPress={onVoiceLocked} style={{ padding: 4 }}>
            <Ionicons name="lock-closed-outline" size={18} color={tc.textMuted} />
          </Pressable>
        )}
      </View>
      <View style={[settingsStyles.divider, { backgroundColor: `${tc.accent}33` }]} />
      <View style={settingsStyles.row}>
        <View style={settingsStyles.textCol}>
          <Text style={[settingsStyles.label, { fontFamily: titleFont, color: tc.cream }]}>Eden Mode</Text>
          <Text style={[settingsStyles.desc, { fontFamily: monoFont, color: tc.textDim }]}>
            {edenMode === 'sugar'
              ? 'Sugar — Eden listens quietly. She won\'t interrupt or auto-open.'
              : 'Spice — Eden actively engages. She\'ll jump in when you need her.'}
          </Text>
        </View>
      </View>
      <View style={modeStyles.row}>
        <Pressable
          onPress={() => setEdenMode('sugar')}
          style={[
            modeStyles.pill,
            { borderColor: `${tc.accent}40` },
            edenMode === 'sugar' && { backgroundColor: `${tc.accent}30`, borderColor: tc.accent },
          ]}
        >
          <Text style={[modeStyles.pillText, { fontFamily: monoFont, color: edenMode === 'sugar' ? tc.cream : tc.textDim }]}>
            🍬 Sugar
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setEdenMode('spice')}
          style={[
            modeStyles.pill,
            { borderColor: `${tc.accent}40` },
            edenMode === 'spice' && { backgroundColor: `${tc.accent}30`, borderColor: tc.accent },
          ]}
        >
          <Text style={[modeStyles.pillText, { fontFamily: monoFont, color: edenMode === 'spice' ? tc.cream : tc.textDim }]}>
            🌶️ Spice
          </Text>
        </Pressable>
      </View>
      <View style={[settingsStyles.divider, { backgroundColor: `${tc.accent}33` }]} />
      <View style={settingsStyles.row}>
        <View style={settingsStyles.textCol}>
          <Text style={[settingsStyles.label, { fontFamily: titleFont, color: tc.cream }]}>Hide Eden</Text>
          <Text style={[settingsStyles.desc, { fontFamily: monoFont, color: tc.textDim }]}>
            Removes Eden&apos;s panel entirely. She&apos;ll still appear to warn you before a ban.
          </Text>
        </View>
        <Switch
          value={isHidden}
          onValueChange={setHidden}
          trackColor={{ false: 'rgba(255,255,255,0.1)', true: `${tc.accent}80` }}
          thumbColor={isHidden ? tc.rose : 'rgba(255,255,255,0.4)'}
        />
      </View>
      <View style={[settingsStyles.divider, { backgroundColor: `${tc.accent}33` }]} />

      {themeShopEnabled && (
        <Pressable
          onPress={onThemesPress}
          style={({ pressed }) => [
            settingsStyles.themesBtn,
            { borderColor: `${tc.accent}40`, backgroundColor: `${tc.accent}0d` },
            pressed && { opacity: 0.75 },
          ]}
        >
          <Ionicons name="color-palette-outline" size={15} color={tc.rose} />
          <Text style={[settingsStyles.themesLabel, { fontFamily: titleFont, color: tc.cream }]}>Themes & Shop</Text>
          <Ionicons name="chevron-forward" size={13} color={tc.textDim} />
        </Pressable>
      )}

      <View style={[settingsStyles.divider, { backgroundColor: `${tc.accent}33` }]} />

      <View style={settingsStyles.donationSection}>
        <Text style={[settingsStyles.donationMsg, { fontFamily: monoFont }]}>
          EdenMux was created by a broke single mother of four, if anyone could use a coffee it&apos;s her. :p Want to buy her a coffee?
        </Text>
        <Pressable
          onPress={() => Linking.openURL('https://cash.app/$OblivionHappier58137')}
          style={({ pressed }) => [
            settingsStyles.donationBar,
            { backgroundColor: `${tc.accent}0d`, borderColor: `${tc.accent}33` },
            pressed && { opacity: 0.7 },
          ]}
        >
          <Ionicons name="cafe-outline" size={15} color={`${tc.accent}99`} />
          <Text style={[settingsStyles.donationAmount, { fontFamily: monoFont }]}>$0.00 USD</Text>
          <Ionicons name="arrow-forward" size={13} color={`${tc.accent}80`} />
        </Pressable>
      </View>

      <View style={[settingsStyles.divider, { backgroundColor: `${tc.accent}22` }]} />

      <Pressable
        onPress={() => Linking.openURL('mailto:oblivionhappier@icloud.com?subject=EdenMux%20Prayer&body=Hey%2C%20I%20need%20your%20help%20with%20something%20in%20EdenMux...')}
        style={({ pressed }) => [
          settingsStyles.themesBtn,
          { borderColor: `${tc.accent}40`, backgroundColor: `${tc.accent}0d` },
          pressed && { opacity: 0.75 },
        ]}
      >
        <Ionicons name="mail-outline" size={15} color={tc.rose} />
        <Text style={[settingsStyles.themesLabel, { fontFamily: titleFont, color: tc.cream }]}>Contact Developer</Text>
        <Ionicons name="chevron-forward" size={13} color={tc.textDim} />
      </Pressable>

      <Pressable
        onPress={onRestore}
        style={({ pressed }) => [
          settingsStyles.themesBtn,
          { borderColor: `${tc.accent}40`, backgroundColor: `${tc.accent}0d` },
          pressed && { opacity: 0.75 },
        ]}
      >
        {isRestoring ? (
          <ActivityIndicator size="small" color={tc.textDim} />
        ) : (
          <>
            <Ionicons name="refresh-outline" size={15} color={tc.textDim} />
            <Text style={[settingsStyles.themesLabel, { fontFamily: titleFont, color: tc.textDim }]}>Restore Purchases</Text>
          </>
        )}
      </Pressable>

      {!user?._p && (
        <>
          <View style={[settingsStyles.divider, { backgroundColor: `${tc.accent}22` }]} />
          <View style={settingsStyles.codeSection}>
            <View style={settingsStyles.codeRow}>
              <TextInput
                style={[settingsStyles.codeInput, { fontFamily: monoFont, color: tc.cream, borderColor: `${tc.accent}33` }]}
                value={codeInput}
                onChangeText={t => { setCodeInput(t); setCodeStatus('idle'); }}
                placeholder="Invite code"
                placeholderTextColor={`${tc.mauve}55`}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!codeLoading && codeStatus !== 'ok'}
              />
              <Pressable
                onPress={handleRedeem}
                disabled={!codeInput.trim() || codeLoading || codeStatus === 'ok'}
                style={({ pressed }) => [
                  settingsStyles.codeBtn,
                  { backgroundColor: `${tc.accent}22`, borderColor: `${tc.accent}44` },
                  pressed && { opacity: 0.7 },
                ]}
              >
                {codeLoading
                  ? <ActivityIndicator size="small" color={tc.rose} />
                  : <Ionicons name={codeStatus === 'ok' ? 'checkmark' : 'arrow-forward'} size={14} color={codeStatus === 'ok' ? tc.success : tc.rose} />
                }
              </Pressable>
            </View>
            {codeStatus === 'fail' && (
              <Text style={[settingsStyles.codeMsg, { fontFamily: monoFont, color: tc.error }]}>That code isn&apos;t right.</Text>
            )}
            {codeStatus === 'ok' && (
              <Text style={[settingsStyles.codeMsg, { fontFamily: monoFont, color: tc.success }]}>Welcome to the garden. ✦</Text>
            )}
          </View>
        </>
      )}

      <View style={[settingsStyles.divider, { backgroundColor: `${tc.accent}15`, marginTop: 12 }]} />
      <View style={settingsStyles.buildRow}>
        <Text style={[settingsStyles.buildLabel, { fontFamily: monoFont, color: `${tc.textMuted}99` }]}>
          build {updateId}
        </Text>
        {updateStatus === 'ready' ? (
          <Pressable onPress={handleApplyUpdate} style={[settingsStyles.updatePill, { borderColor: `${tc.success}60`, backgroundColor: `${tc.success}15` }]}>
            <Text style={[settingsStyles.updatePillText, { fontFamily: monoFont, color: tc.success }]}>restart to apply</Text>
          </Pressable>
        ) : updateStatus === 'available' || updateStatus === 'downloading' ? (
          <View style={[settingsStyles.updatePill, { borderColor: `${tc.accent}40` }]}>
            <ActivityIndicator size="small" color={tc.accent} style={{ transform: [{ scale: 0.65 }] }} />
            <Text style={[settingsStyles.updatePillText, { fontFamily: monoFont, color: tc.textDim }]}>downloading…</Text>
          </View>
        ) : updateStatus === 'checking' ? (
          <View style={[settingsStyles.updatePill, { borderColor: `${tc.accent}30` }]}>
            <ActivityIndicator size="small" color={tc.textDim} style={{ transform: [{ scale: 0.65 }] }} />
            <Text style={[settingsStyles.updatePillText, { fontFamily: monoFont, color: tc.textDim }]}>checking…</Text>
          </View>
        ) : updateStatus === 'current' ? (
          <View style={[settingsStyles.updatePill, { borderColor: `${tc.success}40` }]}>
            <Text style={[settingsStyles.updatePillText, { fontFamily: monoFont, color: `${tc.success}cc` }]}>up to date</Text>
          </View>
        ) : updateStatus === 'error' ? (
          <Pressable onPress={handleCheckUpdate} style={[settingsStyles.updatePill, { borderColor: `${tc.error}40` }]}>
            <Text style={[settingsStyles.updatePillText, { fontFamily: monoFont, color: `${tc.error}cc` }]}>retry</Text>
          </Pressable>
        ) : (
          <Pressable onPress={handleCheckUpdate} style={[settingsStyles.updatePill, { borderColor: `${tc.accent}30` }]}>
            <Text style={[settingsStyles.updatePillText, { fontFamily: monoFont, color: `${tc.textMuted}99` }]}>check for update</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

export default function EdenPanel() {
  const {
    messages, isOpen, isThinking, toggleEden, closeEden, sendMessage,
    edenMode, isHidden, isAutoSpeak,
    setEdenMode, setHidden, setAutoSpeak,
    pendingGreeting, clearPendingGreeting,
    isAtDailyLimit, dailyCount, setCoreUnlocked,
  } = useEden();
  const { theme, unlockThemes } = useTheme();
  const tc = useTerminalColors();
  const { config } = useAppConfig();
  const { user } = useAuth();
  const { hasCoreUnlock, unlockedThemeIds, restore } = useSubscription();
  const hasCoreAccess = hasCoreUnlock || !!user?._p;

  useEffect(() => {
    setCoreUnlocked(hasCoreAccess);
  }, [hasCoreAccess, setCoreUnlocked]);

  const { unlockedThemes } = useTheme();
  useEffect(() => {
    const toAdd = unlockedThemeIds.filter(id => !unlockedThemes.includes(id));
    if (toAdd.length > 0) unlockThemes(unlockedThemeIds);
  }, [unlockedThemeIds, unlockedThemes, unlockThemes]);

  const [input, setInput] = useState('');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLoadingVoice, setIsLoadingVoice] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showThemes, setShowThemes] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [volume, setVolume] = useState(1.0);
  const volumeRef = useRef(1.0);
  const scrollRef = useRef<ScrollView>(null);
  const expandAnim = useRef(new Animated.Value(0)).current;
  const soundRef = useRef<Audio.Sound | null>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const autoSpeakRef = useRef(false);
  const wasThinkingRef = useRef(false);
  const messagesRef = useRef(messages);
  const isAutoSpeakRef = useRef(isAutoSpeak);
  const lastEdenMsgIdRef = useRef<string | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const insets = useSafeAreaInsets();
  const keyboardY = useRef(new Animated.Value(0)).current;
  const speakTextRef = useRef<(text: string) => Promise<void>>(async () => {});

  useEffect(() => {
    Animated.spring(expandAnim, {
      toValue: isOpen ? 1 : 0,
      useNativeDriver: false,
      tension: 80,
      friction: 10,
    }).start();
  }, [isOpen, expandAnim]);

  useEffect(() => {
    if (isOpen) setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }, [messages.length, isOpen]);

  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { isAutoSpeakRef.current = isAutoSpeak; }, [isAutoSpeak]);
  useEffect(() => {
    volumeRef.current = volume;
    soundRef.current?.setVolumeAsync(volume).catch(() => {});
  }, [volume]);

  useEffect(() => { return () => { soundRef.current?.unloadAsync(); recordingRef.current?.stopAndUnloadAsync(); }; }, []);

  useEffect(() => {
    if (isRecording) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 0.3, duration: 700, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.stopAnimation();
      Animated.timing(pulseAnim, { toValue: 1, duration: 150, useNativeDriver: true }).start();
    }
  }, [isRecording, pulseAnim]);

  useEffect(() => {
    if (wasThinkingRef.current && !isThinking) {
      const shouldSpeak = autoSpeakRef.current || isAutoSpeakRef.current;
      autoSpeakRef.current = false;
      if (shouldSpeak && hasCoreAccess) {
        const lastEden = messagesRef.current.slice().reverse().find(m => m.role === 'eden');
        if (lastEden) {
          lastEdenMsgIdRef.current = lastEden.id;
          setTimeout(() => {
            const text = lastEden.content;
            if (text) void speakTextRef.current(text);
          }, 300);
        }
      }
    }
    wasThinkingRef.current = isThinking;
  }, [isThinking, hasCoreAccess]);

  useEffect(() => {
    const lastEden = messages.slice().reverse().find(m => m.role === 'eden');
    if (!lastEden || lastEden.id === lastEdenMsgIdRef.current) return;
    if (isThinking) return;
    lastEdenMsgIdRef.current = lastEden.id;
    if (pendingGreeting) return;
    if (hasCoreAccess && isAutoSpeakRef.current && config.features.voiceInput) {
      setTimeout(() => {
        if (lastEden.content) void speakTextRef.current(lastEden.content);
      }, 400);
    }
  }, [messages, isThinking, pendingGreeting, hasCoreAccess, config.features.voiceInput]);

  useEffect(() => {
    if (!pendingGreeting) return;
    const timer = setTimeout(() => {
      if (hasCoreAccess && isAutoSpeakRef.current && config.features.voiceInput) void speakTextRef.current(pendingGreeting);
      clearPendingGreeting();
    }, 2000);
    return () => clearTimeout(timer);
  }, [pendingGreeting, hasCoreAccess, config.features.voiceInput, clearPendingGreeting]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const onShow = Keyboard.addListener(showEvent, (e) => {
      Animated.timing(keyboardY, {
        toValue: -e.endCoordinates.height,
        duration: Platform.OS === 'ios' ? e.duration || 220 : 180,
        useNativeDriver: true,
      }).start();
    });
    const onHide = Keyboard.addListener(hideEvent, () => {
      Animated.timing(keyboardY, { toValue: 0, duration: 180, useNativeDriver: true }).start();
    });
    return () => { onShow.remove(); onHide.remove(); };
  }, [keyboardY]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text) return;
    if (isAtDailyLimit) { setShowPaywall(true); return; }
    setInput('');
    setShowSettings(false);
    await sendMessage(text);
  };

  const handleRestore = async () => {
    try {
      const info = await restore();
      const active = info.entitlements.active ?? {};
      const hasCoreNow = 'core_unlock' in active;
      if (hasCoreNow) setCoreUnlocked(true);
    } catch {}
  };

  const handleToggle = () => { toggleEden(); if (showSettings) setShowSettings(false); };

  const stopSpeaking = async () => {
    try {
      if (soundRef.current) {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }
    } catch {}
    setIsSpeaking(false);
  };

  const speakText = async (text: string) => {
    if (!text) return;
    if (isSpeaking) await stopSpeaking();
    setIsLoadingVoice(true);
    try {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true, staysActiveInBackground: false });
      const url = new URL('/api/eden/speak', getApiUrl()).toString();
      const speakHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
      if (user?.token) speakHeaders['Authorization'] = `Bearer ${user.token}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: speakHeaders,
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error('Voice request failed');
      const buffer = await res.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = '';
      const chunkSize = 8192;
      for (let i = 0; i < bytes.length; i += chunkSize) binary += String.fromCharCode(...Array.from(bytes.subarray(i, i + chunkSize)));
      const base64 = btoa(binary);
      const tempUri = (FileSystem.cacheDirectory ?? '') + 'eden_voice.mp3';
      await FileSystem.writeAsStringAsync(tempUri, base64, { encoding: FileSystem.EncodingType.Base64 });
      const { sound } = await Audio.Sound.createAsync({ uri: tempUri }, { shouldPlay: true, volume: volumeRef.current });
      soundRef.current = sound;
      setIsSpeaking(true);
      sound.setOnPlaybackStatusUpdate((status) => {
        if (!status.isLoaded) return;
        if (status.didJustFinish) { sound.unloadAsync(); soundRef.current = null; setIsSpeaking(false); }
      });
    } catch { setIsSpeaking(false); }
    finally { setIsLoadingVoice(false); }
  };

  const handleSpeak = async () => {
    const lastEden = [...messages].reverse().find(m => m.role === 'eden');
    if (!lastEden) return;
    if (isSpeaking) { await stopSpeaking(); return; }
    await speakText(lastEden.content);
  };

  useEffect(() => {
    speakTextRef.current = speakText;
  });

  const handleMicPress = async () => {
    if (isTranscribing) return;
    if (isRecording) {
      try {
        await recordingRef.current?.stopAndUnloadAsync();
        const uri = recordingRef.current?.getURI();
        recordingRef.current = null;
        setIsRecording(false);
        if (!uri) return;
        setIsTranscribing(true);
        const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
        const url = new URL('/api/eden/transcribe', getApiUrl()).toString();
        const transcribeHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
        if (user?.token) transcribeHeaders['Authorization'] = `Bearer ${user.token}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: transcribeHeaders,
          body: JSON.stringify({ audio: base64 }),
        });
        const data = await res.json();
        const transcribed = (data.text || '').trim();
        if (transcribed) {
          autoSpeakRef.current = true;
          wasThinkingRef.current = false;
          await sendMessage(transcribed);
        }
      } catch {
        console.error('Mic stop failed.');
      } finally {
        setIsTranscribing(false);
      }
    } else {
      try {
        const { status } = await Audio.requestPermissionsAsync();
        if (status !== 'granted') return;
        if (!isAutoSpeakRef.current) {
          setAutoSpeak(true);
        }
        await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
        const { recording } = await Audio.Recording.createAsync(
          Audio.RecordingOptionsPresets.HIGH_QUALITY
        );
        recordingRef.current = recording;
        setIsRecording(true);
      } catch {
        console.error('Mic start failed.');
      }
    }
  };

  const handleVolumeChange = useCallback((v: number) => {
    setVolume(v);
  }, []);

  const settingsHeight = 580;
  const chatHeight = 460;
  const panelWidth = expandAnim.interpolate({ inputRange: [0, 1], outputRange: [52, 300] });
  const panelHeight = expandAnim.interpolate({ inputRange: [0, 1], outputRange: [52, showSettings ? settingsHeight : chatHeight] });
  const panelRadius = expandAnim.interpolate({ inputRange: [0, 1], outputRange: [26, 16] });
  const headerOpacity = expandAnim.interpolate({ inputRange: [0.6, 1], outputRange: [0, 1] });
  const avatarScale = expandAnim.interpolate({ inputRange: [0, 0.5], outputRange: [1, 0], extrapolate: 'clamp' });
  const topOffset = Platform.OS === 'web' ? 67 + insets.top + 50 : insets.top + 50;

  return (
    <>
      <Animated.View style={[
        styles.outerContainer,
        { top: topOffset, right: 10, transform: [{ translateY: keyboardY }] },
      ]}>
      <Animated.View style={[
        styles.container,
        { width: panelWidth, height: panelHeight, borderRadius: panelRadius, shadowColor: tc.accent },
      ]}>
        <Image source={theme.edenPortrait} style={styles.bgImage} resizeMode="cover" />
        <View style={styles.bgOverlay} />

        <Pressable onPress={handleToggle} style={styles.avatarBtn} pointerEvents={isOpen ? 'none' : 'auto'}>
          <Animated.View style={{ opacity: avatarScale }}>
            <View style={[styles.avatarCircle, { borderColor: isHidden ? `${tc.accent}33` : `${tc.accent}99`, opacity: isHidden ? 0.45 : 1 }]}>
              <Image source={theme.edenPortrait} style={styles.avatarImg} />
              <View style={[styles.avatarGlow, { borderColor: `${tc.accent}4d` }]} />
            </View>
          </Animated.View>
        </Pressable>

        <Animated.View pointerEvents={isOpen ? 'auto' : 'none'} style={[styles.panelContent, { opacity: headerOpacity }]}>
          <View style={[styles.panelHeader, { borderBottomColor: `${tc.accent}40` }]}>
            <View style={styles.headerLeft}>
              <View style={[styles.headerDot, { backgroundColor: tc.rose }]} />
              <Text style={[styles.headerTitle, { fontFamily: titleFont, color: tc.cream }]}>Eden</Text>
            </View>
            <View style={styles.headerActions}>
              <Pressable
                onPress={hasCoreAccess ? handleSpeak : () => setShowPaywall(true)}
                style={styles.headerBtn}
                hitSlop={6}
                disabled={hasCoreAccess && isLoadingVoice}
              >
                {isLoadingVoice
                  ? <ActivityIndicator size="small" color={tc.rose} />
                  : <Ionicons
                      name={hasCoreAccess ? (isSpeaking ? 'volume-high' : 'volume-medium-outline') : 'lock-closed-outline'}
                      size={16}
                      color={hasCoreAccess && isSpeaking ? tc.rose : tc.textDim}
                    />
                }
              </Pressable>
              <Pressable testID="eden-settings" onPress={() => setShowSettings(s => !s)} style={styles.headerBtn} hitSlop={6}>
                <Ionicons name={showSettings ? 'close-circle-outline' : 'settings-outline'} size={15} color={showSettings ? tc.rose : tc.textDim} />
              </Pressable>
              <Pressable onPress={closeEden} style={styles.headerBtn} hitSlop={6}>
                <Ionicons name="chevron-down" size={16} color={tc.textDim} />
              </Pressable>
            </View>
          </View>

          {!showSettings && (
            <View style={[modeBarStyles.bar, { borderBottomColor: `${tc.accent}33` }]}>
              <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                <Pressable
                  onPress={hasCoreAccess ? () => setAutoSpeak(true) : () => setShowPaywall(true)}
                  style={({ pressed }) => [
                    modeBarStyles.modeBtn,
                    hasCoreAccess && isAutoSpeak && { backgroundColor: `${tc.rose}22`, borderColor: `${tc.rose}66` },
                    (!hasCoreAccess || !isAutoSpeak) && { borderColor: `${tc.accent}33` },
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  {hasCoreAccess
                    ? <Ionicons name="volume-high" size={12} color={isAutoSpeak ? tc.rose : tc.textDim} />
                    : <Ionicons name="lock-closed-outline" size={12} color={tc.textMuted} />
                  }
                  <Text style={[modeBarStyles.modeBtnText, { fontFamily: monoFont, color: hasCoreAccess && isAutoSpeak ? tc.rose : tc.textDim }]}>Speak</Text>
                </Pressable>
                <Pressable
                  onPress={() => { if (hasCoreAccess) { setAutoSpeak(false); stopSpeaking(); } }}
                  style={({ pressed }) => [
                    modeBarStyles.modeBtn,
                    (!hasCoreAccess || !isAutoSpeak) && { backgroundColor: `${tc.accent}1a`, borderColor: `${tc.accent}55` },
                    hasCoreAccess && isAutoSpeak && { borderColor: `${tc.accent}33` },
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <Ionicons name="chatbubble-ellipses-outline" size={12} color={!hasCoreAccess || !isAutoSpeak ? tc.cream : tc.textDim} />
                  <Text style={[modeBarStyles.modeBtnText, { fontFamily: monoFont, color: !hasCoreAccess || !isAutoSpeak ? tc.cream : tc.textDim }]}>Type</Text>
                </Pressable>
              </View>
              {hasCoreAccess && isAutoSpeak && (
                <View style={modeBarStyles.sliderRow}>
                  <Ionicons name="volume-low" size={11} color={tc.textDim} />
                  <VolumeSlider volume={volume} onChange={handleVolumeChange} rose={tc.rose} />
                  <Ionicons name="volume-high" size={11} color={tc.textDim} />
                </View>
              )}
            </View>
          )}

          {showSettings ? (
            <SettingsDrawer
              edenMode={edenMode}
              isHidden={isHidden}
              isAutoSpeak={isAutoSpeak}
              setEdenMode={setEdenMode}
              setHidden={setHidden}
              setAutoSpeak={setAutoSpeak}
              onThemesPress={() => setShowThemes(true)}
              themeShopEnabled={config.features.themeShop}
              onRestore={handleRestore}
              hasCoreAccess={hasCoreAccess}
              onVoiceLocked={() => setShowPaywall(true)}
            />
          ) : (
            <>
              <ScrollView
                ref={scrollRef}
                style={styles.chatArea}
                contentContainerStyle={styles.chatContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                {messages.map(msg => (
                  <EdenBubble key={msg.id} msg={msg} accent={tc.accent} cream={tc.cream} textDim={tc.textDim} />
                ))}
                {isThinking && <ThinkingDots accent={tc.accent} />}
              </ScrollView>

              {isAtDailyLimit && (
                <Pressable
                  onPress={() => setShowPaywall(true)}
                  style={[styles.limitBanner, { backgroundColor: `${tc.accent}18`, borderColor: `${tc.accent}44` }]}
                >
                  <Ionicons name="lock-closed-outline" size={12} color={tc.accent} />
                  <Text style={[styles.limitBannerText, { fontFamily: monoFont, color: tc.accent }]}>
                    {`Daily limit reached (${dailyCount}/15) — Unlock Core for unlimited`}
                  </Text>
                  <Ionicons name="chevron-forward" size={12} color={tc.accent} />
                </Pressable>
              )}
              <View style={[styles.inputRow, { borderTopColor: `${tc.accent}33` }]}>
                {config.features.voiceInput && (
                  <Pressable
                    onPress={hasCoreAccess ? handleMicPress : () => setShowPaywall(true)}
                    disabled={hasCoreAccess && isTranscribing}
                    style={({ pressed }) => [
                      styles.micBtn,
                      {
                        backgroundColor: isRecording ? `${tc.rose}22` : `${tc.accent}1a`,
                        borderColor: isRecording ? `${tc.rose}99` : hasCoreAccess ? `${tc.accent}4d` : `${tc.accent}22`,
                      },
                      pressed && { opacity: 0.7 },
                    ]}
                  >
                    {!hasCoreAccess
                      ? <Ionicons name="lock-closed-outline" size={13} color={tc.textMuted} />
                      : isTranscribing
                        ? <ActivityIndicator size="small" color={tc.rose} />
                        : <Animated.View style={{ opacity: pulseAnim }}>
                            <Ionicons
                              name={isRecording ? 'mic' : 'mic-outline'}
                              size={15}
                              color={isRecording ? tc.rose : tc.textDim}
                            />
                          </Animated.View>
                    }
                  </Pressable>
                )}
                {config.features.voiceInput && (
                  <Pressable
                    onPress={hasCoreAccess ? stopSpeaking : () => setShowPaywall(true)}
                    disabled={hasCoreAccess && !isSpeaking && !isLoadingVoice}
                    style={({ pressed }) => [
                      styles.micBtn,
                      {
                        backgroundColor: isSpeaking ? `${tc.rose}22` : `${tc.accent}0d`,
                        borderColor: isSpeaking ? `${tc.rose}80` : `${tc.accent}2a`,
                      },
                      pressed && { opacity: 0.7 },
                    ]}
                  >
                    {isLoadingVoice
                      ? <ActivityIndicator size="small" color={tc.rose} />
                      : <Ionicons
                          name={hasCoreAccess ? 'volume-mute' : 'lock-closed-outline'}
                          size={14}
                          color={hasCoreAccess && isSpeaking ? tc.rose : tc.textMuted}
                        />
                    }
                  </Pressable>
                )}
                <TextInput
                  testID="eden-input"
                  style={[styles.input, { fontFamily: monoFont, color: tc.text, borderColor: `${tc.accent}33` }]}
                  value={input}
                  onChangeText={setInput}
                  placeholder={isRecording ? 'Listening...' : 'Ask Eden...'}
                  placeholderTextColor={isRecording ? `${tc.rose}99` : `${tc.mauve}80`}
                  onSubmitEditing={handleSend}
                  returnKeyType="send"
                  blurOnSubmit={false}
                  multiline={false}
                  editable={!isRecording && !isTranscribing}
                />
                <Pressable
                  testID="eden-send"
                  onPress={handleSend}
                  style={({ pressed }) => [
                    styles.sendBtn,
                    { backgroundColor: `${tc.accent}1a`, borderColor: `${tc.accent}4d` },
                    pressed && { backgroundColor: `${tc.accent}40` },
                  ]}
                  disabled={!input.trim() || isThinking || isRecording}
                >
                  {isThinking
                    ? <ActivityIndicator size="small" color={tc.rose} />
                    : <Ionicons name="arrow-up" size={16} color={input.trim() && !isRecording ? tc.rose : tc.textMuted} />
                  }
                </Pressable>
              </View>
            </>
          )}
        </Animated.View>
      </Animated.View>
      </Animated.View>

      <ThemeShop visible={showThemes} onClose={() => setShowThemes(false)} />
      <PaywallModal
        visible={showPaywall}
        onClose={() => setShowPaywall(false)}
        onCoreUnlocked={() => { setCoreUnlocked(true); setShowPaywall(false); }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    position: 'absolute', zIndex: 100, elevation: 10,
  },
  container: {
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 12,
  },
  bgImage: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' },
  bgOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15,8,12,0.78)' },
  avatarBtn: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  avatarCircle: { width: 46, height: 46, borderRadius: 23, overflow: 'hidden', borderWidth: 1.5 },
  avatarImg: { width: '100%', height: '100%' },
  avatarGlow: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 23, borderWidth: 1 },
  panelContent: { flex: 1 },
  panelHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerDot: { width: 6, height: 6, borderRadius: 3 },
  headerTitle: { fontSize: 14, letterSpacing: 1.5 },
  headerActions: { flexDirection: 'row', gap: 4 },
  headerBtn: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  chatArea: { flex: 1 },
  chatContent: { paddingHorizontal: 10, paddingVertical: 8, gap: 6 },
  inputRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, gap: 6 },
  input: { flex: 1, minHeight: 42, backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, borderWidth: StyleSheet.hairlineWidth },
  sendBtn: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },
  micBtn: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },
  limitBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderTopWidth: StyleSheet.hairlineWidth },
  limitBannerText: { flex: 1, fontSize: 10, letterSpacing: 0.3 },
});

const bubbleStyles = StyleSheet.create({
  row: { flexDirection: 'row', marginBottom: 4 },
  rowEden: { justifyContent: 'flex-start' },
  rowUser: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '85%', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 7, borderWidth: StyleSheet.hairlineWidth },
  bubbleEden: { borderBottomLeftRadius: 4 },
  bubbleUser: { borderBottomRightRadius: 4 },
  text: { fontSize: 11, lineHeight: 16 },
  dot: { width: 5, height: 5, borderRadius: 2.5 },
});

const modeBarStyles = StyleSheet.create({
  bar: {
    paddingHorizontal: 10, paddingVertical: 7,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 6,
  },
  topRow: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  modeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderWidth: 1, borderRadius: 20,
    paddingVertical: 4, paddingHorizontal: 10,
  },
  modeBtnText: { fontSize: 10, letterSpacing: 0.6 },
  sliderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 4, paddingHorizontal: 2 },
});

const modeStyles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, paddingBottom: 10, paddingHorizontal: 2 },
  pill: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 8, borderRadius: 10, borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  pillText: { fontSize: 12, letterSpacing: 0.5 },
});

const settingsStyles = StyleSheet.create({
  drawer: { flex: 1, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingVertical: 10 },
  textCol: { flex: 1 },
  label: { fontSize: 12, letterSpacing: 0.8, marginBottom: 4 },
  desc: { fontSize: 10, lineHeight: 14 },
  divider: { height: StyleSheet.hairlineWidth },
  themesBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12, marginVertical: 10 },
  themesLabel: { flex: 1, fontSize: 12, letterSpacing: 0.8 },
  donationSection: { paddingTop: 10, gap: 8, alignItems: 'center' },
  donationMsg: { fontSize: 10, color: 'rgba(255,255,255,0.35)', textAlign: 'center', lineHeight: 15, fontStyle: 'italic' },
  donationBar: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14, width: '100%' },
  donationAmount: { flex: 1, fontSize: 12, color: 'rgba(255,255,255,0.3)' },
  codeSection: { paddingTop: 8, gap: 4 },
  codeRow: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  codeInput: { flex: 1, height: 30, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: StyleSheet.hairlineWidth, borderRadius: 8, paddingHorizontal: 10, fontSize: 11 },
  codeBtn: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },
  codeMsg: { fontSize: 10, paddingLeft: 2 },
  buildRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 10, paddingBottom: 4 },
  buildLabel: { fontSize: 9, letterSpacing: 0.5 },
  updatePill: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: StyleSheet.hairlineWidth, borderRadius: 6, paddingVertical: 3, paddingHorizontal: 7 },
  updatePillText: { fontSize: 9, letterSpacing: 0.3 },
});
