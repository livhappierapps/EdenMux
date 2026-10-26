import type { Request, Response } from "express";
import fs from "node:fs";
import path from "node:path";

const EAS_PROJECT_ID = process.env.EAS_PROJECT_ID ?? "";
const EAS_OWNER = process.env.EAS_OWNER ?? "livhappierapps";
const EAS_SLUG = "edenmux";
const EAS_GRAPHQL_URL = "https://api.expo.dev/graphql";
const CHANNELS = ["preview", "production"] as const;

interface EasUpdate {
  id: string;
  group: string;
  message: string;
  createdAt: string;
  runtimeVersion: string;
  platform: string;
}

interface ChannelStatus {
  channelId: string | null;
  latestUpdate: EasUpdate | null;
  neverPublished: boolean;
}

// In-memory cache: refresh at most once every 5 min
let cachedChannelData: Record<string, ChannelStatus> | null = null;
let cacheExpiresAt = 0;

function readAppVersion(): string {
  try {
    const appJsonPath = path.resolve(process.cwd(), "app.json");
    const appJson = JSON.parse(fs.readFileSync(appJsonPath, "utf-8"));
    return appJson.expo?.version ?? "unknown";
  } catch {
    return "unknown";
  }
}

async function fetchChannelStatus(
  token: string,
  channelName: string
): Promise<ChannelStatus> {
  const query = `
    query GetChannelHead($appId: String!, $channel: String!) {
      app {
        byId(appId: $appId) {
          updateChannelByName(name: $channel) {
            id
            name
            updateBranches(limit: 1, offset: 0) {
              name
              updates(limit: 1, offset: 0) {
                id
                group
                message
                createdAt
                runtimeVersion
                platform
              }
            }
          }
        }
      }
    }
  `;

  const resp = await fetch(EAS_GRAPHQL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      query,
      variables: { appId: EAS_PROJECT_ID, channel: channelName },
    }),
  });

  if (!resp.ok) {
    throw new Error(`EAS API error: ${resp.status}`);
  }

  const json = (await resp.json()) as {
    data?: {
      app?: {
        byId?: {
          updateChannelByName?: {
            id: string;
            updateBranches?: Array<{
              updates?: EasUpdate[];
            }>;
          } | null;
        };
      };
    };
    errors?: Array<{ message: string }>;
  };

  if (json.errors?.length) {
    throw new Error(json.errors.map((e) => e.message).join("; "));
  }

  const channel = json.data?.app?.byId?.updateChannelByName;
  if (!channel) {
    return { channelId: null, latestUpdate: null, neverPublished: true };
  }

  const latestUpdate = channel.updateBranches?.[0]?.updates?.[0] ?? null;
  return {
    channelId: channel.id,
    latestUpdate,
    neverPublished: latestUpdate === null,
  };
}

async function getChannelData(token: string): Promise<Record<string, ChannelStatus>> {
  const now = Date.now();
  if (cachedChannelData && now < cacheExpiresAt) {
    return cachedChannelData;
  }

  const results = await Promise.allSettled(
    CHANNELS.map((ch) => fetchChannelStatus(token, ch))
  );

  const data: Record<string, ChannelStatus> = {};
  for (let i = 0; i < CHANNELS.length; i++) {
    const ch = CHANNELS[i];
    const r = results[i];
    if (r.status === "fulfilled") {
      data[ch] = r.value;
    } else {
      data[ch] = {
        channelId: null,
        latestUpdate: null,
        neverPublished: true,
      };
    }
  }

  cachedChannelData = data;
  cacheExpiresAt = now + 5 * 60 * 1000;
  return data;
}

export async function handleOtaStatus(_req: Request, res: Response) {
  const appVersion = readAppVersion();
  const token = process.env.EXPO_TOKEN;

  if (!token) {
    return res.status(503).json({
      error: "EXPO_TOKEN not configured — cannot query live OTA state.",
      projectId: EAS_PROJECT_ID,
      owner: EAS_OWNER,
      slug: EAS_SLUG,
      updateUrl: `https://u.expo.dev/${EAS_PROJECT_ID}`,
      appVersion,
    });
  }

  try {
    const channelData = await getChannelData(token);

    return res.json({
      projectId: EAS_PROJECT_ID,
      owner: EAS_OWNER,
      slug: EAS_SLUG,
      appVersion,
      runtimeVersionPolicy: "appVersion",
      updateUrl: `https://u.expo.dev/${EAS_PROJECT_ID}`,
      channels: Object.fromEntries(
        Object.entries(channelData).map(([ch, status]) => [
          ch,
          {
            channelId: status.channelId,
            neverPublished: status.neverPublished,
            latestUpdate: status.latestUpdate
              ? {
                  id: status.latestUpdate.id,
                  group: status.latestUpdate.group,
                  message: status.latestUpdate.message,
                  createdAt: status.latestUpdate.createdAt,
                  runtimeVersion: status.latestUpdate.runtimeVersion,
                  platform: status.latestUpdate.platform,
                }
              : null,
          },
        ])
      ),
      pushCommand: "eas update --channel preview --message 'describe your change'",
      cacheNote: "Channel data cached for 5 minutes.",
    });
  } catch (err) {
    const errorType = err instanceof Error ? err.name : "UnknownError";
    console.error(`OTA status fetch error: ${errorType}`);
    return res.status(502).json({
      error: "Failed to fetch live OTA status from EAS.",
      projectId: EAS_PROJECT_ID,
      updateUrl: `https://u.expo.dev/${EAS_PROJECT_ID}`,
      appVersion,
    });
  }
}
