// Image pipeline (ARCHITECTURE.md §5): authenticated fetch → sha256 →
// public/covers/{sha}/ derivatives, blurhash, dominant-colour palette.
//
// Run for real:  npm run images
// Run against fixtures, no token needed:  npm run images -- --mock

import "dotenv/config";
import { createHash } from "node:crypto";
import { access, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { encode as encodeBlurhash } from "blurhash";
import type { ReleaseDetail } from "./lib/discogs.ts";
import { buildClient, isMockRun } from "./lib/env.ts";

const ROOT = path.resolve(import.meta.dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const RELEASES_DIR = path.join(DATA_DIR, "releases");
const COVERS_DIR = path.join(ROOT, "public", "covers");
const IMAGES_JSON_PATH = path.join(DATA_DIR, "images.json");

interface ImageRecord {
  sha: string;
  width: number;
  height: number;
  blurhash: string;
  palette: string[];
  placeholder: string;
}

type ImagesJson = Record<string, ImageRecord>;

const SIZES: { name: "hero" | "grid" | "thumb"; width: number }[] = [
  { name: "hero", width: 1400 },
  { name: "grid", width: 600 },
  { name: "thumb", width: 200 },
];

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

async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

function rgbToHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
}

/** Dominant colour plus a small swatch strip, deduped, as a lightweight
 * per-cover palette — enough for a shelf-view backdrop drawn from the
 * sleeve itself. */
async function extractPalette(buf: Buffer): Promise<string[]> {
  const { dominant } = await sharp(buf).stats();
  const { data, info } = await sharp(buf)
    .resize(4, 1, { fit: "cover" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const colors = [rgbToHex(dominant.r, dominant.g, dominant.b)];
  for (let i = 0; i < info.width; i++) {
    const idx = i * info.channels;
    colors.push(rgbToHex(data[idx], data[idx + 1], data[idx + 2]));
  }
  return [...new Set(colors)];
}

/** A tiny (24px-wide) low-quality JPEG, base64-inlined, for skeleton
 * loading with no layout shift and no client JS — the doc's "20px LQIP". */
async function generatePlaceholder(buf: Buffer): Promise<string> {
  const tiny = await sharp(buf).resize(24, 24, { fit: "inside" }).jpeg({ quality: 40 }).toBuffer();
  return `data:image/jpeg;base64,${tiny.toString("base64")}`;
}

async function computeBlurhash(buf: Buffer): Promise<string> {
  const { data, info } = await sharp(buf)
    .rotate()
    .resize(32, 32, { fit: "inside" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return encodeBlurhash(new Uint8ClampedArray(data), info.width, info.height, 4, 3);
}

/** Writes hero/grid/thumb × avif/webp/jpg into public/covers/{sha}/.
 * ICC profiles are preserved (withMetadata()) rather than blindly
 * converting everything to sRGB on the way out. */
async function writeDerivatives(buf: Buffer, dir: string) {
  await mkdir(dir, { recursive: true });
  await Promise.all(
    SIZES.flatMap(({ name, width }) => {
      const base = () => sharp(buf).rotate().resize({ width, withoutEnlargement: true }).withMetadata();
      return [
        base().avif({ quality: 50 }).toFile(path.join(dir, `${name}.avif`)),
        base().webp({ quality: 80 }).toFile(path.join(dir, `${name}.webp`)),
        base().jpeg({ quality: 82, mozjpeg: true }).toFile(path.join(dir, `${name}.jpg`)),
      ];
    }),
  );
}

function primaryImageUrl(release: ReleaseDetail): string | undefined {
  if (!release.images || release.images.length === 0) return undefined;
  return (release.images.find((img) => img.type === "primary") ?? release.images[0]).uri;
}

async function main() {
  const mock = isMockRun();
  const client = buildClient(mock);

  await mkdir(COVERS_DIR, { recursive: true });

  const releaseFiles = (await readdir(RELEASES_DIR).catch(() => [])).filter((f) => f.endsWith(".json"));
  const urls = new Set<string>();
  for (const file of releaseFiles) {
    const release = await readJson<ReleaseDetail>(path.join(RELEASES_DIR, file));
    const url = release && primaryImageUrl(release);
    if (url) urls.add(url);
  }

  // Wantlist cover art is also an authenticated i.discogs.com URL and can't
  // be hotlinked from the browser any more than owned-release covers can —
  // it goes through the same fetch → dedupe → derivative pipeline.
  const wants = (await readJson<{ basic_information: { cover_image?: string } }[]>(
    path.join(DATA_DIR, "wantlist.json"),
  )) ?? [];
  for (const want of wants) {
    if (want.basic_information.cover_image) urls.add(want.basic_information.cover_image);
  }

  console.log(`${urls.size} distinct cover URL(s) referenced across ${releaseFiles.length} release(s) + wantlist`);

  const images: ImagesJson = (await readJson<ImagesJson>(IMAGES_JSON_PATH)) ?? {};
  const knownShas = new Set(Object.values(images).map((r) => r.sha));

  let fetched = 0;
  let reusedByHash = 0;
  let alreadyKnown = 0;

  for (const url of urls) {
    if (images[url]) {
      alreadyKnown += 1;
      continue;
    }

    const bytes = Buffer.from(await client.fetchImageBytes(url));
    const sha = createHash("sha256").update(bytes).digest("hex");
    const dir = path.join(COVERS_DIR, sha);

    if (knownShas.has(sha) && (await pathExists(dir))) {
      // Same pressing/scan already processed under a different URL — reuse
      // the existing derivatives rather than regenerating them.
      reusedByHash += 1;
      const meta = await sharp(bytes).metadata();
      images[url] = {
        sha,
        width: meta.width ?? 0,
        height: meta.height ?? 0,
        blurhash: await computeBlurhash(bytes),
        palette: await extractPalette(bytes),
        placeholder: await generatePlaceholder(bytes),
      };
      continue;
    }

    const meta = await sharp(bytes).metadata();
    await writeDerivatives(bytes, dir);
    images[url] = {
      sha,
      width: meta.width ?? 0,
      height: meta.height ?? 0,
      blurhash: await computeBlurhash(bytes),
      palette: await extractPalette(bytes),
      placeholder: await generatePlaceholder(bytes),
    };
    knownShas.add(sha);
    fetched += 1;
  }

  await writeJson(IMAGES_JSON_PATH, images);
  console.log(
    `Images complete: ${fetched} fetched+processed, ${reusedByHash} reused by hash, ${alreadyKnown} already known.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
