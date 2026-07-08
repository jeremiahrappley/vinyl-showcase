# Vinyl Showcase — Personal Edition

**Architecture v3 · single-user, self-hosted**

## 1. The shape of it

```
┌─────────────────────────────────────────┐
│  GitHub Actions (nightly cron + manual) │
│                                         │
│   sync.ts ──► Discogs API (PAT auth)    │
│      │        60 req/min, all yours     │
│      ├──► data/collection.json          │
│      ├──► data/releases/{id}.json       │
│      └──► public/covers/{sha}.avif      │
│                     │                   │
│              commit + push              │
└─────────────────────┬───────────────────┘
                      │
              ┌───────▼────────┐
              │  Static build   │   Astro / Next SSG
              │  → HTML + AVIF  │
              └───────┬─────────┘
                      │
              ┌───────▼─────────────────┐
              │ Cloudflare Pages / Vercel│
              │ vinyl.yourdomain.com     │
              └──────────────────────────┘
```

Visitors hit static HTML and CDN-cached images. Discogs is never in the critical
path. No database. No server.

**The one design rule:** the sync script and the site are separate concerns that
communicate through a JSON directory on disk. You can nuke `data/` and rebuild it
from Discogs in half an hour.

## 2. Auth

```bash
# .env — never committed; GitHub Actions secret in CI
DISCOGS_TOKEN=your_personal_access_token
DISCOGS_USERNAME=your_username
DISCOGS_UA="VinylShowcase/1.0 +https://vinyl.yourdomain.com"
```

Personal access token from `discogs.com/settings/developers`. Sent as
`Authorization: Discogs token=<token>`. This authenticates as a *user*, which
key+secret does not — so it unlocks private collection fields and image fetching.
That's the whole auth story. No OAuth.

The unique User-Agent matters: Discogs throttles generic UAs more aggressively
than the documented limit.

## 3. Rate limiter

No Redis. No distributed token bucket. A serialized in-process queue that reads
the response headers:

```ts
// lib/discogs.ts
let remaining = 60;

async function call(path: string): Promise<Response> {
  if (remaining < 5) await sleep(60_000);   // 60s moving average window
  await sleep(1100);                        // ~55/min, naive but bulletproof

  const res = await fetch(`https://api.discogs.com${path}`, {
    headers: {
      Authorization: `Discogs token=${process.env.DISCOGS_TOKEN}`,
      "User-Agent": process.env.DISCOGS_UA,
    },
  });

  remaining = Number(res.headers.get("X-Discogs-Ratelimit-Remaining") ?? remaining);

  if (res.status === 429) {
    await sleep(60_000);
    return call(path);                      // cap retries at 3
  }
  return res;
}
```

A flat 1.1s sleep between calls is fine. This is a cron job, not a user-facing
request. Resist optimizing it.

**Budget for a 1,000-record collection:**

| Operation | Requests | Wall clock |
|---|---|---|
| Collection index (`per_page=100`) | 10 | 11s |
| Full enrichment, all releases | 1,000 | ~19 min |
| Wantlist | ~2 | 2s |
| Marketplace stats, all releases | 1,000 | ~19 min |

Full cold rebuild: under an hour, once. Nightly incremental: seconds. This is why
the personal version can enrich **every** release eagerly — no lazy loading, no
on-demand fetch, no nullable `detail_fetched_at`.

## 4. Sync script

```
scripts/sync.ts
  1. GET /users/{u}/collection/folders/0/releases
       ?per_page=100&sort=added&sort_order=desc
     → paginate; each item has instance_id, release_id, date_added,
       and basic_information (title, artists, labels, formats, year,
       genres, styles, cover_image, thumb)

  2. For each release_id not in data/releases/:
       GET /releases/{id}  → tracklist, credits, images[], notes
       write data/releases/{id}.json (raw payload, untouched)

  3. For each image URL not in data/images.json:
       fetch (authenticated!), sha256 the bytes,
       write public/covers/{sha}.{avif,webp}, generate blurhash
       → dedupe: same pressing = same file

  4. GET /users/{u}/wants → data/wantlist.json

  5. Reconcile: any instance_id in local index but not upstream → delete

  6. Weekly only: GET /marketplace/stats/{release_id} for each release
       → append to data/valuations.jsonl (timeseries, never overwrite)
