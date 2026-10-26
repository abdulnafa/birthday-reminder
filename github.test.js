import test, { after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  closeBirthday, connectGitHub, createBirthday, getSavedToken,
  listBirthdayIssues, updateBirthday,
} from "./github.js";

const originalFetch = globalThis.fetch;
const originalStorage = globalThis.localStorage;
const values = new Map();
globalThis.localStorage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, value),
  removeItem: (key) => values.delete(key),
};
beforeEach(() => values.clear());
after(() => {
  globalThis.fetch = originalFetch;
  globalThis.localStorage = originalStorage;
});

const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { "Content-Type": "application/json" },
});

test("checks a token before keeping it in browser storage", async () => {
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "https://api.github.com/user");
    assert.equal(options.headers.Authorization, "Bearer test-token");
    return json({ login: "abdulnafa" });
  };
  assert.equal(await connectGitHub("  test-token  "), "abdulnafa");
  assert.equal(getSavedToken(), "test-token");
});

test("creates, edits, and closes birthday issues with the configured label", async () => {
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, method: options.method, auth: options.headers.Authorization, body: JSON.parse(options.body) });
    return json({ number: 7 });
  };
  values.set("birthday-reminder:github-token:abdulnafa/birthday-reminder", "test-token");
  await createBirthday({ name: "Ali & Sara", month: 2, day: 29 });
  await updateBirthday(7, { name: "Ali", month: 3, day: 1 });
  await closeBirthday(7);
  assert.deepEqual(requests.map((request) => request.method), ["POST", "PATCH", "PATCH"]);
  assert.deepEqual(requests[0].body, { title: "Ali & Sara", body: "Birthday: 02-29", labels: ["birthday"] });
  assert.deepEqual(requests[1].body, { title: "Ali", body: "Birthday: 03-01" });
  assert.deepEqual(requests[2].body, { state: "closed" });
  assert.ok(requests.every((request) => request.auth === "Bearer test-token"));
  assert.ok(requests[0].url.endsWith("/repos/abdulnafa/birthday-reminder/issues"));
});

test("falls back to public listing and removes an expired token", async () => {
  values.set("birthday-reminder:github-token:abdulnafa/birthday-reminder", "expired-token");
  const headers = [];
  globalThis.fetch = async (_url, options) => {
    headers.push(options.headers);
    return headers.length === 1 ? json({ message: "Bad credentials" }, 401) : json([]);
  };
  assert.deepEqual(await listBirthdayIssues(), []);
  assert.equal(headers[0].Authorization, "Bearer expired-token");
  assert.equal(headers[1].Authorization, undefined);
  assert.equal(getSavedToken(), null);
});

test("rejects an unauthorized write and disconnects the expired token", async () => {
  values.set("birthday-reminder:github-token:abdulnafa/birthday-reminder", "expired-token");
  globalThis.fetch = async () => json({ message: "Bad credentials" }, 401);
  await assert.rejects(
    createBirthday({ name: "Ali", month: 3, day: 1 }),
    { name: "GitHubError", status: 401 },
  );
  assert.equal(getSavedToken(), null);
});
