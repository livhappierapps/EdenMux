import React, { useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Pressable, Modal,
  ActivityIndicator, Platform, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  useTheme, useTerminalColors, THEMES,
  BUNDLE_PRODUCT_ID, METALLIC_BUNDLE_PRODUCT_ID,
} from '@/lib/theme-context';
import { useSubscription, PAID_THEME_IDS } from '@/lib/revenuecat';
import { useAuth } from '@/lib/auth-context';

const monoFont = Platform.select({ ios: 'JetBrainsMono_400Regular', default: 'JetBrainsMono_400Regular' });
const titleFont = Platform.select({ ios: 'Cinzel_700Bold', default: 'Cinzel_700Bold' });

const ORIGINAL_PACK_IDS = ['candy', 'cyber', 'neo', 'gothic', 'glitter'];
const METALLIC_PACK_IDS = ['gold', 'chrome', 'cobalt', 'silver'];

function ThemeCard({
  themeId, isActive, isUnlocked, onSelect, onBuy, isPurchasing, priceLabel,
}: {
  themeId: string;
  isActive: boolean;
  isUnlocked: boolean;
  onSelect: () => void;
  onBuy: () => void;
  isPurchasing: boolean;
  priceLabel: string;
}) {
  const [imgError, setImgError] = useState(false);
  const themeData = THEMES[themeId];
  if (!themeData) return null;
  const accent = themeData.uiAccent;
  const thumbSource = themeData.edenPortrait ?? themeData.landingImage;

  return (
    <Pressable
      onPress={isUnlocked ? onSelect : onBuy}
      style={({ pressed }) => [
        styles.card,
        {
          borderColor: isActive ? accent : `${accent}33`,
          backgroundColor: isActive ? `${accent}15` : `${accent}08`,
        },
        pressed && { opacity: 0.85 },
      ]}
    >
      <View style={[styles.colorBar, { backgroundColor: accent }]} />
      <View style={styles.cardBody}>
        <View style={styles.cardTop}>
          <Text style={[styles.cardName, { fontFamily: titleFont, color: themeData.terminal.cream }]}>
            {themeData.name}
          </Text>
          {isActive && (
            <View style={[styles.activePill, { backgroundColor: `${accent}30`, borderColor: accent }]}>
              <Text style={[styles.activePillText, { fontFamily: monoFont, color: accent }]}>Active</Text>
            </View>
          )}
        </View>
        <Text style={[styles.cardTagline, { fontFamily: monoFont, color: themeData.terminal.textDim }]}>
          {themeData.tagline}
        </Text>
        {!imgError && thumbSource ? null : (
          <View style={styles.cardPreview}>
            {(['accent', 'rose', 'cream', 'textDim', 'bg'] as const).map((colorKey) => (
              <View
                key={colorKey}
                style={[styles.swatch, { backgroundColor: (themeData.terminal as any)[colorKey] ?? '#333' }]}
              />
            ))}
          </View>
        )}
        <View style={styles.cardFooter}>
          {isUnlocked ? (
            <View style={[styles.unlockedBadge, { borderColor: `${accent}44` }]}>
              <Ionicons name="checkmark-circle" size={13} color={accent} />
              <Text style={[styles.unlockedText, { fontFamily: monoFont, color: accent }]}>
                {themeId === 'default' ? 'Free' : 'Unlocked'}
              </Text>
            </View>
          ) : (
            <View style={[styles.buyBtn, { backgroundColor: `${accent}22`, borderColor: `${accent}55` }]}>
              {isPurchasing ? (
                <ActivityIndicator size="small" color={accent} />
              ) : (
                <>
                  <Ionicons name="bag-outline" size={13} color={accent} />
                  <Text style={[styles.buyBtnText, { fontFamily: monoFont, color: accent }]}>
                    {priceLabel}
                  </Text>
                </>
              )}
            </View>
          )}
        </View>
      </View>
      {thumbSource && !imgError && (
        <Image
          source={thumbSource}
          style={[styles.cardThumb, { borderColor: `${accent}33` }]}
          resizeMode="cover"
          onError={() => setImgError(true)}
        />
      )}
    </Pressable>
  );
}

