import test from "node:test";
import assert from "node:assert/strict";
import {
  isValidBirthday, nextOccurrence, parseBirthdayIssue,
  sortBirthdays, todayInKarachi,
} from "./birthday.js";

const issue = (overrides = {}) => ({
  number: 12,
  title: "Ayesha",
  body: "Birthday: 11-14",
  state: "open",
  labels: [{ name: "birthday" }],
  ...overrides,
});

test("accepts leap day and rejects dates that do not exist", () => {
  assert.equal(isValidBirthday(2, 29), true);
  assert.equal(isValidBirthday(2, 30), false);
  assert.equal(isValidBirthday(4, 31), false);
  assert.equal(isValidBirthday(12, 31), true);
});

test("parses only open labeled birthday issues with the expected date line", () => {
  assert.deepEqual(parseBirthdayIssue(issue()), { name: "Ayesha", month: 11, day: 14, number: 12 });
  assert.equal(parseBirthdayIssue(issue({ labels: [{ name: "bug" }] })), null);
  assert.equal(parseBirthdayIssue(issue({ body: "Birthday: 11-31" })), null);
  assert.equal(parseBirthdayIssue(issue({ body: "Birthday: 11-14\nBirthday: 12-14" })), null);
  assert.equal(parseBirthdayIssue(issue({ pull_request: {} })), null);
  assert.equal(parseBirthdayIssue(issue({ state: "closed" })), null);
});

test("uses Pakistan calendar date across a UTC day boundary", () => {
  assert.deepEqual(todayInKarachi(new Date("2026-10-25T19:30:00Z")), {
    year: 2026, month: 10, day: 26,
  });
});

test("sorts by next birthday and rolls into the next year", () => {
  const birthdays = sortBirthdays([
    issue({ number: 1, title: "Next year", body: "Birthday: 01-01" }),
    issue({ number: 2, title: "Today", body: "Birthday: 12-31" }),
    issue({ number: 3, title: "Tomorrow", body: "Birthday: 01-01" }),
  ], { year: 2026, month: 12, day: 31 });
  assert.equal(birthdays[0].name, "Today");
  assert.equal(birthdays[0].next.daysUntil, 0);
  assert.equal(birthdays[1].next.daysUntil, 1);
});

test("observes February 29 on February 28 in non-leap years", () => {
  assert.deepEqual(nextOccurrence(2, 29, { year: 2027, month: 2, day: 27 }), {
    year: 2027, month: 2, day: 28, daysUntil: 1,
  });
  assert.deepEqual(nextOccurrence(2, 29, { year: 2028, month: 2, day: 28 }), {
    year: 2028, month: 2, day: 29, daysUntil: 1,
  });
});
