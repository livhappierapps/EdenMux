import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, Platform, ActivityIndicator, Pressable,
  Image, TextInput, ScrollView, KeyboardAvoidingView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '@/lib/auth-context';
import { useEden } from '@/lib/eden-context';
import { getApiUrl } from '@/lib/query-client';
import { useTheme, useTerminalColors } from '@/lib/theme-context';

const monoFont = Platform.select({
  ios: 'JetBrainsMono_400Regular',
  android: 'JetBrainsMono_400Regular',
  default: 'JetBrainsMono_400Regular',
});

const titleFont = Platform.select({
  ios: 'Cinzel_700Bold',
  android: 'Cinzel_700Bold',
  default: 'Cinzel_700Bold',
});

function AppleSignInButtonNative({ onPress }: { onPress: () => void }) {
  const [AppleAuth, setAppleAuth] = useState<any>(null);

  useEffect(() => {
    if (Platform.OS === 'ios') {
      import('expo-apple-authentication').then(mod => setAppleAuth(mod));
    }
  }, []);

  if (!AppleAuth) return null;

  return (
    <AppleAuth.AppleAuthenticationButton
      buttonType={AppleAuth.AppleAuthenticationButtonType.SIGN_IN}
      buttonStyle={AppleAuth.AppleAuthenticationButtonStyle.WHITE}
      cornerRadius={12}
      style={styles.appleButton}
      onPress={onPress}
    />
  );
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return '00:00';
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

function BanScreen({ banUntil, permanent }: { banUntil: string | null; permanent: boolean }) {
  const { theme } = useTheme();
  const tc = useTerminalColors();
  const insets = useSafeAreaInsets();
  const [remaining, setRemaining] = useState<number>(
    banUntil ? Math.max(0, new Date(banUntil).getTime() - Date.now()) : 0
  );

  useEffect(() => {
    if (permanent || !banUntil) return;
    const interval = setInterval(() => {
      const left = Math.max(0, new Date(banUntil).getTime() - Date.now());
      setRemaining(left);
      if (left <= 0) clearInterval(interval);
    }, 1000);
    return () => clearInterval(interval);
  }, [banUntil, permanent]);

  return (
    <View style={StyleSheet.absoluteFill}>
      <Image source={theme.edenPortrait} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
      <LinearGradient
        colors={[`${theme.uiBackground}4d`, `${theme.uiBackground}d9`]}
        style={StyleSheet.absoluteFillObject}
      />
      <View style={[banStyles.content, { paddingTop: insets.top + 60, paddingBottom: insets.bottom + 40 }]}>
        <Text style={[banStyles.title, { fontFamily: titleFont, color: tc.cream }]}>EdenMux</Text>
        <Text style={[banStyles.subtitle, { fontFamily: monoFont, color: tc.textDim }]}>
          {permanent
            ? 'You have been permanently removed from this garden.'
            : 'You have been asked to step away for a while.'}
        </Text>
        {!permanent && remaining > 0 && (
          <>
            <View style={[banStyles.timerBox, { backgroundColor: tc.accentFaint, borderColor: `${tc.accent}40` }]}>
              <Text style={[banStyles.timerLabel, { fontFamily: monoFont, color: tc.mauve }]}>Come back in</Text>
              <Text style={[banStyles.timerValue, { fontFamily: titleFont, color: tc.rose }]}>{formatCountdown(remaining)}</Text>
            </View>
            <Text style={[banStyles.hint, { fontFamily: monoFont, color: tc.textMuted }]}>
              When you return, please treat Eden and this space with kindness.
            </Text>
          </>
        )}
        {!permanent && remaining <= 0 && (
          <Text style={[banStyles.hint, { fontFamily: monoFont, color: tc.textMuted }]}>
            Your time is up. You may sign in again. Please be kind.
          </Text>
        )}
      </View>
    </View>
  );
}

function EmailAuthForm() {
  const { signInWithEmail, registerWithEmail, authError, clearAuthError } = useAuth();
  const tc = useTerminalColors();
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [accessCode, setAccessCode] = useState('');
  const [showCode, setShowCode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);

  const switchMode = (next: 'login' | 'register' | 'forgot') => {
    clearAuthError();
    setEmail(''); setPassword(''); setUsername(''); setConfirmPw(''); setAccessCode(''); setShowCode(false);
    setForgotSent(false);
    setMode(next);
  };

  const handleForgotSubmit = async () => {
    if (loading || !email.trim()) return;
    setLoading(true);
    try {
      const base = getApiUrl();
      const url = new URL('/api/auth/forgot-password', base).toString();
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'expo-platform': Platform.OS },
        body: JSON.stringify({ email: email.trim() }),
      });
      setForgotSent(true);
    } catch {
      setForgotSent(true);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (loading) return;
    if (!email.trim() || !password.trim()) return;
    if (mode === 'register' && password !== confirmPw) return;
    setLoading(true);
    try {
      if (mode === 'login') {
        await signInWithEmail(email.trim(), password);
      } else {
        await registerWithEmail(email.trim(), password, username.trim() || undefined, accessCode.trim() || undefined);
      }
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = [
    emailStyles.input,
    { fontFamily: monoFont, color: tc.cream, borderColor: `${tc.accent}40` },
  ];

  return (
    <View style={emailStyles.container}>
      <View style={emailStyles.header}>
        <Text style={[emailStyles.title, { fontFamily: titleFont, color: tc.cream }]}>EdenMux</Text>
        <Text style={[emailStyles.subtitle, { fontFamily: monoFont, color: tc.mauve }]}>
          {mode === 'login' ? 'Welcome back.' : mode === 'register' ? 'Create your account.' : 'Reset your password.'}
        </Text>
      </View>

      <View style={emailStyles.form}>
        {mode === 'register' && (
          <TextInput
            style={inputStyle}
            placeholder="Username (optional)"
            placeholderTextColor="rgba(255,255,255,0.3)"
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
          />
        )}
        <TextInput
          style={inputStyle}
          placeholder="Email"
          placeholderTextColor="rgba(255,255,255,0.3)"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />
        {mode !== 'forgot' && (
          <View style={emailStyles.passwordRow}>
            <TextInput
              style={[inputStyle, { flex: 1, marginBottom: 0 }]}
              placeholder="Password"
              placeholderTextColor="rgba(255,255,255,0.3)"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
            />
            <Pressable onPress={() => setShowPassword(v => !v)} style={emailStyles.eyeBtn} hitSlop={8}>
              <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color="rgba(255,255,255,0.4)" />
            </Pressable>
          </View>
        )}

        {mode === 'login' && (
          <Pressable onPress={() => switchMode('forgot')} style={{ alignSelf: 'flex-end' }}>
            <Text style={[emailStyles.forgotText, { fontFamily: monoFont, color: `${tc.mauve}99` }]}>Forgot password?</Text>
          </Pressable>
        )}

        {mode === 'register' && (
          <>
            <View style={emailStyles.passwordRow}>
              <TextInput
                style={[inputStyle, { flex: 1, marginBottom: 0 }]}
                placeholder="Confirm password"
                placeholderTextColor="rgba(255,255,255,0.3)"
                value={confirmPw}
                onChangeText={setConfirmPw}
                secureTextEntry={!showConfirmPw}
              />
              <Pressable onPress={() => setShowConfirmPw(v => !v)} style={emailStyles.eyeBtn} hitSlop={8}>
                <Ionicons name={showConfirmPw ? 'eye-off-outline' : 'eye-outline'} size={18} color="rgba(255,255,255,0.4)" />
              </Pressable>
            </View>
            {password.length > 0 && confirmPw.length > 0 && password !== confirmPw && (
              <Text style={[emailStyles.inlineError, { fontFamily: monoFont, color: tc.error }]}>
                Passwords don't match.
              </Text>
            )}
          </>
        )}

        {mode === 'register' && (
          <>
            <Pressable onPress={() => setShowCode(v => !v)} style={{ alignSelf: 'flex-start' }}>
              <Text style={[emailStyles.codeToggle, { color: `${tc.mauve}99` }]}>
                {showCode ? '− Invite code' : '+ Have an invite code?'}
              </Text>
            </Pressable>
            {showCode && (
              <TextInput
                style={inputStyle}
                placeholder="Invite code"
                placeholderTextColor="rgba(255,255,255,0.3)"
                value={accessCode}
                onChangeText={setAccessCode}
                autoCapitalize="none"
                autoCorrect={false}
              />
            )}
          </>
        )}

        {authError && (
          <Text style={[emailStyles.inlineError, { fontFamily: monoFont, color: tc.error }]}>{authError}</Text>
        )}

        {mode === 'forgot' && forgotSent ? (
          <View style={emailStyles.forgotSuccess}>
            <Ionicons name="checkmark-circle-outline" size={28} color={tc.accent} style={{ marginBottom: 10 }} />
            <Text style={[emailStyles.forgotSuccessTitle, { fontFamily: titleFont, color: tc.cream }]}>Check your email</Text>
            <Text style={[emailStyles.forgotSuccessBody, { fontFamily: monoFont, color: tc.mauve }]}>
              If an account exists for that address, a reset link is on its way. It expires in 1 hour.
            </Text>
          </View>
        ) : (
          <Pressable
            onPress={mode === 'forgot' ? handleForgotSubmit : handleSubmit}
            disabled={loading || (mode === 'forgot' && !email.trim())}
            style={({ pressed }) => [
              emailStyles.submitButton,
              { backgroundColor: tc.rose },
              pressed && { opacity: 0.8 },
              (mode === 'forgot' && !email.trim()) && { opacity: 0.45 },
            ]}
          >
            {loading
              ? <ActivityIndicator size="small" color={tc.cream} />
              : <Text style={[emailStyles.submitText, { fontFamily: titleFont, color: tc.cream }]}>
                  {mode === 'login' ? 'Sign In' : mode === 'register' ? 'Create Account' : 'Send Reset Link'}
                </Text>
            }
          </Pressable>
        )}

        <Pressable onPress={() => switchMode(mode === 'forgot' || mode === 'register' ? 'login' : 'register')}>
          <Text style={[emailStyles.switchText, { fontFamily: monoFont, color: tc.mauve }]}>
            {mode === 'login' ? "Don't have an account? Register" : 'Back to Sign In'}
          </Text>
        </Pressable>
      </View>

    </View>
  );
}

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, signInWithApple, isAppleSignInAvailable, authError } = useAuth();
  const { moderation } = useEden();
  const { theme } = useTheme();
  const tc = useTerminalColors();
  const insets = useSafeAreaInsets();

  if (isAuthenticated && moderation?.banned) {
    const remaining = moderation.banUntil
      ? Math.max(0, new Date(moderation.banUntil).getTime() - Date.now())
      : 0;
    if (moderation.permanent || remaining > 0) {
      return <BanScreen banUntil={moderation.banUntil} permanent={moderation.permanent} />;
    }
  }

  if (isLoading) {
    return (
      <View style={StyleSheet.absoluteFill}>
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: theme.uiBackground }]} />
        {theme.landingImage && (
          <Image source={theme.landingImage} style={styles.landingImage} resizeMode="cover" />
        )}
        <View style={styles.loadingCenter}>
          <ActivityIndicator size="large" color={tc.rose} />
        </View>
      </View>
    );
  }

  if (isAuthenticated) {
    return <>{children}</>;
  }

  const bottomPad = Platform.OS === 'web' ? 34 : insets.bottom;
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  if (Platform.OS !== 'ios') {
    return (
      <View style={StyleSheet.absoluteFill}>
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: theme.uiBackground }]} />
        {theme.landingImage && (
          <Image source={theme.landingImage} style={styles.landingImage} resizeMode="cover" />
        )}
        <LinearGradient
          colors={theme.gradientColors}
          locations={[0, 0.45, 0.7, 1]}
          style={StyleSheet.absoluteFillObject}
        />
        <KeyboardAvoidingView style={styles.androidPanel} behavior="padding">
          <ScrollView
            contentContainerStyle={[styles.androidScroll, { paddingBottom: bottomPad + 8 }]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <EmailAuthForm />
            <View style={[styles.footer, { marginTop: 8 }]}>
              <Text style={[styles.footerText, { fontFamily: monoFont }]}>Sign in with email</Text>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    );
  }

  return (
    <View style={StyleSheet.absoluteFill}>
      <View style={[StyleSheet.absoluteFillObject, { backgroundColor: theme.uiBackground }]} />
      {theme.landingImage && (
        <Image source={theme.landingImage} style={styles.landingImage} resizeMode="cover" />
      )}
      <LinearGradient
        colors={theme.gradientColors}
        locations={[0, 0.45, 0.7, 1]}
        style={StyleSheet.absoluteFillObject}
      />
      <View style={[styles.bottom, { paddingBottom: bottomPad + 8 }]}>
        {isAppleSignInAvailable ? (
          <AppleSignInButtonNative onPress={signInWithApple} />
        ) : (
          <View style={styles.webFallback}>
            <Text style={[styles.webFallbackTitle, { fontFamily: titleFont, color: tc.cream }]}>
              Apple Sign In Required
            </Text>
            <Text style={[styles.webFallbackText, { fontFamily: monoFont }]}>
              Please open EdenMux on your iPhone or iPad.
            </Text>
          </View>
        )}

        {authError && (
          <Text style={[styles.errorText, { fontFamily: monoFont, color: tc.error }]}>{authError}</Text>
        )}

        <View style={styles.footer}>
          <Ionicons name="logo-apple" size={12} color="rgba(255,255,255,0.3)" />
          <Text style={[styles.footerText, { fontFamily: monoFont }]}>
            Sign in with Apple ID
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  landingImage: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' },
  landingImageFaint: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%', opacity: 0.15 },
  loadingCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scrollContent: { flexGrow: 1, paddingHorizontal: 24, justifyContent: 'center' },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 28, alignItems: 'center' },
  appleButton: { width: '100%', height: 52, marginBottom: 12 },
  webFallback: { alignItems: 'center', marginBottom: 12, paddingHorizontal: 8 },
  webFallbackTitle: { fontSize: 18, marginBottom: 8, letterSpacing: 1 },
  webFallbackText: { fontSize: 12, color: 'rgba(255,255,255,0.5)', textAlign: 'center', lineHeight: 18 },
  errorText: { fontSize: 12, marginTop: 8, textAlign: 'center' },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 10, marginBottom: 12 },
  footerText: { fontSize: 10, color: 'rgba(255,255,255,0.25)' },
  platformNote: { marginTop: 16, marginBottom: 8, paddingHorizontal: 4 },
  platformNoteText: { fontSize: 11, color: 'rgba(255,255,255,0.25)', textAlign: 'center', lineHeight: 17, fontStyle: 'italic' },
  androidPanel: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  androidScroll: { flexGrow: 1, paddingHorizontal: 28, paddingTop: 16 },
});

