export const MONTHLY_PRICE_ARS = 5000;

export interface BillingRecord {
  user_id: string;
  plan_id: string | null;
  checkout_url: string | null;
  subscription_id: string | null;
  provider_status: string;
  trial_ends_at: string | null;
  paid_until: string | null;
  canceled_at: string | null;
  account_deleted_at: string | null;
  last_verified_at: string | null;
}

/**
 * When the trial or paid period ends, in epoch milliseconds; zero when the record never granted one. Deleted accounts and checkouts without a subscription carry no period.
 */
export function entitlementEndsAt(row: BillingRecord | null): number {
  if (!row?.subscription_id || row.account_deleted_at) return 0;

  // A verified payment keeps its paid period even if a later renewal fails.
  // The trial still requires an authorized (or subsequently canceled) subscription.
  const trialEnd = ["authorized", "canceled"].includes(row.provider_status)
    ? row.trial_ends_at
    : null;

  return [trialEnd, row.paid_until]
    .filter(
      (value): value is string =>
        value !== null && !Number.isNaN(Date.parse(value)),
    )
    .reduce((latest, value) => Math.max(latest, Date.parse(value)), 0);
}

export const hasCloudEntitlement = (
  row: BillingRecord | null,
  now = new Date(),
): boolean => now.getTime() < entitlementEndsAt(row);

/** Calendar-month rollover clamps dates such as January 31 to February's last day, computed in UTC. */
export function calendarMonthAfter(value: string, months = 1): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime()))
    throw new RangeError("Invalid billing date");

  const day = date.getUTCDate();
  const next = new Date(date);
  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + months);

  const lastDay = new Date(
    Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0),
  ).getUTCDate();

  next.setUTCDate(Math.min(day, lastDay));

  return next.toISOString();
}

/**
 * Same rollover, but anchored on Argentina's calendar (UTC-03:00, no DST since
 * 2009) so a subscription created late on January 31 in Buenos Aires ends its
 * trial in February rather than March.
 */
export function calendarMonthAfterArgentina(value: string, months = 1): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime()))
    throw new RangeError("Invalid billing date");

  const offsetMs = 3 * 60 * 60 * 1000;
  const local = new Date(date.getTime() - offsetMs);

  const day = local.getUTCDate();
  const year = local.getUTCFullYear();
  const month = local.getUTCMonth();

  const targetMonth = month + months;
  const targetYear = year + Math.floor(targetMonth / 12);
  const normalizedMonth = ((targetMonth % 12) + 12) % 12;

  const lastDay = new Date(
    Date.UTC(targetYear, normalizedMonth + 1, 0),
  ).getUTCDate();

  const clampedDay = Math.min(day, lastDay);

  const nextLocalMs = Date.UTC(
    targetYear,
    normalizedMonth,
    clampedDay,
    local.getUTCHours(),
    local.getUTCMinutes(),
    local.getUTCSeconds(),
    local.getUTCMilliseconds(),
  );

  return new Date(nextLocalMs + offsetMs).toISOString();
}
