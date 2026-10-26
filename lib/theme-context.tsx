import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const THEME_STORAGE_KEY = '@edenmux_theme';
const UNLOCKED_STORAGE_KEY = '@edenmux_unlocked_themes';

export interface TerminalPalette {
  bg: string; bgSecondary: string; bgTertiary: string;
  surface: string; surfaceHover: string;
  accent: string; accentDim: string; accentFaint: string;
  rose: string; blush: string; cream: string; creamDim: string;
  mauve: string; dustyRose: string; warmGrey: string; coolGrey: string;
  wine: string; burgundy: string; pink: string; softPink: string; palePink: string;
  ash: string; silver: string;
  text: string; textDim: string; textMuted: string;
  border: string; borderActive: string;
  cursor: string; selection: string;
  prompt: string; output: string;
  error: string; success: string; warning: string; info: string;
  tabBar: string; tabActive: string; tabInactive: string;
}

export interface Theme {
  id: string;
  name: string;
  tagline: string;
  price: string;
  priceLabel: string;
  rcProductId: string | null;
  rcEntitlementId: string | null;
  landingImage: any;
  edenPortrait: any;
  uiAccent: string;
  uiBackground: string;
  gradientColors: readonly [string, string, string, string];
  terminal: TerminalPalette;
}

export const THEMES: Record<string, Theme> = {
  // ─── FREE ────────────────────────────────────────────────────────────────
  default: {
    id: 'default',
    name: 'Red Delicious',
    tagline: 'The original. Dark and eternal.',
    price: 'free',
    priceLabel: 'Free',
    rcProductId: null,
    rcEntitlementId: null,
    landingImage: require('@/assets/images/eden-landing.jpeg'),
    edenPortrait: require('@/assets/images/eden-portrait.jpeg'),
    uiAccent: '#c94060',
    uiBackground: '#1a1015',
    gradientColors: ['transparent', 'transparent', 'rgba(10,4,8,0.7)', 'rgba(10,4,8,0.97)'],
    terminal: {
      bg: '#1a1015', bgSecondary: '#241a1f', bgTertiary: '#2e2228',
      surface: '#1e1318', surfaceHover: '#2a1e24',
      accent: '#c94060', accentDim: '#8a2a3f', accentFaint: 'rgba(201,64,96,0.08)',
      rose: '#e8607a', blush: '#f2a0b0', cream: '#f5e6d8', creamDim: '#d4c0b0',
      mauve: '#b08898', dustyRose: '#c07888', warmGrey: '#9a8890', coolGrey: '#706068',
      wine: '#8a3050', burgundy: '#6a2040', pink: '#e87898', softPink: '#f0b8c8', palePink: '#f8d8e0',
      ash: '#a89098', silver: '#c8b8c0',
      text: '#f0e4e8', textDim: '#9a8890', textMuted: '#5a4a52',
      border: '#3a2830', borderActive: '#c94060',
      cursor: '#e8607a', selection: 'rgba(201,64,96,0.15)',
      prompt: '#e8607a', output: '#d8c8d0',
      error: '#e85050', success: '#90c8a0', warning: '#e8c878', info: '#b0a0c0',
      tabBar: '#1e1318', tabActive: '#c94060', tabInactive: '#5a4a52',
    },
  },

  // ─── ORIGINAL PACK ───────────────────────────────────────────────────────
  candy: {
    id: 'candy',
    name: 'Candy',
    tagline: 'Sweet, electric, and impossible to ignore.',
    price: '$0.99',
    priceLabel: '$0.99',
    rcProductId: 'com.edenmux.theme_candy',
    rcEntitlementId: 'candy',
    landingImage: require('@/assets/images/theme-candy.jpeg'),
    edenPortrait: require('@/assets/images/theme-candy.jpeg'),
    uiAccent: '#e040fb',
    uiBackground: '#0d0812',
    gradientColors: ['transparent', 'transparent', 'rgba(8,4,12,0.7)', 'rgba(8,4,12,0.97)'],
    terminal: {
      bg: '#0d0812', bgSecondary: '#180d1f', bgTertiary: '#22122a',
      surface: '#130a18', surfaceHover: '#1e1025',
      accent: '#e040fb', accentDim: '#9c27b0', accentFaint: 'rgba(224,64,251,0.08)',
      rose: '#f06292', blush: '#f48fb1', cream: '#fce4ec', creamDim: '#f8bbd0',
      mauve: '#ce93d8', dustyRose: '#ba68c8', warmGrey: '#9e8fa5', coolGrey: '#7b6e82',
      wine: '#7b1fa2', burgundy: '#6a0080', pink: '#f48fb1', softPink: '#f8bbd0', palePink: '#fce4ec',
      ash: '#b39ddb', silver: '#d1c4e9',
      text: '#fce4ec', textDim: '#ce93d8', textMuted: '#7b6e82',
      border: '#3d1a4a', borderActive: '#e040fb',
      cursor: '#f06292', selection: 'rgba(224,64,251,0.15)',
      prompt: '#f06292', output: '#e1bee7',
      error: '#ef5350', success: '#66bb6a', warning: '#ffca28', info: '#ce93d8',
      tabBar: '#130a18', tabActive: '#e040fb', tabInactive: '#7b6e82',
    },
  },

  cyber: {
    id: 'cyber',
    name: 'Cyber',
    tagline: 'Neural-jacked. Neon-drenched.',
    price: '$0.99',
    priceLabel: '$0.99',
    rcProductId: 'com.edenmux.theme_cyber',
    rcEntitlementId: 'cyber',
    landingImage: require('@/assets/images/theme-cyber.jpeg'),
    edenPortrait: require('@/assets/images/theme-cyber.jpeg'),
    uiAccent: '#00e5ff',
    uiBackground: '#050a0f',
    gradientColors: ['transparent', 'transparent', 'rgba(3,6,10,0.7)', 'rgba(3,6,10,0.97)'],
    terminal: {
      bg: '#050a0f', bgSecondary: '#0a1520', bgTertiary: '#0f1e2a',
      surface: '#07111a', surfaceHover: '#0d1c28',
      accent: '#00e5ff', accentDim: '#0097a7', accentFaint: 'rgba(0,229,255,0.08)',
      rose: '#00bcd4', blush: '#80deea', cream: '#e0f7fa', creamDim: '#b2ebf2',
      mauve: '#4dd0e1', dustyRose: '#26c6da', warmGrey: '#8eacb5', coolGrey: '#607d8b',
      wine: '#006064', burgundy: '#004d52', pink: '#80deea', softPink: '#b2ebf2', palePink: '#e0f7fa',
      ash: '#90a4ae', silver: '#b0bec5',
      text: '#e0f7fa', textDim: '#80deea', textMuted: '#607d8b',
      border: '#0d2a35', borderActive: '#00e5ff',
      cursor: '#00e5ff', selection: 'rgba(0,229,255,0.15)',
      prompt: '#00e5ff', output: '#b2ebf2',
      error: '#ff5252', success: '#69f0ae', warning: '#ffd740', info: '#80deea',
      tabBar: '#07111a', tabActive: '#00e5ff', tabInactive: '#607d8b',
    },
  },

  neo: {
    id: 'neo',
    name: 'Neo',
    tagline: 'Pure green. Old school soul.',
    price: '$0.99',
    priceLabel: '$0.99',
    rcProductId: 'com.edenmux.theme_neo',
    rcEntitlementId: 'neo',
    landingImage: require('@/assets/images/theme-neo.jpeg'),
    edenPortrait: require('@/assets/images/theme-neo.jpeg'),
    uiAccent: '#00e676',
    uiBackground: '#030f05',
    gradientColors: ['transparent', 'transparent', 'rgba(2,8,3,0.7)', 'rgba(2,8,3,0.97)'],
    terminal: {
      bg: '#030f05', bgSecondary: '#071a09', bgTertiary: '#0a2210',
      surface: '#051208', surfaceHover: '#091a0d',
      accent: '#00e676', accentDim: '#00a152', accentFaint: 'rgba(0,230,118,0.08)',
      rose: '#69f0ae', blush: '#b9f6ca', cream: '#f1f8e9', creamDim: '#dcedc8',
      mauve: '#a5d6a7', dustyRose: '#81c784', warmGrey: '#8faa91', coolGrey: '#607868',
      wine: '#2e7d32', burgundy: '#1b5e20', pink: '#b9f6ca', softPink: '#ccff90', palePink: '#f1f8e9',
      ash: '#a5d6a7', silver: '#c8e6c9',
      text: '#f1f8e9', textDim: '#a5d6a7', textMuted: '#607868',
      border: '#0d2e12', borderActive: '#00e676',
      cursor: '#00e676', selection: 'rgba(0,230,118,0.15)',
      prompt: '#00e676', output: '#dcedc8',
      error: '#ff5252', success: '#00e676', warning: '#ffd740', info: '#69f0ae',
      tabBar: '#051208', tabActive: '#00e676', tabInactive: '#607868',
    },
  },

  gothic: {
    id: 'gothic',
    name: 'Gothic',
    tagline: 'Bones and violet. Beautifully dark.',
    price: '$0.99',
    priceLabel: '$0.99',
    rcProductId: 'com.edenmux.theme_gothic',
    rcEntitlementId: 'gothic',
    landingImage: require('@/assets/images/theme-gothic.jpeg'),
    edenPortrait: require('@/assets/images/theme-gothic.jpeg'),
    uiAccent: '#9c27b0',
    uiBackground: '#08050c',
    gradientColors: ['transparent', 'transparent', 'rgba(5,3,8,0.7)', 'rgba(5,3,8,0.97)'],
    terminal: {
      bg: '#08050c', bgSecondary: '#110a18', bgTertiary: '#190f22',
      surface: '#0d071a', surfaceHover: '#160c22',
      accent: '#9c27b0', accentDim: '#6a0080', accentFaint: 'rgba(156,39,176,0.08)',
      rose: '#ab47bc', blush: '#ce93d8', cream: '#f3e5f5', creamDim: '#e1bee7',
      mauve: '#ba68c8', dustyRose: '#8d6e99', warmGrey: '#8a7a90', coolGrey: '#5e5568',
      wine: '#4a148c', burgundy: '#38006b', pink: '#ce93d8', softPink: '#e1bee7', palePink: '#f3e5f5',
      ash: '#9e8aaa', silver: '#b39ddb',
      text: '#f3e5f5', textDim: '#ce93d8', textMuted: '#5e5568',
      border: '#2a1040', borderActive: '#9c27b0',
      cursor: '#ab47bc', selection: 'rgba(156,39,176,0.15)',
      prompt: '#ab47bc', output: '#e1bee7',
      error: '#ef5350', success: '#66bb6a', warning: '#ffca28', info: '#ba68c8',
      tabBar: '#0d071a', tabActive: '#9c27b0', tabInactive: '#5e5568',
    },
  },

  glitter: {
    id: 'glitter',
    name: 'Glitter',
    tagline: 'Rose gold dreams. Sparkling and divine.',
    price: '$0.99',
    priceLabel: '$0.99',
    rcProductId: 'com.edenmux.theme_glitter',
    rcEntitlementId: 'glitter',
    landingImage: require('@/assets/images/theme-glitter.jpeg'),
    edenPortrait: require('@/assets/images/theme-glitter.jpeg'),
    uiAccent: '#ff80ab',
    uiBackground: '#130a10',
    gradientColors: ['transparent', 'transparent', 'rgba(10,5,9,0.7)', 'rgba(10,5,9,0.97)'],
    terminal: {
      bg: '#130a10', bgSecondary: '#1e1018', bgTertiary: '#281520',
      surface: '#180d15', surfaceHover: '#221220',
      accent: '#ff80ab', accentDim: '#c2185b', accentFaint: 'rgba(255,128,171,0.08)',
      rose: '#f48fb1', blush: '#f8bbd0', cream: '#fce4ec', creamDim: '#f8bbd0',
      mauve: '#f06292', dustyRose: '#e91e63', warmGrey: '#a0899a', coolGrey: '#7a6878',
      wine: '#880e4f', burgundy: '#6a0036', pink: '#ff4081', softPink: '#f8bbd0', palePink: '#fce4ec',
      ash: '#c49ab0', silver: '#f8bbd0',
      text: '#fce4ec', textDim: '#f48fb1', textMuted: '#7a6878',
      border: '#3d1a2e', borderActive: '#ff80ab',
      cursor: '#ff80ab', selection: 'rgba(255,128,171,0.15)',
      prompt: '#ff80ab', output: '#f8bbd0',
      error: '#ef5350', success: '#66bb6a', warning: '#ffca28', info: '#f48fb1',
      tabBar: '#180d15', tabActive: '#ff80ab', tabInactive: '#7a6878',
    },
  },

  // ─── METALLIC PACK ───────────────────────────────────────────────────────
  gold: {
    id: 'gold',
    name: 'Gold',
    tagline: 'Gilded in glory. Radiantly eternal.',
    price: '$0.99',
    priceLabel: '$0.99',
    rcProductId: 'com.edenmux.theme_gold',
    rcEntitlementId: 'gold',
    landingImage: require('@/assets/images/theme-gold.jpeg'),
    edenPortrait: require('@/assets/images/theme-gold.jpeg'),
    uiAccent: '#ffb300',
    uiBackground: '#0f0800',
    gradientColors: ['transparent', 'transparent', 'rgba(10,6,0,0.7)', 'rgba(10,6,0,0.97)'],
    terminal: {
      bg: '#0f0800', bgSecondary: '#1a1200', bgTertiary: '#251a00',
      surface: '#140a00', surfaceHover: '#201400',
      accent: '#ffb300', accentDim: '#e65100', accentFaint: 'rgba(255,179,0,0.08)',
      rose: '#ffd54f', blush: '#ffe082', cream: '#fff8e1', creamDim: '#ffecb3',
      mauve: '#ffcc02', dustyRose: '#ffa000', warmGrey: '#a89060', coolGrey: '#7a6840',
      wine: '#e65100', burgundy: '#bf360c', pink: '#ffca28', softPink: '#ffe082', palePink: '#fff8e1',
      ash: '#c8a060', silver: '#ffe082',
      text: '#fff8e1', textDim: '#ffd54f', textMuted: '#7a6840',
      border: '#3a2800', borderActive: '#ffb300',
      cursor: '#ffb300', selection: 'rgba(255,179,0,0.15)',
      prompt: '#ffb300', output: '#ffecb3',
      error: '#ef5350', success: '#69f0ae', warning: '#ffd740', info: '#ffd54f',
      tabBar: '#140a00', tabActive: '#ffb300', tabInactive: '#7a6840',
    },
  },

  chrome: {
    id: 'chrome',
    name: 'Chrome',
    tagline: 'Iridescent. Every angle a new color.',
    price: '$0.99',
    priceLabel: '$0.99',
    rcProductId: 'com.edenmux.theme_chrome',
    rcEntitlementId: 'chrome',
    landingImage: require('@/assets/images/theme-chrome.jpeg'),
    edenPortrait: require('@/assets/images/theme-chrome.jpeg'),
    uiAccent: '#cfd8dc',
    uiBackground: '#080c12',
    gradientColors: ['transparent', 'transparent', 'rgba(5,7,10,0.7)', 'rgba(5,7,10,0.97)'],
    terminal: {
      bg: '#080c12', bgSecondary: '#0e1420', bgTertiary: '#141c2a',
      surface: '#0a1018', surfaceHover: '#101820',
      accent: '#cfd8dc', accentDim: '#90a4ae', accentFaint: 'rgba(207,216,220,0.08)',
      rose: '#e0f7fa', blush: '#f5f5f5', cream: '#fafafa', creamDim: '#eceff1',
      mauve: '#b0bec5', dustyRose: '#90a4ae', warmGrey: '#9eacb5', coolGrey: '#78909c',
      wine: '#546e7a', burgundy: '#37474f', pink: '#e1f5fe', softPink: '#f5f5f5', palePink: '#fafafa',
      ash: '#b0bec5', silver: '#eceff1',
      text: '#fafafa', textDim: '#cfd8dc', textMuted: '#78909c',
      border: '#1c2a34', borderActive: '#cfd8dc',
      cursor: '#e0f7fa', selection: 'rgba(207,216,220,0.15)',
      prompt: '#e0f7fa', output: '#eceff1',
      error: '#ff5252', success: '#69f0ae', warning: '#ffd740', info: '#b0bec5',
      tabBar: '#0a1018', tabActive: '#cfd8dc', tabInactive: '#78909c',
    },
  },

  cobalt: {
    id: 'cobalt',
    name: 'Cobalt',
    tagline: 'Deep blue. Electric and cosmic.',
    price: '$0.99',
    priceLabel: '$0.99',
    rcProductId: 'com.edenmux.theme_cobalt',
    rcEntitlementId: 'cobalt',
    landingImage: require('@/assets/images/theme-cobalt.jpeg'),
    edenPortrait: require('@/assets/images/theme-cobalt.jpeg'),
    uiAccent: '#2979ff',
    uiBackground: '#020814',
    gradientColors: ['transparent', 'transparent', 'rgba(1,4,10,0.7)', 'rgba(1,4,10,0.97)'],
    terminal: {
      bg: '#020814', bgSecondary: '#04102a', bgTertiary: '#071838',
      surface: '#030c1e', surfaceHover: '#081428',
      accent: '#2979ff', accentDim: '#1565c0', accentFaint: 'rgba(41,121,255,0.08)',
      rose: '#448aff', blush: '#82b1ff', cream: '#e8eaf6', creamDim: '#c5cae9',
      mauve: '#5c6bc0', dustyRose: '#3f51b5', warmGrey: '#8090b0', coolGrey: '#5e6e90',
      wine: '#1a237e', burgundy: '#0d1460', pink: '#82b1ff', softPink: '#c5cae9', palePink: '#e8eaf6',
      ash: '#7986cb', silver: '#9fa8da',
      text: '#e8eaf6', textDim: '#82b1ff', textMuted: '#5e6e90',
      border: '#0d1e40', borderActive: '#2979ff',
      cursor: '#448aff', selection: 'rgba(41,121,255,0.15)',
      prompt: '#448aff', output: '#c5cae9',
      error: '#ff5252', success: '#69f0ae', warning: '#ffd740', info: '#82b1ff',
      tabBar: '#030c1e', tabActive: '#2979ff', tabInactive: '#5e6e90',
    },
  },

  silver: {
    id: 'silver',
    name: 'Silver',
    tagline: 'Frost and silence. Ice-cold perfection.',
    price: '$0.99',
    priceLabel: '$0.99',
    rcProductId: 'com.edenmux.theme_silver',
    rcEntitlementId: 'silver',
    landingImage: require('@/assets/images/theme-silver.jpeg'),
    edenPortrait: require('@/assets/images/theme-silver.jpeg'),
    uiAccent: '#90caf9',
    uiBackground: '#080c14',
    gradientColors: ['transparent', 'transparent', 'rgba(4,6,10,0.7)', 'rgba(4,6,10,0.97)'],
    terminal: {
      bg: '#080c14', bgSecondary: '#0e1420', bgTertiary: '#141c2c',
      surface: '#0a1018', surfaceHover: '#101820',
      accent: '#90caf9', accentDim: '#5b9bd5', accentFaint: 'rgba(144,202,249,0.08)',
      rose: '#b3e5fc', blush: '#e1f5fe', cream: '#f5f9ff', creamDim: '#deeeff',
      mauve: '#81d4fa', dustyRose: '#4fc3f7', warmGrey: '#90a8c0', coolGrey: '#6888a0',
      wine: '#0277bd', burgundy: '#01579b', pink: '#b3e5fc', softPink: '#e1f5fe', palePink: '#f5f9ff',
      ash: '#90b8d0', silver: '#deeeff',
      text: '#f0f8ff', textDim: '#b3e5fc', textMuted: '#6888a0',
      border: '#1a2a3c', borderActive: '#90caf9',
      cursor: '#90caf9', selection: 'rgba(144,202,249,0.15)',
      prompt: '#90caf9', output: '#deeeff',
      error: '#ff5252', success: '#69f0ae', warning: '#ffd740', info: '#81d4fa',
      tabBar: '#0a1018', tabActive: '#90caf9', tabInactive: '#6888a0',
    },
  },
};

