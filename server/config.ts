import type { Request, Response } from "express";
import { pool } from "./db";

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

const MINIMUM_SHELL_AUTH_VERSION = "1.0.1";

const DEFAULT_CONFIG: AppConfig = {
  features: {
    shellMode: false,
    voiceInput: true,
    themeShop: true,
    screenshotStudio: true,
  },
  eden: {
    voiceId: "Kukbe09auJMFYu1Aidx0",
  },
  app: {
    motd: null,
    minimumVersion: MINIMUM_SHELL_AUTH_VERSION,
  },
};

function isVersionBelow(version: unknown, minimum: string): boolean {
  if (typeof version !== "string") return true;

  const parse = (value: string) => {
    const match = value.match(/^(\d+)\.(\d+)\.(\d+)$/);
    return match ? match.slice(1).map(Number) : null;
  };
  const currentParts = parse(version);
  const minimumParts = parse(minimum);
  if (!currentParts || !minimumParts) return true;

  for (let i = 0; i < 3; i += 1) {
    if (currentParts[i] !== minimumParts[i]) {
      return currentParts[i] < minimumParts[i];
    }
  }
  return false;
}

export async function initConfigDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS app_config (
        id INT PRIMARY KEY DEFAULT 1,
        config JSONB NOT NULL DEFAULT '{}'::jsonb,
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        CONSTRAINT single_row CHECK (id = 1)
      )
    `);
    await pool.query(`
      INSERT INTO app_config (id, config)
      VALUES (1, $1::jsonb)
      ON CONFLICT (id) DO NOTHING
    `, [JSON.stringify(DEFAULT_CONFIG)]);
    const configResult = await pool.query(
      "SELECT config FROM app_config WHERE id = 1"
    );
    const storedConfig = configResult.rows[0]?.config;
    if (isVersionBelow(storedConfig?.app?.minimumVersion, MINIMUM_SHELL_AUTH_VERSION)) {
      await pool.query(
        `UPDATE app_config
         SET config = jsonb_set(
           config,
           '{app}',
           COALESCE(config->'app', '{}'::jsonb) ||
             jsonb_build_object('minimumVersion', $1::text),
           true
         )
         WHERE id = 1`,
        [MINIMUM_SHELL_AUTH_VERSION]
      );
      console.log(`Minimum supported app version raised to ${MINIMUM_SHELL_AUTH_VERSION}.`);
    }
    console.log("Config DB table ready.");
  } catch (e) {
    const errorType = e instanceof Error ? e.name : "UnknownError";
    console.error(`Config DB init error: ${errorType}`);
  }
}

export async function handleGetConfig(_req: Request, res: Response) {
  try {
    const result = await pool.query(
      "SELECT config FROM app_config WHERE id = 1"
    );
    const stored = result.rows[0]?.config ?? {};
    const merged = deepMerge(DEFAULT_CONFIG as unknown as Record<string, unknown>, stored) as unknown as AppConfig;
    // Stored flags cannot re-enable the shared backend PTY while execution
    // isolation is unavailable.
    merged.features.shellMode = false;
    res.json(merged);
  } catch (e) {
    const errorType = e instanceof Error ? e.name : "UnknownError";
    console.error(`Config fetch error: ${errorType}`);
    res.json(DEFAULT_CONFIG);
  }
}

export async function handleSetConfig(req: Request, res: Response) {
  const adminSecret = process.env.ADMIN_SECRET;
  const provided = req.header("x-admin-secret");

  if (!adminSecret || provided !== adminSecret) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const body = req.body as Partial<AppConfig>;
  if (!body || typeof body !== "object") {
    return res.status(400).json({ error: "Invalid config body" });
  }
  if (body.features?.shellMode === true) {
    return res.status(409).json({ error: "Remote shell requires an isolated execution service." });
  }

  try {
    const current = await pool.query(
      "SELECT config FROM app_config WHERE id = 1"
    );
    const existing = current.rows[0]?.config ?? {};
    const updated = deepMerge(existing, body);

    await pool.query(
      "UPDATE app_config SET config = $1::jsonb, updated_at = NOW() WHERE id = 1",
      [JSON.stringify(updated)]
    );

    res.json({ ok: true, config: updated });
  } catch (e) {
    const errorType = e instanceof Error ? e.name : "UnknownError";
    console.error(`Config update error: ${errorType}`);
    res.status(500).json({ error: "Failed to update config" });
  }
}

function deepMerge(base: Record<string, unknown>, override: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base };
  for (const key of Object.keys(override)) {
    const bv = base[key];
    const ov = override[key];
    if (
      ov !== null &&
      typeof ov === "object" &&
      !Array.isArray(ov) &&
      bv !== null &&
      typeof bv === "object" &&
      !Array.isArray(bv)
    ) {
      result[key] = deepMerge(
        bv as Record<string, unknown>,
        ov as Record<string, unknown>
      );
    } else {
      result[key] = ov;
    }
  }
  return result;
}
