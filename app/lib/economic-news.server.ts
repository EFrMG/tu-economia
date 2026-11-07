import { XMLParser } from "fast-xml-parser";
import { decode } from "html-entities";
import { z } from "zod";
import { createPromiseCache } from "~/lib/promise-cache.server";
import { withUpstreamTimeout } from "~/lib/upstream-timeout.server";

import {
  NEWS_SOURCES,
  type EconomicNews,
  type NewsItem,
  type NewsSource,
} from "~/lib/economic-news";

const FEED_TTL_MS = 5 * 60_000;
const NEWS_REQUEST_TIMEOUT_MS = 4_000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_SUMMARY_LENGTH = 200;

export { NEWS_SOURCES } from "~/lib/economic-news";
export type { EconomicNews, NewsItem, NewsSource } from "~/lib/economic-news";

export type NewsSourceHealthStatus =
  "not-checked" | "fetched" | "cached" | "failed";

export interface NewsSourceHealth {
  id: NewsSource["id"];
  name: string;
  url: string;
  status: NewsSourceHealthStatus;
  /** Time at which this server last received a valid feed from this publisher. */
  lastSuccessfulFetchAt: string | null;
  /** Time at which this server last failed to refresh this publisher's feed. */
  lastFailureAt: string | null;
}

const newsItemSchema = z.object({
  headline: z.string().min(1),
  source: z.string().min(1),
  publishedAt: z.string().datetime(),
  link: z
    .string()
    .url()
    .refine((value) => /^https?:\/\//i.test(value)),
  summary: z.string().min(1).max(MAX_SUMMARY_LENGTH).optional(),
});

const cache = createPromiseCache();

const sourceHealth = new Map<NewsSource["id"], NewsSourceHealth>(
  NEWS_SOURCES.map((source) => [
    source.id,
    {
      ...source,
      status: "not-checked" as const,
      lastSuccessfulFetchAt: null,
      lastFailureAt: null,
    },
  ]),
);

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  trimValues: true,
  htmlEntities: true,
});

async function readFeed(response: Response) {
  const contentLength = response.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_RESPONSE_BYTES) {
    void response.body?.cancel().catch(() => undefined);

    throw new Error("El feed excede el tamaño permitido.");
  }

  if (!response.body) throw new Error("El feed no incluyó contenido.");

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    size += value.byteLength;

    if (size > MAX_RESPONSE_BYTES) {
      void reader.cancel().catch(() => undefined);

      throw new Error("El feed excede el tamaño permitido.");
    }

    chunks.push(value);
  }

  if (chunks.length === 1) return new TextDecoder().decode(chunks[0]);

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder().decode(bytes);
}

async function fetchFeed(source: NewsSource) {
  return withUpstreamTimeout(NEWS_REQUEST_TIMEOUT_MS, async (signal) => {
    const response = await fetch(source.url, {
      headers: {
        accept:
          "application/rss+xml, application/atom+xml, application/xml, text/xml",
      },
      signal,
    });

    if (!response.ok)
      throw new Error(`${source.name} respondió con ${response.status}`);

    return readFeed(response);
  });
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : value === undefined ? [] : [value];
}

function textValue(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);

  if (value && typeof value === "object" && "#text" in value) {
    return textValue((value as Record<string, unknown>)["#text"]);
  }

  return undefined;
}

function linkValue(value: unknown): string | undefined {
  const text = textValue(value);
  if (text) return text;

  if (value && typeof value === "object") {
    const href = (value as Record<string, unknown>)["@_href"];
    return typeof href === "string" ? href : undefined;
  }

  return undefined;
}

function plainText(value: unknown) {
  const text = textValue(value);
  if (!text) return undefined;

  const decoded = decode(text);

  const withoutBlocks = decoded
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(
      /<(script|style|iframe|noscript|template|object|embed)\b[^>]*>[\s\S]*?<\/\1>/gi,
      " ",
    )
    .replace(
      /<(script|style|iframe|noscript|template|object|embed)\b[^>]*\/?>/gi,
      " ",
    );

  const plain = withoutBlocks
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return plain || undefined;
}

