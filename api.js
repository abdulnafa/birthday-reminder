import { config } from "./config.js";
import { isValidBirthday, normalizeName, parseBirthdayRecord } from "./birthday.js";

const storageKey = "birthday-reminder:github-token:v1";
const repoApiUrl = new URL(
  `https://api.github.com/repos/${config.githubOwner}/${config.githubRepo}`,
);
const contentsUrl = new URL(`${repoApiUrl.href}/contents/${config.birthdaysPath}`);
const contentsDirUrl = new URL(
  `${repoApiUrl.href}/contents/${config.birthdaysPath.split("/").slice(0, -1).join("/")}`,
);
const accessHint = `Give the token Contents read/write on ${config.githubOwner}/${config.githubRepo}, then unlock again.`;

// Clear secrets left by older page versions.
try {
  sessionStorage.removeItem("birthday-reminder:edit-password:v1");
  for (let index = localStorage.length - 1; index >= 0; index--) {
    const key = localStorage.key(index);
    if (key?.startsWith("birthday-reminder:github-token:") || key?.startsWith("birthday-reminder:edit-password:")) {
      localStorage.removeItem(key);
    }
  }
} catch { /* Storage may be unavailable. */ }

async function timedFetch(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try { return await fetch(url, { ...options, signal: controller.signal }); }
  finally { clearTimeout(timer); }
}

function toBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(text) {
  const binary = atob(text.replace(/\s+/g, ""));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function newBirthdayId() {
  if (globalThis.crypto?.randomUUID) return `b-${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
  return `b-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export class BirthdayApiError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = "BirthdayApiError";
    this.status = status;
  }
}

export function getEditingPassword() {
  try { return sessionStorage.getItem(storageKey); }
  catch { return null; }
}

export function lockEditing() {
  try { sessionStorage.removeItem(storageKey); }
  catch { /* The browser may already have cleared the session. */ }
}

function errorForStatus(status) {
  if (status === 401 || status === 403 || status === 404) {
    return new BirthdayApiError(`GitHub token cannot access the private birthday repo. ${accessHint}`, status);
  }
  if (status === 409) return new BirthdayApiError("This birthday changed elsewhere. Refresh the list and try again.", status);
  if (status === 422) return new BirthdayApiError("GitHub rejected this birthday update. Check the name and date.", status);
  if (status === 429) return new BirthdayApiError("Too many GitHub requests. Try again shortly.", status);
  return new BirthdayApiError("The birthday repo is unavailable right now. Try again.", status);
}

