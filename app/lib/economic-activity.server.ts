import { z } from "zod";
import {
  loadRows,
  snapshotHealth,
  type SnapshotEnv,
  type SnapshotSource,
} from "~/lib/source-snapshots.server";
import { withUpstreamTimeout } from "~/lib/upstream-timeout.server";

import type { SourceHealth } from "~/lib/exchange-rates.server";
import {
  ACTIVITY_CSV_URL,
  ACTIVITY_DATA_URL,
  type ActivityObservation,
  type EconomicActivity,
} from "~/lib/economic-activity";

const API_TIMEOUT_MS = 3_000;
const CSV_TIMEOUT_MS = 8_000;

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

export const getEconomicActivitySourceHealth = (): SourceHealth =>
  snapshotHealth("emae@");

/** The last twelve months with a value, oldest first. */
function observationsFromRows(
  data: z.infer<typeof rowSchema>[],
): ActivityObservation[] {
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

  if (!observations.length)
    throw new Error("La serie EMAE no incluyó observaciones utilizables.");

  return observations;
}

async function fetchActivityApi(): Promise<ActivityObservation[]> {
  return withUpstreamTimeout(API_TIMEOUT_MS, async (signal) => {
    const response = await fetch(ACTIVITY_DATA_URL, {
      headers: { accept: "application/json" },
      signal,
    });

    if (!response.ok)
      throw new Error(`La serie EMAE respondió con ${response.status}.`);

    const payload: unknown = await response.json();
    const { data } = responseSchema.parse(payload);
    return observationsFromRows(data);
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

async function fetchActivityCsv(): Promise<ActivityObservation[]> {
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

    return observationsFromRows(data);
  });
}

const observationSchema = z.object({
  date: z.iso.date(),
  yearOverYear: z.number().finite().nullable(),
  monthOverMonth: z.number().finite().nullable(),
});

/** The series API first, the official CSV when it fails. Refreshed by the daily cron; see `SCHEDULED_SOURCES`. */
export const ACTIVITY_SOURCE: SnapshotSource<ActivityObservation> = {
  key: "emae@1",
  schema: observationSchema,
  fetchRows: () => fetchActivityApi().catch(fetchActivityCsv),
};

/** The saved copy of the last twelve months; rejects only when there is no copy and the source cannot be read. */
export async function getEconomicActivity(
  env: SnapshotEnv,
  now = new Date(),
): Promise<EconomicActivity> {
  const observations = await loadRows(ACTIVITY_SOURCE, env, now);

  return { observations, latest: observations[observations.length - 1] };
}
