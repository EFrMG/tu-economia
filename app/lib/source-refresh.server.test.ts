import { describe, expect, it, vi } from "vitest";

import { ISSUERS } from "./company-filings";
import { refreshCompany } from "./company-filings.server";
import { SOURCE_REFRESH_SLOTS } from "./scheduled-tasks";
import { runRefreshSlot, SCHEDULED_SOURCES } from "./source-refresh.server";
import { refreshSnapshot } from "./source-snapshots.server";

vi.mock("./source-snapshots.server", async (original) => ({
  ...(await original()),
  refreshSnapshot: vi.fn(),
}));

vi.mock("./company-filings.server", async (original) => ({
  ...(await original()),
  refreshCompany: vi.fn(),
}));

/** A Monday: companies 1 and 8 of the table are due. */
const now = new Date("2026-11-23T07:30:00Z");

describe("scheduled source refresh", () => {
  it("gives every source its own copy and at least two runs a day, so a failed refresh is retried the same day", () => {
    const keys = SCHEDULED_SOURCES.map(({ key }) => key);

    expect(new Set(keys).size).toBe(keys.length);
    expect(SCHEDULED_SOURCES.length * 2).toBeLessThanOrEqual(
      SOURCE_REFRESH_SLOTS,
    );
  });

  it("gives a run whose daily copy is current to the day's SEC companies, starting from a different one each slot, and to nothing once all are current", async () => {
    vi.mocked(refreshSnapshot).mockResolvedValue({
      key: "daily",
      status: "current",
    });

    const due = [ISSUERS[1].ticker, ISSUERS[8].ticker];
    const current = new Set<string>();

    vi.mocked(refreshCompany).mockImplementation(async (_env, _now, issuer) =>
      current.has(issuer.ticker)
        ? { key: issuer.ticker, status: "current" }
        : { key: issuer.ticker, status: "failed", error: "busy" },
    );

    // A failing company does not hold up the other: the next slot starts from it.
    await expect(runRefreshSlot({}, now, 14)).resolves.toMatchObject({
      key: due[0],
      status: "failed",
    });

    await expect(runRefreshSlot({}, now, 15)).resolves.toMatchObject({
      key: due[1],
    });

    due.forEach((ticker) => current.add(ticker));

    await expect(runRefreshSlot({}, now, 16)).resolves.toBeNull();
  });

  it("refreshes the slot's daily source first and leaves the companies for later", async () => {
    vi.mocked(refreshSnapshot).mockResolvedValue({
      key: SCHEDULED_SOURCES[3].key,
      status: "refreshed",
      rows: 1,
    });

    vi.mocked(refreshCompany).mockClear();

    await expect(runRefreshSlot({}, now, 3)).resolves.toMatchObject({
      key: SCHEDULED_SOURCES[3].key,
    });

    expect(vi.mocked(refreshSnapshot).mock.lastCall?.[0]).toBe(
      SCHEDULED_SOURCES[3],
    );
    expect(refreshCompany).not.toHaveBeenCalled();
  });
});
