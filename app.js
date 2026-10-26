import { config } from "./config.js";
import {
  countdownLabel, formatBirthday, isValidBirthday, normalizeName,
  sortBirthdays, todayInKarachi,
} from "./birthday.js";
import {
  closeBirthday, connectGitHub, createBirthday, getSavedToken,
  listBirthdayIssues, removeSavedToken, updateBirthday,
} from "./github.js";

const $ = (id) => document.getElementById(id);
const form = $("birthday-form");
const nameInput = $("name");
const daySelect = $("day");
const monthSelect = $("month");
const formStatus = $("form-status");
const list = $("birthday-list");
const listState = $("list-state");
const refreshButton = $("refresh-button");
const connectionDialog = $("connection-dialog");
const tokenInput = $("github-token");
const dialogStatus = $("dialog-status");
const connectionButton = $("connection-button");
const connectInline = $("open-connection");
const submitButton = $("submit-button");
const removeButton = $("remove-birthday");
let editing = null;
let saving = false;
let loading = false;
let lastLoadedAt = 0;
let saveAfterConnect = false;

function setFormStatus(message, isError = false) {
  formStatus.textContent = message;
  formStatus.classList.toggle("is-error", isError);
}

function setDialogStatus(message, isError = false) {
  dialogStatus.textContent = message;
  dialogStatus.classList.toggle("is-error", isError);
}

function setDayOptions() {
  const previous = daySelect.value;
  const month = Number(monthSelect.value);
  const maxDay = month ? new Date(Date.UTC(2000, month, 0)).getUTCDate() : 31;
  daySelect.replaceChildren(new Option("Day", ""));
  for (let day = 1; day <= maxDay; day++) daySelect.add(new Option(String(day), String(day)));
  daySelect.value = Number(previous) <= maxDay ? previous : "";
}

function updateConnectionUi() {
  const connected = Boolean(getSavedToken());
  connectionButton.classList.toggle("is-connected", connected);
  connectionButton.setAttribute("aria-label", connected ? "Manage GitHub connection" : "Connect GitHub");
  connectionButton.title = connected ? "Manage GitHub connection" : "Connect GitHub";
  connectInline.textContent = connected ? "Manage GitHub" : "Connect GitHub";
  $("connection-copy").textContent = connected
    ? "Connected in this browser. Add and edit directly here."
    : "Connect once to add and edit directly here.";
  $("disconnect-button").hidden = !connected;
  $("save-connection").textContent = connected ? "Replace connection" : "Save connection";
}

function openConnection() {
  updateConnectionUi();
  tokenInput.value = "";
  setDialogStatus("");
  connectionDialog.showModal();
  tokenInput.focus();
}

function clearEdit() {
  editing = null;
  form.reset();
  setDayOptions();
  $("add-title").textContent = "Add birthday";
  submitButton.textContent = "Add birthday";
  $("edit-actions").hidden = true;
  nameInput.removeAttribute("aria-invalid");
  daySelect.removeAttribute("aria-invalid");
  monthSelect.removeAttribute("aria-invalid");
}

function beginEdit(birthday) {
  editing = birthday;
  nameInput.value = birthday.name;
  monthSelect.value = String(birthday.month);
  setDayOptions();
  daySelect.value = String(birthday.day);
  $("add-title").textContent = "Edit birthday";
  submitButton.textContent = "Save changes";
  $("edit-actions").hidden = false;
  setFormStatus("");
  form.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
  nameInput.focus({ preventScroll: true });
}

function showEmptyState() {
  listState.replaceChildren();
  const wrapper = document.createElement("div");
  wrapper.className = "empty-state";
  const icon = document.createElement("div");
  icon.className = "empty-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.innerHTML = '<svg viewBox="0 0 32 32" fill="none"><rect x="4" y="7" width="24" height="21" rx="4" stroke="currentColor" stroke-width="1.7"/><path d="M4 13h24M10 4v6M22 4v6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="m12 21 3 3 6-7" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const heading = document.createElement("h3");
  heading.textContent = "No birthdays yet";
  const copy = document.createElement("p");
  copy.textContent = "Add a name to start your list. Saved birthdays will appear here.";
  wrapper.append(icon, heading, copy);
  listState.append(wrapper);
  listState.hidden = false;
}

function makeRow(birthday) {
  const row = document.createElement("li");
  row.className = "birthday-row";
  const avatar = document.createElement("span");
  const color = ["", "pink", "green", "yellow"][Array.from(birthday.name).reduce((sum, char) => sum + char.codePointAt(0), 0) % 4];
  avatar.className = `avatar ${color}`.trim();
  avatar.setAttribute("aria-hidden", "true");
  avatar.textContent = Array.from(birthday.name)[0].toLocaleUpperCase();
  const name = document.createElement("span");
  name.className = "person-name";
  name.textContent = birthday.name;
  const date = document.createElement("time");
  date.className = "birthday-date";
  date.dateTime = `--${String(birthday.month).padStart(2, "0")}-${String(birthday.day).padStart(2, "0")}`;
  date.textContent = formatBirthday(birthday.month, birthday.day);
  const countdown = document.createElement("span");
  countdown.className = "countdown";
  countdown.textContent = countdownLabel(birthday.next.daysUntil);
  const edit = document.createElement("button");
  edit.className = "edit-link";
  edit.type = "button";
  edit.setAttribute("aria-label", `Edit ${birthday.name}'s birthday`);
  edit.innerHTML = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m4 16-.8 4.8L8 20l10.7-10.7a2 2 0 0 0-2.8-2.8L5.2 17.2 4 16Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="m13.8 8.6 2.8 2.8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';
  edit.addEventListener("click", () => beginEdit(birthday));
  row.append(avatar, name, date, countdown, edit);
  return row;
}

