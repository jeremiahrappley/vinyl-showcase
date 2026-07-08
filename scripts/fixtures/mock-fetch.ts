// A fetch-shaped function that serves the fixtures in data.ts, so sync.ts
// and images.ts can run their real code paths end-to-end without a live
// Discogs token. Deterministic per URL: repeated calls to the same image
// URL return byte-identical images, which is what lets images.ts's
// sha256 dedupe be verified against the reissue pair (123005/123006) that
// intentionally shares a cover URL.

import sharp from "sharp";
import { FIXTURE_COLLECTION, FIXTURE_MARKETPLACE_STATS, FIXTURE_RELEASES, FIXTURE_WANTLIST } from "./data.ts";

const PAGE_SIZE_DEFAULT = 100;

function jsonResponse(body: unknown, remaining = 59): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json", "X-Discogs-Ratelimit-Remaining": String(remaining) },
  });
}

function paginate<T>(items: T[], page: number, perPage: number) {
  const pages = Math.max(1, Math.ceil(items.length / perPage));
  const start = (page - 1) * perPage;
  return {
    pageItems: items.slice(start, start + perPage),
    pagination: { page, pages, per_page: perPage, items: items.length },
  };
}

/** Deterministic small solid-colour PNG, seeded by the URL string, so the
 * same fixture cover URL always produces identical bytes. */
async function syntheticImage(url: string): Promise<ArrayBuffer> {
  let hash = 0;
  for (const ch of url) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const r = hash & 0xff;
  const g = (hash >> 8) & 0xff;
  const b = (hash >> 16) & 0xff;
  const buf = await sharp({
    create: { width: 240, height: 240, channels: 3, background: { r, g, b } },
  })
    .png()
    .toBuffer();
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

export function createMockFetch(): typeof fetch {
  return (async (input: string | URL, _init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input.toString());

    if (url.hostname === "i.discogs.com") {
      const bytes = await syntheticImage(url.toString());
      return new Response(bytes, {
        status: 200,
        headers: { "content-type": "image/png", "X-Discogs-Ratelimit-Remaining": "59" },
      });
    }

    const page = Number(url.searchParams.get("page") ?? "1");
    const perPage = Number(url.searchParams.get("per_page") ?? PAGE_SIZE_DEFAULT);

    const collectionMatch = url.pathname.match(/^\/users\/[^/]+\/collection\/folders\/0\/releases$/);
    if (collectionMatch) {
      // Real Discogs honors sort=added&sort_order=desc; iterateCollection's
      // incremental early-stop depends on newest-first order, so the mock
      // must sort the same way rather than serving fixture insertion order.
      const sorted = [...FIXTURE_COLLECTION].sort(
        (a, b) => new Date(b.date_added).getTime() - new Date(a.date_added).getTime(),
      );
      const { pageItems, pagination } = paginate(sorted, page, perPage);
      return jsonResponse({ pagination, releases: pageItems });
    }

    const wantsMatch = url.pathname.match(/^\/users\/[^/]+\/wants$/);
    if (wantsMatch) {
      const { pageItems, pagination } = paginate(FIXTURE_WANTLIST, page, perPage);
      return jsonResponse({ pagination, wants: pageItems });
    }

    const releaseMatch = url.pathname.match(/^\/releases\/(\d+)$/);
    if (releaseMatch) {
      const id = Number(releaseMatch[1]);
      const release = FIXTURE_RELEASES[id];
      if (!release) return new Response("not found", { status: 404 });
      return jsonResponse(release);
    }

    const statsMatch = url.pathname.match(/^\/marketplace\/stats\/(\d+)$/);
    if (statsMatch) {
      const id = Number(statsMatch[1]);
      const stats = FIXTURE_MARKETPLACE_STATS[id];
      if (!stats) return new Response("not found", { status: 404 });
      return jsonResponse(stats);
    }

    return new Response(`mock-fetch: no fixture route for ${url}`, { status: 404 });
  }) as typeof fetch;
}
