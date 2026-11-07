/**
 * Outbound email through Resend, used by the magic-link flow and the retention job. Both call sites send from the same verified sender, and both treat any thrown error as "not delivered".
 */

import type { EmailContent } from "./email-templates";
import { withUpstreamTimeout } from "./upstream-timeout.server";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/** Sign-in waits on this send, and the retention job runs accounts one by one, so a stalled connection must not block either. */
const EMAIL_TIMEOUT_MS = 10_000;

export interface EmailDelivery {
  apiKey: string;
  from: string;
}

/** The Worker's own sending configuration; null keeps every email feature disabled. */
export const emailDelivery = (
  env: CloudflareEnvironment,
): EmailDelivery | null => {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) return null;

  return { apiKey: env.RESEND_API_KEY, from: env.EMAIL_FROM };
};

/**
 * Sends one message through Resend and resolves only after Resend accepts it for delivery. Failures throw with the status code alone: provider bodies could echo addresses or links, so nothing from the response is surfaced into logs or errors under the caller's control.
 */
export const sendEmail = async (
  delivery: EmailDelivery,
  message: EmailContent & { to: string },
) => {
  const response = await withUpstreamTimeout(EMAIL_TIMEOUT_MS, (signal) =>
    fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${delivery.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: delivery.from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        html: message.html,
      }),
      signal,
    }),
  );

  if (!response.ok)
    throw new Error(
      `Resend rejected the message with status ${response.status}`,
    );
};
