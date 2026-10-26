import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Linking, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { getApiUrl } from '@/lib/query-client';
import { useAppConfig } from '@/lib/app-config-context';

const RETRY_INTERVAL_MS = 30_000;

function getAppStoreUrl(): string {
  const id: string =
    (process.env.EXPO_PUBLIC_APP_STORE_ID ?? '') ||
    (Constants.expoConfig?.extra?.appStoreId ?? '');
  if (id) {
    return `https://apps.apple.com/app/id${id}`;
  }
  return 'https://apps.apple.com/search?term=EdenMux';
}

export function UpdateRequired() {
  const insets = useSafeAreaInsets();
  const { recheckConfig } = useAppConfig();
  const recheckRef = useRef(recheckConfig);
  recheckRef.current = recheckConfig;

  useEffect(() => {
    const interval = setInterval(() => {
      recheckRef.current();
    }, RETRY_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  function handleUpdate() {
    if (Platform.OS === 'ios') {
      Linking.openURL(getAppStoreUrl());
    } else {
      Linking.openURL(`${getApiUrl()}/api/dl/apk`);
    }
  }

  const buttonLabel = Platform.OS === 'ios' ? 'Update on App Store' : 'Download Update';

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.content}>
        <Text style={styles.glyph}>⬆</Text>
        <Text style={styles.title}>Update Required</Text>
        <Text style={styles.body}>
          This version of EdenMux is no longer supported.{' '}
          {Platform.OS === 'ios'
            ? 'Update from the App Store to keep using the app.'
            : 'Download the latest build to keep using the app.'}
        </Text>
        <Text style={styles.hint}>Checking again automatically every 30 seconds…</Text>
        <Pressable
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
          onPress={handleUpdate}
        >
          <Text style={styles.buttonText}>{buttonLabel}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1015',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: 36,
    gap: 16,
  },
  glyph: {
    fontSize: 48,
    color: '#c8506a',
    marginBottom: 4,
  },
  title: {
    fontFamily: 'Cinzel_700Bold',
    fontSize: 24,
    color: '#f0d6de',
    textAlign: 'center',
  },
  body: {
    fontFamily: 'JetBrainsMono_400Regular',
    fontSize: 14,
    color: '#a08090',
    textAlign: 'center',
    lineHeight: 22,
  },
  hint: {
    fontFamily: 'JetBrainsMono_400Regular',
    fontSize: 11,
    color: '#6e5560',
    textAlign: 'center',
  },
  button: {
    marginTop: 8,
    backgroundColor: '#c8506a',
    paddingVertical: 14,
    paddingHorizontal: 36,
    borderRadius: 8,
  },
  buttonPressed: {
    opacity: 0.75,
  },
  buttonText: {
    fontFamily: 'JetBrainsMono_700Bold',
    fontSize: 15,
    color: '#fff',
    letterSpacing: 0.5,
  },
});
