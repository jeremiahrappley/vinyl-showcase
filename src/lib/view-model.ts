// Raw data/*.json → what the templates want. Runs at build time (Astro
// pages execute server-side during the static build), reading straight off
// disk — no server, no database, per ARCHITECTURE.md's one design rule.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const DATA_DIR = path.join(ROOT, "data");
const RELEASES_DIR = path.join(DATA_DIR, "releases");

interface CollectionState {
  syncedAt: string;
  count: number;
  instances: Record<
    string,
    { instanceId: number; releaseId: number; dateAdded: string; rating: number }
  >;
}

interface ReleaseDetail {
  id: number;
  title: string;
  artists: { name: string; id: number }[];
  labels: { name: string; catno: string }[];
  formats: { name: string; qty: string; descriptions?: string[] }[];
  genres: string[];
  styles: string[];
  year: number;
  tracklist: { position: string; type_: string; title: string; duration: string }[];
  images: { type: string; uri: string }[];
  resource_url: string;
}

interface ImageRecord {
  sha: string;
  width: number;
  height: number;
  blurhash: string;
  palette: string[];
}

type ImagesJson = Record<string, ImageRecord>;

export interface CoverDerivative {
  sha: string;
  blurhash: string;
  palette: string[];
  hero: { avif: string; webp: string; jpg: string };
  grid: { avif: string; webp: string; jpg: string };
  thumb: { avif: string; webp: string; jpg: string };
}

export interface CollectionViewItem {
  instanceId: number;
  releaseId: number;
  title: string;
  artists: string;
  year: number;
  formats: string[];
  dateAdded: string;
  rating: number;
  discogsUrl: string;
  cover?: CoverDerivative;
}

function readJson<T>(filePath: string): T | undefined {
  if (!existsSync(filePath)) return undefined;
  return JSON.parse(readFileSync(filePath, "utf-8"));
}

function coverDerivative(sha: string, record: ImageRecord): CoverDerivative {
  const sizes = ["hero", "grid", "thumb"] as const;
  const derivatives = Object.fromEntries(
    sizes.map((size) => [
      size,
      {
        avif: `/covers/${sha}/${size}.avif`,
        webp: `/covers/${sha}/${size}.webp`,
        jpg: `/covers/${sha}/${size}.jpg`,
      },
    ]),
  ) as Record<(typeof sizes)[number], { avif: string; webp: string; jpg: string }>;

  return { sha, blurhash: record.blurhash, palette: record.palette, ...derivatives };
}

function primaryImageUrl(release: ReleaseDetail): string | undefined {
  if (!release.images || release.images.length === 0) return undefined;
  return (release.images.find((img) => img.type === "primary") ?? release.images[0]).uri;
}

let cached: CollectionViewItem[] | undefined;

export function getCollection(): CollectionViewItem[] {
  if (cached) return cached;

  const collection = readJson<CollectionState>(path.join(DATA_DIR, "collection.json"));
  const images = readJson<ImagesJson>(path.join(DATA_DIR, "images.json")) ?? {};
  if (!collection) {
    cached = [];
    return cached;
  }

  const releaseCache = new Map<number, ReleaseDetail | undefined>();
  const getRelease = (id: number) => {
    if (!releaseCache.has(id)) {
      releaseCache.set(id, readJson<ReleaseDetail>(path.join(RELEASES_DIR, `${id}.json`)));
    }
    return releaseCache.get(id);
  };

  const items: CollectionViewItem[] = [];
  for (const instance of Object.values(collection.instances)) {
    const release = getRelease(instance.releaseId);
    if (!release) continue;

    const imageUrl = primaryImageUrl(release);
    const imageRecord = imageUrl ? images[imageUrl] : undefined;

    items.push({
      instanceId: instance.instanceId,
      releaseId: instance.releaseId,
      title: release.title,
      artists: release.artists.map((a) => a.name).join(", "),
      year: release.year,
      formats: release.formats.map((f) => f.name),
      dateAdded: instance.dateAdded,
      rating: instance.rating,
      discogsUrl: release.resource_url.replace("api.discogs.com/releases", "www.discogs.com/release"),
      cover: imageRecord ? coverDerivative(imageRecord.sha, imageRecord) : undefined,
    });
  }

  items.sort((a, b) => new Date(b.dateAdded).getTime() - new Date(a.dateAdded).getTime());
  cached = items;
  return items;
}

export function getReleaseFiles(): string[] {
  if (!existsSync(RELEASES_DIR)) return [];
  return readdirSync(RELEASES_DIR);
}
