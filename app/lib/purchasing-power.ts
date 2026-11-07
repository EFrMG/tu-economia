import type { IndicatorPoint } from "~/lib/indicators";

export interface PurchasingPowerResult {
  adjustedAmount: number;
  retainedPercent: number;
  fromMonth: string;
  throughMonth: string;
  months: number;
}

function nextMonth(month: string) {
  const date = new Date(`${month}-01T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() + 1);

  return date.toISOString().slice(0, 7);
}

/** Apply published monthly IPC changes after the starting month, with no gap filling. */
export function calculatePurchasingPower(
  amount: number,
  fromMonth: string,
  observations: IndicatorPoint[],
): PurchasingPowerResult | null {
  if (
    !Number.isFinite(amount) ||
    amount <= 0 ||
    !/^\d{4}-(0[1-9]|1[0-2])$/.test(fromMonth)
  )
    return null;

  const byMonth = new Map(
    observations.map(({ date, value }) => [date.slice(0, 7), value]),
  );

  const throughMonth = [...byMonth.keys()].sort().at(-1);
  if (!throughMonth || !byMonth.has(fromMonth) || fromMonth >= throughMonth)
    return null;

  let factor = 1;
  let months = 0;
  for (
    let month = nextMonth(fromMonth);
    month <= throughMonth;
    month = nextMonth(month)
  ) {
    const rate = byMonth.get(month);
    if (rate === undefined || !Number.isFinite(rate) || rate <= -100)
      return null;

    factor *= 1 + rate / 100;
    months += 1;
  }

  return {
    adjustedAmount: amount * factor,
    retainedPercent: 100 / factor,
    fromMonth,
    throughMonth,
    months,
  };
}
