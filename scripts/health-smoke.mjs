import assert from "node:assert/strict";

const domain = process.env.REPLIT_DEV_DOMAIN;
const base = process.env.SMOKE_BASE_URL || (domain ? `https://${domain}` : "");
if (!base) throw new Error("Set SMOKE_BASE_URL or REPLIT_DEV_DOMAIN.");

async function request(path, options = {}) {
  return fetch(new URL(path, base), {
    ...options,
    signal: AbortSignal.timeout(20_000),
  });
}

const landing = await request("/");
assert.equal(landing.status, 200, "Landing page must respond successfully");
assert.ok((await landing.text()).trim().length > 100, "Landing page must not be blank");
console.log("PASS: landing page");

const configResponse = await request("/api/config");
assert.equal(configResponse.status, 200);
const config = await configResponse.json();
for (const key of ["features", "eden", "app"]) {
  assert.ok(config[key] && typeof config[key] === "object", `Config missing ${key}`);
}
console.log("PASS: config shape");

for (const [path, body, allowed] of [
  ["/api/auth/login", { email: "health-smoke@example.invalid", password: "invalid-password" }, [400, 401]],
  ["/api/auth/register", {}, [400]],
]) {
  const response = await request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  assert.ok(allowed.includes(response.status), `${path}: unexpected status ${response.status}`);
  console.log(`PASS: ${path} validation`);
}

const removedGoogle = await request("/api/auth/google", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: "{}",
});
assert.equal(removedGoogle.status, 404, "Removed Google auth must stay unavailable");
console.log("PASS: Google auth removed");

const traversal = await request("/", { headers: { "expo-platform": "../../etc/passwd" } });
assert.equal(traversal.status, 200, "Invalid platform should fall back to the browser landing page");
assert.match(await traversal.text(), /<!DOCTYPE html>/i, "Invalid platform must not read an arbitrary file");
console.log("PASS: invalid platform serves only the landing page");

assert.equal((await request("/api/config")).status, 200, "Server must survive invalid requests");
console.log("PASS: server remains healthy");
