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

const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { "Content-Type": "application/json" },
});
const noContent = () => new Response(null, { status: 204 });
const sample = { id: "birthday-12", name: "Ayesha", month: 11, day: 14 };

test("loads the public birthday list without an editing password", async () => {
  globalThis.fetch = async (url, options) => {
    assert.equal(String(url), "https://birthday-reminder-api-nafa.kypsamar.chatgpt.site/api/birthdays");
    assert.equal(options.method, "GET");
    assert.equal(options.headers["X-Edit-Password"], undefined);
    return json({ birthdays: [sample] });
  };
  assert.deepEqual(await listBirthdays(), [sample]);
});

test("verifies the password before keeping it in session storage", async () => {
  globalThis.fetch = async (url, options) => {
    assert.equal(String(url), "https://birthday-reminder-api-nafa.kypsamar.chatgpt.site/api/unlock");
    assert.equal(options.method, "POST");
    assert.equal(options.headers["X-Edit-Password"], "example-test-password");
    assert.equal(options.body, undefined);
    return noContent();
  };
  await unlockEditing("example-test-password");
  assert.equal(getEditingPassword(), "example-test-password");
  lockEditing();
  assert.equal(getEditingPassword(), null);
});

test("adds, changes, and removes birthdays through the protected API", async () => {
  values.set("birthday-reminder:edit-password:v1", "example-test-password");
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url: String(url), method: options.method, password: options.headers["X-Edit-Password"], body: options.body && JSON.parse(options.body) });
    return options.method === "DELETE" ? noContent() : json({ birthday: sample });
  };
  await createBirthday({ name: "Ayesha", month: 11, day: 14 });
  await updateBirthday("birthday-12", { name: "Ayesha B", month: 11, day: 15 });
  await deleteBirthday("birthday-12");
  assert.deepEqual(requests.map((item) => item.method), ["POST", "PATCH", "DELETE"]);
  assert.deepEqual(requests[0].body, { name: "Ayesha", month: 11, day: 14 });
  assert.deepEqual(requests[1].body, { name: "Ayesha B", month: 11, day: 15 });
  assert.equal(requests[2].body, undefined);
  assert.ok(requests.every((item) => item.password === "example-test-password"));
  assert.ok(requests.every((item) => !item.url.includes("example-test-password")));
});

test("clears the session password after an unauthorized write", async () => {
  values.set("birthday-reminder:edit-password:v1", "expired-test-password");
  globalThis.fetch = async () => json({ error: "Unauthorized" }, 401);
  await assert.rejects(createBirthday({ name: "Ali", month: 3, day: 1 }), {
    name: "BirthdayApiError", status: 401,
  });
  assert.equal(getEditingPassword(), null);
});

test("does not save a password when unlock is rejected", async () => {
  globalThis.fetch = async () => json({ error: "Unauthorized" }, 401);
  await assert.rejects(unlockEditing("wrong-test-password"), {
    name: "BirthdayApiError", status: 401,
  });
  assert.equal(getEditingPassword(), null);
});
