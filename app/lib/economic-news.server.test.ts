import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const IPROFESIONAL_URL = "https://www.iprofesional.com/rss/economia";
const CLARIN_URL = "https://www.clarin.com/rss/economia/";

const PAGINA_12_URL =
  "https://www.pagina12.com.ar/arc/outboundfeeds/rss/secciones/economia/notas";

function xmlResponse(xml: string, status = 200, headers?: HeadersInit) {
  return new Response(xml, {
    status,
    headers: { "content-type": "application/rss+xml", ...headers },
  });
}

function feed(items: string[]) {
  return `<?xml version="1.0" encoding="UTF-8"?>
    <rss version="2.0"><channel>${items.join("")}</channel></rss>`;
}

function item({
  title = "Una noticia económica",
  link = "https://example.com/noticia",
  date = "2026-02-03T15:00:00Z",
  description,
}: {
  title?: string;
  link?: string;
  date?: string;
  description?: string;
} = {}) {
  return `<item><title><![CDATA[${title}]]></title><link>${link}</link><pubDate>${date}</pubDate>${description ? `<description><![CDATA[${description}]]></description>` : ""}</item>`;
}

function fetchForFeeds(overrides: Partial<Record<string, Response>> = {}) {
  return vi.fn(async (input: string | URL) => {
    const url = String(input);
    if (overrides[url]) return overrides[url].clone();

    return xmlResponse(feed([item({ link: `${url}/story` })]));
  });
}

