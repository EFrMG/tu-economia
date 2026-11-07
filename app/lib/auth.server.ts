import { betterAuth, type BetterAuthOptions } from "better-auth";
import { magicLink } from "better-auth/plugins";

import { accessLinkEmail } from "./email-templates";
import { emailDelivery, sendEmail } from "./email.server";

export interface AuthOptions {
  database: NonNullable<BetterAuthOptions["database"]>;
  baseURL: string;
  secret: string;
  google?: { clientId: string; clientSecret: string };
  sendMagicLink?: (message: { email: string; url: string }) => Promise<void>;
}

/** Better Auth owns the only account session. Browser-local finance data is never read here. */
export const createAuth = ({
  database,
  baseURL,
  secret,
  google,
  sendMagicLink,
}: AuthOptions) =>
  betterAuth({
    appName: "Tu Economía",
    database,
    baseURL,
    secret,
    advanced: { disableOriginCheck: false },
    emailAndPassword: { enabled: false },
    socialProviders: google ? { google } : {},
    account: {
      accountLinking: { enabled: true, disableImplicitLinking: true },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: false },
    },
    rateLimit: { enabled: true, storage: "database" },
    plugins: sendMagicLink
      ? [
          magicLink({
            expiresIn: 5 * 60,
            storeToken: "hashed",
            sendMagicLink: async ({ email, url }) =>
              sendMagicLink({ email, url }),
          }),
        ]
      : [],
  });

const validBaseURL = (value: string | undefined) => {
  if (!value) return null;

  try {
    const url = new URL(value);
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/"
    )
      return null;

    if (
      url.protocol !== "https:" &&
      !(url.protocol === "http:" && url.hostname === "localhost")
    )
      return null;

    return url.origin;
  } catch {
    return null;
  }
};

export const authAvailability = (env: CloudflareEnvironment) => {
  const baseURL = validBaseURL(env.AUTH_BASE_URL);

  const ready = Boolean(
    env.AUTH_ACCOUNTS_ENABLED === "true" &&
    env.DB &&
    env.AUTH_SECRET &&
    env.AUTH_SECRET.length >= 32 &&
    baseURL,
  );

  return {
    ready,
    baseURL,
    google: ready && Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
    email: ready && Boolean(emailDelivery(env)),
  };
};

export const authFromEnv = (env: CloudflareEnvironment) => {
  const availability = authAvailability(env);
  if (
    !availability.ready ||
    (!availability.google && !availability.email) ||
    !availability.baseURL ||
    !env.DB ||
    !env.AUTH_SECRET
  )
    return null;

  return createAuth({
    database: env.DB,
    baseURL: availability.baseURL,
    secret: env.AUTH_SECRET,
    google: availability.google
      ? {
          clientId: env.GOOGLE_CLIENT_ID!,
          clientSecret: env.GOOGLE_CLIENT_SECRET!,
        }
      : undefined,
    sendMagicLink: availability.email
      ? async ({ email, url }) => {
          const delivery = emailDelivery(env)!;

          await sendEmail(delivery, {
            to: email,
            ...accessLinkEmail({ url }),
          });
        }
      : undefined,
  });
};
