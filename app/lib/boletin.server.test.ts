import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";

import {
  MAX_ATTEMPTS,
  NOTICES_PER_RUN,
  editionDateFor,
  getBoletinDigest,
  getResumenBoletin,
  pruneBoletin,
  runBoletinSteps,
  type BoletinStepResult,
} from "~/lib/boletin.server";
import { BOLETIN_MODEL } from "~/lib/boletin-summary.server";

/** The digest's SQL against an in-memory SQLite database with the real migration. */
function localD1(database: DatabaseSync): D1Database {
  const prepare = (query: string) => {
    let values: unknown[] = [];

    const statement = {
      bind(...next: unknown[]) {
        values = next;

        return statement;
      },
      async all<T>() {
        return {
          results: database.prepare(query).all(...(values as [])) as T[],
          success: true,
          meta: {},
        };
      },
      async first<T>() {
        return (
          (database.prepare(query).get(...(values as [])) as T | undefined) ??
          null
        );
      },
      async run() {
        const result = database.prepare(query).run(...(values as []));

        return { success: true, meta: { changes: Number(result.changes) } };
      },
    };

    return statement;
  };

  return {
    prepare,
    async batch(statements: { all: () => Promise<unknown> }[]) {
      database.exec("BEGIN");

      try {
        const results = [];
        for (const statement of statements) results.push(await statement.all());

        database.exec("COMMIT");

        return results;
      } catch (error) {
        database.exec("ROLLBACK");

        throw error;
      }
    },
  } as unknown as D1Database;
}

function setup(onTestFinished: (fn: () => void) => void) {
  const database = new DatabaseSync(":memory:");
  onTestFinished(() => database.close());
  database.exec("PRAGMA foreign_keys = ON");

  database.exec(
    readFileSync(
      new URL("../../migrations/0009_boletin_digest.sql", import.meta.url),
      "utf8",
    ),
  );

  return { database, db: localD1(database) };
}

/** An edition already collected, with no notices. */
const storeEdition = (database: DatabaseSync, date: string) =>
  database
    .prepare(
      "INSERT INTO boletin_editions (edition_date, collected_at, listed_count, selected_count) VALUES (?, ?, 0, 0)",
    )
    .run(date, `${date}T12:00:00.000Z`);

/** 09:00 in Argentina on the edition's day. */
const morning = new Date("2026-11-19T12:00:00Z");

const listingLink = (
  id: string,
  date: string,
  heading: string,
  norm: string,
) => `
  <a href="/detalleAviso/primera/${id}/${date}">
    <div class="linea-aviso"><p class="item">${heading}</p><p class="item-detalle"><small>${norm}</small></p></div>
  </a>`;

const listingFor = (date: string) => `
  <h5 class="seccion-rubro">DECRETOS</h5>
  ${listingLink("100", date, "PRESUPUESTO", "Decreto 1391/2026")}
  ${listingLink("101", date, "PROCEDIMIENTOS ADMINISTRATIVOS", "Decreto 1392/2026")}
  <h5 class="seccion-rubro">RESOLUCIONES</h5>
  ${listingLink("102", date, "MINISTERIO DE SALUD", "Resolución 1709/2026")}
  ${listingLink("103", date, "MINISTERIO DE ECONOMÍA", "Resolución 2000/2026")}`;

/** The same edition with two more selected notices, five in all. */
const longListingFor = (date: string) => `
  ${listingFor(date)}
  ${listingLink("104", date, "MINISTERIO DE ECONOMÍA", "Resolución 2001/2026")}
  ${listingLink("105", date, "MINISTERIO DE ECONOMÍA", "Resolución 2002/2026")}`;

const noticePage = (text: string) =>
  `<div id="cuerpoDetalleAviso">${text
    .split("\n")
    .map((line) => `<p>${line}</p>`)
    .join("")}</div>`;

const notices: Record<string, string> = {
  "100":
    "DECRETA:\nARTÍCULO 1°.- Modifícase el Presupuesto 2026 por $ 1.000.000.",
  "101": "DECRETA:\nARTÍCULO 1°.- Dase por designada a X (DNI 30.111.222).",
  "103": "RESUELVE:\nARTÍCULO 1°.- Apruébase el reglamento de la zona franca.",
  "104":
    "RESUELVE:\nARTÍCULO 1°.- Prorrógase el régimen de facilidades de pago.",
  "105": "RESUELVE:\nARTÍCULO 1°.- Apruébase el procedimiento de devolución.",
};

