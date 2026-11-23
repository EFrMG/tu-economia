import { describe, expect, it } from "vitest";

import { MAINTENANCE_CRON, scheduledTask } from "~/lib/scheduled-tasks";

const SHARED_CRON = "*/5 6-15 * * *";

const at = (time: string) => scheduledTask(SHARED_CRON, Date.parse(time));

describe("shared cron trigger", () => {
  it("runs the maintenance at 06:00 UTC, a source refresh in every run until 08:25, and digest steps after", () => {
    expect(at("2026-11-19T06:00:00Z")).toEqual({ kind: "daily-maintenance" });

    expect(at("2026-11-19T06:05:00Z")).toEqual({
      kind: "source-refresh",
      slot: 0,
    });

    expect(at("2026-11-19T07:00:00Z")).toEqual({
      kind: "source-refresh",
      slot: 11,
    });

    expect(at("2026-11-19T08:25:00Z")).toEqual({
      kind: "source-refresh",
      slot: 28,
    });

    expect(at("2026-11-19T08:30:00Z")).toEqual({ kind: "boletin-step" });
    expect(at("2026-11-19T12:00:00Z")).toEqual({ kind: "boletin-step" });
  });

  it("forces the maintenance for a manual run with the former daily expression", () => {
    expect(
      scheduledTask(MAINTENANCE_CRON, Date.parse("2026-11-19T21:13:00Z")),
    ).toEqual({ kind: "daily-maintenance" });
  });
});
