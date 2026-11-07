export const ACTIVITY_DATA_URL =
  "https://apis.datos.gob.ar/series/api/series/?ids=143.3_ICE_SERVIA_2004_A_25,143.3_ICE_SER_VM_2004_A_34&last=12&metadata=none";

export const ACTIVITY_CSV_URL =
  "https://infra.datos.gob.ar/catalog/sspm/dataset/143/distribution/143.3/download/emae-valores-anuales-indice-base-2004-mensual.csv";

export const ACTIVITY_METHOD_URL =
  "https://www.indec.gob.ar/ftp/cuadros/economia/metodologia_emae_ago_16.pdf";

export interface ActivityObservation {
  date: string;
  yearOverYear: number | null;
  monthOverMonth: number | null;
}

export interface EconomicActivity {
  observations: ActivityObservation[];
  latest: ActivityObservation;
}

const month = new Intl.DateTimeFormat("es-AR", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const shortMonth = new Intl.DateTimeFormat("es-AR", {
  month: "short",
  timeZone: "UTC",
});

const percentage = new Intl.NumberFormat("es-AR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
  signDisplay: "exceptZero",
});

const points = new Intl.NumberFormat("es-AR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

function monthDate(date: string): Date {
  return new Date(`${date.slice(0, 7)}-15T12:00:00.000Z`);
}

export function formatActivityMonth(date: string): string {
  return month.format(monthDate(date));
}

export function formatActivityShortMonth(date: string): string {
  return shortMonth.format(monthDate(date));
}

export function formatActivityChange(value: number | null): string {
  return value === null
    ? "s/d"
    : `${percentage.format(Math.abs(value) < 0.05 ? 0 : value)}%`;
}

/** A change in a percentage rate is expressed in percentage points. */
export function activityRateDifference(
  current: number | null,
  previous: number | null,
): string | null {
  if (current === null || previous === null) return null;

  const difference = current - previous;
  if (Math.abs(difference) < 0.05)
    return "se mantuvo sin cambios frente al mes anterior";

  return `${difference > 0 ? "subió" : "bajó"} ${points.format(Math.abs(difference))} puntos porcentuales frente al mes anterior`;
}
