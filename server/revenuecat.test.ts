import assert from "node:assert/strict";
import { test } from "node:test";
import { hasCoreUnlock, isEntitlementActive } from "./revenuecat";

const NOW = Date.parse("2026-10-18T12:00:00.000Z");

test("a non-expiring Core Unlock entitlement is active", () => {
  assert.equal(isEntitlementActive({ expires_date: null }, NOW), true);
});

test("an expired entitlement is inactive unless its grace period is active", () => {
  assert.equal(
    isEntitlementActive({ expires_date: "2026-10-17T12:00:00.000Z" }, NOW),
    false
  );
  assert.equal(
    isEntitlementActive({
      expires_date: "2026-10-17T12:00:00.000Z",
      grace_period_expires_date: "2026-10-19T12:00:00.000Z",
    }, NOW),
    true
  );
  assert.equal(
    isEntitlementActive({
      expires_date: "2026-10-17T12:00:00.000Z",
      grace_period_expires_date: null,
    }, NOW),
    false
  );
  assert.equal(isEntitlementActive({ grace_period_expires_date: null }, NOW), false);
});

test("Core Unlock is checked against the RevenueCat customer for the signed-in ID", async () => {
  let requestedUrl = "";
  let authorization = "";
  const fetcher: typeof fetch = async (input, init) => {
    requestedUrl = String(input);
    authorization = new Headers(init?.headers).get("Authorization") ?? "";
    return new Response(JSON.stringify({
      subscriber: {
        entitlements: {
          core_unlock: { expires_date: null },
        },
      },
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  const hasAccess = await hasCoreUnlock("account/id", {
    apiKey: "server-secret",
    fetcher,
    now: NOW,
  });

  assert.equal(hasAccess, true);
  assert.equal(
    requestedUrl,
    "https://api.revenuecat.com/v1/subscribers/account%2Fid"
  );
  assert.equal(authorization, "Bearer server-secret");
});

test("a failed RevenueCat check does not grant Core Unlock", async () => {
  const fetcher: typeof fetch = async () => new Response("unavailable", { status: 503 });

  assert.equal(
    await hasCoreUnlock("account-id", { apiKey: "server-secret", fetcher, now: NOW }),
    false
  );
});

test("a successful response without Core Unlock does not grant memory access", async () => {
  const fetcher: typeof fetch = async () => new Response(JSON.stringify({
    subscriber: { entitlements: {} },
  }), { status: 200, headers: { "Content-Type": "application/json" } });

  assert.equal(
    await hasCoreUnlock("account-id", { apiKey: "server-secret", fetcher, now: NOW }),
    false
  );
});

test("a missing server key does not make an entitlement request", async () => {
  let requested = false;
  const fetcher: typeof fetch = async () => {
    requested = true;
    return new Response(null, { status: 200 });
  };

  assert.equal(await hasCoreUnlock("account-id", { apiKey: "", fetcher, now: NOW }), false);
  assert.equal(requested, false);
});
