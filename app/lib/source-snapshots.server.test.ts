import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { localD1 } from "./local-d1.test-helper";
import type { SnapshotSource } from "./source-snapshots.server";

const schema = z.object({ value: z.number() });

const now = new Date("2026-11-22T12:00:00Z");

const hoursAgo = (hours: number) =>
  new Date(now.getTime() - hours * 60 * 60_000).toISOString();

const setup = (rows?: unknown[], fetchedAt = hoursAgo(1)) => {
  const { db, database } = localD1("0010_source_snapshots.sql");

  if (rows)
    database
      .prepare(
        "INSERT INTO source_snapshots (key, body, fetched_at) VALUES (?, ?, ?)",
      )
      .run("source@1", JSON.stringify(rows), fetchedAt);

  return db;
};

const source = (
  fetchRows: (
    env: unknown,
    now: Date,
    previous?: { value: number }[],
  ) => Promise<{ value: number }[]>,
): SnapshotSource<{ value: number }> => ({
  key: "source@1",
  schema,
  fetchRows,
});

const down = async (): Promise<{ value: number }[]> => {
  throw new Error("down");
};

const store = () => import("./source-snapshots.server");

beforeEach(() => {
  vi.resetModules();
});

describe("copies refreshed by the cron", () => {
  it("serves the copy however old it is without asking the source, and marks it stale after a missed day", async () => {
    const { readThrough } = await store();
    const fetchRows = vi.fn(down);

    await expect(
      readThrough(
        source(fetchRows),
        { DB: setup([{ value: 1 }], hoursAgo(30)) },
        now,
      ),
    ).resolves.toEqual({
      rows: [{ value: 1 }],
      fetchedAt: hoursAgo(30),
      status: "cached",
    });

    await expect(
      readThrough(
        source(fetchRows),
        { DB: setup([{ value: 1 }], hoursAgo(40)) },
        now,
      ),
    ).resolves.toMatchObject({ status: "stale" });

    expect(fetchRows).not.toHaveBeenCalled();
  });

  it("asks the source only without a copy, saves the answer, and fails when the source does", async () => {
    const { readThrough, readSnapshot } = await store();
    const db = setup();

    await expect(
      readThrough(
        source(async () => [{ value: 2 }]),
        { DB: db },
        now,
      ),
    ).resolves.toMatchObject({ rows: [{ value: 2 }], status: "fetched" });

    await expect(readSnapshot(db, "source@1", schema)).resolves.toEqual({
      rows: [{ value: 2 }],
      fetchedAt: now.toISOString(),
    });

    await expect(
      readThrough(source(down), { DB: setup() }, now),
    ).rejects.toThrow("down");
  });

  it("refreshes once a day: skips a copy from today, replaces an older one and keeps it when the source fails", async () => {
    const { refreshSnapshot, readSnapshot } = await store();
    const fetchRows = vi.fn(async () => [{ value: 2 }]);

    await expect(
      refreshSnapshot(
        source(fetchRows),
        { DB: setup([{ value: 1 }], hoursAgo(5)) },
        now,
      ),
    ).resolves.toEqual({ key: "source@1", status: "current" });
    expect(fetchRows).not.toHaveBeenCalled();

    const yesterday = setup([{ value: 1 }], hoursAgo(13));

    await expect(
      refreshSnapshot(source(fetchRows), { DB: yesterday }, now),
    ).resolves.toEqual({ key: "source@1", status: "refreshed", rows: 1 });

    await expect(readSnapshot(yesterday, "source@1", schema)).resolves.toEqual({
      rows: [{ value: 2 }],
      fetchedAt: now.toISOString(),
    });

    const failing = setup([{ value: 1 }], hoursAgo(13));

    await expect(
      refreshSnapshot(source(down), { DB: failing }, now),
    ).resolves.toMatchObject({ status: "failed", error: "Error: down" });

    await expect(readSnapshot(failing, "source@1", schema)).resolves.toEqual({
      rows: [{ value: 1 }],
      fetchedAt: hoursAgo(13),
    });

    await expect(
      refreshSnapshot(source(fetchRows), {}, now),
    ).resolves.toMatchObject({
      status: "failed",
    });
  });
});

describe("source snapshots", () => {
  it("revalidates stored rows, drops invalid ones and treats a copy without valid rows as missing", async () => {
    const { readThrough, readSnapshot } = await store();

    await expect(
      readSnapshot(setup([{ value: 1 }, { value: "x" }]), "source@1", schema),
    ).resolves.toMatchObject({ rows: [{ value: 1 }] });

    const fetchRows = vi.fn(async () => [{ value: 3 }]);

    await expect(
      readThrough(source(fetchRows), { DB: setup([{ value: "x" }]) }, now),
    ).resolves.toMatchObject({ status: "fetched" });
    expect(fetchRows).toHaveBeenCalledOnce();
  });

  it("asks the source when the database is missing or failing, without failing the read", async () => {
    const { readThrough } = await store();
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const broken = {
      prepare: () => {
        throw new Error("D1 unavailable");
      },
    } as unknown as D1Database;

    await expect(
      readThrough(
        source(async () => [{ value: 4 }]),
        { DB: broken },
        now,
      ),
    ).resolves.toMatchObject({ rows: [{ value: 4 }], status: "fetched" });

    await expect(
      readThrough(
        source(async () => [{ value: 5 }]),
        {},
        now,
      ),
    ).resolves.toMatchObject({ rows: [{ value: 5 }], status: "fetched" });

    vi.restoreAllMocks();
  });

  it("reports one health row per key prefix: stale when a copy missed its refresh, partial when another could not be read", async () => {
    const { loadSnapshot, snapshotHealth } = await store();
    const db = setup([{ value: 1 }], hoursAgo(40));

    await loadSnapshot(source(down), { DB: db }, now);

    await expect(
      loadSnapshot({ ...source(down), key: "source:other@1" }, { DB: db }, now),
    ).rejects.toThrow("down");

    expect(snapshotHealth("unrelated")).toMatchObject({
      status: "not-checked",
    });

    expect(snapshotHealth("source@")).toEqual({
      status: "stale",
      lastSuccessfulFetchAt: hoursAgo(40),
      lastFailureAt: null,
    });

    expect(snapshotHealth("source")).toMatchObject({
      status: "partial",
      lastFailureAt: now.toISOString(),
    });
  });
});