function SectionHeader({ label, tc }: { label: string; tc: any }) {
  return (
    <View style={[styles.sectionHeader, { borderBottomColor: `${tc.accent}22` }]}>
      <Text style={[styles.sectionLabel, { fontFamily: titleFont, color: tc.textDim }]}>{label}</Text>
    </View>
  );
}

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function ThemeShop({ visible, onClose }: Props) {
  const tc = useTerminalColors();
  const { themeId, setTheme, unlockThemes } = useTheme();
  const { user } = useAuth();
  const {
    isLoading, getPackageForProductId, hasCoreUnlock,
    purchase, restore, isRestoring, unlockedThemeIds: rcUnlockedThemeIds,
  } = useSubscription();

  const unlockedThemeIds = (user?._p || hasCoreUnlock)
    ? ['default', ...PAID_THEME_IDS]
    : rcUnlockedThemeIds;
  const insets = useSafeAreaInsets();
  const [purchasingId, setPurchasingId] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const showStatus = (msg: string) => {
    setStatusMsg(msg);
    setTimeout(() => setStatusMsg(null), 3500);
  };

  const handleBuyTheme = async (id: string) => {
    const themeData = THEMES[id];
    if (!themeData?.rcProductId) return;
    const pkg = getPackageForProductId(themeData.rcProductId);
    if (!pkg) { showStatus('Product not available. Try restoring purchases.'); return; }
    setPurchasingId(id);
    try {
      await purchase(pkg);
      unlockThemes([id]);
      setTheme(id);
      showStatus(`${themeData.name} unlocked! ✦`);
    } catch (e: any) {
      if (!e?.userCancelled) showStatus('Purchase failed. Try again.');
    } finally {
      setPurchasingId(null);
    }
  };

  const handleBuyBundle = async (bundleProductId: string, themeIds: string[], label: string) => {
    const pkg = getPackageForProductId(bundleProductId);
    if (!pkg) { showStatus(`${label} not available. Try restoring purchases.`); return; }
    setPurchasingId(bundleProductId);
    try {
      await purchase(pkg);
      unlockThemes(themeIds);
      showStatus(`${label} unlocked! ✦`);
    } catch (e: any) {
      if (!e?.userCancelled) showStatus('Purchase failed. Try again.');
    } finally {
      setPurchasingId(null);
    }
  };

  const handleRestore = async () => {
    try {
      const info = await restore();
      const active = info.entitlements.active ?? {};
      const nowUnlocked: string[] = [];
      for (const id of PAID_THEME_IDS) {
        const entId = THEMES[id]?.rcEntitlementId;
        if (entId && entId in active) nowUnlocked.push(id);
      }
      if (nowUnlocked.length > 0) {
        unlockThemes(nowUnlocked);
        showStatus(`Restored ${nowUnlocked.length} theme(s)! ✦`);
      } else {
        showStatus('No previous purchases found.');
      }
    } catch {
      showStatus('Restore failed. Try again.');
    }
  };

  const originalBundlePkg = getPackageForProductId(BUNDLE_PRODUCT_ID);
  const originalBundlePrice = originalBundlePkg?.product.priceString ?? '$2.99';
  const allOriginalUnlocked = ORIGINAL_PACK_IDS.every(id => unlockedThemeIds.includes(id));

  const metallicBundlePkg = getPackageForProductId(METALLIC_BUNDLE_PRODUCT_ID);
  const metallicBundlePrice = metallicBundlePkg?.product.priceString ?? '$2.99';
  const allMetallicUnlocked = METALLIC_PACK_IDS.every(id => unlockedThemeIds.includes(id));

  const renderThemeSection = (ids: string[]) =>
    ids.map((id) => {
      const themeData = THEMES[id];
      const pkg = themeData.rcProductId ? getPackageForProductId(themeData.rcProductId) : null;
      const priceLabel = pkg?.product.priceString ?? themeData.priceLabel;
      return (
        <ThemeCard
          key={id}
          themeId={id}
          isActive={themeId === id}
          isUnlocked={unlockedThemeIds.includes(id)}
          onSelect={() => { setTheme(id); onClose(); }}
          onBuy={() => handleBuyTheme(id)}
          isPurchasing={purchasingId === id}
          priceLabel={priceLabel}
        />
      );
    });

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={[styles.overlay, { paddingBottom: insets.bottom }]}>
        <View style={[styles.sheet, { backgroundColor: tc.bg, borderColor: `${tc.accent}33` }]}>
          <View style={[styles.header, { borderBottomColor: `${tc.accent}22` }]}>
            <Text style={[styles.headerTitle, { fontFamily: titleFont, color: tc.cream }]}>
              Themes & Shop
            </Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={22} color={tc.textDim} />
            </Pressable>
          </View>

          {statusMsg ? (
            <View style={[styles.statusBar, { backgroundColor: `${tc.accent}22`, borderColor: `${tc.accent}44` }]}>
              <Text style={[styles.statusText, { fontFamily: monoFont, color: tc.cream }]}>{statusMsg}</Text>
            </View>
          ) : null}

          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {isLoading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={tc.accent} />
                <Text style={[styles.loadingText, { fontFamily: monoFont, color: tc.textDim }]}>Loading store...</Text>
              </View>
            ) : (
              <>
                {/* Free theme */}
                <SectionHeader label="Free" tc={tc} />
                <ThemeCard
                  themeId="default"
                  isActive={themeId === 'default'}
                  isUnlocked
                  onSelect={() => { setTheme('default'); onClose(); }}
                  onBuy={() => {}}
                  isPurchasing={false}
                  priceLabel="Free"
                />

                {/* Original Pack */}
                <SectionHeader label="Original Pack" tc={tc} />
                {renderThemeSection(ORIGINAL_PACK_IDS)}
                {!allOriginalUnlocked && (
                  <Pressable
                    onPress={() => handleBuyBundle(BUNDLE_PRODUCT_ID, ORIGINAL_PACK_IDS, 'Original Pack')}
                    style={({ pressed }) => [
                      styles.bundleBtn,
                      { backgroundColor: `${tc.accent}15`, borderColor: `${tc.accent}55` },
                      pressed && { opacity: 0.8 },
                    ]}
                  >
                    {purchasingId === BUNDLE_PRODUCT_ID ? (
                      <ActivityIndicator size="small" color={tc.accent} />
                    ) : (
                      <>
                        <Ionicons name="gift-outline" size={18} color={tc.accent} />
                        <Text style={[styles.bundleText, { fontFamily: titleFont, color: tc.cream }]}>
                          Original Pack — All 5
                        </Text>
                        <Text style={[styles.bundlePrice, { fontFamily: monoFont, color: tc.accent }]}>
                          {originalBundlePrice}
                        </Text>
                      </>
                    )}
                  </Pressable>
                )}

                {/* Metallic Pack */}
                <SectionHeader label="Metallic Pack" tc={tc} />
                {renderThemeSection(METALLIC_PACK_IDS)}
                {!allMetallicUnlocked && (
                  <Pressable
                    onPress={() => handleBuyBundle(METALLIC_BUNDLE_PRODUCT_ID, METALLIC_PACK_IDS, 'Metallic Pack')}
                    style={({ pressed }) => [
                      styles.bundleBtn,
                      { backgroundColor: `${tc.accent}15`, borderColor: `${tc.accent}55` },
                      pressed && { opacity: 0.8 },
                    ]}
                  >
                    {purchasingId === METALLIC_BUNDLE_PRODUCT_ID ? (
                      <ActivityIndicator size="small" color={tc.accent} />
                    ) : (
                      <>
                        <Ionicons name="gift-outline" size={18} color={tc.accent} />
                        <Text style={[styles.bundleText, { fontFamily: titleFont, color: tc.cream }]}>
                          Metallic Pack — All 4
                        </Text>
                        <Text style={[styles.bundlePrice, { fontFamily: monoFont, color: tc.accent }]}>
                          {metallicBundlePrice}
                        </Text>
                      </>
                    )}
                  </Pressable>
                )}

                <Pressable onPress={handleRestore} style={({ pressed }) => [styles.restoreBtn, pressed && { opacity: 0.7 }]}>
                  {isRestoring ? (
                    <ActivityIndicator size="small" color={tc.textDim} />
                  ) : (
                    <Text style={[styles.restoreText, { fontFamily: monoFont, color: tc.textDim }]}>
                      Restore Purchases
                    </Text>
                  )}
                </Pressable>

                <Text style={[styles.legalNote, { fontFamily: monoFont, color: tc.textMuted }]}>
                  Themes are one-time purchases. Payment is charged to your Apple ID. Purchases are non-refundable.
                </Text>
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.7)' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: 1, maxHeight: '92%', overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1 },
  headerTitle: { fontSize: 16, letterSpacing: 1 },
  statusBar: { marginHorizontal: 16, marginTop: 10, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
  statusText: { fontSize: 12, textAlign: 'center' },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, gap: 12, paddingBottom: 24 },
  loadingContainer: { alignItems: 'center', paddingVertical: 48, gap: 12 },
  loadingText: { fontSize: 12 },
  sectionHeader: { paddingBottom: 6, borderBottomWidth: 1, marginBottom: 2, marginTop: 4 },
  sectionLabel: { fontSize: 10, letterSpacing: 2, textTransform: 'uppercase' },
  card: { flexDirection: 'row', borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
  colorBar: { width: 4 },
  cardBody: { flex: 1, padding: 14, gap: 6 },
  cardThumb: { width: 72, height: '100%' as any, borderLeftWidth: 1 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardName: { fontSize: 14, letterSpacing: 0.8 },
  cardTagline: { fontSize: 11, lineHeight: 16 },
  cardPreview: { flexDirection: 'row', gap: 5, marginTop: 4 },
  swatch: { width: 18, height: 18, borderRadius: 9 },
  cardFooter: { marginTop: 6, alignItems: 'flex-start' },
  activePill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, borderWidth: 1 },
  activePillText: { fontSize: 10, letterSpacing: 0.5 },
  unlockedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
  unlockedText: { fontSize: 11 },
  buyBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
  buyBtnText: { fontSize: 12, letterSpacing: 0.3 },
  bundleBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 14, borderRadius: 12, borderWidth: 1, marginTop: 4 },
  bundleText: { fontSize: 14, letterSpacing: 0.8 },
  bundlePrice: { fontSize: 13, letterSpacing: 0.3 },
  restoreBtn: { alignItems: 'center', paddingVertical: 14 },
  restoreText: { fontSize: 12, textDecorationLine: 'underline' },
  legalNote: { fontSize: 10, textAlign: 'center', lineHeight: 15, paddingHorizontal: 8 },
});
