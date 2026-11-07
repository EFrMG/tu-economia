import { calendarMonthAfter } from "~/lib/billing-entitlement";

/** Records of a lapsed subscription are kept this many calendar months after access ends. */
export const RETENTION_MONTHS = 3;

/** The deletion notice is attempted this many calendar months after access ends. */
export const NOTICE_MONTHS = 2;

/** Deletion happens this many days after the first notice attempt, whether or not delivery succeeded. */
export const NOTICE_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface RetentionInput {
  now: Date;
  /** End of the latest trial or paid period in epoch milliseconds; zero when none was granted. */
  entitlementEndsAt: number;
  /** The record's last write; it anchors records that never had an entitlement on file. */
  documentUpdatedAt: string;
  /** The first delivery attempt; recorded even when the provider rejected or never received the message. */
  deletionNoticeAttemptedAt: string | null;
  /** When the provider accepted the notice; null until a delivery succeeds. */
  deletionNoticeSentAt: string | null;
}

export type RetentionAction = "keep" | "notify" | "delete" | "reset-notice";

/** The later of the entitlement end and the last write, both in epoch milliseconds. */
const retentionAnchor = ({
  entitlementEndsAt,
  documentUpdatedAt,
}: Pick<RetentionInput, "entitlementEndsAt" | "documentUpdatedAt">) =>
  Math.max(entitlementEndsAt, Date.parse(documentUpdatedAt));

/** The day the notice first becomes due: two calendar months after access ends. */
export function retentionNoticeDate({
  entitlementEndsAt,
  documentUpdatedAt,
}: Pick<RetentionInput, "entitlementEndsAt" | "documentUpdatedAt">): Date {
  return new Date(
    calendarMonthAfter(
      new Date(
        retentionAnchor({ entitlementEndsAt, documentUpdatedAt }),
      ).toISOString(),
      NOTICE_MONTHS,
    ),
  );
}

/**
 * When a lapsed account's records are deleted: three calendar months after access ends, and never sooner than thirty days after the first notice attempt. The attempt, not a successful delivery, anchors the clock, so an unusable address cannot defer deletion indefinitely.
 */
export function retentionDeletionDate({
  entitlementEndsAt,
  documentUpdatedAt,
  deletionNoticeAttemptedAt,
}: Pick<
  RetentionInput,
  "entitlementEndsAt" | "documentUpdatedAt" | "deletionNoticeAttemptedAt"
>): Date {
  const deadline = calendarMonthAfter(
    new Date(
      retentionAnchor({ entitlementEndsAt, documentUpdatedAt }),
    ).toISOString(),
    RETENTION_MONTHS,
  );

  const afterNotice = deletionNoticeAttemptedAt
    ? Date.parse(deletionNoticeAttemptedAt) + NOTICE_DAYS * DAY_MS
    : 0;

  return new Date(Math.max(Date.parse(deadline), afterNotice));
}

/**
 * Records are deleted only after a notice was attempted, so a deployment without sending configuration never deletes silently. A failed delivery is retried daily until the deletion date.
 */
export function retentionAction(input: RetentionInput): RetentionAction {
  const now = input.now.getTime();

  if (now < input.entitlementEndsAt)
    return input.deletionNoticeAttemptedAt || input.deletionNoticeSentAt
      ? "reset-notice"
      : "keep";

  if (!input.deletionNoticeAttemptedAt)
    return now >= retentionNoticeDate(input).getTime() ? "notify" : "keep";

  if (now >= retentionDeletionDate(input).getTime()) return "delete";

  return input.deletionNoticeSentAt ? "keep" : "notify";
}