/** Serves the listing and the notice pages; `failing` ids answer 503. */
function boletinFetch(listing: string, failing = new Set<string>()) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/seccion/primera")) return new Response(listing);

    const id = url.split("/").at(-2)!;
    if (failing.has(id) || !notices[id])
      return new Response("", { status: 503 });

    return new Response(noticePage(notices[id]));
  }) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
}

const summaryOutput = (summary: object) => ({
  choices: [{ message: { content: JSON.stringify(summary) } }],
  usage: { neurons: 30 },
});

const goodSummary = {
  titulo: "Cambios en el Presupuesto 2026",
  resumen: "Se modifica el Presupuesto 2026 por $ 1.000.000.",
  puntos: [],
  afecta_hogares: true,
};

const env = (db: D1Database, run?: (...args: unknown[]) => unknown) =>
  ({
    DB: db,
    BOLETIN_DIGEST_ENABLED: "true",
    AI: run ? ({ run } as unknown as Ai) : undefined,
  }) as CloudflareEnvironment;

/** Every step of one cron run, in order. */
async function runOnce(...args: Parameters<typeof runBoletinSteps>) {
  const steps: BoletinStepResult[] = [];
  for await (const step of runBoletinSteps(...args)) steps.push(step);

  return steps;
}

/** The notice pages the fetcher was asked for, by id. */
const noticeRequests = (fetcher: ReturnType<typeof vi.fn>) =>
  fetcher.mock.calls
    .map(([url]) => String(url))
    .filter((url) => !url.endsWith("/seccion/primera"))
    .map((url) => url.split("/").at(-2));

