import { describe, expect, it } from "vitest";

import { MAINTENANCE_CRON, scheduledTask } from "~/lib/scheduled-tasks";

const SHARED_CRON = "*/5 6-15 * * *";

describe("shared cron trigger", () => {
  it("runs the daily maintenance at 06:00 UTC and a digest step otherwise", () => {
    expect(scheduledTask(SHARED_CRON, Date.parse("2026-11-19T06:00:00Z"))).toBe(
      "daily-maintenance",
    );

    expect(scheduledTask(SHARED_CRON, Date.parse("2026-11-19T06:05:00Z"))).toBe(
      "boletin-step",
    );

    expect(scheduledTask(SHARED_CRON, Date.parse("2026-11-19T12:00:00Z"))).toBe(
      "boletin-step",
    );
  });

  it("forces the maintenance for a manual run with the former daily expression", () => {
    expect(
      scheduledTask(MAINTENANCE_CRON, Date.parse("2026-11-19T21:13:00Z")),
    ).toBe("daily-maintenance");
  });
});
