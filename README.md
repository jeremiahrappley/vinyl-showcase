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

Deployed via GitHub Pages: `.github/workflows/deploy.yml` builds the Astro
site and publishes `dist/` on every push to `main` (including the commits
`sync.yml` makes), so new data goes live automatically. One-time setup:

1. In the repo's **Settings → Pages**, set **Source** to **GitHub Actions**.
2. Point DNS for `vinyl.jrappley.com` at GitHub Pages — add a `CNAME` record
   at your DNS provider: `vinyl` → `jeremiahrappley.github.io`. (The
   `public/CNAME` file in this repo tells GitHub Pages which domain to
   serve; `astro.config.mjs`'s `site` is already set to
   `https://vinyl.jrappley.com`.)
3. Back in **Settings → Pages**, once DNS resolves, check **Enforce HTTPS**.

Repo-size caveat: GitHub soft-caps repos around 1–5GB and Pages sites
around 1GB published. The architecture doc estimates ~400MB of AVIF covers
for a 1,000-record collection — comfortable for now, but if the collection
grows a lot, moving `public/covers/` to R2/S3 (per the doc's "when it gets
uncomfortable" note) becomes worth it sooner on Pages than it would on
Cloudflare Pages or Vercel.

Alternative: point Cloudflare Pages or Vercel at this repo instead (build
command `npm run build`, output directory `dist`) — same auto-rebuild-on-push
behavior, without the repo-size ceiling.
