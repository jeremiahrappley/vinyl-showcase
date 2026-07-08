// Weekly marketplace stats (ARCHITECTURE.md §6), run on a separate schedule
// from sync.ts/images.ts. Appends to data/valuations.jsonl — never
// overwrites — so this becomes a genuine time series instead of a single
// snapshot. One request per owned release; well within budget even weekly.
//
// Run for real:  npm run valuations
// Run against fixtures, no token needed:  npm run valuations -- --mock

import "dotenv/config";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { buildClient, isMockRun } from "./lib/env.ts";

const ROOT = path.resolve(import.meta.dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const COLLECTION_PATH = path.join(DATA_DIR, "collection.json");
const VALUATIONS_PATH = path.join(DATA_DIR, "valuations.jsonl");

interface CollectionState {
  instances: Record<string, { releaseId: number }>;
}

interface ValuationRecord {
  date: string;
  releaseId: number;
  lowestPrice: number | null;
  currency: string;
  numForSale: number;
}

async function main() {
  const mock = isMockRun();
  const client = buildClient(mock);

  await mkdir(DATA_DIR, { recursive: true });

  let collection: CollectionState;
  try {
    collection = JSON.parse(await readFile(COLLECTION_PATH, "utf-8"));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error("No data/collection.json yet — run `npm run sync` first.");
    }
    throw err;
  }

  const releaseIds = new Set(Object.values(collection.instances).map((i) => i.releaseId));
  const date = new Date().toISOString().slice(0, 10);
  console.log(`Fetching marketplace stats for ${releaseIds.size} release(s), dated ${date}...`);

  const lines: string[] = [];
  for (const releaseId of releaseIds) {
    const stats = await client.getMarketplaceStats(releaseId);
    const record: ValuationRecord = {
      date,
      releaseId,
      lowestPrice: stats.lowest_price?.value ?? null,
      currency: stats.lowest_price?.currency ?? "USD",
      numForSale: stats.num_for_sale,
    };
    lines.push(JSON.stringify(record));
  }

  await appendFile(VALUATIONS_PATH, lines.map((l) => l + "\n").join(""), "utf-8");
  console.log(`Appended ${lines.length} valuation record(s) to data/valuations.jsonl.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
