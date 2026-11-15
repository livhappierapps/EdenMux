import assert from "node:assert/strict";
import { test } from "node:test";
import { getSecurityTeachingContext } from "./security-education";

test("Android lab questions receive the curated course", () => {
  const context = getSecurityTeachingContext([{ role: "user", content: "Teach me red team hacking on my old rooted Androids." }]);
  assert.match(context, /OWASP MASVS\/MASTG/);
  assert.match(context, /initial\s+scope/);
  assert.match(context, /exact model\/variant/);
});

test("brick questions include prevention and uncertain recovery, not a destructive recipe", () => {
  const context = getSecurityTeachingContext([{ role: "user", content: "How do I avoid bricking a phone?" }]);
  assert.match(context, /recovery\s+is not guaranteed/);
  assert.match(context, /Do not provide a generic OEM unlock/);
  assert.match(context, /currently disabled pending execution isolation/);
});

test("short follow-up questions retain the recent lesson context", () => {
  assert.notEqual(getSecurityTeachingContext([
    { role: "user", content: "What is Termux?" },
    { role: "assistant", content: "A terminal app." },
    { role: "user", content: "What should I learn first?" },
  ]), "");
});

test("unrelated chats and assistant text alone do not add the course", () => {
  assert.equal(getSecurityTeachingContext([{ role: "user", content: "Hello Eden!" }]), "");
  assert.equal(getSecurityTeachingContext([{ role: "assistant", content: "Android security" }]), "");
});
