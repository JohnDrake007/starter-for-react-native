import { getReminderDateKeys, toLocalDateKey } from "../reminder-utils";

describe("reminder calendar dates", () => {
  it("marks only the current reminder date, not the historical visit date", () => {
    const dates = getReminderDateKeys([
      {
        visitDate: "2026-07-01T12:00:00.000Z",
        nextVisitDate: "2026-08-05T12:00:00.000Z",
      },
    ]);

    expect([...dates]).toEqual([toLocalDateKey("2026-08-05T12:00:00.000Z")]);
    expect(dates.has(toLocalDateKey("2026-07-01T12:00:00.000Z")!)).toBe(false);
  });

  it("does not retain a previous date after a reminder is moved", () => {
    const dates = getReminderDateKeys([
      { nextVisitDate: "2026-08-12T12:00:00.000Z" },
    ]);

    expect(dates.has(toLocalDateKey("2026-08-05T12:00:00.000Z")!)).toBe(false);
    expect(dates.has(toLocalDateKey("2026-08-12T12:00:00.000Z")!)).toBe(true);
  });

  it("has no marked date after a reminder is deleted", () => {
    expect(getReminderDateKeys([{ nextVisitDate: null }]).size).toBe(0);
    expect(getReminderDateKeys([{}]).size).toBe(0);
  });

  it("ignores invalid reminder timestamps", () => {
    expect(getReminderDateKeys([{ nextVisitDate: "not-a-date" }]).size).toBe(0);
  });
});
