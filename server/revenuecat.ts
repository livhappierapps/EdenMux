const CORE_UNLOCK_ENTITLEMENT_ID = "core_unlock";

interface RevenueCatEntitlement {
  expires_date?: string | null;
  grace_period_expires_date?: string | null;
}

interface RevenueCatSubscriberResponse {
  subscriber?: {
    entitlements?: Record<string, RevenueCatEntitlement>;
  };
}

interface RevenueCatCheckOptions {
  apiKey?: string;
  fetcher?: typeof fetch;
  now?: number;
}

export function isEntitlementActive(
  entitlement: RevenueCatEntitlement | undefined,
  now = Date.now()
): boolean {
  if (!entitlement) return false;
  if (entitlement.expires_date === null) return true;

  const expiry = typeof entitlement.expires_date === "string"
    ? Date.parse(entitlement.expires_date)
    : Number.NaN;
  const graceExpiry = typeof entitlement.grace_period_expires_date === "string"
    ? Date.parse(entitlement.grace_period_expires_date)
    : Number.NaN;
  return (Number.isFinite(expiry) && expiry > now)
    || (Number.isFinite(graceExpiry) && graceExpiry > now);
}

export async function hasCoreUnlock(
  appUserId: string,
  options: RevenueCatCheckOptions = {}
): Promise<boolean> {
  const apiKey = options.apiKey ?? process.env.REVENUECAT_SECRET_KEY;
  if (!apiKey || !appUserId) return false;

  const fetcher = options.fetcher ?? fetch;
  try {
    const response = await fetcher(
      `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(5000),
      }
    );
    if (!response.ok) {
      console.error(`[RevenueCat] Core Unlock check failed (${response.status}).`);
      return false;
    }

    const data = (await response.json()) as RevenueCatSubscriberResponse;
    return isEntitlementActive(
      data.subscriber?.entitlements?.[CORE_UNLOCK_ENTITLEMENT_ID],
      options.now ?? Date.now()
    );
  } catch (error) {
    const errorType = error instanceof Error ? error.name : "UnknownError";
    console.error(`[RevenueCat] Core Unlock check error: ${errorType}`);
    return false;
  }
}