function truncateSummary(summary: string) {
  if (summary.length <= MAX_SUMMARY_LENGTH) return summary;

  // Reserve one character for the ellipsis so the stored summary stays within MAX_SUMMARY_LENGTH, and avoid cutting in the middle of a word when possible.
  const limit = MAX_SUMMARY_LENGTH - 1;
  let truncated = summary.slice(0, limit);
  const lastSpace = truncated.lastIndexOf(" ");
  if (lastSpace >= Math.floor(limit * 0.6)) {
    truncated = truncated.slice(0, lastSpace);
  }

  return `${truncated.trimEnd()}…`;
}

function summaryValue(record: Record<string, unknown>) {
  const candidates = [
    record.subtitle,
    record.summary,
    record.description,
    record["content:encoded"],
    record.content,
  ];

  for (const candidate of candidates) {
    const summary = plainText(candidate);
    if (summary) return truncateSummary(summary);
  }

  return undefined;
}

function itemFromRecord(
  source: NewsSource,
  value: unknown,
): NewsItem | undefined {
  if (!value || typeof value !== "object") return undefined;

  const record = value as Record<string, unknown>;
  const headline = plainText(record.title);
  const link = linkValue(record.link);

  const published = textValue(
    record.pubDate ?? record.published ?? record.updated ?? record.date,
  );

  const publishedAt = published ? new Date(published) : undefined;
  if (
    !headline ||
    !link ||
    !publishedAt ||
    Number.isNaN(publishedAt.getTime())
  ) {
    return undefined;
  }

  const result = newsItemSchema.safeParse({
    headline,
    source: source.name,
    publishedAt: publishedAt.toISOString(),
    link,
    summary: summaryValue(record),
  });

  return result.success ? result.data : undefined;
}

function recordsFromFeed(feed: unknown) {
  if (!feed || typeof feed !== "object") {
    throw new Error("El documento recibido no es un feed RSS o Atom.");
  }

  const root = feed as Record<string, unknown>;
  const rss = root.rss as Record<string, unknown> | undefined;
  const atom = root.feed as Record<string, unknown> | undefined;

  if (rss && typeof rss === "object" && "channel" in rss) {
    const channel = rss.channel as Record<string, unknown> | undefined;
    return asArray(channel?.item);
  }

  if (atom && typeof atom === "object") return asArray(atom.entry);

  throw new Error("El documento recibido no es un feed RSS o Atom.");
}

export function parseEconomicFeed(source: NewsSource, xml: string): NewsItem[] {
  const feed = parser.parse(xml);
  return recordsFromFeed(feed)
    .map((item) => itemFromRecord(source, item))
    .filter((item): item is NewsItem => item !== undefined);
}

async function loadSource(source: NewsSource) {
  const cachedResult = cache.isFresh(source.id);

  try {
    const items = await cache.get(source.id, FEED_TTL_MS, async () =>
      parseEconomicFeed(source, await fetchFeed(source)),
    );

    recordSuccess(source, cachedResult);

    return items;
  } catch (error) {
    recordFailure(source);

    throw error;
  }
}

function recordSuccess(source: NewsSource, cachedResult: boolean) {
  const previous = sourceHealth.get(source.id)!;

  sourceHealth.set(source.id, {
    ...previous,
    status: cachedResult ? "cached" : "fetched",
    lastSuccessfulFetchAt: cachedResult
      ? previous.lastSuccessfulFetchAt
      : new Date().toISOString(),
  });
}

function recordFailure(source: NewsSource) {
  const previous = sourceHealth.get(source.id)!;

  sourceHealth.set(source.id, {
    ...previous,
    status: "failed",
    lastFailureAt: new Date().toISOString(),
  });
}

/** A snapshot of this process's feed activity, not a real-time publisher monitor. */
export function getNewsSourceHealth(): NewsSourceHealth[] {
  return NEWS_SOURCES.map((source) => ({ ...sourceHealth.get(source.id)! }));
}

/** Fetches every publisher independently so one unavailable feed does not hide the others. */
export async function getEconomicNews(): Promise<EconomicNews> {
  const results = await Promise.allSettled(NEWS_SOURCES.map(loadSource));

  const items = results.flatMap((result) =>
    result.status === "fulfilled" ? result.value : [],
  );

  const unavailableSources = results.flatMap((result, index) =>
    result.status === "rejected" ? [NEWS_SOURCES[index].id] : [],
  );

  const seen = new Set<string>();
  return {
    items: items
      .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
      .filter((item) => {
        if (seen.has(item.link)) return false;

        seen.add(item.link);

        return true;
      }),
    unavailableSources,
  };
}
