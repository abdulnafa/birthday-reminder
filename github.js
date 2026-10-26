import { config } from "./config.js";

// This module is the app's data adapter. A hosted write API can replace the
// authenticated functions without changing the form or list UI.
const storageKey = `birthday-reminder:github-token:${config.owner}/${config.repo}`;
const repoApi = `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}`;
const apiHeaders = { Accept: "application/vnd.github+json" };
const pad = (number) => String(number).padStart(2, "0");

async function timedFetch(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try { return await fetch(url, { ...options, signal: controller.signal }); }
  finally { clearTimeout(timer); }
}

export class GitHubError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = "GitHubError";
    this.status = status;
  }
}

export function getSavedToken() {
  try { return localStorage.getItem(storageKey); }
  catch { return null; }
}

export function removeSavedToken() {
  try { localStorage.removeItem(storageKey); }
  catch { /* Storage may already be unavailable. */ }
}

function apiError(status) {
  if (status === 401) return new GitHubError("GitHub token is invalid or expired. Connect again.", status);
  if (status === 403) return new GitHubError("GitHub denied access. Give the token Issues: Read and write access to this repository.", status);
  if (status === 404) return new GitHubError("Repository not found, or this token cannot access it.", status);
  if (status === 422) return new GitHubError("GitHub rejected the change. Check that the birthday label exists.", status);
  if (status === 429) return new GitHubError("GitHub is limiting requests right now. Try again later.", status);
  return new GitHubError("GitHub could not save this change. Try again.", status);
}

async function authenticatedRequest(path, method, payload, token = getSavedToken()) {
  if (!token) throw new GitHubError("Connect GitHub first to save birthdays.", 401);
  let response;
  try {
    response = await timedFetch(`https://api.github.com${path}`, {
      method,
      cache: "no-store",
      headers: { ...apiHeaders, Authorization: `Bearer ${token}`, ...(payload ? { "Content-Type": "application/json" } : {}) },
      ...(payload ? { body: JSON.stringify(payload) } : {}),
    });
  } catch {
    throw new GitHubError("Could not reach GitHub. Check your connection and try again.");
  }
  if (!response.ok) {
    if (response.status === 401 && token === getSavedToken()) removeSavedToken();
    throw apiError(response.status);
  }
  return response.json();
}

export async function connectGitHub(rawToken) {
  const token = rawToken.trim();
  if (!token || /\s/u.test(token)) throw new GitHubError("Paste a GitHub token without spaces.");
  const user = await authenticatedRequest("/user", "GET", null, token);
  try { localStorage.setItem(storageKey, token); }
  catch { throw new GitHubError("This browser cannot save the token. Enable site storage and try again."); }
  return user.login;
}

export async function listBirthdayIssues() {
  const all = [];
  for (let page = 1; page <= 20; page++) {
    const url = new URL(`${repoApi}/issues`);
    url.searchParams.set("state", "open");
    url.searchParams.set("labels", config.label);
    url.searchParams.set("per_page", "100");
    url.searchParams.set("page", String(page));
    let response;
    const token = getSavedToken();
    const headers = token ? { ...apiHeaders, Authorization: `Bearer ${token}` } : apiHeaders;
    try { response = await timedFetch(url, { cache: "no-store", headers }); }
    catch { throw new GitHubError("Could not reach GitHub. Check your connection and refresh."); }
    if (token && (response.status === 401 || response.status === 403)) {
      if (response.status === 401) removeSavedToken();
      try { response = await timedFetch(url, { cache: "no-store", headers: apiHeaders }); }
      catch { throw new GitHubError("Could not reach GitHub. Check your connection and refresh."); }
    }
    if (!response.ok) {
      if (response.status === 404) throw new GitHubError("GitHub repository or Issues could not be found.", 404);
      if (response.status === 403 || response.status === 429) throw new GitHubError("GitHub is limiting requests right now. Try refreshing later.", response.status);
      throw new GitHubError("GitHub could not load birthdays right now.", response.status);
    }
    const batch = await response.json();
    if (!Array.isArray(batch)) throw new GitHubError("GitHub returned an unexpected response.");
    all.push(...batch);
    if (batch.length < 100) return all;
  }
  throw new GitHubError("The birthday list is too large to display.");
}

function birthdayFields({ name, month, day }) {
  return { title: name, body: `Birthday: ${pad(month)}-${pad(day)}` };
}

export function createBirthday(birthday) {
  return authenticatedRequest(`/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/issues`, "POST", {
    ...birthdayFields(birthday), labels: [config.label],
  });
}

export function updateBirthday(number, birthday) {
  return authenticatedRequest(`/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/issues/${number}`, "PATCH", birthdayFields(birthday));
}

export function closeBirthday(number) {
  return authenticatedRequest(`/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/issues/${number}`, "PATCH", { state: "closed" });
}
