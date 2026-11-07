import { describe, expect, it } from "vitest";

import {
  retentionAction,
  retentionDeletionDate,
  retentionNoticeDate,
  type RetentionInput,
} from "~/lib/finance-retention";

const lapsed = (overrides: Partial<RetentionInput>): RetentionInput => ({
  now: new Date("2026-03-01T00:00:00.000Z"),
  entitlementEndsAt: Date.parse("2026-01-31T00:00:00.000Z"),
  documentUpdatedAt: "2026-01-15T00:00:00.000Z",
  deletionNoticeAttemptedAt: null,
  deletionNoticeSentAt: null,
  ...overrides,
});

describe("lapsed finance retention", () => {
  it("deletes three calendar months after access ends, clamping short months", () => {
    expect(retentionDeletionDate(lapsed({})).toISOString()).toBe(
      "2026-04-30T00:00:00.000Z",
    );

    expect(
      retentionDeletionDate(
        lapsed({
          entitlementEndsAt: Date.parse("2025-08-31T00:00:00.000Z"),
          documentUpdatedAt: "2025-08-01T00:00:00.000Z",
        }),
      ).toISOString(),
    ).toBe("2025-11-30T00:00:00.000Z");
  });

  it("anchors on the last write when no entitlement is on file", () => {
    expect(
      retentionDeletionDate(
        lapsed({
          entitlementEndsAt: 0,
          documentUpdatedAt: "2026-02-10T00:00:00.000Z",
        }),
      ).toISOString(),
    ).toBe("2026-05-10T00:00:00.000Z");
  });

  it("keeps active accounts and clears notice state when access resumes", () => {
    const active = {
      entitlementEndsAt: Date.parse("2026-04-01T00:00:00.000Z"),
    };

    expect(retentionAction(lapsed(active))).toBe("keep");

    expect(
      retentionAction(
        lapsed({
          ...active,
          deletionNoticeAttemptedAt: "2026-02-01T00:00:00.000Z",
        }),
      ),
    ).toBe("reset-notice");

    expect(
      retentionAction(
        lapsed({ ...active, deletionNoticeSentAt: "2026-02-01T00:00:00.000Z" }),
      ),
    ).toBe("reset-notice");
  });

  it("notifies two months after access ends, not before", () => {
    expect(retentionNoticeDate(lapsed({})).toISOString()).toBe(
      "2026-03-31T00:00:00.000Z",
    );

    expect(
      retentionAction(lapsed({ now: new Date("2026-03-30T00:00:00.000Z") })),
    ).toBe("keep");

    expect(
      retentionAction(lapsed({ now: new Date("2026-03-31T00:00:00.000Z") })),
    ).toBe("notify");
  });

  it("deletes a month after the attempt even when delivery failed", () => {
    const failed = lapsed({
      deletionNoticeAttemptedAt: "2026-03-31T00:00:00.000Z",
    });

    expect(retentionDeletionDate(failed).toISOString()).toBe(
      "2026-04-30T00:00:00.000Z",
    );

    // The failed notice is retried until the deadline.
    expect(
      retentionAction({ ...failed, now: new Date("2026-04-29T00:00:00.000Z") }),
    ).toBe("notify");

    expect(
      retentionAction({ ...failed, now: new Date("2026-04-30T00:00:00.000Z") }),
    ).toBe("delete");
  });

  it("gives a late attempt its full thirty days", () => {
    const late = lapsed({
      deletionNoticeAttemptedAt: "2026-05-15T00:00:00.000Z",
      deletionNoticeSentAt: "2026-05-15T00:00:00.000Z",
    });

    expect(retentionDeletionDate(late).toISOString()).toBe(
      "2026-06-14T00:00:00.000Z",
    );

    expect(
      retentionAction({ ...late, now: new Date("2026-06-13T00:00:00.000Z") }),
    ).toBe("keep");

    expect(
      retentionAction({ ...late, now: new Date("2026-06-14T00:00:00.000Z") }),
    ).toBe("delete");
  });

  it("never deletes before a notice was attempted", () => {
    expect(
      retentionAction(lapsed({ now: new Date("2026-09-01T00:00:00.000Z") })),
    ).toBe("notify");
  });
});
