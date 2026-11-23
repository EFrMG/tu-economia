/** INDEC's poverty and indigence rates from the Encuesta Permanente de Hogares, per semester. */
export const POVERTY_SERVICE = "pobreza_eph";

/** `area_geografica_nom` of the total of the 31 urban agglomerations, the only area the service publishes. */
export const POVERTY_AREA = "T_31_A";

export const POVERTY_UNITS = [
  { id: "personas", label: "Personas" },
  { id: "hogares", label: "Hogares" },
] as const;

export type PovertyUnit = (typeof POVERTY_UNITS)[number]["id"];

/** Years shown by the shorter range; the default range is the whole series. */
export const POVERTY_RECENT_YEARS = 4;

export const POVERTY_UNIT_PARAM = "povertyUnit";
export const POVERTY_YEARS_PARAM = "povertyYears";

export interface PovertyRates {
  /** Percentage below the poverty line (the total basket). */
  poverty: number | null;
  /** Percentage below the indigence line (the food basket). */
  indigence: number | null;
}

export interface PovertyPoint {
  /** `YYYY-S1` or `YYYY-S2`. */
  period: string;
  personas: PovertyRates;
  hogares: PovertyRates;
  /** INDEC's observation for the semester, such as an agglomeration left out; the provisional mark is `provisional` instead. */
  note: string | null;
  provisional: boolean;
}

export interface PovertyData {
  /** Oldest semester first. */
  points: PovertyPoint[];
}

export const povertyUnitFromParam = (value: string | null): PovertyUnit =>
  value === "hogares" ? "hogares" : "personas";

/** `null` is the whole series. */
export const povertyYearsFromParam = (value: string | null) =>
  value === String(POVERTY_RECENT_YEARS) ? POVERTY_RECENT_YEARS : null;

/** The last `years` years of semesters, or every point when `years` is `null`. */
export const povertyPointsForYears = (
  points: PovertyPoint[],
  years: number | null,
) => (years === null ? points : points.slice(-years * 2));

const semesterOf = (period: string) => ({
  year: Number(period.slice(0, 4)),
  semester: period.endsWith("S1") ? 1 : 2,
});

/** The same semester one year earlier, when the series has it. */
export const yearEarlierPoint = (points: PovertyPoint[], point: PovertyPoint) =>
  points.find(
    (candidate) =>
      candidate.period ===
      `${semesterOf(point.period).year - 1}-${point.period.slice(5)}`,
  ) ?? null;

export interface PovertySummary {
  latest: PovertyPoint;
  /** The same semester a year earlier; `null` when the series does not reach back that far. */
  reference: PovertyPoint | null;
  /** Percentage-point changes against `reference`. */
  change: PovertyRates;
}

const difference = (current: number | null, previous: number | null) =>
  current === null || previous === null
    ? null
    : Math.round((current - previous) * 10) / 10;

export function povertySummary(
  points: PovertyPoint[],
  unit: PovertyUnit,
): PovertySummary | null {
  const latest = points.at(-1);
  if (!latest) return null;

  const reference = yearEarlierPoint(points, latest);

  return {
    latest,
    reference,
    change: {
      poverty: difference(
        latest[unit].poverty,
        reference?.[unit].poverty ?? null,
      ),
      indigence: difference(
        latest[unit].indigence,
        reference?.[unit].indigence ?? null,
      ),
    },
  };
}

/** "1.er semestre 2026". */
export const formatSemester = (period: string) => {
  const { year, semester } = semesterOf(period);

  return `${semester === 1 ? "1.er" : "2.º"} semestre ${year}`;
};

/** "1S 2026", for axis ticks. */
export const formatSemesterShort = (period: string) => {
  const { year, semester } = semesterOf(period);

  return `${semester}S ${year}`;
};

const rate = new Intl.NumberFormat("es-AR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const points = new Intl.NumberFormat("es-AR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
  signDisplay: "exceptZero",
});

export const formatPovertyRate = (value: number) => `${rate.format(value)}%`;

export const formatPovertyChange = (value: number) =>
  `${points.format(value)} pp`;
