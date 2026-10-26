import { ScrollView, View, Text, StyleSheet, Linking } from 'react-native';
import { Stack } from 'expo-router';

export default function PrivacyPolicy() {
  return (
    <>
      <Stack.Screen options={{ title: 'Privacy Policy', headerShown: false }} />
      <ScrollView style={s.page} contentContainerStyle={s.container}>
        <View style={s.hero}>
          <Text style={s.logo}>Eden<Text style={s.accent}>Mux</Text></Text>
          <Text style={s.tag}>PRIVACY POLICY</Text>
        </View>

        <Text style={s.effective}>Effective Date: October 15, 2026  ·  Last Updated: October 15, 2026</Text>

        <View style={s.box}>
          <Text style={s.boxText}>EdenMux is a mobile terminal emulator. This policy explains what information we collect, why we collect it, and how it is handled. We collect only what is necessary to run the app.</Text>
        </View>

        <Text style={s.h2}>1. Who We Are</Text>
        <Text style={s.p}>EdenMux is an independently developed application created by a solo developer. Questions can be directed to <Text style={s.link} onPress={() => Linking.openURL('mailto:Oblivionhappier@icloud.com')}>Oblivionhappier@icloud.com</Text>.</Text>

        <Text style={s.h2}>2. Information We Collect</Text>
        <Text style={s.p}>We collect the minimum information needed to provide the app&apos;s features:</Text>
        <Text style={s.li}>• <Text style={s.bold}>Account information</Text> — Email address, optional username, and a securely hashed password (never stored in plain text). Apple Sign-In provides only an anonymous identifier unless you choose to share your email.</Text>
        <Text style={s.li}>• <Text style={s.bold}>Device identifier</Text> — A randomly generated device ID stored locally and sent with Eden requests to maintain moderation status and, for Core Unlock, conversation memory. It is not linked to your real identity.</Text>
        <Text style={s.li}>• <Text style={s.bold}>Terminal session data</Text> — iOS terminal activity stays in the app. Android and web shell input and output are sent to our server for real-time execution; we do not automatically send that activity to Eden or third-party AI services.</Text>
        <Text style={s.li}>• <Text style={s.bold}>Messages to Eden</Text> — Sent to our server and forwarded to xAI Grok to generate a response. Core Unlock conversation history is stored on our server for Eden memory; free-tier messages are not stored on our server after the response.</Text>
        <Text style={s.li}>• <Text style={s.bold}>Voice input</Text> — With Core Unlock and microphone permission, recorded audio is sent to our server and forwarded to ElevenLabs Scribe for transcription. We do not retain the audio after transcription.</Text>

        <Text style={s.h2}>3. Information We Do Not Collect</Text>
        <Text style={s.li}>• We do not collect your location.</Text>
        <Text style={s.li}>• We do not access your contacts, camera, or photos.</Text>
        <Text style={s.li}>• We do not use advertising SDKs or sell your data.</Text>
        <Text style={s.li}>• We do not track you across other apps or websites.</Text>
        <Text style={s.li}>• We do not automatically include terminal activity in Eden conversations sent to xAI.</Text>

        <Text style={s.h2}>4. How We Use Your Information</Text>
        <Text style={s.li}>• To authenticate you and maintain your account.</Text>
        <Text style={s.li}>• To generate responses from Eden (our AI assistant).</Text>
        <Text style={s.li}>• To enforce our community guidelines and moderation policy.</Text>
        <Text style={s.li}>• To generate Eden&apos;s voice responses via ElevenLabs text-to-speech.</Text>
        <Text style={s.li}>• To transcribe voice input via ElevenLabs Scribe when you use the microphone feature.</Text>

        <Text style={s.h2}>5. Third-Party Services</Text>
        <Text style={s.li}>• <Text style={s.bold}>Apple Sign In</Text> — We receive only a unique Apple user identifier and, if you choose, your email address.</Text>
        <Text style={s.li}>• <Text style={s.bold}>xAI (Grok)</Text> — Your messages are transmitted to xAI&apos;s API to generate Eden&apos;s responses. See <Text style={s.link} onPress={() => Linking.openURL('https://x.ai/privacy')}>x.ai/privacy</Text>.</Text>
        <Text style={s.li}>• <Text style={s.bold}>ElevenLabs</Text> — Eden response text is sent for text-to-speech, and voice recordings are sent for Scribe transcription. See <Text style={s.link} onPress={() => Linking.openURL('https://elevenlabs.io/privacy')}>elevenlabs.io/privacy</Text>.</Text>
        <Text style={s.li}>• <Text style={s.bold}>RevenueCat</Text> — Manages in-app purchase entitlements. See <Text style={s.link} onPress={() => Linking.openURL('https://www.revenuecat.com/privacy')}>revenuecat.com/privacy</Text>.</Text>
        <Text style={s.li}>• <Text style={s.bold}>Resend</Text> — Receives your email address and one-time password-reset link to deliver reset emails. See <Text style={s.link} onPress={() => Linking.openURL('https://resend.com/legal/privacy-policy')}>resend.com privacy policy</Text>.</Text>

        <Text style={s.h2}>6. Data Storage and Security</Text>
        <Text style={s.p}>Account passwords are stored on our server as bcrypt hashes. Mobile authentication tokens use OS secure storage when available, with app-storage fallback; the web app uses app storage. Theme and app preferences are stored locally.</Text>

        <Text style={s.h2}>7. Data Retention</Text>
        <Text style={s.p}>Your account is retained as long as it is active. You may request deletion at any time by contacting us. We will delete your data within 30 days of your request.</Text>

        <Text style={s.h2}>8. Children&apos;s Privacy</Text>
        <Text style={s.p}>EdenMux is not directed at children under the age of 17. We do not knowingly collect personal information from children. If you believe a child has provided us information, please contact us and we will delete it promptly.</Text>

        <Text style={s.h2}>9. Your Rights</Text>
        <Text style={s.p}>Depending on your location, you may have the right to access, correct, or delete your personal data. Contact us directly to exercise any of these rights.</Text>

        <Text style={s.h2}>10. Changes to This Policy</Text>
        <Text style={s.p}>We may update this policy from time to time and will update the &quot;Last Updated&quot; date above. Continued use after changes are posted constitutes acceptance.</Text>

        <Text style={s.h2}>11. Contact Us</Text>
        <View style={s.contact}>
          <Text style={s.p}>EdenMux — Privacy Inquiries</Text>
          <Text style={s.link} onPress={() => Linking.openURL('mailto:Oblivionhappier@icloud.com')}>Oblivionhappier@icloud.com</Text>
        </View>

        <Text style={s.footer}>© 2026 EdenMux · All rights reserved</Text>
      </ScrollView>
    </>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#0f0a0d' },
  container: { paddingBottom: 60 },
  hero: { backgroundColor: '#1a1015', borderBottomWidth: 1, borderBottomColor: 'rgba(201,64,96,0.2)', paddingTop: 60, paddingBottom: 40, alignItems: 'center' },
  logo: { fontSize: 36, fontWeight: 'bold', color: '#f5e6d8', letterSpacing: 4 },
  accent: { color: '#c94060' },
  tag: { fontSize: 11, color: 'rgba(201,64,96,0.7)', letterSpacing: 3, marginTop: 8 },
  effective: { fontSize: 11, color: 'rgba(240,228,232,0.4)', textAlign: 'center', marginTop: 24, marginBottom: 16, fontFamily: 'Courier New' },
  box: { backgroundColor: 'rgba(201,64,96,0.06)', borderWidth: 1, borderColor: 'rgba(201,64,96,0.2)', borderRadius: 10, marginHorizontal: 20, padding: 16, marginBottom: 8 },
  boxText: { color: '#d8c8d0', fontSize: 14, lineHeight: 22 },
  h2: { fontSize: 16, color: '#e8607a', fontWeight: 'bold', marginTop: 28, marginBottom: 10, marginHorizontal: 20, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(201,64,96,0.15)' },
  p: { fontSize: 14, color: '#d8c8d0', lineHeight: 22, marginHorizontal: 20, marginBottom: 10 },
  li: { fontSize: 14, color: '#d8c8d0', lineHeight: 22, marginHorizontal: 20, marginBottom: 6 },
  bold: { fontWeight: 'bold', color: '#f0e4e8' },
  link: { color: '#e8607a' },
  contact: { marginHorizontal: 20, marginTop: 8, backgroundColor: 'rgba(201,64,96,0.08)', borderWidth: 1, borderColor: 'rgba(201,64,96,0.25)', borderRadius: 12, padding: 20, alignItems: 'center' },
  footer: { fontSize: 11, color: 'rgba(240,228,232,0.2)', textAlign: 'center', marginTop: 40, fontFamily: 'Courier New' },
});
