/** Release schedule of the INDEC indicators Tu Economía shows, taken from
 * INDEC's semester diffusion calendar. The calendar is published once per
 * semester, so this table is refreshed twice a year; the test in
 * `indec-calendar.test.ts` fails once the covered semester ends.
 *
 * Source: https://www.indec.gob.ar/ftp/cuadros/publicaciones/calendario_2sem2026.pdf
 * (converted to text as `DOCS/calendario_2sem2026.txt`).
 *
 * The calendar also lists pobreza (semestral) and mercado de trabajo
 * (trimestral), which can be added here when those surfaces land. */

/** Semester covered by this calendar, `YYYY-S` where S is 1 or 2. */
export const INDEC_CALENDAR_SEMESTER = "2026-2" as const;

/** Last day the calendar is in force; the test fails after this date. */
export const INDEC_CALENDAR_EXPIRES_AT = "2026-12-31";

export type IndecCalendarIndicator = "ipc" | "canasta" | "salarios" | "emae";

export interface IndecRelease {
  indicator: IndecCalendarIndicator;
  /** Data period covered, `YYYY-MM`. */
  period: string;
  /** Publication date, `YYYY-MM-DD`. */
  releaseDate: string;
}

export const INDEC_RELEASES: readonly IndecRelease[] = [
  // IPC, cobertura nacional.
  { indicator: "ipc", period: "2026-06", releaseDate: "2026-07-14" },
  { indicator: "ipc", period: "2026-07", releaseDate: "2026-08-13" },
  { indicator: "ipc", period: "2026-08", releaseDate: "2026-09-10" },
  { indicator: "ipc", period: "2026-09", releaseDate: "2026-10-13" },
  { indicator: "ipc", period: "2026-10", releaseDate: "2026-11-12" },
  { indicator: "ipc", period: "2026-11", releaseDate: "2026-12-15" },

  // Canasta básica alimentaria y total, Gran Buenos Aires.
  { indicator: "canasta", period: "2026-06", releaseDate: "2026-07-14" },
  { indicator: "canasta", period: "2026-07", releaseDate: "2026-08-13" },
  { indicator: "canasta", period: "2026-08", releaseDate: "2026-09-10" },
  { indicator: "canasta", period: "2026-09", releaseDate: "2026-10-13" },
  { indicator: "canasta", period: "2026-10", releaseDate: "2026-11-12" },
  { indicator: "canasta", period: "2026-11", releaseDate: "2026-12-15" },

  // Índice de salarios.
  { indicator: "salarios", period: "2026-05", releaseDate: "2026-07-20" },
  { indicator: "salarios", period: "2026-06", releaseDate: "2026-08-20" },
  { indicator: "salarios", period: "2026-07", releaseDate: "2026-09-22" },
  { indicator: "salarios", period: "2026-08", releaseDate: "2026-10-21" },
  { indicator: "salarios", period: "2026-09", releaseDate: "2026-11-13" },
  { indicator: "salarios", period: "2026-10", releaseDate: "2026-12-16" },

  // EMAE.
  { indicator: "emae", period: "2026-05", releaseDate: "2026-07-22" },
  { indicator: "emae", period: "2026-06", releaseDate: "2026-08-20" },
  { indicator: "emae", period: "2026-07", releaseDate: "2026-09-24" },
  { indicator: "emae", period: "2026-08", releaseDate: "2026-10-21" },
  { indicator: "emae", period: "2026-09", releaseDate: "2026-11-24" },
  { indicator: "emae", period: "2026-10", releaseDate: "2026-12-21" },
] as const;

const releaseDateFormatter = new Intl.DateTimeFormat("es-AR", {
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

/** Formats a `YYYY-MM-DD` release date as "12 de noviembre". */
export const formatReleaseDate = (date: string) =>
  releaseDateFormatter.format(new Date(`${date}T12:00:00.000Z`));

/** Whether the calendar is still in force on `now`. */
export const isCalendarInForce = (now: Date = new Date()) =>
  now.toISOString().slice(0, 10) <= INDEC_CALENDAR_EXPIRES_AT;

/** The next scheduled release on or after `now`, or `null` past the end of the calendar. */
export function nextRelease(
  indicator: IndecCalendarIndicator,
  now: Date = new Date(),
): IndecRelease | null {
  const today = now.toISOString().slice(0, 10);

  return (
    INDEC_RELEASES.filter(
      (release) =>
        release.indicator === indicator && release.releaseDate >= today,
    ).sort((a, b) => a.releaseDate.localeCompare(b.releaseDate))[0] ?? null
  );
}
