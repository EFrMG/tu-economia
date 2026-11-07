import { renderToReadableStream } from "react-dom/server";
import { isbot } from "isbot";
import { ServerRouter, type EntryContext } from "react-router";

/** Allow streamed loaders to finish their own 8-second upstream timeouts. */
export const streamTimeout = 20_000;

export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
) {
  let shellRendered = false;

  const body = await renderToReadableStream(
    <ServerRouter context={routerContext} url={request.url} />,
    {
      onError(error: unknown) {
        if (shellRendered) console.error(error);

        responseStatusCode = 500;
      },
    },
  );

  shellRendered = true;

  const userAgent = request.headers.get("user-agent");
  if ((userAgent && isbot(userAgent)) || routerContext.isSpaMode)
    await body.allReady;

  responseHeaders.set("Content-Type", "text/html");
  responseHeaders.set("X-Content-Type-Options", "nosniff");
  responseHeaders.set("Referrer-Policy", "strict-origin-when-cross-origin");
  responseHeaders.set("X-Frame-Options", "DENY");
  responseHeaders.set(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
  );
  responseHeaders.set(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains",
  );
  responseHeaders.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=()",
  );

  return new Response(body, {
    status: responseStatusCode,
    headers: responseHeaders,
  });
}
