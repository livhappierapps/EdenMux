import { createClient } from "@replit/revenuecat-sdk/client";

export async function getUncachableRevenueCatClient() {
  const apiKey = process.env.REVENUECAT_API_KEY;
  if (!apiKey) {
    throw new Error(
      "REVENUECAT_API_KEY is not set. Add a V2 Secret Key from app.revenuecat.com → Project → API Keys."
    );
  }

  const client = createClient({
    baseUrl: "https://api.revenuecat.com/v2",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  return client;
}