async function loadBirthdays() {
  if (loading) return;
  loading = true;
  refreshButton.disabled = true;
  listState.hidden = false;
  listState.textContent = "Loading birthdays…";
  try {
    const birthdays = sortBirthdays(await listBirthdayIssues(), todayInKarachi(), config.label);
    list.replaceChildren(...birthdays.map(makeRow));
    if (birthdays.length) listState.hidden = true;
    else showEmptyState();
  } catch (error) {
    list.replaceChildren();
    listState.textContent = `${error instanceof Error ? error.message : "Could not load birthdays."} Use the refresh button to try again.`;
    listState.hidden = false;
  } finally {
    lastLoadedAt = Date.now();
    loading = false;
    refreshButton.disabled = false;
    updateConnectionUi();
  }
}

function refreshOnReturn() {
  if (!document.hidden && Date.now() - lastLoadedAt > 1500) loadBirthdays();
}

function readForm() {
  setFormStatus("");
  nameInput.removeAttribute("aria-invalid");
  daySelect.removeAttribute("aria-invalid");
  monthSelect.removeAttribute("aria-invalid");
  const name = normalizeName(nameInput.value);
  if (!name) {
    nameInput.setAttribute("aria-invalid", "true");
    setFormStatus("Enter a name with no more than 80 characters.", true);
    nameInput.focus();
    return null;
  }
  const month = Number(monthSelect.value);
  const day = Number(daySelect.value);
  if (!isValidBirthday(month, day)) {
    if (!monthSelect.value) monthSelect.setAttribute("aria-invalid", "true");
    daySelect.setAttribute("aria-invalid", "true");
    setFormStatus("Choose a valid month and day.", true);
    (monthSelect.value ? daySelect : monthSelect).focus();
    return null;
  }
  return { name, month, day };
}

async function saveBirthday() {
  if (saving) return;
  const birthday = readForm();
  if (!birthday) return;
  if (!getSavedToken()) {
    saveAfterConnect = true;
    setFormStatus("Connect GitHub once to save birthdays here.");
    openConnection();
    return;
  }
  saving = true;
  submitButton.disabled = true;
  removeButton.disabled = true;
  setFormStatus("Saving birthday…");
  const wasEditing = Boolean(editing);
  try {
    if (wasEditing) await updateBirthday(editing.number, birthday);
    else await createBirthday(birthday);
    clearEdit();
    await loadBirthdays();
    setFormStatus(wasEditing ? "Birthday updated." : "Birthday added.");
  } catch (error) {
    updateConnectionUi();
    setFormStatus(error instanceof Error ? error.message : "Could not save birthday.", true);
  } finally {
    saving = false;
    submitButton.disabled = false;
    removeButton.disabled = false;
  }
}

form.addEventListener("submit", (event) => { event.preventDefault(); saveBirthday(); });
monthSelect.addEventListener("change", setDayOptions);
refreshButton.addEventListener("click", loadBirthdays);
window.addEventListener("focus", refreshOnReturn);
document.addEventListener("visibilitychange", refreshOnReturn);
$("cancel-edit").addEventListener("click", () => { clearEdit(); setFormStatus(""); });
removeButton.addEventListener("click", async () => {
  if (!editing || saving || !window.confirm(`Remove ${editing.name}'s birthday from reminders?`)) return;
  if (!getSavedToken()) { openConnection(); return; }
  saving = true;
  submitButton.disabled = true;
  removeButton.disabled = true;
  setFormStatus("Removing birthday…");
  try {
    await closeBirthday(editing.number);
    clearEdit();
    await loadBirthdays();
    setFormStatus("Birthday removed.");
  } catch (error) {
    updateConnectionUi();
    setFormStatus(error instanceof Error ? error.message : "Could not remove birthday.", true);
  } finally {
    saving = false;
    submitButton.disabled = false;
    removeButton.disabled = false;
  }
});

connectionButton.addEventListener("click", openConnection);
connectInline.addEventListener("click", openConnection);
$("close-connection").addEventListener("click", () => connectionDialog.close());
connectionDialog.addEventListener("close", () => { saveAfterConnect = false; });
$("connection-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const saveButton = $("save-connection");
  saveButton.disabled = true;
  setDialogStatus("Checking token…");
  try {
    await connectGitHub(tokenInput.value);
    updateConnectionUi();
    const shouldSave = saveAfterConnect;
    saveAfterConnect = false;
    connectionDialog.close();
    tokenInput.value = "";
    setFormStatus("GitHub connected. You can save birthdays here.");
    if (shouldSave) await saveBirthday();
  } catch (error) {
    setDialogStatus(error instanceof Error ? error.message : "Could not connect GitHub.", true);
  } finally {
    saveButton.disabled = false;
  }
});
$("disconnect-button").addEventListener("click", () => {
  removeSavedToken();
  updateConnectionUi();
  connectionDialog.close();
  setFormStatus("GitHub connection removed from this browser.");
});

const tokenUrl = new URL("https://github.com/settings/personal-access-tokens/new");
tokenUrl.searchParams.set("name", "Birthday Reminder");
tokenUrl.searchParams.set("target_name", config.owner);
tokenUrl.searchParams.set("expires_in", "none");
tokenUrl.searchParams.set("issues", "write");
$("create-token-link").href = tokenUrl.toString();
connectionButton.textContent = config.owner.charAt(0).toLocaleLowerCase();
$("repo-name").textContent = config.repo;
$("recipient").textContent = config.recipient;
$("email-state").textContent = config.emailEnabled
  ? "Email delivery is active."
  : "Email delivery is awaiting setup.";
$("email-state").classList.toggle("is-ready", config.emailEnabled);
updateConnectionUi();
setDayOptions();
loadBirthdays();
