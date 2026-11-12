import { describe, expect, it } from "vitest";

import {
  INDEC_CALENDAR_EXPIRES_AT,
  INDEC_CALENDAR_SEMESTER,
  INDEC_RELEASES,
  formatReleaseDate,
  isCalendarInForce,
  nextRelease,
} from "./indec-calendar";

describe("INDEC release calendar", () => {
  it("is still in force (refresh the table when this fails)", () => {
    expect(isCalendarInForce()).toBe(true);
  });

  it("expires at the end of the covered semester", () => {
    expect(INDEC_CALENDAR_EXPIRES_AT).toBe("2026-12-31");
    expect(INDEC_CALENDAR_SEMESTER).toBe("2026-2");
  });

  it("has a release for every shown indicator in every month", () => {
    const indicators = ["ipc", "canasta", "salarios", "emae"] as const;
    for (const indicator of indicators) {
      const releases = INDEC_RELEASES.filter(
        (release) => release.indicator === indicator,
      );
      expect(releases.length).toBeGreaterThan(0);
    }
  });

  it("picks the first release on or after the given date", () => {
    const now = new Date("2026-11-12T12:00:00.000Z");
    const ipc = nextRelease("ipc", now);
    expect(ipc).toEqual({
      indicator: "ipc",
      period: "2026-10",
      releaseDate: "2026-11-12",
    });

    const salarios = nextRelease("salarios", now);
    expect(salarios).toEqual({
      indicator: "salarios",
      period: "2026-09",
      releaseDate: "2026-11-13",
    });
  });

  it("returns null once the calendar is exhausted", () => {
    const now = new Date("2027-01-15T12:00:00.000Z");
    expect(nextRelease("ipc", now)).toBeNull();
    expect(nextRelease("emae", now)).toBeNull();
  });

  it("formats a release date in Spanish", () => {
    expect(formatReleaseDate("2026-11-12")).toBe("12 de noviembre");
  });
});
