// The whole ingestion pipeline (ARCHITECTURE.md §4), minus images (images.ts)
// and marketplace stats (valuations.ts, weekly/separate schedule).
//
// Run for real:  npm run sync
// Run against fixtures, no token needed:  npm run sync -- --mock

import "dotenv/config";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CollectionItem } from "./lib/discogs.ts";
import { buildClient, isMockRun } from "./lib/env.ts";

const ROOT = path.resolve(import.meta.dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const RELEASES_DIR = path.join(DATA_DIR, "releases");
const COLLECTION_PATH = path.join(DATA_DIR, "collection.json");
const WANTLIST_PATH = path.join(DATA_DIR, "wantlist.json");

interface CollectionState {
  syncedAt: string;
  count: number;
  instances: Record<
    string,
    { instanceId: number; releaseId: number; dateAdded: string; rating: number }
  >;
}

async function readJson<T>(filePath: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(filePath, "utf-8"));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw err;
  }
}

async function writeJson(filePath: string, data: unknown) {
  await writeFile(filePath, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

async function main() {
  const mock = isMockRun();
  const client = buildClient(mock);

  await mkdir(RELEASES_DIR, { recursive: true });

  // Step 1: full collection walk. Always fetched in full — it's ~10
  // requests / 11s for a 1,000-record collection (see ARCHITECTURE.md §3
  // budget table), and reconciliation (step 5) needs the complete current
  // instance_id set to detect removals, so there's no separate incremental
  // path here worth the correctness risk. The expensive part (per-release
  // enrichment, step 2) is what actually gets skipped incrementally.
  console.log(`Fetching collection for ${mock ? "fixture-user (mock)" : process.env.DISCOGS_USERNAME}...`);
  const upstream: CollectionItem[] = [];
  for await (const item of client.iterateCollection()) upstream.push(item);
  console.log(`  ${upstream.length} instances upstream`);

  // Step 2: enrich any release_id we haven't already stored. instance_id,
  // not release_id, is the primary key for owned copies (you can own
  // multiple pressings of the same release) — but release detail files are
  // keyed by release_id since the tracklist/credits/images are identical
  // across instances of the same release.
  const releaseIdsNeeded = new Set(upstream.map((item) => item.id));
  const existingReleaseFiles = new Set(
    (await readdir(RELEASES_DIR).catch(() => []))
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(/\.json$/, "")),
  );
  const toFetch = [...releaseIdsNeeded].filter((id) => !existingReleaseFiles.has(String(id)));
  console.log(`  ${toFetch.length} release(s) need enrichment (${releaseIdsNeeded.size - toFetch.length} already cached)`);

  for (const releaseId of toFetch) {
    const detail = await client.getRelease(releaseId);
    await writeJson(path.join(RELEASES_DIR, `${releaseId}.json`), detail);
  }

  // Step 4: wantlist, stored raw — cheap (~2 requests), always refetched in full.
  const wants = [];
  for await (const want of client.iterateWantlist()) wants.push(want);
  await writeJson(WANTLIST_PATH, wants);
  console.log(`  ${wants.length} wantlist item(s)`);

  // Step 5: reconcile. Any instance_id in local state but not upstream
  // means the copy was removed/sold on Discogs — drop it locally too.
  const previous = await readJson<CollectionState>(COLLECTION_PATH);
  const previousIds = new Set(Object.keys(previous?.instances ?? {}));
  const upstreamIds = new Set(upstream.map((item) => String(item.instance_id)));
  const removed = [...previousIds].filter((id) => !upstreamIds.has(id));
  if (removed.length > 0) {
    console.log(`  removing ${removed.length} instance(s) no longer in upstream collection: ${removed.join(", ")}`);
  }

  const nextState: CollectionState = {
    syncedAt: new Date().toISOString(),
    count: upstream.length,
    instances: Object.fromEntries(
      upstream.map((item) => [
        String(item.instance_id),
        { instanceId: item.instance_id, releaseId: item.id, dateAdded: item.date_added, rating: item.rating },
      ]),
    ),
  };
  await writeJson(COLLECTION_PATH, nextState);

  console.log(`Sync complete: ${nextState.count} instances, ${toFetch.length} newly enriched, ${removed.length} removed.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
