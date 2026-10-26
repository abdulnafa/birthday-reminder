const timeZone = "Asia/Karachi";

export function normalizeName(value) {
  if (typeof value !== "string") return null;
  const name = value.normalize("NFC").trim().replace(/\s+/gu, " ");
  if (!name || name.length > 80 || /[\u0000-\u001f\u007f]/u.test(name)) return null;
  return name;
}

export function isValidBirthday(month, day) {
  const m = Number(month);
  const d = Number(day);
  return Number.isInteger(m) && Number.isInteger(d) && m >= 1 && m <= 12 && d >= 1 && d <= new Date(Date.UTC(2000, m, 0)).getUTCDate();
}

export function parseBirthdayIssue(issue, label = "birthday") {
  if (!issue || issue.pull_request || (issue.state && issue.state !== "open")) return null;
  const labeled = Array.isArray(issue.labels) && issue.labels.some((item) =>
    (typeof item === "string" ? item : item?.name)?.toLowerCase() === label.toLowerCase()
  );
  if (!labeled) return null;

  const name = normalizeName(issue.title);
  const birthdayLines = typeof issue.body === "string"
    ? [...issue.body.matchAll(/^Birthday:\s*(\d{2})-(\d{2})\s*$/gim)]
    : [];
  if (!name || birthdayLines.length !== 1) return null;
  const birthdayLine = birthdayLines[0];
  const month = Number(birthdayLine[1]);
  const day = Number(birthdayLine[2]);
  if (!isValidBirthday(month, day) || !Number.isSafeInteger(issue.number) || issue.number < 1) return null;
  return { name, month, day, number: issue.number };
}

export function todayInKarachi(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(date);
  const get = (type) => Number(parts.find((part) => part.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

function isLeapYear(year) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function occurrenceInYear(month, day, year) {
  return { year, month, day: month === 2 && day === 29 && !isLeapYear(year) ? 28 : day };
}

export function nextOccurrence(month, day, today = todayInKarachi()) {
  if (!isValidBirthday(month, day)) throw new RangeError("Invalid birthday");
  const todayStamp = Date.UTC(today.year, today.month - 1, today.day);
  let occurrence = occurrenceInYear(Number(month), Number(day), today.year);
  let stamp = Date.UTC(occurrence.year, occurrence.month - 1, occurrence.day);
  if (stamp < todayStamp) {
    occurrence = occurrenceInYear(Number(month), Number(day), today.year + 1);
    stamp = Date.UTC(occurrence.year, occurrence.month - 1, occurrence.day);
  }
  return { ...occurrence, daysUntil: Math.round((stamp - todayStamp) / 86400000) };
}

export function sortBirthdays(issues, today = todayInKarachi(), label = "birthday") {
  return issues
    .map((issue) => parseBirthdayIssue(issue, label))
    .filter(Boolean)
    .map((birthday) => ({ ...birthday, next: nextOccurrence(birthday.month, birthday.day, today) }))
    .sort((a, b) => a.next.daysUntil - b.next.daysUntil || a.name.localeCompare(b.name));
}

export function formatBirthday(month, day) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC", day: "numeric", month: "short",
  }).format(new Date(Date.UTC(2000, month - 1, day)));
}

export function countdownLabel(daysUntil) {
  if (daysUntil === 0) return "Today";
  if (daysUntil === 1) return "Tomorrow";
  return `In ${daysUntil} days`;
}
