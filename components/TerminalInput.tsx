import React, { useState, useRef, useCallback } from 'react';
import { View, TextInput, Pressable, StyleSheet, Platform, ActivityIndicator, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTerminalColors } from '@/lib/theme-context';
import { useTerminal } from '@/lib/terminal-context';
import { useEden } from '@/lib/eden-context';

const monoFont = Platform.select({
  ios: 'JetBrainsMono_400Regular',
  android: 'JetBrainsMono_400Regular',
  default: 'JetBrainsMono_400Regular',
});

export default function TerminalInput() {
  const { runCommand, navigateHistory, isProcessing } = useTerminal();
  const { openEden } = useEden();
  const tc = useTerminalColors();
  const [input, setInput] = useState('');
  const inputRef = useRef<TextInput>(null);

  const handleSubmit = useCallback(async () => {
    if (!input.trim() || isProcessing) return;
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    const cmd = input.trim().toLowerCase();
    if (cmd === 'eden') {
      setInput('');
      openEden();
      inputRef.current?.focus();
      return;
    }
    const fullCmd = input;
    setInput('');
    await runCommand(fullCmd);
    inputRef.current?.focus();
  }, [input, isProcessing, runCommand, openEden]);

  const handleHistoryUp = useCallback(() => {
    const prev = navigateHistory('up');
    if (prev) setInput(prev);
  }, [navigateHistory]);

  const handleHistoryDown = useCallback(() => {
    const next = navigateHistory('down');
    setInput(next);
  }, [navigateHistory]);

  const handleTab = useCallback(() => {
    setInput(prev => prev + '    ');
  }, []);

  const quickCmds = [
    { label: 'ls', color: tc.blush },
    { label: 'cd', color: tc.cream },
    { label: 'pwd', color: tc.mauve },
    { label: 'cat', color: tc.dustyRose },
    { label: 'grep', color: tc.rose },
  ];

  return (
    <View style={[styles.container, { borderTopColor: tc.border, backgroundColor: tc.surface }]}>
      <View style={[styles.quickActions, { borderBottomColor: tc.border }]}>
        <Pressable
          onPress={handleHistoryUp}
          style={({ pressed }) => [
            styles.actionBtn,
            { backgroundColor: tc.bgTertiary },
            pressed && { backgroundColor: tc.accentFaint },
          ]}
          hitSlop={8}
        >
          <Ionicons name="chevron-up" size={16} color={tc.textDim} />
        </Pressable>
        <Pressable
          onPress={handleHistoryDown}
          style={({ pressed }) => [
            styles.actionBtn,
            { backgroundColor: tc.bgTertiary },
            pressed && { backgroundColor: tc.accentFaint },
          ]}
          hitSlop={8}
        >
          <Ionicons name="chevron-down" size={16} color={tc.textDim} />
        </Pressable>
        <Pressable
          onPress={handleTab}
          style={({ pressed }) => [
            styles.actionBtn,
            styles.tabBtn,
            { backgroundColor: tc.bgTertiary },
            pressed && { backgroundColor: tc.accentFaint },
          ]}
          hitSlop={8}
        >
          <Ionicons name="arrow-forward" size={14} color={tc.textDim} />
        </Pressable>
        <View style={styles.quickChips}>
          {quickCmds.map(({ label, color }) => (
            <Pressable
              key={label}
              onPress={() => {
                setInput(label + ' ');
                inputRef.current?.focus();
              }}
              style={({ pressed }) => [
                styles.chip,
                { backgroundColor: tc.bgTertiary, borderColor: `${color}33` },
                pressed && { backgroundColor: `${color}18` },
              ]}
            >
              <Text style={[styles.chipText, { color, fontFamily: monoFont }]}>{label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.inputRow}>
        <View style={styles.promptIndicator}>
          <Ionicons name="chevron-forward" size={16} color={tc.rose} />
        </View>
        <TextInput
          ref={inputRef}
          style={[styles.input, { fontFamily: monoFont, color: tc.text }]}
          value={input}
          onChangeText={setInput}
          onSubmitEditing={handleSubmit}
          placeholder="Enter command..."
          placeholderTextColor={tc.textMuted}
          selectionColor={tc.accent}
          cursorColor={tc.cursor}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          spellCheck={false}
          returnKeyType="go"
          blurOnSubmit={false}
          editable={!isProcessing}
          testID="terminal-input"
        />
        <Pressable
          onPress={handleSubmit}
          disabled={isProcessing || !input.trim()}
          style={({ pressed }) => [
            styles.sendBtn,
            { backgroundColor: tc.bgTertiary },
            (isProcessing || !input.trim()) && styles.sendBtnDisabled,
            pressed && { backgroundColor: tc.accentFaint },
          ]}
          hitSlop={8}
        >
          {isProcessing ? (
            <ActivityIndicator size="small" color={tc.accent} />
          ) : (
            <Ionicons
              name="return-down-back"
              size={18}
              color={input.trim() ? tc.rose : tc.textMuted}
            />
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderTopWidth: 1 },
  quickActions: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  actionBtn: {
    width: 32, height: 28, borderRadius: 6,
    alignItems: 'center', justifyContent: 'center',
  },
  tabBtn: { marginRight: 4 },
  quickChips: { flex: 1, flexDirection: 'row', gap: 4, justifyContent: 'flex-end' },
  chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, borderWidth: 1 },
  chipText: { fontSize: 12, padding: 0, margin: 0 },
  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 8, paddingVertical: 8, gap: 4,
  },
  promptIndicator: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, fontSize: 14, paddingVertical: 6, paddingHorizontal: 4, lineHeight: 20 },
  sendBtn: { width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { opacity: 0.5 },
});
