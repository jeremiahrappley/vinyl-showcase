# Vinyl Showcase

Personal, single-user Discogs collection showcase. See [ARCHITECTURE.md](./ARCHITECTURE.md)
for the full design. Astro static site; `data/` and `public/covers/` are the
database, populated by scripts that talk to the Discogs API and committed to
git.

## Local setup

```sh
npm install
cp .env.example .env   # fill in DISCOGS_TOKEN, DISCOGS_USERNAME, DISCOGS_UA
```

Get a personal access token at [discogs.com/settings/developers](https://www.discogs.com/settings/developers).

## Running the pipeline

```sh
npm run sync         # collection index, per-release enrichment, wantlist, reconciliation
npm run images        # cover art -> AVIF/WebP/JPEG derivatives, blurhash, palette
npm run valuations    # marketplace stats -> data/valuations.jsonl (run weekly)
```

Every script also runs with `-- --mock`, which exercises the full pipeline
against hand-written fixtures in `scripts/fixtures/` — no token required.
Useful for developing the site itself without waiting on real API calls.

## Site

```sh
npm run dev      # http://localhost:4321
npm run build    # -> dist/
npm run astro check   # type-check
```

Pages: `/` (grid), `/shelf/` (spine view), `/r/{instanceId}/` (detail),
`/stats/`, `/wantlist/`.

## CI

`.github/workflows/sync.yml` runs `sync` + `images` nightly and `valuations`
weekly (or on manual dispatch), committing and pushing any changes to
`data/` and `public/covers/`. Set these as repository secrets:

- `DISCOGS_TOKEN`
- `DISCOGS_USERNAME`
- `DISCOGS_UA`

## Deploy

Point Cloudflare Pages or Vercel at this repo (build command `npm run
build`, output directory `dist`) — they rebuild automatically whenever the
sync workflow pushes new data.