```

**Incremental mode:** sorted by `added` desc, stop paginating as soon as you hit a
`date_added` older than the last sync timestamp. Removals won't surface that way,
so run step 5 fully every time — it's a set-difference on data you already have,
zero API cost.

**Key detail:** `instance_id`, not `release_id`, is the primary key for owned
copies. You can own three copies of the same pressing; Discogs models them as
three instances.

**Store raw payloads verbatim.** You will restructure your view model repeatedly,
and re-crawling to do it wastes an evening.

## 5. Images

Image requests require authentication and count against the rate limit, so you
cannot hotlink from the browser. At build time this is trivial — fetch once,
transform, commit.

- Fetch original → `sha256` → `public/covers/{sha}/`
- Emit `hero` (1400px), `grid` (600px), `thumb` (200px), each AVIF + WebP with a
  JPEG fallback
- Generate a blurhash or 20px LQIP, store alongside the record → skeleton loading
  with no layout shift
- Dedupe by hash. A collection with a lot of reissues will share files.

Sharp handles all of this in the sync script. Astro's `<Image>` picks up the
derivatives.

Colour-accurate pipeline: preserve embedded ICC profiles through the Sharp
transform rather than stripping to sRGB blindly. Extract a dominant-colour palette
per cover at build time — it makes for a striking shelf view where each record's
backdrop is drawn from its own sleeve.

Link every record back to its Discogs release page. Cover art is user-contributed;
attribution is the right instinct.

## 6. Valuation

Because you can spend 1,000 requests a week without consequence:

- **`/marketplace/stats/{release_id}`** → `lowest_price`, `num_for_sale`. Works
  with a personal token, no seller settings needed.
- **`/marketplace/price_suggestions/{release_id}`** → per-condition values, keyed
  to your copy's grade. Requires completed seller settings on your account; if
  you've never sold, it returns "You must fill out your seller settings first."
  Filling in seller settings is free and unlocks the better data.

Append to `data/valuations.jsonl` rather than overwriting. Six months of nightly
appends gives a genuine time series, and a collection-value-over-time chart that
no other Discogs frontend has, because nobody else keeps the history.

## 7. Repo layout

```
vinyl/
├─ .github/workflows/sync.yml      # cron: '0 7 * * *' + workflow_dispatch
├─ scripts/
│   ├─ sync.ts                     # the whole ingestion pipeline
│   ├─ images.ts                   # sharp transforms, blurhash, palette
│   └─ valuations.ts               # weekly, separate schedule
├─ data/                           # committed. this IS the database.
│   ├─ collection.json             # instance_id → release_id + your metadata
│   ├─ releases/{id}.json          # raw Discogs payloads
│   ├─ images.json                 # url → sha, dims, blurhash, palette
│   ├─ wantlist.json
│   └─ valuations.jsonl
├─ public/covers/{sha}/…
├─ src/
│   ├─ pages/
│   │   ├─ index.astro             # the grid
│   │   ├─ r/[instance].astro      # detail: tracklist, hi-res, value
│   │   ├─ shelf.astro             # spine view
│   │   ├─ stats.astro             # decades, genres, labels, value history
│   │   └─ wantlist.astro
│   └─ lib/view-model.ts           # raw JSON → what the templates want
└─ astro.config.mjs
```

Committing `data/` and `public/covers/` to git is legitimate at this scale — a
1,000-record collection is maybe 400MB of optimized AVIF, which git handles
adequately and Cloudflare Pages serves for free. If it gets uncomfortable, push
images to R2 and keep only the JSON in git.

## 8. Stack

**Astro**, not Next.js. Zero-JS by default, content-collection support that fits a
`data/` directory, first-class image optimization, and islands for the two things
that need interactivity (filter/sort, lightbox). Next's App Router is built for a
server you don't have.

If you'd rather stay in React: Next with `output: 'export'` gets the same static
result.

Client-side filter and sort over a 1,000-item JSON blob is instant and needs no
server. Above ~5,000 items, move to a prebuilt search index (Pagefind).

## 9. Build order

1. `sync.ts` against the real collection, writing JSON. Verify counts match
   Discogs. No UI.
2. Image pipeline. Verify a cover renders locally from `public/covers/`.
3. Ugly grid page. Confirm the whole loop: cron → data → build → deploy.
4. Then, and only then, design. Grid, shelf, detail, stats.
5. Valuations and the time-series chart, once there are a few weeks of history.

## 10. When to graduate

Add a server only when you want one of: on-demand refresh from the browser,
multiple people's collections, or write-back to Discogs. Until then every piece of
infrastructure you skip is one you don't maintain.

The migration path is intact — `data/*.json` maps cleanly onto a Postgres schema,
and the sync script becomes a worker job. Nothing here is a dead end.