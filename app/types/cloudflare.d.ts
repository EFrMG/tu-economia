declare global {
  interface CloudflareEnvironment {
    DB?: D1Database;
    /** Caps `/resources/prices` per client IP, since each request can fan out to the unofficial Precios Claros API. */
    PRICES_LIMITER?: RateLimit;
    AUTH_ACCOUNTS_ENABLED?: string;
    /** Mi economía stores nothing until explicitly enabled. */
    FINANCE_STORAGE_ENABLED?: string;
    /** New provider checkout stays disabled until private validation. */
    BILLING_ENABLED?: string;
    MP_ACCESS_TOKEN?: string;
    MP_WEBHOOK_SECRET?: string;
    AUTH_BASE_URL?: string;
    AUTH_SECRET?: string;
    GOOGLE_CLIENT_ID?: string;
    GOOGLE_CLIENT_SECRET?: string;
    /** Resend credentials that send access links and retention notices; EMAIL_FROM needs a sender address on a domain verified in Resend. */
    RESEND_API_KEY?: string;
    EMAIL_FROM?: string;
  }
}

export {};
