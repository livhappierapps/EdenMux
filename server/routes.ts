import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import path from "node:path";
import fs from "node:fs";
import { rateLimit } from "express-rate-limit";
import { initEdenDB, handleEdenChat, handleGetModeration, handleDailyDump } from "./eden";
import { handleEdenSpeak, handleEdenTranscribe } from "./voice";
import { initAuthDB, initResetTokens, handleRegister, handleLogin, handleVerifyToken, handleSysKey, handleSysChk, requireAuth, handleAppleSignIn, handleForgotPassword, handleResetPassword } from "./auth";
import { initConfigDB, handleGetConfig, handleSetConfig } from "./config";
import { handleOtaStatus } from "./ota";
import { attachShellWebSocket } from "./shell";

// IP-based rate limiter for unauthenticated auth endpoints.
// Configurable via RATE_LIMIT_WINDOW_MS and RATE_LIMIT_MAX_REQUESTS env vars.
// Defaults: 20 attempts per 15-minute window per IP.
//
// Requires app.set("trust proxy", 1) in server/index.ts so that req.ip
// resolves to the real client IP from X-Forwarded-For (set by Replit/Railway
// edge proxy) rather than the proxy socket address.
function parsePosInt(raw: string | undefined, fallback: number): number {
  const n = parseInt(raw ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const authRateLimit = rateLimit({
  windowMs: parsePosInt(process.env.RATE_LIMIT_WINDOW_MS, 900_000), // default 15 min
  max: parsePosInt(process.env.RATE_LIMIT_MAX_REQUESTS, 20),        // default 20 req
  standardHeaders: "draft-7", // emit RateLimit-* headers (RFC draft-7)
  legacyHeaders: false,
  // Generic message — does not reveal which endpoint was hit
  message: { error: "Too many requests. Please wait a moment and try again." },
  skip: () => process.env.NODE_ENV === "test",
});

const EAS_PROJECT_ID = process.env.EAS_PROJECT_ID ?? "";
const EAS_GRAPHQL_URL = "https://api.expo.dev/graphql";
const APK_CACHE_TTL_MS = 10 * 60 * 1000;
const BUILDS_CACHE_TTL_MS = 3 * 60 * 1000;

interface ApkBuildInfo {
  url: string;
  buildId: string;
  buildProfile: string;
  createdAt: string;
  fetchedAt: number;
}

interface BuildEntry {
  id: string;
  platform: string;
  status: string;
  buildProfile: string;
  createdAt: string;
  completedAt: string | null;
  downloadUrl: string | null;
}

interface BuildsCache {
  builds: BuildEntry[];
  fetchedAt: number;
}

let apkCache: ApkBuildInfo | null = null;
let buildsCache: BuildsCache | null = null;

function requireAdminSecret(req: Request, res: Response): boolean {
  const adminSecret = process.env.ADMIN_SECRET;
  const provided = req.headers["x-admin-secret"] ?? req.query["secret"];
  if (!adminSecret || provided !== adminSecret) {
    res.status(403).json({ error: "Forbidden" });
    return false;
  }
  return true;
}

async function fetchLatestApkBuild(): Promise<ApkBuildInfo | null> {
  const now = Date.now();
  if (apkCache && now - apkCache.fetchedAt < APK_CACHE_TTL_MS) {
    return apkCache;
  }

  const token = process.env.EXPO_TOKEN;
  if (!token) {
    console.error("[apk] EXPO_TOKEN not set — cannot query EAS API");
    return null;
  }

  const query = `
    query GetLatestApkBuild($appId: String!) {
      app {
        byId(appId: $appId) {
          builds(
            limit: 10
            offset: 0
            filter: { platform: ANDROID, status: FINISHED }
          ) {
            id
            buildProfile
            createdAt
            artifacts {
              buildUrl
            }
          }
        }
      }
    }
  `;

  const response = await fetch(EAS_GRAPHQL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ query, variables: { appId: EAS_PROJECT_ID } }),
  });

  if (!response.ok) {
    console.error(`[apk] EAS API returned HTTP ${response.status}`);
    return null;
  }

  const json = (await response.json()) as {
    data?: {
      app?: {
        byId?: {
          builds?: Array<{
            id?: string;
            buildProfile?: string;
            createdAt?: string;
            artifacts?: { buildUrl?: string | null };
          }>;
        };
      };
    };
    errors?: Array<{ message: string }>;
  };

  if (json.errors?.length) {
    console.error(`[apk] EAS returned ${json.errors.length} GraphQL error(s).`);
    return null;
  }

  const builds = json.data?.app?.byId?.builds ?? [];

  for (const build of builds) {
    const buildUrl = build?.artifacts?.buildUrl;
    if (buildUrl) {
      apkCache = {
        url: buildUrl,
        buildId: build?.id ?? "unknown",
        buildProfile: build?.buildProfile ?? "unknown",
        createdAt: build?.createdAt ?? new Date().toISOString(),
        fetchedAt: Date.now(),
      };
      console.log(`[apk] Cached latest APK (profile: ${apkCache.buildProfile}, id: ${apkCache.buildId})`);
      return apkCache;
    }
  }

  console.warn("[apk] No finished Android builds with a download URL found in EAS");
  return null;
}

