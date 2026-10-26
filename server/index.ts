import express from "express";
import type { Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import * as fs from "fs";
import * as http from "http";
import * as path from "path";
import { createProxyMiddleware } from "http-proxy-middleware";

const app = express();
const log = console.log;

function setupTrustProxy(app: express.Application) {
  // Both Replit and Railway sit exactly one reverse-proxy hop in front of the
  // container. Trusting that single hop lets Express resolve req.ip from the
  // X-Forwarded-For header set by the platform proxy rather than using the
  // proxy socket address (which would collapse all users into one rate-limit
  // bucket). Setting this to 1 (not true / "trust all") means a forged
  // X-Forwarded-For from a client cannot override the value appended by the
  // real proxy at the edge.
  app.set("trust proxy", 1);
}

function setupCors(app: express.Application) {
  app.use((req, res, next) => {
    const origins = new Set<string>();

    // Dev workspace domain
    if (process.env.REPLIT_DEV_DOMAIN) {
      origins.add(`https://${process.env.REPLIT_DEV_DOMAIN}`);
    }

    // Replit deployment domains (auto-set by Replit in the deployed environment)
    if (process.env.REPLIT_DOMAINS) {
      process.env.REPLIT_DOMAINS.split(",").forEach((d) => {
        origins.add(`https://${d.trim()}`);
      });
    }

    // Stable production URL — hardcoded so it works even on external hosting
    // where REPLIT_DOMAINS is absent. Update this if the backend ever moves.
    origins.add("https://eden-mux--LivHappierApps.replit.app");

    // APP_PUBLIC_URL env var for self-declared production origin
    // (set this as a secret when deploying externally, e.g. on Railway)
    if (process.env.APP_PUBLIC_URL) {
      origins.add(process.env.APP_PUBLIC_URL.replace(/\/$/, ""));
    }

    const origin = req.header("origin");

    // Allow localhost origins for Expo web development (any port)
    const isLocalhost =
      origin?.startsWith("http://localhost:") ||
      origin?.startsWith("http://127.0.0.1:");

    if (origin && (origins.has(origin) || isLocalhost)) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, OPTIONS",
      );
      res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, expo-platform, expo-runtime-version, expo-channel-name, expo-protocol-version, expo-sfv-version");
      res.header("Access-Control-Allow-Credentials", "true");
    }

    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }

    next();
  });
}

function setupBodyParsing(app: express.Application) {
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
}

function setupRequestLogging(app: express.Application) {
  app.use((req, res, next) => {
    const start = Date.now();
    const path = req.path;

    res.on("finish", () => {
      if (!path.startsWith("/api")) return;

      const duration = Date.now() - start;
      log(`${req.method} ${path} ${res.statusCode} in ${duration}ms`);
    });

    next();
  });
}

function getAppName(): string {
  try {
    const appJsonPath = path.resolve(process.cwd(), "app.json");
    const appJsonContent = fs.readFileSync(appJsonPath, "utf-8");
    const appJson = JSON.parse(appJsonContent);
    return appJson.expo?.name || "App Landing Page";
  } catch {
    return "App Landing Page";
  }
}

const ALLOWED_PLATFORMS = new Set(["ios", "android"]);

function serveExpoManifest(platform: string, res: Response) {
  if (!ALLOWED_PLATFORMS.has(platform)) {
    return res.status(400).json({ error: "Invalid platform" });
  }

  const manifestPath = path.resolve(
    process.cwd(),
    "static-build",
    platform,
    "manifest.json",
  );

  if (!fs.existsSync(manifestPath)) {
    return res
      .status(404)
      .json({ error: `Manifest not found for platform: ${platform}` });
  }

  res.setHeader("expo-protocol-version", "1");
  res.setHeader("expo-sfv-version", "0");
  res.setHeader("content-type", "application/json");

  const manifest = fs.readFileSync(manifestPath, "utf-8");
  res.send(manifest);
}

function serveLandingPage({
  req,
  res,
  landingPageTemplate,
  appName,
}: {
  req: Request;
  res: Response;
  landingPageTemplate: string;
  appName: string;
}) {
  const forwardedProto = req.header("x-forwarded-proto");
  const protocol = forwardedProto || req.protocol || "https";
  const forwardedHost = req.header("x-forwarded-host");
  const host = forwardedHost || req.get("host");
  const baseUrl = `${protocol}://${host}`;
  const expsUrl = `${host}`;

  const html = landingPageTemplate
    .replace(/BASE_URL_PLACEHOLDER/g, baseUrl)
    .replace(/EXPS_URL_PLACEHOLDER/g, expsUrl)
    .replace(/APP_NAME_PLACEHOLDER/g, appName);

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(html);
}