describe("Boletín digest cron", () => {
  it("uses Argentina's date for the edition", () => {
    expect(editionDateFor(new Date("2026-11-20T02:59:00Z"))).toBe("2026-11-19");
    expect(editionDateFor(new Date("2026-11-20T03:00:00Z"))).toBe("2026-11-20");
  });

  it("does nothing while the flag is off", async ({ onTestFinished }) => {
    const { db } = setup(onTestFinished);
    const fetcher = boletinFetch(listingFor("20261119"));

    expect(
      await runOnce({ DB: db } as CloudflareEnvironment, morning, {
        fetch: fetcher,
      }),
    ).toEqual([{ step: "disabled" }]);

    expect(fetcher).not.toHaveBeenCalled();
  });

  it("waits while the section still shows the newest stored edition", async ({
    onTestFinished,
  }) => {
    const { db, database } = setup(onTestFinished);
    storeEdition(database, "2026-11-18");

    expect(
      await runOnce(env(db), morning, {
        fetch: boletinFetch(listingFor("20261118")),
      }),
    ).toEqual([{ step: "waiting-edition" }]);

    expect(
      database.prepare("SELECT COUNT(*) AS n FROM boletin_editions").get(),
    ).toEqual({ n: 1 });
  });

  it("reports the site's contingency page, reading only its start, and records nothing", async ({
    onTestFinished,
  }) => {
    const { db, database } = setup(onTestFinished);

    // The edition as a base64 PDF of several MB, after the iframe that shows it.
    const page = `<div>Edición del 20 de Noviembre de 2026</div><iframe id="iframeContingencia" type="application/pdf"></iframe><script>pdfUrl = convertBase64InUrlBlob("${"A".repeat(3 * 1024 * 1024)}");</script>`;

    const bytes = new TextEncoder().encode(page);

    // Like the site, chunked and without a length; then with one.
    const headerSets: HeadersInit[] = [
      {},
      { "content-length": String(bytes.length) },
    ];

    for (const headers of headerSets) {
      let pulled = 0;

      const body = new ReadableStream<Uint8Array>({
        pull(controller) {
          if (pulled >= bytes.length) return controller.close();

          controller.enqueue(bytes.subarray(pulled, pulled + 16_384));
          pulled += 16_384;
        },
      });

      const fetcher = vi.fn(
        async () => new Response(body, { headers }),
      ) as unknown as typeof fetch;

      expect(await runOnce(env(db), morning, { fetch: fetcher })).toEqual([
        { step: "contingency" },
      ]);

      expect(pulled).toBeLessThan(256 * 1024);
    }

    expect(
      database.prepare("SELECT COUNT(*) AS n FROM boletin_editions").get(),
    ).toEqual({ n: 0 });
  });

  it("still fails on an oversized page that is not the contingency page", async ({
    onTestFinished,
  }) => {
    const { db } = setup(onTestFinished);

    const fetcher = vi.fn(
      async () => new Response("A".repeat(3 * 1024 * 1024)),
    ) as unknown as typeof fetch;

    await expect(runOnce(env(db), morning, { fetch: fetcher })).rejects.toThrow(
      "excede el tamaño permitido",
    );
  });

  it("collects the section's edition on the first run, whatever its date", async ({
    onTestFinished,
  }) => {
    const { db } = setup(onTestFinished);

    expect(
      await runOnce(env(db), morning, {
        fetch: boletinFetch(listingFor("20261118")),
      }),
    ).toMatchObject([{ step: "collected", edition: "2026-11-18" }]);
  });

  it("collects the next day an edition missed on its own day", async ({
    onTestFinished,
  }) => {
    const { db, database } = setup(onTestFinished);
    storeEdition(database, "2026-11-18");

    // Friday morning, with Thursday's edition still on the page.
    const friday = new Date("2026-11-20T12:00:00Z");

    expect(
      await runOnce(env(db), friday, {
        fetch: boletinFetch(listingFor("20261119")),
      }),
    ).toMatchObject([{ step: "collected", edition: "2026-11-19" }]);
  });

  it("finishes the pending notices before reading the section page again", async ({
    onTestFinished,
  }) => {
    const { db } = setup(onTestFinished);
    const fetcher = boletinFetch(listingFor("20261119"));

    await runOnce(env(db), morning, { fetch: fetcher });

    // The next day, with no new edition yet: the previous one is still summarized.
    const nextDay = new Date("2026-11-20T12:00:00Z");

    expect(await runOnce(env(db), nextDay, { fetch: fetcher })).toMatchObject([
      { step: "processed", id: "100" },
      { step: "processed", id: "101" },
      { step: "processed", id: "103" },
    ]);

    expect(
      fetcher.mock.calls.filter(([url]) =>
        String(url).endsWith("/seccion/primera"),
      ),
    ).toHaveLength(1);
  });

  it("collects the edition in a run of its own, then summarizes a run's worth of notices", async ({
    onTestFinished,
  }) => {
    const { db, database } = setup(onTestFinished);
    const fetcher = boletinFetch(listingFor("20261119"));
    const run = vi.fn(async () => summaryOutput(goodSummary));

    expect(await runOnce(env(db, run), morning, { fetch: fetcher })).toEqual([
      { step: "collected", edition: "2026-11-19", listed: 4, selected: 3 },
    ]);

    expect(noticeRequests(fetcher)).toEqual([]);
    expect(run).not.toHaveBeenCalled();

    // The zona franca summary repeats the decree's figure, which is not in its source.
    expect(await runOnce(env(db, run), morning, { fetch: fetcher })).toEqual([
      { step: "processed", id: "100", status: "summarized" },
      { step: "processed", id: "101", status: "excluded" },
      { step: "processed", id: "103", status: "title_only" },
    ]);

    expect(await runOnce(env(db, run), morning, { fetch: fetcher })).toEqual([
      { step: "idle" },
    ]);

    expect(run).toHaveBeenCalledTimes(2);

    expect(
      database
        .prepare(
          "SELECT id, status, outcome, model, neurons FROM boletin_notices ORDER BY position",
        )
        .all(),
    ).toEqual([
      {
        id: "100",
        status: "summarized",
        outcome: "ok",
        model: BOLETIN_MODEL,
        neurons: 30,
      },
      {
        id: "101",
        status: "excluded",
        outcome: "personal-data",
        model: null,
        neurons: null,
      },
      {
        id: "103",
        status: "title_only",
        outcome: "invented-figures",
        model: BOLETIN_MODEL,
        neurons: 30,
      },
    ]);
  });

  it(`summarizes at most ${NOTICES_PER_RUN} notices per run, and leaves collecting to the next run after the last ones`, async ({
    onTestFinished,
  }) => {
    const { db } = setup(onTestFinished);
    const fetcher = boletinFetch(longListingFor("20261119"));
    const run = vi.fn(async () => summaryOutput(goodSummary));

    expect(
      await runOnce(env(db, run), morning, { fetch: fetcher }),
    ).toMatchObject([{ step: "collected", selected: 5 }]);

    expect(
      await runOnce(env(db, run), morning, { fetch: fetcher }),
    ).toMatchObject([
      { step: "processed", id: "100" },
      { step: "processed", id: "101" },
      { step: "processed", id: "103" },
    ]);

    // The next day, with fewer pending than a full run: the run ends after them without reading the section page.
    const nextDay = new Date("2026-11-20T12:00:00Z");

    expect(
      await runOnce(env(db, run), nextDay, { fetch: fetcher }),
    ).toMatchObject([
      { step: "processed", id: "104" },
      { step: "processed", id: "105" },
    ]);

    const listingReads = () =>
      fetcher.mock.calls.filter(([url]) =>
        String(url).endsWith("/seccion/primera"),
      ).length;

    expect(listingReads()).toBe(1);

    expect(await runOnce(env(db, run), nextDay, { fetch: fetcher })).toEqual([
      { step: "waiting-edition" },
    ]);

    expect(listingReads()).toBe(2);
  });

  it("stops the run at the first notice that will be retried", async ({
    onTestFinished,
  }) => {
    const { db, database } = setup(onTestFinished);
    const fetcher = boletinFetch(listingFor("20261119"), new Set(["101"]));
    const run = vi.fn(async () => summaryOutput(goodSummary));

    await runOnce(env(db, run), morning, { fetch: fetcher });

    expect(await runOnce(env(db, run), morning, { fetch: fetcher })).toEqual([
      { step: "processed", id: "100", status: "summarized" },
      { step: "retry", id: "101", reason: "fetch-failed" },
    ]);

    expect(noticeRequests(fetcher)).toEqual(["100", "101"]);

    expect(
      database
        .prepare(
          "SELECT id, status, attempts FROM boletin_notices ORDER BY position",
        )
        .all(),
    ).toEqual([
      { id: "100", status: "summarized", attempts: 1 },
      { id: "101", status: "pending", attempts: 1 },
      { id: "103", status: "pending", attempts: 0 },
    ]);
  });

  it("retries a failing model and keeps the official reference after the last attempt", async ({
    onTestFinished,
  }) => {
    const { db, database } = setup(onTestFinished);
    const fetcher = boletinFetch(listingFor("20261119"));

    const run = vi.fn(async () => {
      throw new Error("Daily free allocation exceeded");
    });

    await runOnce(env(db, run), morning, { fetch: fetcher });

    // A spent allocation costs each run one attempt, not one per notice.
    for (let attempt = 1; attempt < MAX_ATTEMPTS; attempt++) {
      expect(await runOnce(env(db, run), morning, { fetch: fetcher })).toEqual([
        { step: "retry", id: "100", reason: "model-failed" },
      ]);

      expect(run).toHaveBeenCalledTimes(attempt);
    }

    // A notice on its last attempt is not retried, so the run goes on to the next ones.
    expect(await runOnce(env(db, run), morning, { fetch: fetcher })).toEqual([
      { step: "processed", id: "100", status: "title_only" },
      { step: "processed", id: "101", status: "excluded" },
      { step: "retry", id: "103", reason: "model-failed" },
    ]);

    expect(
      database
        .prepare(
          "SELECT id, status, attempts, outcome FROM boletin_notices ORDER BY position",
        )
        .all(),
    ).toEqual([
      {
        id: "100",
        status: "title_only",
        attempts: MAX_ATTEMPTS,
        outcome: "model-failed",
      },
      { id: "101", status: "excluded", attempts: 1, outcome: "personal-data" },
      { id: "103", status: "pending", attempts: 1, outcome: "model-failed" },
    ]);
  });

  it("retries a notice page that fails to load", async ({ onTestFinished }) => {
    const { db } = setup(onTestFinished);
    const fetcher = boletinFetch(listingFor("20261119"), new Set(["100"]));

    await runOnce(env(db), morning, { fetch: fetcher });

    expect(await runOnce(env(db), morning, { fetch: fetcher })).toEqual([
      { step: "retry", id: "100", reason: "fetch-failed" },
    ]);

    expect(noticeRequests(fetcher)).toEqual(["100"]);
  });
});