async function fetchAllBuilds(): Promise<BuildEntry[]> {
  const now = Date.now();
  if (buildsCache && now - buildsCache.fetchedAt < BUILDS_CACHE_TTL_MS) {
    return buildsCache.builds;
  }

  const token = process.env.EXPO_TOKEN;
  if (!token) {
    console.error("[builds] EXPO_TOKEN not set");
    return [];
  }

  const query = `
    query GetAllBuilds($appId: String!) {
      app {
        byId(appId: $appId) {
          builds(limit: 20, offset: 0) {
            id
            platform
            status
            buildProfile
            createdAt
            completedAt
            artifacts {
              buildUrl
            }
          }
        }
      }
    }
  `;

  try {
    const response = await fetch(EAS_GRAPHQL_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ query, variables: { appId: EAS_PROJECT_ID } }),
    });

    if (!response.ok) {
      console.error(`[builds] EAS API returned HTTP ${response.status}`);
      return [];
    }

    const json = (await response.json()) as {
      data?: {
        app?: {
          byId?: {
            builds?: Array<{
              id?: string;
              platform?: string;
              status?: string;
              buildProfile?: string;
              createdAt?: string;
              completedAt?: string | null;
              artifacts?: { buildUrl?: string | null };
            }>;
          };
        };
      };
      errors?: Array<{ message: string }>;
    };

    if (json.errors?.length) {
      console.error(`[builds] EAS returned ${json.errors.length} GraphQL error(s).`);
      return [];
    }

    const raw = json.data?.app?.byId?.builds ?? [];
    const builds: BuildEntry[] = raw.map((b) => ({
      id: b.id ?? "unknown",
      platform: b.platform ?? "unknown",
      status: b.status ?? "unknown",
      buildProfile: b.buildProfile ?? "unknown",
      createdAt: b.createdAt ?? "",
      completedAt: b.completedAt ?? null,
      downloadUrl: b.artifacts?.buildUrl ?? null,
    }));

    buildsCache = { builds, fetchedAt: Date.now() };
    return builds;
  } catch (err) {
    const errorType = err instanceof Error ? err.name : "UnknownError";
    console.error(`[builds] Unexpected error fetching builds: ${errorType}`);
    return [];
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  await initEdenDB();
  await initAuthDB();
  await initResetTokens();
  await initConfigDB();

  app.post("/api/eden/chat", requireAuth, handleEdenChat);
  app.get("/api/eden/moderation/:deviceId", handleGetModeration);
  app.post("/api/eden/daily-dump", handleDailyDump);
  app.post("/api/eden/speak", requireAuth, handleEdenSpeak);
  app.post("/api/eden/transcribe", requireAuth, handleEdenTranscribe);

  app.get("/api/config", handleGetConfig);
  app.post("/api/admin/config", handleSetConfig);

  app.get("/api/ota/status", handleOtaStatus);

  // Auth endpoints that accept unauthenticated requests are rate-limited by IP.
  // /api/auth/verify and /api/auth/reset-password are not rate-limited here
  // because they require a short-lived token that is itself the rate-limit signal.
  app.post("/api/auth/register", authRateLimit, handleRegister);
  app.post("/api/auth/login", authRateLimit, handleLogin);
  app.post("/api/auth/apple", authRateLimit, handleAppleSignIn);
  app.post("/api/auth/forgot-password", authRateLimit, handleForgotPassword);
  app.post("/api/auth/verify", handleVerifyToken);
  app.post("/api/auth/reset-password", handleResetPassword);
  app.post("/api/sys/key", handleSysKey);
  app.post("/api/sys/chk", handleSysChk);

  app.get("/auth/reset", (_req, res) => {
    const filePath = path.resolve(process.cwd(), "server", "templates", "reset-password.html");
    const html = fs.readFileSync(filePath, "utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(html);
  });

  app.get("/api/dl/apk/info", async (_req, res) => {
    try {
      const build = await fetchLatestApkBuild();
      if (!build) {
        res.json({ available: false });
        return;
      }
      res.json({
        available: true,
        buildId: build.buildId,
        buildProfile: build.buildProfile,
        createdAt: build.createdAt,
      });
    } catch (err) {
      const errorType = err instanceof Error ? err.name : "UnknownError";
      console.error(`[apk] Unexpected error fetching APK info: ${errorType}`);
      res.json({ available: false });
    }
  });

  app.get("/api/dl/apk", async (req, res) => {
    const adminSecret = process.env.ADMIN_SECRET;
    const providedSecret = req.query["secret"];
    const isAdminDownload = adminSecret && providedSecret === adminSecret;

    if (!isAdminDownload) {
      await requireAuth(req, res, async () => {
        try {
          const build = await fetchLatestApkBuild();
          if (!build) {
            res.status(503).json({ error: "No APK available yet. Please try again later." });
            return;
          }
          res.redirect(302, build.url);
        } catch (err) {
          const errorType = err instanceof Error ? err.name : "UnknownError";
          console.error(`[apk] Unexpected error fetching APK URL: ${errorType}`);
          res.status(503).json({ error: "Could not retrieve APK download URL." });
        }
      });
      return;
    }

    try {
      const build = await fetchLatestApkBuild();
      if (!build) {
        res.status(503).json({ error: "No APK available yet. Trigger a preview build on expo.dev first." });
        return;
      }
      res.redirect(302, build.url);
    } catch (err) {
      const errorType = err instanceof Error ? err.name : "UnknownError";
      console.error(`[apk] Unexpected error fetching APK URL: ${errorType}`);
      res.status(503).json({ error: "Could not retrieve APK download URL." });
    }
  });

  app.get("/api/admin/builds", async (req, res) => {
    if (!requireAdminSecret(req, res)) return;
    try {
      const builds = await fetchAllBuilds();
      const finished = builds.filter((b) => b.status === "FINISHED");
      const running = builds.filter((b) => b.status === "IN_QUEUE" || b.status === "IN_PROGRESS");
      const failed = builds.filter((b) => b.status === "ERRORED" || b.status === "CANCELED");

      const apks = finished.filter(
        (b) => b.platform === "ANDROID" && b.downloadUrl?.endsWith(".apk")
      );
      const aabs = finished.filter(
        (b) => b.platform === "ANDROID" && b.downloadUrl?.endsWith(".aab")
      );
      const ipaBuilds = finished.filter((b) => b.platform === "IOS" && b.downloadUrl);

      res.json({
        projectId: EAS_PROJECT_ID,
        queriedAt: new Date().toISOString(),
        summary: {
          total: builds.length,
          finished: finished.length,
          running: running.length,
          failed: failed.length,
        },
        ready: {
          latestApk: apks[0] ?? null,
          latestAab: aabs[0] ?? null,
          latestIpa: ipaBuilds[0] ?? null,
        },
        active: running,
        recent: builds.slice(0, 10),
      });
    } catch (err) {
      const errorType = err instanceof Error ? err.name : "UnknownError";
      console.error(`[builds] Unexpected error: ${errorType}`);
      res.status(500).json({ error: "Failed to fetch build status." });
    }
  });

  app.get("/privacy", (_req, res) => {
    const filePath = path.resolve(process.cwd(), "server", "templates", "privacy-policy.html");
    const html = fs.readFileSync(filePath, "utf-8");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(html);
  });

  app.get("/home", (_req, res) => {
    const filePath = path.resolve(process.cwd(), "server", "templates", "marketing.html");
    const html = fs.readFileSync(filePath, "utf-8");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(html);
  });

  const httpServer = createServer(app);
  attachShellWebSocket(httpServer);
  return httpServer;
}