function configureExpoAndLanding(app: express.Application) {
  const templatePath = path.resolve(
    process.cwd(),
    "server",
    "templates",
    "landing-page.html",
  );
  const landingPageTemplate = fs.readFileSync(templatePath, "utf-8");
  const appName = getAppName();

  const isDev = process.env.NODE_ENV === "development";

  log("Serving static Expo files with dynamic manifest routing");

  if (isDev) {
    // Serve local asset files directly before the Metro proxy.
    // Some Android Expo Go versions request /assets/images/foo.jpeg (old URL format, no unstable_path).
    // Metro would receive these, strip /assets/ → look for images/ at project root → ENOENT crash.
    // Serving from disk here intercepts those requests before they reach Metro.
    // Requests using the unstable_path format (/assets/?unstable_path=...) have no matching file
    // and fall through to the Metro proxy below.
    app.use("/assets", (req, res, next) => {
      if (req.path.toLowerCase().endsWith(".zip")) {
        return res.status(404).end();
      }
      next();
    }, express.static(path.resolve(process.cwd(), "assets")));

    // In dev mode: proxy all Expo Go / Metro traffic to the Metro bundler on port 8081.
    // Expo Go sends an expo-platform header; bundle & asset requests come through as plain paths.
    // Browsers hitting "/" (no expo-platform header) still get the landing page.
    const metroProxy = createProxyMiddleware({
      target: "http://localhost:8081",
      changeOrigin: true,
      ws: true,
      // Allow up to 3 min for Metro to finish the initial cold bundle build.
      // Without this the proxy closes the socket after ~30 s and Expo Go shows
      // "Failed to download remote update" on the first scan after a restart.
      proxyTimeout: 180000,
      timeout: 180000,
      on: {
        error: (_err: unknown, _req: unknown, res: unknown) => {
          const r = res as Response;
          if (!r.headersSent) {
            r.status(502).json({ error: "Metro bundler not reachable. Make sure Start Frontend is running." });
          }
        },
      },
    });

    // Pre-warm the Metro bundle cache after startup so the first device scan
    // hits a cached bundle (~0.1 s) instead of a cold build (~17 s).
    const warmMetroBundle = (attemptsLeft = 10) => {
      const opts = {
        hostname: "localhost",
        port: 8081,
        path: "/node_modules/expo-router/entry.bundle?platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&transform.reactCompiler=true&unstable_transformProfile=hermes-stable",
        method: "GET",
        timeout: 180000,
      };
      const req = http.request(opts, (res) => {
        res.resume();
        res.on("end", () => log("Metro bundle pre-warm: complete ✓"));
      });
      req.on("error", () => {
        if (attemptsLeft > 1) {
          // Metro not ready yet — retry in 8 s
          setTimeout(() => warmMetroBundle(attemptsLeft - 1), 8000);
        }
      });
      req.on("timeout", () => req.destroy());
      req.end();
    };
    // Give Metro ~25 s to start up, then kick off the warm-up
    setTimeout(() => warmMetroBundle(), 25000);

    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.path.startsWith("/api")) return next();
      if (req.path.startsWith("/auth/reset")) return next();
      if (req.path === "/privacy" || req.path === "/home") return next();

      const platform = req.header("expo-platform");
      const isExpoGo = platform === "ios" || platform === "android";
      const isBrowserRoot = req.path === "/" && !isExpoGo;

      if (isBrowserRoot) {
        return serveLandingPage({ req, res, landingPageTemplate, appName });
      }

      // Everything else (manifest, bundles, assets, HMR) → Metro
      return metroProxy(req, res, next);
    });

    log("Expo routing: DEV mode — proxying Expo Go + Metro traffic to :8081");
  } else {
    // Production mode: serve pre-built static files and platform manifests.
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.path.startsWith("/api")) return next();
      if (req.path !== "/" && req.path !== "/manifest") return next();

      const platform = req.header("expo-platform");
      if (platform && (platform === "ios" || platform === "android")) {
        return serveExpoManifest(platform, res);
      }

      if (req.path === "/") {
        return serveLandingPage({ req, res, landingPageTemplate, appName });
      }

      next();
    });

    app.use("/assets", (req, res, next) => {
      if (req.path.toLowerCase().endsWith(".zip")) {
        return res.status(404).end();
      }
      next();
    }, express.static(path.resolve(process.cwd(), "assets")));
    app.use(express.static(path.resolve(process.cwd(), "static-build")));

    log("Expo routing: PROD mode — serving from static-build/");
  }
}

function setupErrorHandler(app: express.Application) {
  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    const error = err as {
      status?: number;
      statusCode?: number;
      message?: string;
    };

    const status = error.status || error.statusCode || 500;
    const errorType = err instanceof Error ? err.name : "UnknownError";
    console.error(`Request failed (${status}): ${errorType}`);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({
      message: status >= 500 ? "Internal Server Error" : "Invalid request",
    });
  });
}

(async () => {
  setupTrustProxy(app);
  setupCors(app);
  setupBodyParsing(app);

  setupRequestLogging(app);

  configureExpoAndLanding(app);

  const server = await registerRoutes(app);

  setupErrorHandler(app);

  const port = parseInt(process.env.PORT || "5000", 10);
  server.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`express server serving on port ${port}`);
    },
  );
})();
