import type { IndicatorPoint } from "~/lib/indicators";

export interface DepositInflationComparison {
  month: string;
  rateDate: string;
  tna: number;
  inflation: number;
  nominalReturnPercent: number;
  realReturnPercent: number;
}

const DAY_MS = 86_400_000;

/** ISO dates and months order by code point, which also spares a cold Worker the collator a locale-aware comparison initializes. */
const compareText = (left: string, right: string) =>
  left < right ? -1 : left > right ? 1 : 0;

/** The last point dated before `date` in `points`, sorted oldest first: a binary search, since the deposit series has thousands of daily points. */
function lastBefore(
  points: readonly IndicatorPoint[],
  date: string,
): IndicatorPoint | undefined {
  let low = 0;
  let high = points.length;

  while (low < high) {
    const middle = (low + high) >>> 1;

    if (points[middle].date < date) low = middle + 1;
    else high = middle;
  }

  return points[low - 1];
}

/** Historical 30-day calendar months allow a direct comparison with published monthly IPC. */
export function depositInflationComparisons(
  inflationHistory: IndicatorPoint[],
  depositHistory: IndicatorPoint[],
): DepositInflationComparison[] {
  const rates = [...depositHistory].sort((left, right) =>
    compareText(left.date, right.date),
  );

  return inflationHistory
    .flatMap((inflationPoint) => {
      const month = inflationPoint.date.slice(0, 7);
      const start = new Date(`${month}-01T00:00:00.000Z`);
      if (Number.isNaN(start.getTime())) return [];

      const end = new Date(start);
      end.setUTCMonth(end.getUTCMonth() + 1);

      if ((end.getTime() - start.getTime()) / DAY_MS !== 30) return [];

      const rate = lastBefore(rates, `${month}-01`);
      if (!rate) return [];

      const ageDays =
        (start.getTime() - new Date(`${rate.date}T00:00:00.000Z`).getTime()) /
        DAY_MS;

      if (
        ageDays < 1 ||
        ageDays > 7 ||
        !Number.isFinite(rate.value) ||
        rate.value < 0 ||
        inflationPoint.value <= -100
      )
        return [];

      const nominalReturnPercent = (rate.value * 30) / 365;

      const realReturnPercent =
        ((1 + nominalReturnPercent / 100) / (1 + inflationPoint.value / 100) -
          1) *
        100;

      return [
        {
          month,
          rateDate: rate.date,
          tna: rate.value,
          inflation: inflationPoint.value,
          nominalReturnPercent,
          realReturnPercent,
        },
      ];
    })
    .sort((left, right) => compareText(left.month, right.month));
}

export function simulateDeposit(
  amount: number,
  comparison: DepositInflationComparison,
) {
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const finalAmount = amount * (1 + comparison.nominalReturnPercent / 100);
  return {
    finalAmount,
    initialMonthPurchasingPower: finalAmount / (1 + comparison.inflation / 100),
  };
}
