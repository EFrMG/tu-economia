import { DatabaseSync } from "node:sqlite";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

import { authAvailability, authFromEnv, createAuth } from "./auth.server";

const origin = "https://auth.example.test";

const migration = readFileSync(
  new URL("../../migrations/0003_auth.sql", import.meta.url),
  "utf8",
);

/** Exercise Better Auth's built-in D1 path against SQLite without a provider account. */
const localD1 = (db: DatabaseSync): D1Database => {
  const prepare = (query: string) => {
    let values: unknown[] = [];

    const statement = {
      bind(...next: unknown[]) {
        values = next;

        return statement;
      },
      async all<T>() {
        const sql = db.prepare(query);
        const rows = sql.all(...(values as [])) as T[];
        return {
          results: rows,
          meta: {
            changes: Number(
              db.prepare("select changes() as value").get()?.value ?? 0,
            ),
            last_row_id: 0,
          },
        };
      },
    };

    return statement;
  };

  return {
    prepare,
    async batch(statements: D1PreparedStatement[]) {
      const results = [];
      for (const statement of statements) results.push(await statement.all());

      return results;
    },
    async exec(query: string) {
      db.exec(query);

      return { count: 1, duration: 0 };
    },
  } as unknown as D1Database;
};

const request = (path: string, init?: RequestInit) =>
  new Request(new URL(path, origin), init);

const post = (path: string, body: object, headers?: HeadersInit) =>
  request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin, ...headers },
    body: JSON.stringify(body),
  });

const cookies = (response: Response) =>
  response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");

/** The redirect callback trusts the token endpoint response; Google JWKS is only used for direct ID-token sign-in. */
const mockGoogleCodeExchange = (email: string, subject: string) => {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const issuedAt = Math.floor(Date.now() / 1000);

  const claims = {
    iss: "https://accounts.google.com",
    aud: "synthetic-google-id",
    sub: subject,
    email,
    email_verified: true,
    name: "Synthetic Google User",
    iat: issuedAt,
    exp: issuedAt + 3600,
  };

  const unsigned = [{ alg: "RS256", kid: "synthetic-key", typ: "JWT" }, claims]
    .map((part) => Buffer.from(JSON.stringify(part)).toString("base64url"))
    .join(".");

  const signature = Buffer.from(
    sign("RSA-SHA256", Buffer.from(unsigned), privateKey),
  ).toString("base64url");

  const idToken = `${unsigned}.${signature}`;
  const exchanges: URLSearchParams[] = [];

  const providerFetch = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      if (
        url !== "https://oauth2.googleapis.com/token" ||
        init?.method !== "POST"
      )
        throw new Error(
          `Unexpected provider request: ${init?.method ?? "GET"} ${url}`,
        );

      exchanges.push(new URLSearchParams(String(init.body)));

      return Response.json({
        token_type: "Bearer",
        access_token: "synthetic-access-token",
        expires_in: 3600,
        scope: "openid email profile",
        id_token: idToken,
      });
    },
  );

  vi.stubGlobal("fetch", providerFetch);

  return { exchanges, providerFetch };
};

const completeGoogleCallback = async (
  auth: ReturnType<typeof createAuth>,
  start: Response,
  sessionCookie = "",
) => {
  expect(start.status).toBe(200);
  const authorization = new URL(((await start.json()) as { url: string }).url);
  expect(authorization.origin).toBe("https://accounts.google.com");

  expect(authorization.searchParams.get("redirect_uri")).toBe(
    `${origin}/api/auth/callback/google`,
  );

  const state = authorization.searchParams.get("state");
  expect(state).toBeTruthy();

  const callback = await auth.handler(
    request(`/api/auth/callback/google?state=${state}&code=synthetic-code`, {
      headers: {
        Cookie: [sessionCookie, cookies(start)].filter(Boolean).join("; "),
      },
    }),
  );

  return { callback, authorization };
};

const expectGoogleExchange = (
  exchange: URLSearchParams,
  authorization: URL,
) => {
  expect(Object.fromEntries(exchange)).toMatchObject({
    grant_type: "authorization_code",
    code: "synthetic-code",
    client_id: "synthetic-google-id",
    client_secret: "synthetic-google-secret",
    redirect_uri: `${origin}/api/auth/callback/google`,
  });

  const verifier = exchange.get("code_verifier");
  expect(verifier).toBeTruthy();

  expect(createHash("sha256").update(verifier!).digest("base64url")).toBe(
    authorization.searchParams.get("code_challenge"),
  );

  expect(authorization.searchParams.get("code_challenge_method")).toBe("S256");
};

afterEach(() => vi.unstubAllGlobals());

