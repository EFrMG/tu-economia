import {
  depositInflationComparisons,
  type DepositInflationComparison,
} from "~/lib/deposit-inflation";
import type { IndicatorPoint } from "~/lib/indicators";
import {
  getDepositRateHistory,
  getMonthlyInflationHistory,
} from "~/lib/indicators.server";
import type { SnapshotEnv } from "~/lib/source-snapshots.server";

interface Computed {
  inflation: IndicatorPoint[];
  deposits: IndicatorPoint[];
  comparisons: DepositInflationComparison[];
}

/**
 * The last comparison computed in this instance and the series it came from.
 * The snapshot cache hands every request the same arrays until a copy is reloaded, so comparing them by identity recomputes exactly when either series changes, and holds no copy longer than that cache does.
 */
let last: Computed | null = null;

/** The deposit-vs-inflation months, computed once per pair of series rather than on every visit; callers must not mutate the result. */
export async function getDepositInflationComparisons(
  env: SnapshotEnv,
): Promise<DepositInflationComparison[]> {
  const [inflation, deposits] = await Promise.all([
    getMonthlyInflationHistory(env),
    getDepositRateHistory(env),
  ]);

  if (last?.inflation === inflation && last.deposits === deposits)
    return last.comparisons;

  const comparisons = depositInflationComparisons(inflation, deposits);
  last = { inflation, deposits, comparisons };

  return comparisons;
}
