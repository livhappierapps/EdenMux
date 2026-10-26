import React, { createContext, useContext, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import * as Application from 'expo-application';
import { apiRequest } from '@/lib/query-client';

export interface AppConfig {
  features: {
    shellMode: boolean;
    voiceInput: boolean;
    themeShop: boolean;
    screenshotStudio: boolean;
  };
  eden: {
    voiceId: string;
  };
  app: {
    motd: string | null;
    minimumVersion: string;
  };
}

const DEFAULT_CONFIG: AppConfig = {
  features: {
    shellMode: false,
    voiceInput: true,
    themeShop: true,
    screenshotStudio: true,
  },
  eden: {
    voiceId: 'Kukbe09auJMFYu1Aidx0',
  },
  app: {
    motd: null,
    minimumVersion: '1.0.1',
  },
};

function parseSemver(version: string): [number, number, number] {
  const parts = version.split('.').map(Number);
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

function isVersionBelow(current: string, minimum: string): boolean {
  const [cMaj, cMin, cPat] = parseSemver(current);
  const [mMaj, mMin, mPat] = parseSemver(minimum);
  if (cMaj !== mMaj) return cMaj < mMaj;
  if (cMin !== mMin) return cMin < mMin;
  return cPat < mPat;
}

interface AppConfigContextType {
  config: AppConfig;
  isLoaded: boolean;
  isUpdateRequired: boolean;
  recheckConfig: () => Promise<void>;
}

const AppConfigContext = createContext<AppConfigContextType>({
  config: DEFAULT_CONFIG,
  isLoaded: false,
  isUpdateRequired: false,
  recheckConfig: async () => {},
});

export function AppConfigProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isUpdateRequired, setIsUpdateRequired] = useState(false);

  useEffect(() => {
    fetchConfig();
  }, []);

  async function fetchConfig() {
    try {
      const res = await apiRequest('GET', '/api/config');
      if (res.ok) {
        const data = await res.json() as AppConfig;
        setConfig(data);

        const minimumVersion = data.app?.minimumVersion;
        if (minimumVersion && Platform.OS !== 'web') {
          const nativeVersion = Application.nativeApplicationVersion;
          if (nativeVersion && isVersionBelow(nativeVersion, minimumVersion)) {
            setIsUpdateRequired(true);
          } else {
            // Admin may have lowered minimumVersion since last check — unblock immediately.
            setIsUpdateRequired(false);
          }
        } else {
          setIsUpdateRequired(false);
        }
      }
    } catch {
      // Network failure: leave isUpdateRequired as-is rather than flip-flopping on a flaky connection.
    } finally {
      setIsLoaded(true);
    }
  }

  return (
    <AppConfigContext.Provider value={{ config, isLoaded, isUpdateRequired, recheckConfig: fetchConfig }}>
      {children}
    </AppConfigContext.Provider>
  );
}

export function useAppConfig() {
  return useContext(AppConfigContext);
}
