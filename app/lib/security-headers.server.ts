/**
 * Headers every response from the Worker should carry, including the JSON data routes whose responses never pass through `entry.server.tsx`.
 * `nosniff` stops a browser from guessing a different content type than the one declared, for instance reading JSON that echoes user text as HTML.
 * Pages set the full list in `entry.server.tsx`; this only adds what is missing.
 */
export function withBaselineHeaders(response: Response) {
  if (response.headers.has("X-Content-Type-Options")) return response;

  // A copy, because responses that come straight from `fetch()` have immutable headers.
  const secured = new Response(response.body, response);
  secured.headers.set("X-Content-Type-Options", "nosniff");

  return secured;
}
