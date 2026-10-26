import React, { useRef, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable,
  Dimensions, Alert, Platform, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { captureRef } from 'react-native-view-shot';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';

// ─── Target dimensions ────────────────────────────────────────────────────────
// iPhone 14 Pro Max / 15 Pro Max logical size @ 3x = 1290×2796px (App Store 6.7")
const CAPTURE_W = 430;
const CAPTURE_H = 932;
const { width: SCREEN_W } = Dimensions.get('window');
const SCALE = SCREEN_W / CAPTURE_W;
const PREVIEW_H = Math.round(CAPTURE_H * SCALE);

// ─── Shared fonts ─────────────────────────────────────────────────────────────
const MONO = 'JetBrainsMono_400Regular';
const MONO_BOLD = 'JetBrainsMono_700Bold';
const TITLE_FONT = 'Cinzel_700Bold';

// ─── Colour palettes per scene ────────────────────────────────────────────────
const PALETTES = {
  redDelicious: {
    bg: '#1a1015', bgSec: '#241a1f', accent: '#c94060',
    prompt: '#e8607a', output: '#d8c8d0', text: '#f0e4e8',
    textDim: '#9a8890', success: '#90c8a0', error: '#e85050',
    warning: '#e8c878', border: '#3a2830', info: '#b0a0c0',
    tabBar: '#1e1318', tabActive: '#c94060', tabInactive: '#5a4a52',
    surface: '#1e1318',
  },
  cyber: {
    bg: '#14102a', bgSec: '#1c1638', accent: '#b44fde',
    prompt: '#00ffcc', output: '#cc88ff', text: '#e8e0ff',
    textDim: '#9988cc', success: '#00ff9f', error: '#ff2d78',
    warning: '#ffcc00', border: '#362458', info: '#00d4ff',
    tabBar: '#0e0c20', tabActive: '#b44fde', tabInactive: '#332255',
    surface: '#181230',
  },
  neo: {
    bg: '#000800', bgSec: '#001000', accent: '#00ff41',
    prompt: '#39ff14', output: '#00cc33', text: '#c8ffc8',
    textDim: '#66aa66', success: '#00ff41', error: '#ff4444',
    warning: '#ffff00', border: '#004410', info: '#00aaff',
    tabBar: '#000800', tabActive: '#00ff41', tabInactive: '#1a4420',
    surface: '#000c00',
  },
  gothic: {
    bg: '#020108', bgSec: '#070318', accent: '#cc0022',
    prompt: '#d4a000', output: '#c8a830', text: '#e8e0f8',
    textDim: '#8878b8', success: '#6699cc', error: '#ff1133',
    warning: '#cc8800', border: '#220a44', info: '#6644aa',
    tabBar: '#050210', tabActive: '#cc0022', tabInactive: '#220a44',
    surface: '#050210',
  },
  candy: {
    bg: '#1a0818', bgSec: '#220e22', accent: '#ff6eb4',
    prompt: '#ff6eb4', output: '#ffccee', text: '#fff0f8',
    textDim: '#e0b8d0', success: '#a8e6cf', error: '#ff4488',
    warning: '#ffb347', border: '#4a1a40', info: '#d4a0ff',
    tabBar: '#1e0a1e', tabActive: '#ff6eb4', tabInactive: '#6a3060',
    surface: '#1e0a1e',
  },
};

// ─── Reusable mini-components ─────────────────────────────────────────────────

type Palette = typeof PALETTES.redDelicious;

function TerminalLine({ prompt, command, palette }: { prompt?: boolean; command?: string; palette: Palette }) {
  return (
    <View style={ss.termLine}>
      {prompt !== false && (
        <Text style={[ss.termPrompt, { color: palette.prompt, fontFamily: MONO_BOLD }]}>~ $ </Text>
      )}
      {command ? (
        <Text style={[ss.termCmd, { color: palette.text, fontFamily: MONO }]}>{command}</Text>
      ) : null}
    </View>
  );
}

function TerminalOutput({ text, color, palette }: { text: string; color?: string; palette: Palette }) {
  return (
    <Text style={[ss.termOut, { color: color ?? palette.output, fontFamily: MONO }]}>
      {text}
    </Text>
  );
}

function SceneHeader({ title, cwd, palette }: { title: string; cwd: string; palette: Palette }) {
  return (
    <View style={[ss.header, { backgroundColor: palette.bg, borderBottomColor: palette.border }]}>
      <View style={ss.headerLeft}>
        <View style={[ss.dot, { backgroundColor: palette.accent }]} />
        <Text style={[ss.headerTitle, { fontFamily: TITLE_FONT, color: palette.text }]}>{title}</Text>
      </View>
      <Text style={[ss.cwd, { fontFamily: MONO, color: palette.textDim }]}>{cwd}</Text>
    </View>
  );
}

function TabBar({ tabs, activeIdx, palette }: { tabs: string[]; activeIdx: number; palette: Palette }) {
  return (
    <View style={[ss.tabBar, { backgroundColor: palette.tabBar, borderBottomColor: palette.border }]}>
      {tabs.map((t, i) => (
        <View
          key={t}
          style={[ss.tab, i === activeIdx && { borderBottomColor: palette.tabActive, borderBottomWidth: 2 }]}
        >
          <Text style={[ss.tabText, { fontFamily: MONO, color: i === activeIdx ? palette.tabActive : palette.tabInactive }]}>
            {t}
          </Text>
        </View>
      ))}
    </View>
  );
}

function InputBar({ palette }: { palette: Palette }) {
  return (
    <View style={[ss.inputBar, { backgroundColor: palette.bgSec, borderTopColor: palette.border }]}>
      <Text style={[ss.inputPrompt, { color: palette.prompt, fontFamily: MONO_BOLD }]}>~ $ </Text>
      <View style={[ss.inputCursor, { backgroundColor: palette.prompt }]} />
    </View>
  );
}

// ─── Scene 1: Terminal in action (Red Delicious) ──────────────────────────────
function Scene1({ palette }: { palette: Palette }) {
  return (
    <View style={[ss.scene, { backgroundColor: palette.bg }]}>
      <SceneHeader title="EdenMux" cwd="~/projects" palette={palette} />
      <TabBar tabs={['main', 'session 2']} activeIdx={0} palette={palette} />
      <ScrollView style={{ flex: 1 }} scrollEnabled={false}>
        <View style={ss.termBody}>
          <TerminalLine command="ls -la ~/storage" palette={palette} />
          <TerminalOutput text="total 48" palette={palette} />
          <TerminalOutput text="drwxr-xr-x  8 user  staff   256 Apr 18 09:14 ." palette={palette} />
          <TerminalOutput text="drwxr-xr-x  3 user  staff    96 Apr 18 09:14 .." palette={palette} />
          <TerminalOutput text="drwxr-xr-x  2 user  staff    64 Apr 18 09:14 dcim/" color={palette.success} palette={palette} />
          <TerminalOutput text="drwxr-xr-x  2 user  staff    64 Apr 18 09:14 downloads/" color={palette.info} palette={palette} />
          <TerminalOutput text="drwxr-xr-x  2 user  staff    64 Apr 18 09:14 music/" color={palette.warning} palette={palette} />
          <TerminalOutput text="drwxr-xr-x  2 user  staff    64 Apr 18 09:14 pictures/" color={palette.success} palette={palette} />
          <TerminalOutput text="drwxr-xr-x  2 user  staff    64 Apr 18 09:14 shared/" color={palette.info} palette={palette} />

          <TerminalLine command="cat ~/.profile" palette={palette} />
          <TerminalOutput text="# EdenMux shell profile" color={palette.textDim} palette={palette} />
          <TerminalOutput text='export EDITOR="nano"' palette={palette} />
          <TerminalOutput text='export PATH="$HOME/scripts:$PATH"' palette={palette} />
          <TerminalOutput text='alias ll="ls -la"' color={palette.accent} palette={palette} />
          <TerminalOutput text='alias ..="cd .."' color={palette.accent} palette={palette} />

          <TerminalLine command="echo $SHELL" palette={palette} />
          <TerminalOutput text="/bin/bash" palette={palette} />

          <TerminalLine command="date" palette={palette} />
          <TerminalOutput text="Fri Apr 18 09:14:22 EDT 2026" color={palette.success} palette={palette} />

          <TerminalLine command="whoami" palette={palette} />
          <TerminalOutput text="eden" color={palette.accent} palette={palette} />

          <TerminalLine command="uname -a" palette={palette} />
          <TerminalOutput text="Darwin EdenMux 24.0.0 Darwin Kernel Apr 2026" palette={palette} />

          <TerminalLine command="cowsay 'Welcome to EdenMux!'" palette={palette} />
          <TerminalOutput text=" ___________________" palette={palette} />
          <TerminalOutput text="< Welcome to EdenMux! >" palette={palette} />
          <TerminalOutput text=" -------------------" palette={palette} />
          <TerminalOutput text="        \\   ^__^" palette={palette} />
          <TerminalOutput text="         \\  (oo)\\_______" palette={palette} />
          <TerminalOutput text="            (__)\\       )\\/\\" palette={palette} />
          <TerminalOutput text="                ||----w |" palette={palette} />
          <TerminalOutput text="                ||     ||" palette={palette} />

          <TerminalLine palette={palette} />
        </View>
      </ScrollView>
      <InputBar palette={palette} />
    </View>
  );
}

// ─── Scene 2: Eden Chat ───────────────────────────────────────────────────────
function Scene2({ palette }: { palette: Palette }) {
  const bubbles = [
    { from: 'eden', text: "Hello! I'm Eden — your AI terminal guide. Ask me anything about your files, commands, or just chat." },
    { from: 'user', text: 'How do I find all .txt files in my home folder?' },
    { from: 'eden', text: "Easy! Try:\n\nfind ~ -name '*.txt'\n\nThat searches recursively from your home directory. Add -maxdepth 2 to limit it to 2 levels deep." },
    { from: 'user', text: 'What about files bigger than 1MB?' },
    { from: 'eden', text: "Use the -size flag:\n\nfind ~ -size +1M\n\nCombine with -name '*.log' to find large log files specifically. Want me to explain more flags?" },
    { from: 'user', text: 'Yes please!' },
    { from: 'eden', text: "Here are the most useful find flags:\n\n-name  match filename\n-type f  files only\n-type d  dirs only\n-mtime -7  modified this week\n-size +1M  larger than 1MB\n\nCombine them with -and or -or for power searches!" },
  ];

  return (
    <View style={[ss.scene, { backgroundColor: palette.bg }]}>
      <SceneHeader title="EdenMux" cwd="~" palette={palette} />
      <View style={[ss.edenChatHeader, { backgroundColor: palette.bgSec, borderBottomColor: palette.border }]}>
        <View style={[ss.edenAvatar, { backgroundColor: palette.accent }]}>
          <Text style={ss.edenAvatarText}>E</Text>
        </View>
        <View>
          <Text style={[ss.edenName, { color: palette.text, fontFamily: MONO_BOLD }]}>Eden</Text>
          <Text style={[ss.edenStatus, { color: palette.success, fontFamily: MONO }]}>● online · powered by Grok</Text>
        </View>
      </View>
      <ScrollView style={{ flex: 1 }} scrollEnabled={false} contentContainerStyle={ss.chatContent}>
        {bubbles.map((b, i) => (
          <View key={i} style={[ss.bubble, b.from === 'user' ? ss.bubbleUser : ss.bubbleEden]}>
            <View style={[
              ss.bubbleBg,
              {
                backgroundColor: b.from === 'user' ? palette.accent : palette.surface,
                borderColor: b.from === 'user' ? palette.accent : palette.border,
              },
            ]}>
              <Text style={[ss.bubbleText, { color: b.from === 'user' ? '#fff' : palette.text, fontFamily: MONO }]}>
                {b.text}
              </Text>
            </View>
          </View>
        ))}
      </ScrollView>
      <View style={[ss.chatInput, { backgroundColor: palette.bgSec, borderTopColor: palette.border }]}>
        <View style={[ss.chatInputInner, { borderColor: palette.border }]}>
          <Text style={[{ color: palette.textDim, fontFamily: MONO, fontSize: 12, flex: 1 }]}>Ask Eden anything…</Text>
          <View style={[ss.sendBtn, { backgroundColor: palette.accent }]}>
            <Ionicons name="arrow-up" size={14} color="#fff" />
          </View>
        </View>
      </View>
    </View>
  );
}

// ─── Scene 3: Theme Shop ──────────────────────────────────────────────────────
function Scene3({ palette }: { palette: Palette }) {
  const themes = [
    { name: 'Red Delicious', tagline: 'Dark and eternal.', price: 'Free', accent: '#c94060', bg: '#1a1015', active: true },
    { name: 'Candy', tagline: 'Dangerously cute.', price: '$0.99', accent: '#ff6eb4', bg: '#1a0818', active: false },
    { name: 'Cyber', tagline: 'Neon dreams.', price: '$0.99', accent: '#b44fde', bg: '#14102a', active: false },
    { name: 'Neo', tagline: 'Follow the rabbit.', price: '$0.99', accent: '#00ff41', bg: '#000800', active: false },
    { name: 'Gothic', tagline: 'Moonlit, fanged.', price: '$0.99', accent: '#cc0022', bg: '#020108', active: false },
  ];

  return (
    <View style={[ss.scene, { backgroundColor: palette.bg }]}>
      <SceneHeader title="EdenMux" cwd="~" palette={palette} />
      <View style={[ss.shopHeader, { borderBottomColor: palette.border }]}>
        <Text style={[ss.shopTitle, { color: palette.text, fontFamily: TITLE_FONT }]}>Theme Studio</Text>
        <Text style={[ss.shopSub, { color: palette.textDim, fontFamily: MONO }]}>Customize your terminal</Text>
      </View>
      <ScrollView scrollEnabled={false} contentContainerStyle={ss.themeGrid}>
        {themes.map((t) => (
          <View key={t.name} style={[ss.themeCard, { backgroundColor: t.bg, borderColor: t.active ? t.accent : palette.border }]}>
            <View style={[ss.themeCardAccentBar, { backgroundColor: t.accent }]} />
            <View style={ss.themeCardBody}>
              <Text style={[ss.themeCardName, { color: '#fff', fontFamily: MONO_BOLD }]}>{t.name}</Text>
              <Text style={[ss.themeCardTagline, { color: 'rgba(255,255,255,0.5)', fontFamily: MONO }]}>{t.tagline}</Text>
            </View>
            <View style={[ss.themeCardBadge, { backgroundColor: t.active ? t.accent : 'rgba(255,255,255,0.1)' }]}>
              <Text style={[ss.themeCardPrice, { color: '#fff', fontFamily: MONO_BOLD }]}>
                {t.active ? '✓ Active' : t.price}
              </Text>
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

// ─── Scene 4: Cyber theme terminal ───────────────────────────────────────────
function Scene4({ palette }: { palette: Palette }) {
  return (
    <View style={[ss.scene, { backgroundColor: palette.bg }]}>
      <SceneHeader title="EdenMux" cwd="~/projects/app" palette={palette} />
      <TabBar tabs={['main', 'dev', 'logs']} activeIdx={1} palette={palette} />
      <ScrollView style={{ flex: 1 }} scrollEnabled={false}>
        <View style={ss.termBody}>
          <TerminalLine command="grep -r 'TODO' src/ --include='*.ts'" palette={palette} />
          <TerminalOutput text="src/auth.ts:14:  // TODO: add rate limiting" color={palette.warning} palette={palette} />
          <TerminalOutput text="src/eden.ts:88:  // TODO: streaming responses" color={palette.warning} palette={palette} />
          <TerminalOutput text="src/routes.ts:201: // TODO: pagination" color={palette.warning} palette={palette} />

          <TerminalLine command="wc -l src/*.ts" palette={palette} />
          <TerminalOutput text="  892 src/auth.ts" color={palette.info} palette={palette} />
          <TerminalOutput text="  1204 src/eden.ts" color={palette.info} palette={palette} />
          <TerminalOutput text="  567 src/routes.ts" color={palette.info} palette={palette} />
          <TerminalOutput text="  2663 total" color={palette.accent} palette={palette} />

          <TerminalLine command="sha256sum package.json" palette={palette} />
          <TerminalOutput text="a9f2c8b3d7e4f1a0b5c6d9e2f3a4b7c8  package.json" palette={palette} />

          <TerminalLine command="find . -name '*.log' -mtime -1" palette={palette} />
          <TerminalOutput text="./logs/server-2026-04-18.log" color={palette.success} palette={palette} />
          <TerminalOutput text="./logs/error-2026-04-18.log" color={palette.error} palette={palette} />

          <TerminalLine command="tail -5 logs/server-2026-04-18.log" palette={palette} />
          <TerminalOutput text="[09:14:01] GET /api/auth/verify 200" color={palette.success} palette={palette} />
          <TerminalOutput text="[09:14:03] POST /api/eden/chat 200" color={palette.success} palette={palette} />
          <TerminalOutput text="[09:14:07] GET /api/auth/verify 200" color={palette.success} palette={palette} />
          <TerminalOutput text="[09:14:09] POST /api/eden/chat 200" color={palette.success} palette={palette} />
          <TerminalOutput text="[09:14:12] GET /api/auth/verify 200" color={palette.success} palette={palette} />

          <TerminalLine command="base64 -d <<< 'SGVsbG8gZnJvbSBFZGVuTXV4IQ=='" palette={palette} />
          <TerminalOutput text="Hello from EdenMux!" color={palette.accent} palette={palette} />

          <TerminalLine palette={palette} />
        </View>
      </ScrollView>
      <InputBar palette={palette} />
    </View>
  );
}

// ─── Scene 5: Neo Matrix theme ────────────────────────────────────────────────
function Scene5({ palette }: { palette: Palette }) {
  return (
    <View style={[ss.scene, { backgroundColor: palette.bg }]}>
      <SceneHeader title="EdenMux" cwd="~" palette={palette} />
      <TabBar tabs={['main']} activeIdx={0} palette={palette} />
      <ScrollView style={{ flex: 1 }} scrollEnabled={false}>
        <View style={ss.termBody}>
          <TerminalLine command="neofetch" palette={palette} />
          <TerminalOutput text="       .:'        " color={palette.accent} palette={palette} />
          <TerminalOutput text="    _ ,'_         user@EdenMux" color={palette.accent} palette={palette} />
          <TerminalOutput text="   | | _|_         OS: EdenOS 1.0" color={palette.accent} palette={palette} />
          <TerminalOutput text="   | |'   '.       Shell: bash 5.2" color={palette.accent} palette={palette} />
          <TerminalOutput text="    \\|    ,'        Terminal: EdenMux" color={palette.accent} palette={palette} />
          <TerminalOutput text="     `---'          Theme: Neo" color={palette.success} palette={palette} />
          <TerminalOutput text="                   Sessions: 3 active" color={palette.info} palette={palette} />

          <TerminalLine command="pkg list-installed" palette={palette} />
          <TerminalOutput text="bash        5.2.15   installed" color={palette.success} palette={palette} />
          <TerminalOutput text="git         2.43.0   installed" color={palette.success} palette={palette} />
          <TerminalOutput text="python      3.11.9   installed" color={palette.success} palette={palette} />
          <TerminalOutput text="nodejs      20.12.1  installed" color={palette.success} palette={palette} />
          <TerminalOutput text="vim         9.1      installed" color={palette.success} palette={palette} />
          <TerminalOutput text="curl        8.7.1    installed" color={palette.success} palette={palette} />

          <TerminalLine command="fortune" palette={palette} />
          <TerminalOutput text='"There is no spoon."' color={palette.warning} palette={palette} />
          <TerminalOutput text="           — The Matrix" color={palette.textDim} palette={palette} />

          <TerminalLine command="echo 'I know kung fu.'" palette={palette} />
          <TerminalOutput text="I know kung fu." color={palette.accent} palette={palette} />

          <TerminalLine palette={palette} />
        </View>
      </ScrollView>
      <InputBar palette={palette} />
    </View>
  );
}

// ─── Scene registry ───────────────────────────────────────────────────────────
const SCENES = [
  { label: 'Terminal', sublabel: 'Red Delicious theme', palette: PALETTES.redDelicious, Scene: Scene1 },
  { label: 'Eden AI Chat', sublabel: 'Talk to your assistant', palette: PALETTES.redDelicious, Scene: Scene2 },
  { label: 'Theme Studio', sublabel: 'All 5 themes', palette: PALETTES.redDelicious, Scene: Scene3 },
  { label: 'Cyber Mode', sublabel: 'Neon developer tools', palette: PALETTES.cyber, Scene: Scene4 },
  { label: 'Neo Matrix', sublabel: 'Follow the rabbit', palette: PALETTES.neo, Scene: Scene5 },
];

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function ScreenshotStudio() {
  const insets = useSafeAreaInsets();
  const [activeIdx, setActiveIdx] = useState(0);
  const [saving, setSaving] = useState(false);
  const [savedCount, setSavedCount] = useState(0);
  const sceneRefs = [useRef(null), useRef(null), useRef(null), useRef(null), useRef(null)];

  const requestPermission = useCallback(async () => {
    if (Platform.OS === 'web') return true;
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Permission needed',
        'EdenMux needs access to your Camera Roll to save screenshots.',
        [{ text: 'OK' }]
      );
      return false;
    }
    return true;
  }, []);

  const saveScene = useCallback(async (idx: number) => {
    const ref = sceneRefs[idx];
    if (!ref.current) return;

    setSaving(true);
    try {
      const uri = await captureRef(ref, {
        format: 'png',
        quality: 1,
        width: CAPTURE_W,
        height: CAPTURE_H,
      });

      if (Platform.OS === 'web') {
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(uri, { mimeType: 'image/png' });
        } else {
          Alert.alert('Saved', `Screenshot ready: ${uri}`);
        }
      } else {
        const ok = await requestPermission();
        if (!ok) return;
        await MediaLibrary.saveToLibraryAsync(uri);
        setSavedCount(c => c + 1);
        Alert.alert('Saved!', `"${SCENES[idx].label}" saved to your Camera Roll.`);
      }
    } catch (e) {
      Alert.alert('Error', 'Could not capture screenshot. Try again.');
    } finally {
      setSaving(false);
    }
  }, []);

  const saveAll = useCallback(async () => {
    if (Platform.OS !== 'web') {
      const ok = await requestPermission();
      if (!ok) return;
    }
    setSaving(true);
    let count = 0;
    for (let i = 0; i < sceneRefs.length; i++) {
      const ref = sceneRefs[i];
      if (!ref.current) continue;
      try {
        const uri = await captureRef(ref, {
          format: 'png',
          quality: 1,
          width: CAPTURE_W,
          height: CAPTURE_H,
        });
        if (Platform.OS === 'web') {
          const canShare = await Sharing.isAvailableAsync();
          if (canShare) await Sharing.shareAsync(uri, { mimeType: 'image/png' });
        } else {
          await MediaLibrary.saveToLibraryAsync(uri);
          count++;
        }
      } catch {
        // skip failed scenes
      }
    }
    setSaving(false);
    setSavedCount(count);
    if (Platform.OS !== 'web') {
      Alert.alert('All done!', `${count} screenshots saved to your Camera Roll.\n\nUpload them in App Store Connect under "App Previews and Screenshots".`);
    }
  }, []);

  const { Scene, label, sublabel, palette } = SCENES[activeIdx];

  const webTop = Platform.OS === 'web' ? 67 : 0;
  const webBottom = Platform.OS === 'web' ? 34 : 0;

  return (
    <View style={[st.root, { backgroundColor: '#0d0a1a' }]}>
      {/* ── Header ── */}
      <View style={[st.topBar, {
        paddingTop: (Platform.OS === 'web' ? webTop : insets.top) + 8,
        borderBottomColor: '#2a1a3a',
      }]}>
        <Pressable testID="screenshot-studio-back" onPress={() => router.back()} style={st.backBtn} hitSlop={12}>
          <Ionicons name="chevron-back" size={22} color="#b44fde" />
          <Text style={st.backText}>Back</Text>
        </Pressable>
        <View style={st.topBarCenter}>
          <Text style={st.topBarTitle}>Screenshot Studio</Text>
          <Text style={st.topBarSub}>App Store · 1290×2796 px</Text>
        </View>
        <Pressable onPress={saveAll} disabled={saving} style={[st.saveAllBtn, saving && { opacity: 0.5 }]}>
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="download-outline" size={16} color="#fff" />
              <Text style={st.saveAllText}>All</Text>
            </>
          )}
        </Pressable>
      </View>

      {/* ── Scene tabs ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[st.tabStrip, { borderBottomColor: '#2a1a3a' }]}
        contentContainerStyle={st.tabStripContent}
      >
        {SCENES.map((s, i) => (
          <Pressable
            key={s.label}
            onPress={() => setActiveIdx(i)}
            style={[st.sceneTab, i === activeIdx && st.sceneTabActive]}
          >
            <Text style={[st.sceneTabText, i === activeIdx && st.sceneTabTextActive]}>
              {i + 1}. {s.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* ── Preview ── */}
      <View style={st.previewArea} pointerEvents="box-none">
        <View style={[st.previewWrapper, { width: SCREEN_W, height: PREVIEW_H }]} pointerEvents="none">
          <View
            style={{
              width: CAPTURE_W,
              height: CAPTURE_H,
              transform: [{ scale: SCALE }],
              transformOrigin: 'top left',
            }}
          >
            <View ref={sceneRefs[activeIdx]} style={{ width: CAPTURE_W, height: CAPTURE_H }} collapsable={false}>
              <Scene palette={palette} />
            </View>
          </View>
        </View>
      </View>

      {/* ── Bottom bar ── */}
      <View style={[st.bottomBar, {
        paddingBottom: (Platform.OS === 'web' ? webBottom : insets.bottom) + 8,
        borderTopColor: '#2a1a3a',
      }]}>
        <View style={st.bottomInfo}>
          <Text style={st.bottomLabel}>{label}</Text>
          <Text style={st.bottomSub}>{sublabel}</Text>
          {savedCount > 0 && (
            <Text style={st.savedBadge}>✓ {savedCount} saved</Text>
          )}
        </View>
        <View style={st.bottomActions}>
          <Pressable
            onPress={() => setActiveIdx(i => Math.max(0, i - 1))}
            disabled={activeIdx === 0}
            style={[st.navBtn, activeIdx === 0 && { opacity: 0.3 }]}
          >
            <Ionicons name="chevron-back" size={20} color="#b44fde" />
          </Pressable>
          <Text style={st.pageCount}>{activeIdx + 1} / {SCENES.length}</Text>
          <Pressable
            onPress={() => setActiveIdx(i => Math.min(SCENES.length - 1, i + 1))}
            disabled={activeIdx === SCENES.length - 1}
            style={[st.navBtn, activeIdx === SCENES.length - 1 && { opacity: 0.3 }]}
          >
            <Ionicons name="chevron-forward" size={20} color="#b44fde" />
          </Pressable>
          <Pressable
            onPress={() => saveScene(activeIdx)}
            disabled={saving}
            style={[st.saveBtn, saving && { opacity: 0.5 }]}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="camera-outline" size={16} color="#fff" />
                <Text style={st.saveBtnText}>Save</Text>
              </>
            )}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

// ─── Scene-level styles ───────────────────────────────────────────────────────
const ss = StyleSheet.create({
  scene: { flex: 1, width: CAPTURE_W, height: CAPTURE_H },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 54, paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  headerTitle: { fontSize: 15, letterSpacing: 1 },
  cwd: { fontSize: 11 },
  tabBar: {
    flexDirection: 'row', paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tab: { paddingHorizontal: 14, paddingVertical: 8 },
  tabText: { fontSize: 12 },
  termBody: { padding: 14, gap: 1 },
  termLine: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  termPrompt: { fontSize: 13 },
  termCmd: { fontSize: 13 },
  termOut: { fontSize: 12, lineHeight: 18, paddingLeft: 2 },
  inputBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  inputPrompt: { fontSize: 13 },
  inputCursor: { width: 8, height: 14, borderRadius: 1 },
  // Eden chat
  edenChatHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  edenAvatar: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center',
  },
  edenAvatarText: { color: '#fff', fontFamily: 'Cinzel_700Bold', fontSize: 16 },
  edenName: { fontSize: 14 },
  edenStatus: { fontSize: 11 },
  chatContent: { padding: 12, gap: 8 },
  bubble: { maxWidth: '82%' },
  bubbleEden: { alignSelf: 'flex-start' },
  bubbleUser: { alignSelf: 'flex-end' },
  bubbleBg: { borderRadius: 12, padding: 10, borderWidth: StyleSheet.hairlineWidth },
  bubbleText: { fontSize: 12, lineHeight: 17 },
  chatInput: {
    paddingHorizontal: 14, paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  chatInputInner: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 8, gap: 8,
  },
  sendBtn: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  // Shop
  shopHeader: {
    padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, alignItems: 'center',
  },
  shopTitle: { fontSize: 20, letterSpacing: 2 },
  shopSub: { fontSize: 11, opacity: 0.6, marginTop: 2 },
  themeGrid: { padding: 12, gap: 10 },
  themeCard: {
    borderRadius: 12, borderWidth: 1.5, overflow: 'hidden',
    flexDirection: 'row', alignItems: 'center', height: 70,
  },
  themeCardAccentBar: { width: 4, alignSelf: 'stretch' },
  themeCardBody: { flex: 1, paddingHorizontal: 12 },
  themeCardName: { fontSize: 14 },
  themeCardTagline: { fontSize: 11, marginTop: 2 },
  themeCardBadge: {
    marginRight: 12, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20,
  },
  themeCardPrice: { fontSize: 11 },
});

// ─── Screen-level styles ──────────────────────────────────────────────────────
const st = StyleSheet.create({
  root: { flex: 1 },
  topBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    backgroundColor: '#0d0a1a',
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, minWidth: 60 },
  backText: { color: '#b44fde', fontSize: 15, fontFamily: 'JetBrainsMono_400Regular' },
  topBarCenter: { flex: 1, alignItems: 'center' },
  topBarTitle: { color: '#e8e0ff', fontSize: 14, fontFamily: 'Cinzel_700Bold', letterSpacing: 1 },
  topBarSub: { color: '#6655aa', fontSize: 10, fontFamily: 'JetBrainsMono_400Regular', marginTop: 1 },
  saveAllBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#b44fde', borderRadius: 16,
    paddingHorizontal: 12, paddingVertical: 6, minWidth: 60, justifyContent: 'center',
  },
  saveAllText: { color: '#fff', fontSize: 12, fontFamily: 'JetBrainsMono_700Bold' },
  tabStrip: { borderBottomWidth: StyleSheet.hairlineWidth, backgroundColor: '#0d0a1a', maxHeight: 44 },
  tabStripContent: { paddingHorizontal: 12, gap: 4, alignItems: 'center', paddingVertical: 6 },
  sceneTab: {
    paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12,
    backgroundColor: 'rgba(180,79,222,0.08)',
  },
  sceneTabActive: { backgroundColor: 'rgba(180,79,222,0.22)' },
  sceneTabText: { color: '#6655aa', fontSize: 11, fontFamily: 'JetBrainsMono_400Regular' },
  sceneTabTextActive: { color: '#e8e0ff', fontFamily: 'JetBrainsMono_700Bold' },
  previewArea: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#070510' },
  previewWrapper: { overflow: 'hidden', borderRadius: 12 },
  bottomBar: {
    paddingHorizontal: 16, paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    backgroundColor: '#0d0a1a',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  bottomInfo: { flex: 1 },
  bottomLabel: { color: '#e8e0ff', fontSize: 14, fontFamily: 'JetBrainsMono_700Bold' },
  bottomSub: { color: '#6655aa', fontSize: 11, fontFamily: 'JetBrainsMono_400Regular', marginTop: 2 },
  savedBadge: { color: '#00ff9f', fontSize: 11, fontFamily: 'JetBrainsMono_400Regular', marginTop: 4 },
  bottomActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  navBtn: { padding: 4 },
  pageCount: { color: '#6655aa', fontSize: 12, fontFamily: 'JetBrainsMono_400Regular', minWidth: 36, textAlign: 'center' },
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#b44fde', borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 8,
  },
  saveBtnText: { color: '#fff', fontSize: 13, fontFamily: 'JetBrainsMono_700Bold' },
});
