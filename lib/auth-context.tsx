import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { getApiUrl } from '@/lib/query-client';

async function rcLogIn(userId: string): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const Purchases = (await import('react-native-purchases')).default;
    await Purchases.logIn(userId);
  } catch {
    console.warn('[RevenueCat] logIn failed.');
  }
}

async function rcLogOut(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const Purchases = (await import('react-native-purchases')).default;
    await Purchases.logOut();
  } catch {
    console.warn('[RevenueCat] logOut failed.');
  }
}

const AUTH_KEY = 'edenmux_user_v2';

export interface AuthUser {
  userId: string;
  email: string | null;
  fullName: string | null;
  authType: 'apple' | 'email';
  token?: string;
  _p?: boolean;
}

interface AuthContextValue {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: AuthUser | null;
  signInWithApple: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  registerWithEmail: (email: string, password: string, username?: string, k?: string) => Promise<void>;
  redeemCode: (code: string) => Promise<boolean>;
  signOut: () => Promise<void>;
  isAppleSignInAvailable: boolean;
  authError: string | null;
  clearAuthError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function storeUser(user: AuthUser): Promise<void> {
  const data = JSON.stringify(user);
  if (Platform.OS !== 'web') {
    try {
      const SecureStore = await import('expo-secure-store');
      await SecureStore.setItemAsync(AUTH_KEY, data);
      return;
    } catch {}
  }
  await AsyncStorage.setItem(AUTH_KEY, data);
}

async function getStoredUser(): Promise<AuthUser | null> {
  try {
    let stored: string | null = null;
    if (Platform.OS !== 'web') {
      try {
        const SecureStore = await import('expo-secure-store');
        stored = await SecureStore.getItemAsync(AUTH_KEY);
      } catch {}
    }
    if (!stored) {
      stored = await AsyncStorage.getItem(AUTH_KEY);
    }
    if (stored) return JSON.parse(stored);
  } catch {}
  return null;
}

async function clearStoredUser(): Promise<void> {
  try {
    if (Platform.OS !== 'web') {
      try {
        const SecureStore = await import('expo-secure-store');
        await SecureStore.deleteItemAsync(AUTH_KEY);
      } catch {}
    }
    await AsyncStorage.removeItem(AUTH_KEY);
  } catch {}
}

async function verifyEmailToken(token: string): Promise<AuthUser | null> {
  try {
    const base = getApiUrl();
    const url = new URL('/api/auth/verify', base).toString();
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    const data = await res.json();
    if (data.valid && data.user) {
      return { ...data.user, authType: 'email', token, _p: !!data.user._p };
    }
  } catch {}
  return null;
}

async function fetchExt(id: string): Promise<boolean> {
  try {
    const base = getApiUrl();
    const url = new URL('/api/sys/chk', base).toString();
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    const data = await res.json();
    return !!data.p;
  } catch { return false; }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAppleSignInAvailable, setIsAppleSignInAvailable] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        if (Platform.OS === 'ios') {
          const AppleAuth = await import('expo-apple-authentication');
          const available = await AppleAuth.isAvailableAsync();
          setIsAppleSignInAvailable(available);

          const storedUser = await getStoredUser();
          if (storedUser) {
            if (storedUser.authType === 'apple') {
              try {
                const credentialState = await AppleAuth.getCredentialStateAsync(storedUser.userId);
                if (credentialState === AppleAuth.AppleAuthenticationCredentialState.AUTHORIZED) {
                  const _p = await fetchExt(storedUser.userId);
                  const updated = { ...storedUser, _p };
                  await storeUser(updated);
                  setUser(updated);
                  await rcLogIn(updated.userId);
                } else {
                  await clearStoredUser();
                  setAuthError('Session revoked. Please sign in again.');
                }
              } catch {
                setUser(storedUser);
                await rcLogIn(storedUser.userId);
              }
            } else if (storedUser.authType === 'email' && storedUser.token) {
              const verified = await verifyEmailToken(storedUser.token);
              if (verified) {
                setUser(verified);
                await rcLogIn(verified.userId);
              } else await clearStoredUser();
            } else {
              await clearStoredUser();
            }
          }
        } else {
          setIsAppleSignInAvailable(false);
          const storedUser = await getStoredUser();
          if (storedUser) {
            if (storedUser.authType === 'email' && storedUser.token) {
              const verified = await verifyEmailToken(storedUser.token);
              if (verified) {
                await storeUser(verified);
                setUser(verified);
                await rcLogIn(verified.userId);
              } else {
                await clearStoredUser();
              }
            } else if (storedUser.authType === 'apple') {
              setUser(storedUser);
              await rcLogIn(storedUser.userId);
            } else {
              await clearStoredUser();
            }
          }
        }
      } catch {}
      setIsLoading(false);
    })();
  }, []);

  const signInWithApple = useCallback(async () => {
    setAuthError(null);
    try {
      if (Platform.OS !== 'ios') {
        setAuthError('Apple Sign In requires iOS. Use email to sign in on this device.');
        return;
      }
      if (Platform.OS === 'ios') {
        const AppleAuth = await import('expo-apple-authentication');
        const credential = await AppleAuth.signInAsync({
          requestedScopes: [
            AppleAuth.AppleAuthenticationScope.FULL_NAME,
            AppleAuth.AppleAuthenticationScope.EMAIL,
          ],
        });
        const _p = await fetchExt(credential.user);

        let appleToken: string | undefined;
        if (credential.identityToken) {
          try {
            const base = getApiUrl();
            const appleUrl = new URL('/api/auth/apple', base).toString();
            const appleRes = await fetch(appleUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'expo-platform': Platform.OS },
              body: JSON.stringify({ identityToken: credential.identityToken }),
            });
            const appleData = await appleRes.json();
            if (appleData.token) appleToken = appleData.token;
          } catch {}
        }

        const authUser: AuthUser = {
          userId: credential.user,
          email: credential.email || null,
          fullName: credential.fullName
            ? [credential.fullName.givenName, credential.fullName.familyName].filter(Boolean).join(' ') || null
            : null,
          authType: 'apple',
          token: appleToken,
          _p,
        };
        await storeUser(authUser);
        setUser(authUser);
        await rcLogIn(authUser.userId);
      }
    } catch (e: any) {
      if (e.code === 'ERR_REQUEST_CANCELED') return;
      setAuthError('Apple Sign In failed. Please try again.');
    }
  }, []);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    setAuthError(null);
    try {
      const base = getApiUrl();
      const url = new URL('/api/auth/login', base).toString();
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'expo-platform': Platform.OS },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAuthError(data.error || 'Sign in failed. Please try again.');
        return;
      }
      const authUser: AuthUser = { ...data.user, authType: 'email', token: data.token, _p: !!data.user._p };
      await storeUser(authUser);
      setUser(authUser);
      await rcLogIn(authUser.userId);
    } catch {
      setAuthError('Network error. Please check your connection and try again.');
    }
  }, []);

  const registerWithEmail = useCallback(async (email: string, password: string, username?: string, k?: string) => {
    setAuthError(null);
    try {
      const base = getApiUrl();
      const url = new URL('/api/auth/register', base).toString();
      const body: any = { email, password, username };
      if (k) body.k = k;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'expo-platform': Platform.OS },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setAuthError(data.error || 'Registration failed. Please try again.');
        return;
      }
      const authUser: AuthUser = { ...data.user, authType: 'email', token: data.token, _p: !!data.user._p };
      await storeUser(authUser);
      setUser(authUser);
      await rcLogIn(authUser.userId);
    } catch {
      setAuthError('Network error. Please check your connection and try again.');
    }
  }, []);

  const redeemCode = useCallback(async (code: string): Promise<boolean> => {
    if (!user) return false;
    try {
      const id = (user.email || user.userId).toLowerCase().trim();
      const base = getApiUrl();
      const url = new URL('/api/sys/key', base).toString();
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ k: code, id }),
      });
      const data = await res.json();
      if (data.ok) {
        const updated = { ...user, _p: true };
        await storeUser(updated);
        setUser(updated);
        return true;
      }
    } catch {}
    return false;
  }, [user]);

  const signOut = useCallback(async () => {
    await rcLogOut();
    await clearStoredUser();
    setUser(null);
  }, []);

  const clearAuthError = useCallback(() => setAuthError(null), []);

  const value = useMemo(() => ({
    isAuthenticated: !!user,
    isLoading,
    user,
    signInWithApple,
    signInWithEmail,
    registerWithEmail,
    redeemCode,
    signOut,
    isAppleSignInAvailable,
    authError,
    clearAuthError,
  }), [user, isLoading, signInWithApple, signInWithEmail, registerWithEmail, redeemCode, signOut, isAppleSignInAvailable, authError, clearAuthError]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