describe("Boletín digest reading", () => {
  const insertEdition = (
    database: DatabaseSync,
    date: string,
    selected: number,
  ) =>
    database
      .prepare(
        "INSERT INTO boletin_editions (edition_date, collected_at, listed_count, selected_count) VALUES (?, ?, ?, ?)",
      )
      .run(date, `${date}T09:00:00Z`, 50, selected);

  const insertNotice = (
    database: DatabaseSync,
    values: {
      id: string;
      date: string;
      position: number;
      status: string;
      households?: number;
    },
  ) =>
    database
      .prepare(
        "INSERT INTO boletin_notices (id, edition_date, position, rubro, heading, norm, url, status, title, summary, points, affects_households, updated_at) VALUES (?, ?, ?, 'RESOLUCIONES', 'MINISTERIO DE ECONOMÍA', 'Resolución 1/2026', ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        values.id,
        values.date,
        values.position,
        `https://www.boletinoficial.gob.ar/detalleAviso/primera/${values.id}/${values.date.replaceAll("-", "")}`,
        values.status,
        `Título ${values.id}`,
        `Resumen ${values.id}`,
        JSON.stringify(["Punto"]),
        values.households ?? 0,
        `${values.date}T10:00:00Z`,
      );

  it("is empty before the first edition", async ({ onTestFinished }) => {
    const { db } = setup(onTestFinished);

    expect(await getBoletinDigest({ DB: db } as CloudflareEnvironment)).toEqual(
      {
        editionDate: null,
        notices: [],
        pending: 0,
        previous: null,
        next: null,
      },
    );
  });

  it("pages through the kept editions and falls back to the latest", async ({
    onTestFinished,
  }) => {
    const { db, database } = setup(onTestFinished);
    const env = { DB: db } as CloudflareEnvironment;

    for (const [index, date] of [
      "2026-11-17",
      "2026-11-18",
      "2026-11-19",
    ].entries()) {
      insertEdition(database, date, 1);

      insertNotice(database, {
        id: String(index),
        date,
        position: 0,
        status: "summarized",
      });
    }

    // An edition still entirely pending is not offered yet.
    insertEdition(database, "2026-11-20", 1);

    insertNotice(database, {
      id: "pending",
      date: "2026-11-20",
      position: 0,
      status: "pending",
    });

    expect(await getBoletinDigest(env, "2026-11-18")).toMatchObject({
      editionDate: "2026-11-18",
      previous: "2026-11-17",
      next: "2026-11-19",
      notices: [expect.objectContaining({ id: "1" })],
    });

    expect(await getBoletinDigest(env, "2026-11-17")).toMatchObject({
      previous: null,
      next: "2026-11-18",
    });

    for (const requested of [null, "2026-11-20", "2026-09-01"]) {
      expect(await getBoletinDigest(env, requested)).toMatchObject({
        editionDate: "2026-11-19",
        previous: "2026-11-18",
        next: null,
      });
    }
  });

  it("keeps the previous edition until the new one has a notice ready", async ({
    onTestFinished,
  }) => {
    const { db, database } = setup(onTestFinished);

    insertEdition(database, "2026-11-18", 1);

    insertNotice(database, {
      id: "1",
      date: "2026-11-18",
      position: 0,
      status: "summarized",
    });

    insertEdition(database, "2026-11-19", 2);

    insertNotice(database, {
      id: "2",
      date: "2026-11-19",
      position: 0,
      status: "pending",
    });

    insertNotice(database, {
      id: "3",
      date: "2026-11-19",
      position: 1,
      status: "pending",
    });

    expect(
      (await getBoletinDigest({ DB: db } as CloudflareEnvironment))
        ?.editionDate,
    ).toBe("2026-11-18");

    database
      .prepare(
        "UPDATE boletin_notices SET status = 'title_only' WHERE id = '3'",
      )
      .run();

    const digest = await getBoletinDigest({ DB: db } as CloudflareEnvironment);

    expect(digest).toMatchObject({
      editionDate: "2026-11-19",
      pending: 1,
      previous: "2026-11-18",
      next: null,
    });

    // A notice without a summary shows the official reference only.
    expect(digest?.notices).toEqual([
      expect.objectContaining({
        id: "3",
        status: "title_only",
        title: null,
        summary: null,
        points: [],
      }),
    ]);
  });

  it("puts household summaries first and hides excluded notices", async ({
    onTestFinished,
  }) => {
    const { db, database } = setup(onTestFinished);

    insertEdition(database, "2026-11-19", 4);

    insertNotice(database, {
      id: "1",
      date: "2026-11-19",
      position: 0,
      status: "summarized",
    });

    insertNotice(database, {
      id: "2",
      date: "2026-11-19",
      position: 1,
      status: "excluded",
    });

    insertNotice(database, {
      id: "3",
      date: "2026-11-19",
      position: 2,
      status: "title_only",
    });

    insertNotice(database, {
      id: "4",
      date: "2026-11-19",
      position: 3,
      status: "summarized",
      households: 1,
    });

    const digest = await getBoletinDigest({ DB: db } as CloudflareEnvironment);

    expect(digest?.notices.map((notice) => notice.id)).toEqual(["4", "1", "3"]);

    expect(digest?.notices[0]).toMatchObject({
      affectsHouseholds: true,
      points: ["Punto"],
    });
  });

  it("fills Resumen with household summaries of any edition, then the latest edition's others", async ({
    onTestFinished,
  }) => {
    const { db, database } = setup(onTestFinished);
    const env = { DB: db } as CloudflareEnvironment;

    expect(await getResumenBoletin(env)).toEqual({
      editionDate: null,
      notices: [],
    });

    insertEdition(database, "2026-11-17", 2);
    insertEdition(database, "2026-11-18", 1);
    insertEdition(database, "2026-11-19", 4);
    insertEdition(database, "2026-11-20", 1);

    const notices = [
      ["older-household", "2026-11-17", 0, "summarized", 1],
      ["older-other", "2026-11-17", 1, "summarized", 0],
      ["newer-household", "2026-11-18", 0, "summarized", 1],
      ["latest-other-1", "2026-11-19", 0, "summarized", 0],
      ["latest-title-only", "2026-11-19", 1, "title_only", 0],
      ["latest-other-2", "2026-11-19", 2, "summarized", 0],
      ["latest-other-3", "2026-11-19", 3, "summarized", 0],
      ["still-pending", "2026-11-20", 0, "pending", 0],
    ] as const;

    for (const [id, date, position, status, households] of notices) {
      insertNotice(database, { id, date, position, status, households });
    }

    // The 20th is still being summarized, so the 19th is the latest on screen.
    expect(await getResumenBoletin(env)).toMatchObject({
      editionDate: "2026-11-19",
      notices: [
        expect.objectContaining({ id: "newer-household" }),
        expect.objectContaining({ id: "older-household" }),
        expect.objectContaining({ id: "latest-other-1" }),
      ],
    });
  });

  it("leaves Resumen empty when the latest edition has no summaries", async ({
    onTestFinished,
  }) => {
    const { db, database } = setup(onTestFinished);

    insertEdition(database, "2026-11-18", 1);

    insertNotice(database, {
      id: "older-other",
      date: "2026-11-18",
      position: 0,
      status: "summarized",
    });

    insertEdition(database, "2026-11-19", 0);

    expect(
      await getResumenBoletin({ DB: db } as CloudflareEnvironment),
    ).toEqual({ editionDate: "2026-11-19", notices: [] });
  });

  it("prunes editions past the retention window", async ({
    onTestFinished,
  }) => {
    const { db, database } = setup(onTestFinished);

    insertEdition(database, "2026-10-28", 1);

    insertNotice(database, {
      id: "1",
      date: "2026-10-28",
      position: 0,
      status: "summarized",
    });

    insertEdition(database, "2026-10-29", 0);
    insertEdition(database, "2026-11-19", 0);

    await pruneBoletin({ DB: db } as CloudflareEnvironment, morning);

    expect(
      database
        .prepare("SELECT edition_date FROM boletin_editions ORDER BY 1")
        .all(),
    ).toEqual([{ edition_date: "2026-10-29" }, { edition_date: "2026-11-19" }]);

    expect(
      database.prepare("SELECT COUNT(*) AS n FROM boletin_notices").get(),
    ).toEqual({ n: 0 });
  });

  it("keeps the latest edition however old it is", async ({
    onTestFinished,
  }) => {
    const { db, database } = setup(onTestFinished);

    insertEdition(database, "2026-10-01", 1);
    insertEdition(database, "2026-10-02", 1);

    insertNotice(database, {
      id: "1",
      date: "2026-10-02",
      position: 0,
      status: "summarized",
    });

    await pruneBoletin({ DB: db } as CloudflareEnvironment, morning);

    expect(
      database.prepare("SELECT edition_date FROM boletin_editions").all(),
    ).toEqual([{ edition_date: "2026-10-02" }]);

    expect(
      database.prepare("SELECT COUNT(*) AS n FROM boletin_notices").get(),
    ).toEqual({ n: 1 });
  });
});
