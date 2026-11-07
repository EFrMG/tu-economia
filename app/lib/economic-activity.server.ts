import { z } from "zod";
import { createPromiseCache } from "~/lib/promise-cache.server";
import { withUpstreamTimeout } from "~/lib/upstream-timeout.server";

import type { SourceHealth } from "~/lib/exchange-rates.server";
import {
  ACTIVITY_CSV_URL,
  ACTIVITY_DATA_URL,
  type EconomicActivity,
} from "~/lib/economic-activity";

const API_TIMEOUT_MS = 3_000;
const CSV_TIMEOUT_MS = 8_000;
const CACHE_TTL_MS = 30 * 60_000;

const rowSchema = z.tuple([
  z.iso.date(),
  z.number().finite().nullable(),
  z.number().finite().nullable(),
]);

const responseSchema = z.object({ data: z.array(rowSchema) });

const csvRowSchema = z.object({
  indice_tiempo: z.iso.date(),
  emae_original_via: z.string(),
  emae_desestacionalizada_vm: z.string(),
});

const cache = createPromiseCache();

interface ActivityHealthStats {
  successes: number;
  failures: number;
  lastSuccess: string | null;
  lastFailure: string | null;
}

const activityHealthStats: ActivityHealthStats = {
  successes: 0,
  failures: 0,
  lastSuccess: null,
  lastFailure: null,
};

function recordActivitySuccess() {
  const now = new Date().toISOString();
  activityHealthStats.successes += 1;
  activityHealthStats.lastSuccess = now;
}

function recordActivityFailure() {
  const now = new Date().toISOString();
  activityHealthStats.failures += 1;
  activityHealthStats.lastFailure = now;
}

export function getEconomicActivitySourceHealth(): SourceHealth {
  const { successes, failures, lastSuccess, lastFailure } = activityHealthStats;
  const status =
    successes === 0 && failures === 0
      ? "not-checked"
      : failures === 0
        ? "fetched"
        : successes === 0
          ? "failed"
          : "partial";

  return {
    status,
    lastSuccessfulFetchAt: lastSuccess,
    lastFailureAt: lastFailure,
  };
}

function activityFromRows(data: z.infer<typeof rowSchema>[]): EconomicActivity {
  const observations = data
    .map(([date, yearOverYear, monthOverMonth]) => ({
      date,
      yearOverYear: yearOverYear === null ? null : yearOverYear * 100,
      monthOverMonth: monthOverMonth === null ? null : monthOverMonth * 100,
    }))
    .filter(
      (point) => point.yearOverYear !== null || point.monthOverMonth !== null,
    )
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-12);

  const latest = observations.at(-1);
  if (!latest)
    throw new Error("La serie EMAE no incluyó observaciones utilizables.");

  return { observations, latest };
}

async function fetchActivityApi(): Promise<EconomicActivity> {
  return withUpstreamTimeout(API_TIMEOUT_MS, async (signal) => {
    const response = await fetch(ACTIVITY_DATA_URL, {
      headers: { accept: "application/json" },
      signal,
    });

    if (!response.ok)
      throw new Error(`La serie EMAE respondió con ${response.status}.`);

    const payload: unknown = await response.json();
    const { data } = responseSchema.parse(payload);
    return activityFromRows(data);
  });
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        field += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (char === "," && !quoted) {
      fields.push(field);
      field = "";
    } else field += char;
  }

  fields.push(field);

  return fields;
}

function parseFraction(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "...") return null;

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed))
    throw new Error("La serie EMAE incluyó un valor inválido.");

  return parsed;
}

async function fetchActivityCsv(): Promise<EconomicActivity> {
  return withUpstreamTimeout(CSV_TIMEOUT_MS, async (signal) => {
    const response = await fetch(ACTIVITY_CSV_URL, {
      headers: { accept: "text/csv" },
      signal,
    });

    if (!response.ok)
      throw new Error(
        `El recurso CSV de EMAE respondió con ${response.status}.`,
      );

    const lines = (await response.text())
      .replace(/^\uFEFF/, "")
      .trim()
      .split(/\r?\n/);

    const headers = parseCsvLine(lines.shift() ?? "");

    const data = lines.map((line) => {
      const values = parseCsvLine(line);

      const record = Object.fromEntries(
        headers.map((header, index) => [header, values[index] ?? ""]),
      );

      const row = csvRowSchema.parse(record);
      return rowSchema.parse([
        row.indice_tiempo,
        parseFraction(row.emae_original_via),
        parseFraction(row.emae_desestacionalizada_vm),
      ]);
    });

    return activityFromRows(data);
  });
}

async function fetchEconomicActivity(): Promise<EconomicActivity> {
  try {
    const result = await fetchActivityApi();
    recordActivitySuccess();
    return result;
  } catch {
    try {
      const result = await fetchActivityCsv();
      recordActivitySuccess();
      return result;
    } catch (error) {
      recordActivityFailure();
      throw error;
    }
  }
}

/** Concurrent readers share the request; a failure is not cached as a value, only backed off briefly. */
export function getEconomicActivity(): Promise<EconomicActivity> {
  return cache.get("emae", CACHE_TTL_MS, fetchEconomicActivity);
}
