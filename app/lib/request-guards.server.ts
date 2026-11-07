import { authFromEnv } from "~/lib/auth.server";

/** Every guard failure is thrown as a `Response`, so callers can let it propagate out of an action or handler. */
export const privateJSON = (
  body: unknown,
  status = 200,
  headers?: HeadersInit,
) =>
  Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store", ...headers },
  });

/** Same-origin only: the `Origin` header, the request URL and `Sec-Fetch-Site` must all agree with the app's base URL. */
export function requireOrigin(request: Request, baseURL: string) {
  if (
    request.headers.get("Origin") !== baseURL ||
    new URL(request.url).origin !== baseURL ||
    request.headers.get("Sec-Fetch-Site") === "cross-site"
  )
    throw privateJSON({ error: "Origin forbidden" }, 403);
}

/** Reads a JSON body of at most `maxBytes`, counting the bytes actually received rather than trusting `Content-Length`. */
export async function readLimitedJSON(
  request: Request,
  maxBytes: number,
): Promise<unknown> {
  if (
    request.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase() !==
    "application/json"
  )
    throw privateJSON({ error: "JSON required" }, 415);

  const length = request.headers.get("Content-Length");
  if (length && Number(length) > maxBytes)
    throw privateJSON({ error: "Request too large" }, 413);

  if (!request.body) throw privateJSON({ error: "Invalid JSON" }, 400);

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      size += value.byteLength;

      if (size > maxBytes) {
        await reader.cancel();

        throw privateJSON({ error: "Request too large" }, 413);
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw privateJSON({ error: "Invalid JSON" }, 400);
  }
}

/** User-facing Spanish copy added beside the technical `error` for the two authentication failures. */
export interface AuthenticationMessages {
  unavailable: string;
  unauthenticated: string;
}

export async function authenticated(
  request: Request,
  env: CloudflareEnvironment,
  messages?: AuthenticationMessages,
) {
  const auth = authFromEnv(env);
  if (!auth || !env.DB)
    throw privateJSON(
      {
        error: "Account access is unavailable",
        ...(messages && { message: messages.unavailable }),
      },
      503,
    );

  const session = await auth.api.getSession({ headers: request.headers });
  if (!session)
    throw privateJSON(
      {
        error: "Authentication required",
        ...(messages && { message: messages.unauthenticated }),
      },
      401,
    );

  return {
    db: env.DB,
    userId: session.user.id,
    baseURL: new URL(env.AUTH_BASE_URL!).origin,
  };
}
