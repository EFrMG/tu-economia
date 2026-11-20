export const DAILY_MAINTENANCE_UTC_HOUR = 6;
export const MAINTENANCE_CRON = "0 6 * * *";

export type ScheduledTask = "daily-maintenance" | "boletin-step";

/** The job for a run, from its scheduled time (not the time it started), so a late start never skips or repeats the maintenance. */
export function scheduledTask(
  cron: string,
  scheduledTime: number,
): ScheduledTask {
  if (cron === MAINTENANCE_CRON) return "daily-maintenance";

  const at = new Date(scheduledTime);

  return at.getUTCHours() === DAILY_MAINTENANCE_UTC_HOUR &&
    at.getUTCMinutes() === 0
    ? "daily-maintenance"
    : "boletin-step";
}
