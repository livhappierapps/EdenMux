import type { Request, Response } from "express";
import { pool } from "./db";

// ─────────────────────────────────────────────────────────────────────────────
// EDEN VOICE CONFIG
// ─────────────────────────────────────────────────────────────────────────────
// The voice ID is stored in the app_config database table under eden.voiceId.
// To change Eden's voice without restarting the server:
//   POST /api/admin/config  (x-admin-secret header required)
//   Body: { "eden": { "voiceId": "<new-elevenlabs-voice-id>" } }
//
// Find voice IDs in your ElevenLabs dashboard → Voices → copy the ID.
// API key is stored in the environment secret: ELEVENLABS_API_KEY
//
// TTS model: eleven_multilingual_v2
// Voice settings (stability, similarity, style) are in handleEdenSpeak below.
// STT model: scribe_v1 — used by handleEdenTranscribe below.
// ─────────────────────────────────────────────────────────────────────────────

const FALLBACK_VOICE_ID = "Kukbe09auJMFYu1Aidx0";

// Simple in-memory cache — refreshes every 5 minutes so voice ID changes
// take effect without a server restart.
let cachedVoiceId: string = FALLBACK_VOICE_ID;
let cacheExpiry = 0;

async function getVoiceId(): Promise<string> {
  const now = Date.now();
  if (now < cacheExpiry) return cachedVoiceId;

  try {
    const result = await pool.query(
      "SELECT config->'eden'->>'voiceId' AS voice_id FROM app_config WHERE id = 1"
    );
    const id = result.rows[0]?.voice_id;
    if (id && typeof id === "string" && id.length > 4) {
      cachedVoiceId = id;
    }
  } catch {
    // Keep cached value
  }

  cacheExpiry = now + 5 * 60 * 1000;
  return cachedVoiceId;
}

// ─────────────────────────────────────────────────────────────────────────────
// SPEECH-TO-TEXT  (mic → text)
// Route: POST /api/eden/transcribe
// Receives: base64-encoded m4a audio from the app's mic recording
// Returns: { text: string } — the transcribed words
// ─────────────────────────────────────────────────────────────────────────────
export async function handleEdenTranscribe(req: Request, res: Response) {
  const { audio } = req.body as { audio?: string };
  if (!audio) return res.status(400).json({ error: "audio required" });

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return res.status(503).json({ error: "Voice not configured" });

  try {
    const buffer = Buffer.from(audio, "base64");
    const formData = new FormData();
    const blob = new Blob([buffer], { type: "audio/mp4" });
    formData.append("file", blob, "recording.m4a");
    formData.append("model_id", "scribe_v1");

    const response = await fetch(
      "https://api.elevenlabs.io/v1/speech-to-text",
      {
        method: "POST",
        headers: { "xi-api-key": apiKey },
        body: formData,
      }
    );

    if (!response.ok) {
      console.error(`ElevenLabs STT request failed with HTTP ${response.status}.`);
      return res.status(502).json({ error: "Transcription failed" });
    }

    const data = (await response.json()) as any;
    res.json({ text: data.text || "" });
  } catch (e) {
    const errorType = e instanceof Error ? e.name : "UnknownError";
    console.error(`Transcribe error: ${errorType}`);
    res.status(500).json({ error: "Transcription failed" });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TEXT-TO-SPEECH  (text → Eden's voice audio)
// Route: POST /api/eden/speak
// Receives: { text: string } — what Eden should say
// Returns: audio/mpeg stream played back by the app via expo-av
//
// To tweak how Eden sounds, adjust voice_settings below:
//   stability        — 0–1, lower = more expressive/variable (current: 0.28)
//   similarity_boost — 0–1, higher = more like the original voice (current: 0.88)
//   style            — 0–1, higher = more dramatic/styled (current: 0.65)
//   use_speaker_boost — true = clearer audio at slight quality cost
// ─────────────────────────────────────────────────────────────────────────────
export async function handleEdenSpeak(req: Request, res: Response) {
  const { text } = req.body as { text?: string };
  if (!text) return res.status(400).json({ error: "text required" });

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return res.status(503).json({ error: "Voice not configured" });

  const voiceId = await getVoiceId();

  try {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_multilingual_v2",
          voice_settings: {
            stability: 0.28,
            similarity_boost: 0.88,
            style: 0.65,
            use_speaker_boost: true,
          },
        }),
      }
    );

    if (!response.ok) {
      console.error(`ElevenLabs TTS request failed with HTTP ${response.status}.`);
      return res.status(502).json({ error: "Voice service error" });
    }

    const buffer = await response.arrayBuffer();
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Length", buffer.byteLength);
    res.send(Buffer.from(buffer));
  } catch (e) {
    const errorType = e instanceof Error ? e.name : "UnknownError";
    console.error(`Speak error: ${errorType}`);
    res.status(500).json({ error: "Voice service error" });
  }
}
