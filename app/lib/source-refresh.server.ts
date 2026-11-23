import { companiesDueOn, refreshCompany } from "~/lib/company-filings.server";
import { ACTIVITY_SOURCE } from "~/lib/economic-activity.server";
import { DOLLAR_HISTORY_SOURCES } from "~/lib/exchange-rates.server";
import { INDEC_SOURCES } from "~/lib/indec.server";
import {
  BCRA_LATEST_SOURCE,
  COUNTRY_RISK_SOURCE,
  DEPOSIT_HISTORY_SOURCE,
  INFLATION_HISTORY_SOURCE,
} from "~/lib/indicators.server";
import {
  refreshSnapshot,
  type RefreshOutcome,
  type SnapshotEnv,
  type SnapshotSource,
} from "~/lib/source-snapshots.server";

/**
 * The copies the cron refreshes every day: refresh slot `n` handles source `n mod length`, so each source has a first run and a later one that retries it only when it failed.
 * Keep the list at most half of `SOURCE_REFRESH_SLOTS`, so every source gets at least two runs a day.
 */
export const SCHEDULED_SOURCES: readonly SnapshotSource<unknown>[] = [
  ...INDEC_SOURCES,
  ACTIVITY_SOURCE,
  BCRA_LATEST_SOURCE,
  COUNTRY_RISK_SOURCE,
  INFLATION_HISTORY_SOURCE,
  DEPOSIT_HISTORY_SOURCE,
  ...DOLLAR_HISTORY_SOURCES,
];

/**
 * One refresh run. The slot's daily source comes first; when its copy is already from today, the run goes to the first SEC company due today (weekly, see `companiesDueOn`) that is not yet refreshed, starting from a different one each slot so a failing company does not hold up the others.
 * `null` when nothing was due, so the run can go to the digest.
 */
export async function runRefreshSlot(
  env: SnapshotEnv,
  now: Date,
  slot: number,
): Promise<RefreshOutcome | null> {
  const daily = await refreshSnapshot(
    SCHEDULED_SOURCES[slot % SCHEDULED_SOURCES.length],
    env,
    now,
  );

  if (daily.status !== "current") return daily;

  const companies = companiesDueOn(now);

  for (let step = 0; step < companies.length; step += 1) {
    const company = companies[(slot + step) % companies.length];
    const outcome = await refreshCompany(env, now, company);

    if (outcome.status !== "current") return outcome;
  }

  return null;
}
