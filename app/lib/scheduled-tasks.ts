export const DAILY_MAINTENANCE_UTC_HOUR = 6;
export const MAINTENANCE_CRON = "0 6 * * *";

/** The trigger, `*\/5 6-15 * * *` in `wrangler.jsonc`, runs every five minutes. */
const RUN_INTERVAL_MINUTES = 5;

/**
 * The runs from 06:05 to 08:25 UTC (03:05 to 05:25 in Argentina) refresh one saved copy each, back to back.
 * They come before the Boletín's morning edition, when a digest step would only find the previous one, and the digest has the rest of the morning.
 */
export const SOURCE_REFRESH_SLOTS = 29;

const FIRST_REFRESH_MINUTE =
  DAILY_MAINTENANCE_UTC_HOUR * 60 + RUN_INTERVAL_MINUTES;

export type ScheduledTask =
  | { kind: "daily-maintenance" }
  | { kind: "source-refresh"; slot: number }
  | { kind: "boletin-step" };

/** The job for a run, from its scheduled time (not the time it started), so a late start never skips or repeats a job. */
export function scheduledTask(
  cron: string,
  scheduledTime: number,
): ScheduledTask {
  if (cron === MAINTENANCE_CRON) return { kind: "daily-maintenance" };

  const at = new Date(scheduledTime);
  const minuteOfDay = at.getUTCHours() * 60 + at.getUTCMinutes();

  if (minuteOfDay === DAILY_MAINTENANCE_UTC_HOUR * 60)
    return { kind: "daily-maintenance" };

  const offset = minuteOfDay - FIRST_REFRESH_MINUTE;
  const slot = offset / RUN_INTERVAL_MINUTES;

  return offset >= 0 && Number.isInteger(slot) && slot < SOURCE_REFRESH_SLOTS
    ? { kind: "source-refresh", slot }
    : { kind: "boletin-step" };
}
