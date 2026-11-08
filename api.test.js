import test, { after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  createBirthday, deleteBirthday, getEditingPassword, listBirthdays,
  lockEditing, unlockEditing, updateBirthday,
} from "./api.js";

const originalFetch = globalThis.fetch;
const originalStorage = globalThis.sessionStorage;
const values = new Map();
globalThis.sessionStorage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, value),
  removeItem: (key) => values.delete(key),
};
beforeEach(() => values.clear());
after(() => {
  globalThis.fetch = originalFetch;
  globalThis.sessionStorage = originalStorage;
});

const sample = { id: "birthday-12", name: "Ayesha", month: 11, day: 14 };
const repoUrl = "https://api.github.com/repos/abdulnafa/birthday-reminder-scheduler";
const fileUrl = `${repoUrl}/contents/data/birthdays.json`;

function encodeStore(birthdays, sha = "abc123") {
  const payload = `${JSON.stringify({ version: 1, birthdays }, null, 2)}\n`;
  return {
    sha,
    content: Buffer.from(payload, "utf8").toString("base64"),
  };
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status, headers: { "Content-Type": "application/json" },
  });
}

test("never requests birthdays before the token is unlocked", async () => {
  let requests = 0;
  globalThis.fetch = async () => { requests++; return json(encodeStore([sample])); };
  await assert.rejects(listBirthdays(), { name: "BirthdayApiError", status: 401 });
  assert.equal(requests, 0);
});

test("loads birthdays only with the saved GitHub token", async () => {
  values.set("birthday-reminder:github-token:v1", "example-test-token");
  globalThis.fetch = async (url, options) => {
    assert.equal(options.headers.Authorization, "Bearer example-test-token");
    if (String(url) === repoUrl) return json({ full_name: "abdulnafa/birthday-reminder-scheduler" });
    assert.equal(String(url), fileUrl);
    assert.equal(options.method, "GET");
    return json(encodeStore([sample]));
  };
  assert.deepEqual(await listBirthdays(), [sample]);
});

test("an unauthorized birthday list clears the saved token", async () => {
  values.set("birthday-reminder:github-token:v1", "expired-test-token");
  globalThis.fetch = async (_url, options) => {
    assert.equal(options.headers.Authorization, "Bearer expired-test-token");
    return json({ message: "Bad credentials" }, 401);
  };
  await assert.rejects(listBirthdays(), { name: "BirthdayApiError", status: 401 });
  assert.equal(getEditingPassword(), null);
});

test("rejects unlock when the token cannot see the private repo", async () => {
  globalThis.fetch = async (url) => {
    assert.equal(String(url), repoUrl);
    return json({ message: "Not Found" }, 404);
  };
  await assert.rejects(unlockEditing("wrong-repo-token"), {
    name: "BirthdayApiError", status: 403,
  });
  assert.equal(getEditingPassword(), null);
});

test("verifies the token before keeping it in session storage", async () => {
  globalThis.fetch = async (url, options) => {
    assert.equal(options.headers.Authorization, "Bearer example-test-token");
    if (String(url) === repoUrl) return json({ full_name: "abdulnafa/birthday-reminder-scheduler" });
    assert.equal(String(url), fileUrl);
    assert.equal(options.method, "GET");
    assert.equal(options.body, undefined);
    return json(encodeStore([]));
  };
  await unlockEditing("example-test-token");
  assert.equal(getEditingPassword(), "example-test-token");
  lockEditing();
  assert.equal(getEditingPassword(), null);
});

test("adds, changes, and removes birthdays through the private JSON file", async () => {
  values.set("birthday-reminder:github-token:v1", "example-test-token");
  let store = [sample];
  let sha = "sha-1";
  const methods = [];
  globalThis.fetch = async (url, options) => {
    assert.equal(options.headers.Authorization, "Bearer example-test-token");
    if (String(url) === repoUrl) return json({ full_name: "abdulnafa/birthday-reminder-scheduler" });
    assert.equal(String(url), fileUrl);
    methods.push(options.method);
    if (options.method === "GET") return json(encodeStore(store, sha));
    const body = JSON.parse(options.body);
    assert.equal(body.sha, sha);
    const next = JSON.parse(Buffer.from(body.content, "base64").toString("utf8"));
    store = next.birthdays;
    sha = "sha-next";
    return json({ content: encodeStore(store, sha) });
  };
  const created = await createBirthday({ name: "Bilal", month: 3, day: 1 });
  assert.equal(created.name, "Bilal");
  assert.match(created.id, /^b-[a-z0-9]+$/i);
  await updateBirthday(sample.id, { name: "Ayesha B", month: 11, day: 15 });
  await deleteBirthday(sample.id);
  assert.deepEqual(methods, ["GET", "PUT", "GET", "PUT", "GET", "PUT"]);
  assert.equal(store.length, 1);
  assert.equal(store[0].name, "Bilal");
});

test("clears the session token after an unauthorized write", async () => {
  values.set("birthday-reminder:github-token:v1", "expired-test-token");
  globalThis.fetch = async (url, options) => {
    if (String(url) === repoUrl) return json({ full_name: "abdulnafa/birthday-reminder-scheduler" });
    if (options.method === "GET") return json(encodeStore([]));
    return json({ message: "Bad credentials" }, 401);
  };
  await assert.rejects(createBirthday({ name: "Ali", month: 3, day: 1 }), {
    name: "BirthdayApiError", status: 401,
  });
  assert.equal(getEditingPassword(), null);
});

test("does not save a token when unlock is rejected", async () => {
  globalThis.fetch = async () => json({ message: "Bad credentials" }, 401);
  await assert.rejects(unlockEditing("wrong-test-token"), {
    name: "BirthdayApiError", status: 401,
  });
  assert.equal(getEditingPassword(), null);
});
