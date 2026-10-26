import { config } from "./config.js";

const storageKey = "birthday-reminder:edit-password:v1";
const apiBase = new URL(config.apiBase);

// Remove credentials left by the previous GitHub-based version of this page.
try {
  for (let index = localStorage.length - 1; index >= 0; index--) {
    const key = localStorage.key(index);
    if (key?.startsWith("birthday-reminder:github-token:")) localStorage.removeItem(key);
  }
} catch { /* Local storage may be unavailable. */ }

async function timedFetch(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try { return await fetch(url, { ...options, signal: controller.signal }); }
  finally { clearTimeout(timer); }
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
  if (status === 401) return new BirthdayApiError("Editing password is incorrect. Unlock again.", status);
  if (status === 403) return new BirthdayApiError("Editing is not allowed. Check the password and try again.", status);
  if (status === 404) return new BirthdayApiError("Birthday was not found. Refresh the list and try again.", status);
  if (status === 409) return new BirthdayApiError("This birthday changed elsewhere. Refresh the list and try again.", status);
  if (status === 422) return new BirthdayApiError("The server rejected this birthday. Check the name and date.", status);
  if (status === 429) return new BirthdayApiError("Too many requests. Try again shortly.", status);
  return new BirthdayApiError("The birthday service is unavailable right now. Try again.", status);
}

async function request(path, { method = "GET", body, password } = {}) {
  let response;
  try {
    response = await timedFetch(new URL(path, apiBase), {
      method,
      cache: "no-store",
      headers: {
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(password ? { "X-Edit-Password": password } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new BirthdayApiError("Could not reach the birthday service. Check your connection and try again.");
  }
  if (!response.ok) {
    if (response.status === 401 && password === getEditingPassword()) lockEditing();
    throw errorForStatus(response.status);
  }
  return response.status === 204 ? null : response.json();
}

export async function unlockEditing(password) {
  if (typeof password !== "string" || password.length === 0) throw new BirthdayApiError("Enter the editing password.");
  await request("/api/unlock", { method: "POST", password });
  try { sessionStorage.setItem(storageKey, password); }
  catch { throw new BirthdayApiError("This browser cannot keep the password for this tab. Enable session storage and try again."); }
}

export async function listBirthdays() {
  const data = await request("/api/birthdays");
  if (!data || !Array.isArray(data.birthdays)) throw new BirthdayApiError("The birthday service returned an unexpected response.");
  return data.birthdays;
}

async function writeBirthday(path, method, birthday) {
  const password = getEditingPassword();
  if (!password) throw new BirthdayApiError("Unlock editing first.", 401);
  const data = await request(path, { method, body: birthday, password });
  if (!data || !data.birthday) throw new BirthdayApiError("The birthday service returned an unexpected response.");
  return data.birthday;
}

export function createBirthday(birthday) {
  return writeBirthday("/api/birthdays", "POST", birthday);
}

export function updateBirthday(id, birthday) {
  return writeBirthday(`/api/birthdays/${encodeURIComponent(id)}`, "PATCH", birthday);
}

export async function deleteBirthday(id) {
  const password = getEditingPassword();
  if (!password) throw new BirthdayApiError("Unlock editing first.", 401);
  await request(`/api/birthdays/${encodeURIComponent(id)}`, { method: "DELETE", password });
}
