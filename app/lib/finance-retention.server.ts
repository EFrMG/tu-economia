import {
  entitlementEndsAt,
  hasCloudEntitlement,
  type BillingRecord,
} from "~/lib/billing-entitlement";
import { billingRecord } from "~/lib/billing.server";
import { retentionNoticeEmail } from "~/lib/email-templates";
import { emailDelivery, sendEmail } from "~/lib/email.server";
import {
  retentionAction,
  retentionDeletionDate,
} from "~/lib/finance-retention";
import { financeHref, SUBSCRIPTION_ANCHOR } from "~/lib/finance-tabs";

interface RetentionRow extends Omit<BillingRecord, "user_id"> {
  owner_id: string;
  email: string;
  updated_at: string;
  deletion_notice_attempted_at: string | null;
  deletion_notice_sent_at: string | null;
  billing_user_id: string | null;
}

export interface RetentionSummary {
  notified: number;
  deleted: number;
  reset: number;
  failed: number;
}

type NoticeResult = "sent" | "failed" | "unavailable";

/** Sends the deletion notice through Resend; only a provider acceptance counts as delivered. */
async function sendNotice(
  env: CloudflareEnvironment,
  email: string,
  deleteOn: Date,
): Promise<NoticeResult> {
  const delivery = emailDelivery(env);

  if (!delivery || !env.AUTH_BASE_URL) return "unavailable";

  try {
    await sendEmail(delivery, {
      to: email,
      ...retentionNoticeEmail({
        deleteOn: deleteOn.toISOString(),
        url: `${new URL(env.AUTH_BASE_URL).origin}${financeHref("usuario")}#${SUBSCRIPTION_ANCHOR}`,
      }),
    });
  } catch {
    return "failed";
  }

  return "sent";
}

/**
 * The daily cleanup for lapsed subscriptions. Each step is conditioned on the row it read, so a resubscription or edit made while the job runs is never overwritten or deleted.
 */
export async function runFinanceRetention(
  env: CloudflareEnvironment,
  now = new Date(),
): Promise<RetentionSummary> {
  const summary: RetentionSummary = {
    notified: 0,
    deleted: 0,
    reset: 0,
    failed: 0,
  };

  const db = env.DB;
  if (env.FINANCE_STORAGE_ENABLED !== "true" || !db) return summary;

  const { results } = await db
    .prepare(
      'SELECT d.user_id AS owner_id, u.email, d.updated_at, d.deletion_notice_attempted_at, d.deletion_notice_sent_at, b.user_id AS billing_user_id, b.plan_id, b.checkout_url, b.subscription_id, b.provider_status, b.trial_ends_at, b.paid_until, b.canceled_at, b.account_deleted_at, b.last_verified_at FROM finance_documents d JOIN "user" u ON u.id = d.user_id LEFT JOIN billing_subscriptions b ON b.user_id = d.user_id',
    )
    .all<RetentionRow>();

  for (const row of results) {
    const input = {
      now,
      entitlementEndsAt: row.billing_user_id
        ? entitlementEndsAt({ ...row, user_id: row.billing_user_id })
        : 0,
      documentUpdatedAt: row.updated_at,
      deletionNoticeAttemptedAt: row.deletion_notice_attempted_at,
      deletionNoticeSentAt: row.deletion_notice_sent_at,
    };

    try {
      switch (retentionAction(input)) {
        case "reset-notice":
          await db
            .prepare(
              "UPDATE finance_documents SET deletion_notice_attempted_at = NULL, deletion_notice_sent_at = NULL WHERE user_id = ?",
            )
            .bind(row.owner_id)
            .run();

          summary.reset++;
          break;
        case "notify": {
          const attemptedAt =
            row.deletion_notice_attempted_at ?? now.toISOString();
          const deleteOn = retentionDeletionDate({
            ...input,
            deletionNoticeAttemptedAt: attemptedAt,
          });

          const result = await sendNotice(env, row.email, deleteOn);

          // Missing configuration must not start the clock: only a real send attempt can make an account eligible for notice-based deletion.
          if (result === "unavailable") {
            summary.failed++;
            break;
          }

          // Record the attempt even when delivery fails, so an unusable address cannot retain lapsed records forever.
          await db
            .prepare(
              "UPDATE finance_documents SET deletion_notice_attempted_at = COALESCE(deletion_notice_attempted_at, ?), deletion_notice_sent_at = CASE WHEN ? THEN COALESCE(deletion_notice_sent_at, ?) ELSE deletion_notice_sent_at END WHERE user_id = ? AND updated_at = ?",
            )
            .bind(
              now.toISOString(),
              result === "sent" ? 1 : 0,
              now.toISOString(),
              row.owner_id,
              row.updated_at,
            )
            .run();

          if (result === "sent") summary.notified++;
          else summary.failed++;

          break;
        }
        case "delete": {
          // A subscription authorized after the scan started still saves the records.
          if (hasCloudEntitlement(await billingRecord(db, row.owner_id), now))
            break;

          const { meta } = await db
            .prepare(
              "DELETE FROM finance_documents WHERE user_id = ? AND updated_at = ? AND deletion_notice_attempted_at = ?",
            )
            .bind(
              row.owner_id,
              row.updated_at,
              row.deletion_notice_attempted_at,
            )
            .run();

          if (meta.changes) summary.deleted++;

          break;
        }
        case "keep":
          break;
      }
    } catch {
      // One account's failure never blocks the others; the next run retries it.
      summary.failed++;
    }
  }

  return summary;
}