async function loadModule() {
  return import("~/lib/economic-news.server");
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-02-03T16:00:00Z"));
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("economic news feeds", () => {
  it("normalizes RSS items and derives a short plain-text feed summary", async () => {
    const { NEWS_SOURCES, parseEconomicFeed } = await loadModule();

    const longSummary =
      "<p>El d&oacute;lar avanzó &amp; el mercado cerró con calma.</p> ".repeat(
        8,
      );

    const items = parseEconomicFeed(
      NEWS_SOURCES[0],
      feed([
        item({
          title: "<strong>Mercados</strong> hoy",
          link: "https://example.com/mercados",
          description: longSummary,
        }),
      ]),
    );

    expect(items).toEqual([
      expect.objectContaining({
        headline: "Mercados hoy",
        source: "iProfesional",
        publishedAt: "2026-02-03T15:00:00.000Z",
        link: "https://example.com/mercados",
      }),
    ]);

    expect(items[0].summary).toMatch(
      /^El dólar avanzó & el mercado cerró con calma\./,
    );

    expect(items[0].summary).not.toMatch(/<|&amp;/);
    expect(items[0].summary!.length).toBeLessThanOrEqual(200);
  });

  it("drops malformed feed entries at the boundary", async () => {
    const { NEWS_SOURCES, parseEconomicFeed } = await loadModule();

    const items = parseEconomicFeed(
      NEWS_SOURCES[1],
      feed([
        item({ link: "not a URL" }),
        item({ link: "javascript:alert(1)" }),
        "<item><title>Sin enlace</title><pubDate>2026-02-03T15:00:00Z</pubDate></item>",
        "<item><title>Sin fecha</title><link>https://example.com/sin-fecha</link></item>",
      ]),
    );

    expect(items).toEqual([]);
  });

  it("accepts Atom entries with link attributes and a summary", async () => {
    const { NEWS_SOURCES, parseEconomicFeed } = await loadModule();

    const items = parseEconomicFeed(
      NEWS_SOURCES[0],
      `<feed><entry><title>Actividad económica</title><link href="https://example.com/actividad"/><published>2026-02-03T15:00:00Z</published><summary>Un dato nuevo.</summary></entry></feed>`,
    );

    expect(items).toEqual([
      expect.objectContaining({
        headline: "Actividad económica",
        link: "https://example.com/actividad",
        summary: "Un dato nuevo.",
      }),
    ]);
  });

  it("orders newest-first and deduplicates a story shared by publishers", async () => {
    const fetch = fetchForFeeds({
      [IPROFESIONAL_URL]: xmlResponse(
        feed([
          item({
            link: "https://example.com/shared",
            date: "2026-02-03T13:00:00Z",
          }),
          item({
            link: "https://example.com/older",
            date: "2026-02-03T10:00:00Z",
          }),
        ]),
      ),
      [CLARIN_URL]: xmlResponse(
        feed([
          item({
            link: "https://example.com/newest",
            date: "2026-02-03T14:00:00Z",
          }),
        ]),
      ),
      [PAGINA_12_URL]: xmlResponse(
        feed([
          item({
            link: "https://example.com/shared",
            date: "2026-02-03T12:00:00Z",
          }),
        ]),
      ),
    });

    vi.stubGlobal("fetch", fetch);
    const { getEconomicNews } = await loadModule();

    const result = await getEconomicNews();

    expect(result.items.map((entry) => entry.link)).toEqual([
      "https://example.com/newest",
      "https://example.com/shared",
      "https://example.com/older",
    ]);

    expect(result.unavailableSources).toEqual([]);
  });

  it("caches each source independently and shares concurrent work", async () => {
    const fetch = fetchForFeeds();
    vi.stubGlobal("fetch", fetch);
    const { getEconomicNews } = await loadModule();

    await Promise.all([getEconomicNews(), getEconomicNews()]);
    expect(fetch).toHaveBeenCalledTimes(3);

    await getEconomicNews();
    expect(fetch).toHaveBeenCalledTimes(3);

    vi.advanceTimersByTime(5 * 60_000 + 1);
    await getEconomicNews();
    expect(fetch).toHaveBeenCalledTimes(6);
  });

  it("keeps per-publisher successful fetch times when later reads use cached feeds", async () => {
    vi.stubGlobal("fetch", fetchForFeeds());
    const { getEconomicNews, getNewsSourceHealth } = await loadModule();

    await getEconomicNews();

    expect(getNewsSourceHealth()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "clarin",
          status: "fetched",
          lastSuccessfulFetchAt: "2026-02-03T16:00:00.000Z",
          lastFailureAt: null,
        }),
      ]),
    );

    await getEconomicNews();

    expect(getNewsSourceHealth()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "clarin",
          status: "cached",
          lastSuccessfulFetchAt: "2026-02-03T16:00:00.000Z",
        }),
      ]),
    );
  });

  it("keeps other feeds when one source fails and retries its rejected cache entry", async () => {
    const fetch = fetchForFeeds();

    fetch.mockImplementation(async (input: string | URL) => {
      if (String(input) === CLARIN_URL) throw new Error("temporary outage");

      return xmlResponse(feed([item({ link: `${input}/story` })]));
    });

    vi.stubGlobal("fetch", fetch);
    const { getEconomicNews } = await loadModule();

    const first = await getEconomicNews();
    expect(first.items).toHaveLength(2);
    expect(first.unavailableSources).toEqual(["clarin"]);

    // Inside the failure backoff the failing feed is not requested again.
    await getEconomicNews();

    expect(
      fetch.mock.calls.filter(([url]) => String(url) === CLARIN_URL),
    ).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(5_000);
    await getEconomicNews();

    expect(
      fetch.mock.calls.filter(([url]) => String(url) === CLARIN_URL),
    ).toHaveLength(2);

    expect(
      fetch.mock.calls.filter(([url]) => String(url) === IPROFESIONAL_URL),
    ).toHaveLength(1);

    expect(
      fetch.mock.calls.filter(([url]) => String(url) === PAGINA_12_URL),
    ).toHaveLength(1);

    expect((await loadModule()).getNewsSourceHealth()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "clarin",
          status: "failed",
          lastSuccessfulFetchAt: null,
          lastFailureAt: "2026-02-03T16:00:05.000Z",
        }),
      ]),
    );
  });

  it("reports a non-feed response as unavailable without hiding other sources", async () => {
    vi.stubGlobal(
      "fetch",
      fetchForFeeds({
        [CLARIN_URL]: xmlResponse("<html><body>Error</body></html>"),
      }),
    );

    const { getEconomicNews } = await loadModule();

    const result = await getEconomicNews();

    expect(result.items).toHaveLength(2);
    expect(result.unavailableSources).toEqual(["clarin"]);
  });

  it("accepts a valid feed with no stories", async () => {
    const { NEWS_SOURCES, parseEconomicFeed } = await loadModule();

    expect(parseEconomicFeed(NEWS_SOURCES[0], "<rss><channel/></rss>")).toEqual(
      [],
    );
  });

  it("treats a response beyond the size limit as an unavailable source", async () => {
    const fetch = fetchForFeeds({
      [PAGINA_12_URL]: xmlResponse("too large", 200, {
        "content-length": "2097153",
      }),
    });

    vi.stubGlobal("fetch", fetch);
    const { getEconomicNews } = await loadModule();

    await expect(getEconomicNews()).resolves.toMatchObject({
      unavailableSources: ["pagina-12"],
    });
  });

  it("bounds a feed stream even without a content-length header", async () => {
    vi.stubGlobal(
      "fetch",
      fetchForFeeds({
        [PAGINA_12_URL]: xmlResponse("x".repeat(2 * 1024 * 1024 + 1)),
      }),
    );

    const { getEconomicNews } = await loadModule();

    const result = await getEconomicNews();

    expect(result.items).toHaveLength(2);
    expect(result.unavailableSources).toEqual(["pagina-12"]);
  });
});
