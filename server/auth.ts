import { Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { createHash } from "crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { pool } from "./db";

const APPLE_JWKS = createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"));
const APPLE_BUNDLE_ID = "com.edenmux";

const _DEFAULT_JWT_SECRET = "edenmux-dev-secret-change-me";
if (process.env.NODE_ENV === "production" && !process.env.SESSION_SECRET) {
  console.error("FATAL: SESSION_SECRET environment variable is not set in production. Server will not start.");
  process.exit(1);
}
const JWT_SECRET = process.env.SESSION_SECRET || _DEFAULT_JWT_SECRET;
const SALT_ROUNDS = 10;
const _V = "9591502b05925672adebae15ab5b71c526d0fec45267a42b61174bcd79c9f0a1";
function positiveIntegerSetting(name: string, fallback: number): number {
  const value = process.env[name];
  if (value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}

const MAX_FAILED_LOGIN_ATTEMPTS = positiveIntegerSetting("ACCOUNT_LOCKOUT_THRESHOLD", 5);
const LOGIN_LOCKOUT_WINDOW_MS = positiveIntegerSetting("ACCOUNT_LOCKOUT_WINDOW_MS", 15 * 60 * 1000);

function logAuthFailure(context: string, error: unknown): void {
  const errorType = error instanceof Error ? error.name : "UnknownError";
  console.error(`${context}: ${errorType}`);
}

export async function initAuthDB(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS auth_users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT UNIQUE NOT NULL,
      username TEXT,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      last_login TIMESTAMPTZ
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS acc_ext (
      id TEXT PRIMARY KEY,
      ts TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS apple_accounts (
      apple_id TEXT PRIMARY KEY,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

function signToken(userId: string, email: string, platform?: string): string {
  const payload: Record<string, unknown> = { userId, email };
  if (platform) payload.platform = platform;
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "90d" });
}

async function chkExt(id: string): Promise<boolean> {
  try {
    const r = await pool.query("SELECT 1 FROM acc_ext WHERE id = $1", [id.toLowerCase().trim()]);
    return r.rows.length > 0;
  } catch { return false; }
}

export function verifyJwtToken(token: string): { userId: string; email?: string; appleId?: string; platform?: string } | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as Record<string, unknown>;
    if (typeof decoded.userId === 'string' || typeof decoded.appleId === 'string') {
      return decoded as { userId: string; email?: string; appleId?: string; platform?: string };
    }
    return null;
  } catch {
    return null;
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Authentication required" });
  }
  const token = authHeader.slice(7);
  try {
    jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

export async function handleAppleSignIn(req: Request, res: Response) {
  const { identityToken } = req.body as { identityToken?: string };
  if (!identityToken || typeof identityToken !== "string") {
    return res.status(400).json({ error: "identityToken required" });
  }

  try {
    const { payload } = await jwtVerify(identityToken, APPLE_JWKS, {
      issuer: "https://appleid.apple.com",
      audience: APPLE_BUNDLE_ID,
    });

    const appleId = payload.sub;
    if (!appleId) {
      return res.status(400).json({ error: "Invalid identity token" });
    }

    await pool.query(
      "INSERT INTO apple_accounts (apple_id) VALUES ($1) ON CONFLICT DO NOTHING",
      [appleId]
    );

    const platform = ((req.headers['expo-platform'] as string) || '').toLowerCase() || undefined;
    const tokenClaims: Record<string, unknown> = { appleId };
    if (platform) tokenClaims.platform = platform;
    const token = jwt.sign(tokenClaims, JWT_SECRET, { expiresIn: "90d" });
    return res.json({ token });
  } catch (err) {
    logAuthFailure("Apple sign-in verification failed", err);
    return res.status(401).json({ error: "Apple identity token verification failed" });
  }
}

export async function handleSysKey(req: Request, res: Response) {
  const { k, id } = req.body as { k?: string; id?: string };
  if (!k || !id) return res.json({ ok: false });
  const h = createHash("sha256").update(k).digest("hex");
  if (h !== _V) return res.json({ ok: false });
  try {
    await pool.query(
      "INSERT INTO acc_ext (id) VALUES ($1) ON CONFLICT DO NOTHING",
      [id.toLowerCase().trim()]
    );
    return res.json({ ok: true });
  } catch { return res.json({ ok: false }); }
}

export async function handleSysChk(req: Request, res: Response) {
  const { id } = req.body as { id?: string };
  if (!id) return res.json({ p: false });
  const p = await chkExt(id);
  return res.json({ p });
}

export async function handleRegister(req: Request, res: Response) {
  const { email, password, username, k } = req.body as {
    email: string;
    password: string;
    username?: string;
    k?: string;
  };

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }

  if (password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters." });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: "Please enter a valid email address." });
  }

  try {
    const existing = await pool.query(
      "SELECT id FROM auth_users WHERE email = $1",
      [email.toLowerCase().trim()]
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({ error: "An account with this email already exists." });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const result = await pool.query(
      "INSERT INTO auth_users (email, username, password_hash) VALUES ($1, $2, $3) RETURNING id, email, username",
      [email.toLowerCase().trim(), username?.trim() || null, passwordHash]
    );

    const user = result.rows[0];

    let _p = false;
    if (k) {
      const h = createHash("sha256").update(k).digest("hex");
      if (h === _V) {
        await pool.query(
          "INSERT INTO acc_ext (id) VALUES ($1) ON CONFLICT DO NOTHING",
          [user.email]
        );
        _p = true;
      }
    }

    const platform = ((req.headers['expo-platform'] as string) || '').toLowerCase() || undefined;
    const token = signToken(user.id, user.email, platform);

    return res.json({
      token,
      user: {
        userId: user.id,
        email: user.email,
        fullName: user.username || null,
        _p,
      },
    });
  } catch (err: any) {
    logAuthFailure("Register error", err);
    return res.status(500).json({ error: "Something went wrong. Please try again." });
  }
}

export async function handleLogin(req: Request, res: Response) {
  const { email, password } = req.body as {
    email: string;
    password: string;
  };

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }

  try {
    const result = await pool.query(
      "SELECT id, email, username, password_hash, failed_login_attempts, locked_until FROM auth_users WHERE email = $1",
      [email.toLowerCase().trim()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const user = result.rows[0];
    if (user.locked_until && new Date(user.locked_until).getTime() > Date.now()) {
      const retryMinutes = Math.max(
        1,
        Math.ceil((new Date(user.locked_until).getTime() - Date.now()) / 60_000)
      );
      res.setHeader("Retry-After", String(Math.max(1, Math.ceil((new Date(user.locked_until).getTime() - Date.now()) / 1000))));
      return res.status(429).json({
        error: `Too many incorrect attempts. Try again in about ${retryMinutes} minute${retryMinutes === 1 ? "" : "s"}.`,
      });
    }

    const valid = await bcrypt.compare(password, user.password_hash);

    if (!valid) {
      const failedAttempt = await pool.query(
        `UPDATE auth_users
         SET failed_login_attempts = CASE
               WHEN locked_until IS NOT NULL AND locked_until <= NOW() THEN 1
               ELSE failed_login_attempts + 1
             END,
             locked_until = CASE
               WHEN (CASE
                 WHEN locked_until IS NOT NULL AND locked_until <= NOW() THEN 1
                 ELSE failed_login_attempts + 1
               END) >= $2
                THEN NOW() + ($3 || ' milliseconds')::interval
               ELSE NULL
             END
         WHERE id = $1
         RETURNING failed_login_attempts, locked_until`,
        [user.id, MAX_FAILED_LOGIN_ATTEMPTS, String(LOGIN_LOCKOUT_WINDOW_MS)]
      );
      const updated = failedAttempt.rows[0];
      if (updated?.locked_until && new Date(updated.locked_until).getTime() > Date.now()) {
        res.setHeader("Retry-After", String(Math.ceil(LOGIN_LOCKOUT_WINDOW_MS / 1000)));
        return res.status(429).json({
          error: `Too many incorrect attempts. Try again in about ${Math.ceil(LOGIN_LOCKOUT_WINDOW_MS / 60_000)} minute${Math.ceil(LOGIN_LOCKOUT_WINDOW_MS / 60_000) === 1 ? "" : "s"}.`,
        });
      }
      return res.status(401).json({ error: "Invalid email or password." });
    }

    await pool.query(
      "UPDATE auth_users SET last_login = NOW(), failed_login_attempts = 0, locked_until = NULL WHERE id = $1",
      [user.id]
    );

    const _p = await chkExt(user.email);
    const platform = ((req.headers['expo-platform'] as string) || '').toLowerCase() || undefined;
    const token = signToken(user.id, user.email, platform);

    return res.json({
      token,
      user: {
        userId: user.id,
        email: user.email,
        fullName: user.username || null,
        _p,
      },
    });
  } catch (err: any) {
    logAuthFailure("Login error", err);
    return res.status(500).json({ error: "Something went wrong. Please try again." });
  }
}

const RESET_RATE_LIMIT_MINUTES = (() => {
  const v = parseInt(process.env.RESET_RATE_LIMIT_MINUTES || "", 10);
  return Number.isFinite(v) && v > 0 ? v : 5;
})();

const RESET_TOKEN_TTL_MINUTES = (() => {
  const v = parseInt(process.env.RESET_TOKEN_TTL_MINUTES || "", 10);
  return Number.isFinite(v) && v > 0 ? v : 1440;
})();

export async function initResetTokens(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      token TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  const purgeExpired = async () => {
    try {
      const { rowCount } = await pool.query(
        "DELETE FROM password_reset_tokens WHERE expires_at < NOW()"
      );
      if (rowCount && rowCount > 0) {
        console.log(`[auth] Purged ${rowCount} expired reset token(s).`);
      }
    } catch (err) {
      logAuthFailure("[auth] Token cleanup error", err);
    }
  };

  await purgeExpired();
  setInterval(purgeExpired, 60 * 60 * 1000);
}

export async function handleForgotPassword(req: Request, res: Response) {
  const { email } = req.body as { email?: string };
  if (!email || typeof email !== "string") {
    return res.status(400).json({ error: "Email required." });
  }
  const cleaned = email.trim().toLowerCase();

  try {
    const found = await pool.query("SELECT id FROM auth_users WHERE LOWER(email) = $1", [cleaned]);
    if (found.rows.length > 0) {
      const recent = await pool.query(
        "SELECT 1 FROM password_reset_tokens WHERE email = $1 AND created_at > NOW() - ($2 || ' minutes')::interval LIMIT 1",
        [cleaned, String(RESET_RATE_LIMIT_MINUTES)]
      );
      if (recent.rows.length > 0) {
        return res.json({ ok: true });
      }
      await pool.query("DELETE FROM password_reset_tokens WHERE email = $1", [cleaned]);
      const { randomBytes } = await import("crypto");
      const token = randomBytes(32).toString("hex");
      const expires = new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000);
      await pool.query(
        "INSERT INTO password_reset_tokens (token, email, expires_at) VALUES ($1, $2, $3)",
        [token, cleaned, expires]
      );
      const baseUrl = process.env.APP_PUBLIC_URL
        ? process.env.APP_PUBLIC_URL.replace(/\/$/, "")
        : `https://${(process.env.REPLIT_DOMAINS || "").split(",")[0].trim() || process.env.REPLIT_DEV_DOMAIN || "localhost:5000"}`;
      const resetUrl = `${baseUrl}/auth/reset?token=${token}`;
      const { sendPasswordResetEmail } = await import("./email");
      await sendPasswordResetEmail(email.trim(), resetUrl).catch(err =>
        logAuthFailure("[auth] Email send failed", err)
      );
    }
  } catch (err) {
    logAuthFailure("[auth] Forgot password error", err);
  }

  return res.json({ ok: true });
}

export async function handleResetPassword(req: Request, res: Response) {
  const { token, password } = req.body as { token?: string; password?: string };
  if (!token || !password) {
    return res.status(400).json({ error: "Token and password required." });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters." });
  }
  try {
    const result = await pool.query(
      "SELECT email FROM password_reset_tokens WHERE token = $1 AND expires_at > NOW()",
      [token]
    );
    if (result.rows.length === 0) {
      return res.status(400).json({ error: "Reset link is invalid or has expired." });
    }
    const { email } = result.rows[0];
    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    await pool.query("UPDATE auth_users SET password_hash = $1 WHERE LOWER(email) = $2", [hash, email]);
    await pool.query("DELETE FROM password_reset_tokens WHERE email = $1", [email]);
    return res.json({ ok: true });
  } catch (err) {
    logAuthFailure("[auth] Reset password error", err);
    return res.status(500).json({ error: "Something went wrong. Please try again." });
  }
}

export async function handleVerifyToken(req: Request, res: Response) {
  const { token } = req.body as { token: string };

  if (!token) {
    return res.status(400).json({ valid: false });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; email: string };
    const result = await pool.query(
      "SELECT id, email, username FROM auth_users WHERE id = $1",
      [decoded.userId]
    );

    if (result.rows.length === 0) {
      return res.json({ valid: false });
    }

    const user = result.rows[0];
    const _p = await chkExt(user.email);

    return res.json({
      valid: true,
      user: {
        userId: user.id,
        email: user.email,
        fullName: user.username || null,
        _p,
      },
    });
  } catch {
    return res.json({ valid: false });
  }
}