export const THEME_ORDER = ['default', 'candy', 'cyber', 'neo', 'gothic', 'glitter', 'gold', 'chrome', 'cobalt', 'silver'];

export const BUNDLE_PRODUCT_ID = 'com.edenmux.theme_bundle_current';
export const BUNDLE_FUTURE_PRODUCT_ID = 'com.edenmux.theme_bundle_future';
export const METALLIC_BUNDLE_PRODUCT_ID = 'com.edenmux.theme_bundle_metallic';
export const CORE_UNLOCK_PRODUCT_ID = 'com.edenmux.core_unlock';
export const CORE_UNLOCK_ENTITLEMENT_ID = 'core_unlock';

interface ThemeContextValue {
  theme: Theme;
  themeId: string;
  unlockedThemes: string[];
  setTheme: (id: string) => void;
  unlockTheme: (id: string) => void;
  unlockThemes: (ids: string[]) => void;
  isUnlocked: (id: string) => boolean;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeId, setThemeId] = useState('default');
  const [unlockedThemes, setUnlockedThemes] = useState<string[]>(['default']);

  useEffect(() => {
    (async () => {
      try {
        const [savedTheme, savedUnlocked] = await Promise.all([
          AsyncStorage.getItem(THEME_STORAGE_KEY),
          AsyncStorage.getItem(UNLOCKED_STORAGE_KEY),
        ]);
        if (savedTheme && THEMES[savedTheme]) setThemeId(savedTheme);
        if (savedUnlocked) {
          const parsed = JSON.parse(savedUnlocked);
          setUnlockedThemes(['default', ...parsed.filter((t: string) => t !== 'default')]);
        }
      } catch {}
    })();
  }, []);

  const setTheme = useCallback(async (id: string) => {
    if (!THEMES[id]) return;
    setThemeId(id);
    await AsyncStorage.setItem(THEME_STORAGE_KEY, id);
  }, []);

  const unlockTheme = useCallback(async (id: string) => {
    setUnlockedThemes(prev => {
      const next = prev.includes(id) ? prev : [...prev, id];
      AsyncStorage.setItem(UNLOCKED_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const unlockThemes = useCallback(async (ids: string[]) => {
    setUnlockedThemes(prev => {
      const newOnes = ids.filter(id => !prev.includes(id));
      if (newOnes.length === 0) return prev;
      const next = [...prev, ...newOnes];
      AsyncStorage.setItem(UNLOCKED_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const isUnlocked = useCallback((id: string) => {
    return unlockedThemes.includes(id);
  }, [unlockedThemes]);

  const value = useMemo(() => ({
    theme: THEMES[themeId] || THEMES.default,
    themeId,
    unlockedThemes,
    setTheme,
    unlockTheme,
    unlockThemes,
    isUnlocked,
  }), [themeId, unlockedThemes, setTheme, unlockTheme, unlockThemes, isUnlocked]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}

export function useTerminalColors(): TerminalPalette {
  const { theme } = useTheme();
  return theme.terminal;
}