async function githubFetch(token, url, { method = "GET", body } = {}) {
  let response;
  try {
    response = await timedFetch(url, {
      method,
      cache: "no-store",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new BirthdayApiError("Could not reach GitHub. Check your connection and try again.");
  }
  return response;
}

async function requireRepoAccess(token) {
  const response = await githubFetch(token, repoApiUrl);
  if (!response.ok) {
    if ((response.status === 401 || response.status === 403 || response.status === 404) && token === getEditingPassword()) {
      lockEditing();
    }
    throw errorForStatus(response.status === 404 ? 403 : response.status);
  }
}

function parseStore(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new BirthdayApiError("Birthday file must be a JSON object.");
  }
  if (payload.version !== 1 || !Array.isArray(payload.birthdays)) {
    throw new BirthdayApiError("Birthday file has an unsupported format.");
  }
  if (payload.birthdays.length > 10_000) {
    throw new BirthdayApiError("Birthday file has too many records.");
  }
  const birthdays = [];
  const seen = new Set();
  for (const raw of payload.birthdays) {
    const birthday = parseBirthdayRecord(raw);
    if (!birthday) throw new BirthdayApiError("Birthday file contains an invalid record.");
    if (seen.has(birthday.id)) throw new BirthdayApiError(`Birthday file has a duplicate id ${birthday.id}.`);
    seen.add(birthday.id);
    birthdays.push(birthday);
  }
  return birthdays;
}

async function readStore(token) {
  await requireRepoAccess(token);
  const response = await githubFetch(token, contentsUrl);
  if (response.status === 404) {
    // GitHub often returns 404 for private Contents without permission.
    // Confirm the parent folder is readable before treating the file as empty.
    const folder = await githubFetch(token, contentsDirUrl);
    if (!folder.ok) {
      if (token === getEditingPassword()) lockEditing();
      throw errorForStatus(folder.status === 404 ? 403 : folder.status);
    }
    return { birthdays: [], sha: null };
  }
  if (!response.ok) {
    if ((response.status === 401 || response.status === 403) && token === getEditingPassword()) lockEditing();
    throw errorForStatus(response.status);
  }
  let data;
  try { data = await response.json(); }
  catch { throw new BirthdayApiError("GitHub returned an unexpected response."); }
  if (typeof data?.content !== "string" || typeof data?.sha !== "string") {
    throw new BirthdayApiError("GitHub returned an unexpected response.");
  }
  let payload;
  try { payload = JSON.parse(fromBase64(data.content)); }
  catch { throw new BirthdayApiError("Birthday file is not valid JSON."); }
  return { birthdays: parseStore(payload), sha: data.sha };
}

async function writeStore(token, birthdays, sha, message) {
  const payload = `${JSON.stringify({ version: 1, birthdays }, null, 2)}\n`;
  const response = await githubFetch(token, contentsUrl, {
    method: "PUT",
    body: {
      message,
      content: toBase64(payload),
      ...(sha ? { sha } : {}),
    },
  });
  if (!response.ok) {
    if ((response.status === 401 || response.status === 403 || response.status === 404) && token === getEditingPassword()) {
      lockEditing();
    }
    throw errorForStatus(response.status);
  }
}

function validateInput(birthday) {
  const name = normalizeName(birthday?.name);
  const month = Number(birthday?.month);
  const day = Number(birthday?.day);
  if (!name || !isValidBirthday(month, day)) {
    throw new BirthdayApiError("Check the name and date, then try again.", 422);
  }
  return { name, month, day };
}

export async function unlockEditing(token) {
  if (typeof token !== "string" || token.trim().length === 0) {
    throw new BirthdayApiError("Enter a GitHub token with access to the private birthday repo.");
  }
  const cleaned = token.trim();
  await readStore(cleaned);
  try { sessionStorage.setItem(storageKey, cleaned); }
  catch { throw new BirthdayApiError("This browser cannot keep the token for this tab. Enable session storage and try again."); }
}

export async function listBirthdays() {
  const token = getEditingPassword();
  if (!token) throw new BirthdayApiError("Unlock to view birthdays.", 401);
  return (await readStore(token)).birthdays;
}

export async function createBirthday(birthday) {
  const token = getEditingPassword();
  if (!token) throw new BirthdayApiError("Unlock editing first.", 401);
  const value = validateInput(birthday);
  const store = await readStore(token);
  const created = { id: newBirthdayId(), ...value };
  await writeStore(token, [...store.birthdays, created], store.sha, `Add birthday for ${created.name}`);
  return created;
}

export async function updateBirthday(id, birthday) {
  const token = getEditingPassword();
  if (!token) throw new BirthdayApiError("Unlock editing first.", 401);
  const value = validateInput(birthday);
  const store = await readStore(token);
  const index = store.birthdays.findIndex((item) => item.id === String(id));
  if (index < 0) throw new BirthdayApiError("Birthday was not found. Refresh the list and try again.", 404);
  const updated = { id: String(id), ...value };
  const next = store.birthdays.slice();
  next[index] = updated;
  await writeStore(token, next, store.sha, `Update birthday for ${updated.name}`);
  return updated;
}

export async function deleteBirthday(id) {
  const token = getEditingPassword();
  if (!token) throw new BirthdayApiError("Unlock editing first.", 401);
  const store = await readStore(token);
  const next = store.birthdays.filter((item) => item.id !== String(id));
  if (next.length === store.birthdays.length) {
    throw new BirthdayApiError("Birthday was not found. Refresh the list and try again.", 404);
  }
  const removed = store.birthdays.find((item) => item.id === String(id));
  await writeStore(token, next, store.sha, `Remove birthday for ${removed?.name ?? id}`);
}
