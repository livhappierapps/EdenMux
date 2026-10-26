import React, { useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, Modal, ActivityIndicator, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTerminalColors } from '@/lib/theme-context';
import { useSubscription, PAID_THEME_IDS } from '@/lib/revenuecat';
import { CORE_UNLOCK_PRODUCT_ID, BUNDLE_PRODUCT_ID, THEMES } from '@/lib/theme-context';
import { useTheme } from '@/lib/theme-context';

const monoFont = Platform.select({ ios: 'JetBrainsMono_400Regular', default: 'JetBrainsMono_400Regular' });
const titleFont = Platform.select({ ios: 'Cinzel_700Bold', default: 'Cinzel_700Bold' });

interface Props {
  visible: boolean;
  onClose: () => void;
  onCoreUnlocked?: () => void;
}

export default function PaywallModal({ visible, onClose, onCoreUnlocked }: Props) {
  const tc = useTerminalColors();
  const { unlockThemes } = useTheme();
  const {
    getPackageForProductId, purchase, restore, isRestoring, unlockedThemeIds,
  } = useSubscription();
  const insets = useSafeAreaInsets();
  const [purchasing, setPurchasing] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const showStatus = (msg: string) => {
    setStatusMsg(msg);
    setTimeout(() => setStatusMsg(null), 3500);
  };

  const handleBuyCoreUnlock = async () => {
    const pkg = getPackageForProductId(CORE_UNLOCK_PRODUCT_ID);
    if (!pkg) {
      showStatus('Product not available yet. Try restoring purchases.');
      return;
    }
    setPurchasing(true);
    try {
      await purchase(pkg);
      showStatus('Core unlocked! Unlimited conversations. ✦');
      onCoreUnlocked?.();
      setTimeout(onClose, 1500);
    } catch (e: any) {
      if (!e?.userCancelled) showStatus('Purchase failed. Try again.');
    } finally {
      setPurchasing(false);
    }
  };

  const handleRestore = async () => {
    try {
      const info = await restore();
      const active = info.entitlements.active ?? {};
      const hasCoreActive = 'core_unlock' in active;
      const nowUnlocked: string[] = [];
      for (const id of PAID_THEME_IDS) {
        const entId = THEMES[id]?.rcEntitlementId;
        if (entId && entId in active) nowUnlocked.push(id);
      }
      if (nowUnlocked.length > 0) unlockThemes(nowUnlocked);
      if (hasCoreActive) {
        onCoreUnlocked?.();
        showStatus('Core access restored! ✦');
        setTimeout(onClose, 1500);
      } else if (nowUnlocked.length > 0) {
        showStatus(`Restored ${nowUnlocked.length} theme(s).`);
      } else {
        showStatus('No previous purchases found.');
      }
    } catch {
      showStatus('Restore failed. Try again.');
    }
  };

  const corePkg = getPackageForProductId(CORE_UNLOCK_PRODUCT_ID);
  const corePrice = corePkg?.product.priceString ?? '$2.99';

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={[styles.overlay, { paddingBottom: insets.bottom }]}>
        <View style={[styles.card, { backgroundColor: tc.bgSecondary, borderColor: `${tc.accent}44` }]}>
          <View style={[styles.iconRow, { backgroundColor: `${tc.accent}18` }]}>
            <Ionicons name="sparkles" size={28} color={tc.accent} />
          </View>

          <Text style={[styles.title, { fontFamily: titleFont, color: tc.cream }]}>
            Daily Limit Reached
          </Text>
          <Text style={[styles.subtitle, { fontFamily: monoFont, color: tc.textDim }]}>
            Free users get 15 conversations per day. Unlock Core for unlimited access — plus all future premium features.
          </Text>

          <View style={[styles.featureList, { borderColor: `${tc.accent}22` }]}>
            {[
              'Unlimited daily conversations with Eden',
              'Voice input & output (mic + TTS)',
              'Chat history saved across sessions',
              'Unlock all themes with Core',
            ].map((feat) => (
              <View key={feat} style={styles.featureRow}>
                <Ionicons name="checkmark-circle" size={14} color={tc.accent} />
                <Text style={[styles.featureText, { fontFamily: monoFont, color: tc.text }]}>{feat}</Text>
              </View>
            ))}
          </View>

          {statusMsg ? (
            <View style={[styles.statusBar, { backgroundColor: `${tc.accent}22`, borderColor: `${tc.accent}44` }]}>
              <Text style={[styles.statusText, { fontFamily: monoFont, color: tc.cream }]}>{statusMsg}</Text>
            </View>
          ) : null}

          <Pressable
            onPress={handleBuyCoreUnlock}
            disabled={purchasing}
            style={({ pressed }) => [
              styles.buyBtn,
              { backgroundColor: tc.accent, borderColor: tc.accent },
              pressed && { opacity: 0.85 },
            ]}
          >
            {purchasing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="bag-outline" size={16} color="#fff" />
                <Text style={[styles.buyBtnText, { fontFamily: titleFont }]}>
                  Unlock Core — {corePrice}
                </Text>
              </>
            )}
          </Pressable>

          <Pressable
            onPress={handleRestore}
            style={({ pressed }) => [styles.restoreBtn, pressed && { opacity: 0.7 }]}
          >
            {isRestoring ? (
              <ActivityIndicator size="small" color={tc.textDim} />
            ) : (
              <Text style={[styles.restoreText, { fontFamily: monoFont, color: tc.textDim }]}>
                Restore Purchases
              </Text>
            )}
          </Pressable>

          <Pressable onPress={onClose} style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.7 }]}>
            <Text style={[styles.closeText, { fontFamily: monoFont, color: tc.textMuted }]}>
              Maybe later
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.75)',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 20,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    gap: 14,
  },
  iconRow: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 18,
    letterSpacing: 1,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
  featureList: {
    width: '100%',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    gap: 8,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  featureText: {
    fontSize: 12,
    flex: 1,
  },
  statusBar: {
    width: '100%',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  statusText: {
    fontSize: 12,
    textAlign: 'center',
  },
  buyBtn: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  buyBtnText: {
    color: '#fff',
    fontSize: 14,
    letterSpacing: 0.5,
  },
  restoreBtn: {
    paddingVertical: 8,
  },
  restoreText: {
    fontSize: 12,
    textDecorationLine: 'underline',
  },
  closeBtn: {
    paddingVertical: 4,
  },
  closeText: {
    fontSize: 11,
  },
});