const emailStyles = StyleSheet.create({
  container: { width: '100%' },
  header: { alignItems: 'center', marginBottom: 24 },
  title: { fontSize: 26, letterSpacing: 3, marginBottom: 6 },
  subtitle: { fontSize: 12, letterSpacing: 1 },
  form: { gap: 10, marginBottom: 16 },
  input: { backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14 },
  inlineError: { fontSize: 11, marginTop: -4 },
  passwordRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', borderRadius: 10, paddingHorizontal: 14 },
  eyeBtn: { paddingLeft: 8, paddingVertical: 12 },
  forgotText: { fontSize: 11, letterSpacing: 0.3, marginTop: -2 },
  forgotSuccess: { alignItems: 'center', paddingVertical: 16, paddingHorizontal: 8 },
  forgotSuccessTitle: { fontSize: 16, letterSpacing: 1, marginBottom: 8 },
  forgotSuccessBody: { fontSize: 12, textAlign: 'center', lineHeight: 18, opacity: 0.8 },
  submitButton: { borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  submitText: { fontSize: 14, letterSpacing: 1.5 },
  switchText: { fontSize: 12, textAlign: 'center', marginTop: 4 },
  codeToggle: { fontSize: 11, fontFamily: 'JetBrainsMono_400Regular', marginTop: -2, marginBottom: 2 },
});

const banStyles = StyleSheet.create({
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36 },
  title: { fontSize: 28, letterSpacing: 3, marginBottom: 16, textAlign: 'center' },
  subtitle: { fontSize: 13, textAlign: 'center', lineHeight: 20, marginBottom: 32 },
  timerBox: { borderRadius: 16, borderWidth: 1, paddingVertical: 20, paddingHorizontal: 32, alignItems: 'center', marginBottom: 24 },
  timerLabel: { fontSize: 11, letterSpacing: 1, marginBottom: 8 },
  timerValue: { fontSize: 32, letterSpacing: 2 },
  hint: { fontSize: 12, textAlign: 'center', lineHeight: 18 },
});