describe("Better Auth account boundary", () => {
  it("stays unavailable without an explicit activation and all required bindings", () => {
    const db = {} as D1Database;

    const base = {
      DB: db,
      AUTH_BASE_URL: origin,
      AUTH_SECRET: "a".repeat(32),
      GOOGLE_CLIENT_ID: "fake",
      GOOGLE_CLIENT_SECRET: "fake",
    };

    expect(authAvailability(base).google).toBe(false);

    expect(
      authAvailability({ ...base, AUTH_ACCOUNTS_ENABLED: "true" }).google,
    ).toBe(true);

    expect(
      authAvailability({
        ...base,
        AUTH_ACCOUNTS_ENABLED: "true",
        AUTH_BASE_URL: "https://example.com/path",
      }).ready,
    ).toBe(false);

    expect(
      authAvailability({
        ...base,
        AUTH_ACCOUNTS_ENABLED: "true",
        AUTH_SECRET: "short",
      }).ready,
    ).toBe(false);

    expect(
      authAvailability({ ...base, AUTH_ACCOUNTS_ENABLED: "true" }).email,
    ).toBe(false);

    expect(
      authAvailability({
        ...base,
        AUTH_ACCOUNTS_ENABLED: "true",
        RESEND_API_KEY: "re_synthetic",
      }).email,
    ).toBe(false);

    expect(
      authAvailability({
        ...base,
        AUTH_ACCOUNTS_ENABLED: "true",
        RESEND_API_KEY: "re_synthetic",
        EMAIL_FROM: "Tu Economía <acceso@auth.example.test>",
      }).email,
    ).toBe(true);
  });

  it("sends the access link through Resend in an email-only account flow", async () => {
    const db = new DatabaseSync(":memory:");
    db.exec(migration);
    const messages: { url: string; subject: string }[] = [];

    vi.stubGlobal("fetch", (async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      expect(String(input)).toBe("https://api.resend.com/emails");

      const body = JSON.parse(String(init?.body)) as {
        to: string[];
        subject: string;
        text: string;
      };

      expect(body.to).toEqual(["mail@example.test"]);
      messages.push({
        url: body.text.match(/https:\/\/\S+/)![0],
        subject: body.subject,
      });

      return Response.json({ id: "synthetic-message" });
    }) as typeof fetch);

    const auth = authFromEnv({
      DB: localD1(db),
      AUTH_ACCOUNTS_ENABLED: "true",
      AUTH_BASE_URL: origin,
      AUTH_SECRET: "synthetic-auth-secret-0000000000000000",
      RESEND_API_KEY: "re_synthetic",
      EMAIL_FROM: "Tu Economía <acceso@auth.example.test>",
    });

    expect(auth).not.toBeNull();

    const response = await auth!.handler(
      post("/api/auth/sign-in/magic-link", { email: "mail@example.test" }),
    );

    expect(response.status).toBe(200);
    expect(messages).toHaveLength(1);
    expect(messages[0].subject).toBe("Tu enlace de acceso a Tu Economía");

    expect(new URL(messages[0].url).pathname).toBe(
      "/api/auth/magic-link/verify",
    );

    const disabledGoogle = await auth!.handler(
      post("/api/auth/sign-in/social", { provider: "google" }),
    );

    expect(disabledGoogle.status).toBeGreaterThanOrEqual(400);
    db.close();
  });

  it("completes an explicit Google link and signs back in to the same email-link user", async ({
    onTestFinished,
  }) => {
    const db = new DatabaseSync(":memory:");
    onTestFinished(() => db.close());
    db.exec(migration);
    const sent: { email: string; url: string }[] = [];

    const auth = createAuth({
      database: localD1(db),
      baseURL: origin,
      secret: "synthetic-auth-secret-0000000000000000",
      google: {
        clientId: "synthetic-google-id",
        clientSecret: "synthetic-google-secret",
      },
      sendMagicLink: async (message) => {
        sent.push(message);
      },
    });

    const email = "explicit-link@example.test";

    expect(
      (await auth.handler(post("/api/auth/sign-in/magic-link", { email })))
        .status,
    ).toBe(200);

    const emailSignIn = await auth.handler(new Request(sent[0].url));
    const emailCookie = cookies(emailSignIn);

    const emailSession = await auth.api.getSession({
      headers: new Headers({ Cookie: emailCookie }),
    });

    expect(emailSession?.user.email).toBe(email);
    const userId = emailSession!.user.id;
    const userBefore = db.prepare('select * from "user"').get();
    expect(db.prepare('select * from "account"').all()).toEqual([]);

    const provider = mockGoogleCodeExchange(
      email,
      "synthetic-explicit-google-subject",
    );

    const linkedStart = await auth.handler(
      post(
        "/api/auth/link-social",
        { provider: "google", callbackURL: "/mi-economia?tab=usuario" },
        { Cookie: emailCookie },
      ),
    );

    const linked = await completeGoogleCallback(auth, linkedStart, emailCookie);
    expect(linked.callback.status).toBe(302);
    expect(linked.callback.headers.get("location")).toBe(
      "/mi-economia?tab=usuario",
    );
    expect(provider.exchanges).toHaveLength(1);
    expectGoogleExchange(provider.exchanges[0], linked.authorization);
    expect(db.prepare('select * from "user"').all()).toEqual([userBefore]);

    expect(
      db
        .prepare('select "providerId", "accountId", "userId" from "account"')
        .all(),
    ).toEqual([
      {
        providerId: "google",
        accountId: "synthetic-explicit-google-subject",
        userId,
      },
    ]);

    expect(
      (
        await auth.api.getSession({
          headers: new Headers({ Cookie: emailCookie }),
        })
      )?.user.id,
    ).toBe(userId);

    expect(
      (
        await auth.handler(
          post("/api/auth/sign-out", {}, { Cookie: emailCookie }),
        )
      ).status,
    ).toBe(200);

    expect(
      await auth.api.getSession({
        headers: new Headers({ Cookie: emailCookie }),
      }),
    ).toBeNull();

    const googleStart = await auth.handler(
      post("/api/auth/sign-in/social", {
        provider: "google",
        callbackURL: "/mi-economia?tab=usuario",
      }),
    );

    const signedIn = await completeGoogleCallback(auth, googleStart);
    expect(signedIn.callback.status).toBe(302);
    expect(signedIn.callback.headers.get("location")).toBe(
      "/mi-economia?tab=usuario",
    );
    expect(provider.exchanges).toHaveLength(2);
    expectGoogleExchange(provider.exchanges[1], signedIn.authorization);
    expect(provider.providerFetch).toHaveBeenCalledTimes(2);
    const googleCookie = cookies(signedIn.callback);
    expect(googleCookie).toContain("better-auth.session_token=");

    const googleSession = await auth.api.getSession({
      headers: new Headers({ Cookie: googleCookie }),
    });

    expect(googleSession?.user.id).toBe(userId);
    expect(googleSession?.user.email).toBe(email);

    expect(db.prepare('select "id" from "user"').all()).toEqual([
      { id: userId },
    ]);

    expect(db.prepare('select "userId" from "account"').all()).toEqual([
      { userId },
    ]);

    expect(db.prepare('select "userId" from "session"').all()).toEqual([
      { userId },
    ]);
  });

  it("rejects a completed Google sign-in with an email matching an unlinked email-link account", async ({
    onTestFinished,
  }) => {
    const db = new DatabaseSync(":memory:");
    onTestFinished(() => db.close());
    db.exec(migration);
    const sent: { email: string; url: string }[] = [];

    const auth = createAuth({
      database: localD1(db),
      baseURL: origin,
      secret: "synthetic-auth-secret-0000000000000000",
      google: {
        clientId: "synthetic-google-id",
        clientSecret: "synthetic-google-secret",
      },
      sendMagicLink: async (message) => {
        sent.push(message);
      },
    });

    const email = "unlinked-match@example.test";

    expect(
      (await auth.handler(post("/api/auth/sign-in/magic-link", { email })))
        .status,
    ).toBe(200);

    const emailSignIn = await auth.handler(new Request(sent[0].url));
    const emailCookie = cookies(emailSignIn);

    const emailSession = await auth.api.getSession({
      headers: new Headers({ Cookie: emailCookie }),
    });

    expect(emailSession?.user.email).toBe(email);
    expect(emailSession?.user.emailVerified).toBe(true);
    const usersBefore = db.prepare('select * from "user"').all();
    const sessionsBefore = db.prepare('select * from "session"').all();

    const provider = mockGoogleCodeExchange(
      email,
      "synthetic-unlinked-google-subject",
    );

    // Start anonymously: a matching verified provider email is not an explicit linking request.
    const googleStart = await auth.handler(
      post("/api/auth/sign-in/social", {
        provider: "google",
        callbackURL: "/mi-economia?tab=usuario",
        errorCallbackURL: "/mi-economia?tab=usuario&source=google",
      }),
    );

    const { callback, authorization } = await completeGoogleCallback(
      auth,
      googleStart,
    );

    expect(callback.status).toBe(302);
    const location = new URL(callback.headers.get("location")!, origin);
    expect(location.pathname).toBe("/mi-economia");
    expect(location.searchParams.get("source")).toBe("google");
    expect(location.searchParams.get("error")).toBe("account_not_linked");
    expect(provider.exchanges).toHaveLength(1);
    expectGoogleExchange(provider.exchanges[0], authorization);
    expect(provider.providerFetch).toHaveBeenCalledTimes(1);
    expect(cookies(callback)).not.toContain("better-auth.session_token=");

    expect(
      await auth.api.getSession({
        headers: new Headers({ Cookie: cookies(callback) }),
      }),
    ).toBeNull();

    expect(db.prepare('select * from "user"').all()).toEqual(usersBefore);
    expect(db.prepare('select * from "account"').all()).toEqual([]);
    expect(db.prepare('select * from "session"').all()).toEqual(sessionsBefore);

    expect(
      (
        await auth.api.getSession({
          headers: new Headers({ Cookie: emailCookie }),
        })
      )?.user.id,
    ).toBe(emailSession!.user.id);
  });

  it("uses one database session, consumes an email link once, and revokes it on sign-out", async () => {
    const db = new DatabaseSync(":memory:");
    db.exec(migration);
    const sent: { email: string; url: string }[] = [];

    const auth = createAuth({
      database: localD1(db),
      baseURL: origin,
      secret: "synthetic-auth-secret-0000000000000000",
      google: {
        clientId: "synthetic-google-id",
        clientSecret: "synthetic-google-secret",
      },
      sendMagicLink: async (message) => {
        sent.push(message);
      },
    });

    expect(auth.options.account?.accountLinking?.disableImplicitLinking).toBe(
      true,
    );

    expect(auth.options.session?.expiresIn).toBe(60 * 60 * 24 * 7);
    expect(auth.options.session?.updateAge).toBe(60 * 60 * 24);
    expect(auth.options.session?.cookieCache?.enabled).toBe(false);

    const anonymousLink = await auth.handler(
      post("/api/auth/link-social", { provider: "google" }),
    );

    expect(anonymousLink.status).toBe(401);

    const googleStart = await auth.handler(
      post("/api/auth/sign-in/social", {
        provider: "google",
        callbackURL: "/mi-economia?tab=usuario",
      }),
    );

    expect(googleStart.status).toBe(200);

    expect(((await googleStart.json()) as { url: string }).url).toContain(
      "accounts.google.com",
    );

    const anonymous = await auth.api.getSession({ headers: new Headers() });
    expect(anonymous).toBeNull();

    const blocked = await auth.handler(
      post(
        "/api/auth/sign-in/magic-link",
        { email: "demo@example.test" },
        { Origin: "https://other.example" },
      ),
    );

    expect(blocked.status).toBe(403);
    expect(sent).toHaveLength(0);

    const send = await auth.handler(
      post("/api/auth/sign-in/magic-link", {
        email: "demo@example.test",
        callbackURL: "/mi-economia?tab=usuario",
      }),
    );

    expect(send.status).toBe(200);
    expect(sent).toHaveLength(1);
    expect(sent[0].email).toBe("demo@example.test");

    const link = new URL(sent[0].url);

    expect(
      db.prepare("select identifier from verification").get()?.identifier,
    ).not.toContain(link.searchParams.get("token"));

    const consumed = await auth.handler(new Request(link));
    expect(consumed.status).toBe(302);
    const cookie = consumed.headers.get("set-cookie");
    expect(cookie).toContain("better-auth.session_token");
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Secure/i);
    const tokenCookie = cookie?.split(";")[0] ?? "";

    const session = await auth.api.getSession({
      headers: new Headers({ Cookie: tokenCookie }),
    });

    expect(session?.user.email).toBe("demo@example.test");

    const linkedStart = await auth.handler(
      post(
        "/api/auth/link-social",
        { provider: "google", callbackURL: "/mi-economia?tab=usuario" },
        { Cookie: tokenCookie },
      ),
    );

    expect(linkedStart.status).toBe(200);

    expect(((await linkedStart.json()) as { url: string }).url).toContain(
      "accounts.google.com",
    );

    const replay = await auth.handler(new Request(link));

    expect(replay.headers.get("set-cookie") ?? "").not.toContain(
      "better-auth.session_token=",
    );

    const sendExpired = await auth.handler(
      post("/api/auth/sign-in/magic-link", { email: "expired@example.test" }),
    );

    expect(sendExpired.status).toBe(200);
    db.prepare('update verification set "expiresAt" = 0').run();
    const expired = await auth.handler(new Request(sent[1].url));

    expect(expired.headers.get("set-cookie") ?? "").not.toContain(
      "better-auth.session_token=",
    );

    const blockedSignOut = await auth.handler(
      post(
        "/api/auth/sign-out",
        {},
        { Cookie: tokenCookie, Origin: "https://other.example" },
      ),
    );

    expect(blockedSignOut.status).toBe(403);

    expect(
      await auth.api.getSession({
        headers: new Headers({ Cookie: tokenCookie }),
      }),
    ).not.toBeNull();

    const signOut = await auth.handler(
      post("/api/auth/sign-out", {}, { Cookie: tokenCookie }),
    );

    expect(signOut.status).toBe(200);

    expect(
      await auth.api.getSession({
        headers: new Headers({ Cookie: tokenCookie }),
      }),
    ).toBeNull();

    db.close();
  });
});
