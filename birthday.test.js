import test from "node:test";
import assert from "node:assert/strict";
import {
  isValidBirthday, nextOccurrence, parseBirthdayRecord,
  sortBirthdays, todayInKarachi,
} from "./birthday.js";

const record = (overrides = {}) => ({
  id: "birthday-12",
  name: "Ayesha",
  month: 11,
  day: 14,
  ...overrides,
});

test("accepts leap day and rejects dates that do not exist", () => {
  assert.equal(isValidBirthday(2, 29), true);
  assert.equal(isValidBirthday(2, 30), false);
  assert.equal(isValidBirthday(4, 31), false);
  assert.equal(isValidBirthday(12, 31), true);
});

test("parses only well-formed birthday records", () => {
  assert.deepEqual(parseBirthdayRecord(record()), { id: "birthday-12", name: "Ayesha", month: 11, day: 14 });
  assert.equal(parseBirthdayRecord(record({ id: "" })), null);
  assert.equal(parseBirthdayRecord(record({ month: 11, day: 31 })), null);
  assert.equal(parseBirthdayRecord(record({ name: "" })), null);
});

test("uses Pakistan calendar date across a UTC day boundary", () => {
  assert.deepEqual(todayInKarachi(new Date("2026-10-25T19:30:00Z")), {
    year: 2026, month: 10, day: 26,
  });
});

test("sorts by next birthday and rolls into the next year", () => {
  const birthdays = sortBirthdays([
    record({ id: "1", name: "Next year", month: 1, day: 1 }),
    record({ id: "2", name: "Today", month: 12, day: 31 }),
    record({ id: "3", name: "Tomorrow", month: 1, day: 1 }),
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
