// Raw data/*.json → what the templates want. Runs at build time (Astro
// pages execute server-side during the static build), reading straight off
// disk — no server, no database, per ARCHITECTURE.md's one design rule.

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

// process.cwd(), not import.meta.dirname: Vite bundles this file into
// dist/.prerender/chunks/ during `astro build`, so dirname-relative
// traversal resolves to the wrong place at build time even though it
// works in dev (where the file runs in place). npm scripts and Astro's
// CLI are always invoked from the project root, so cwd is stable.
const ROOT = process.cwd();
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
  released?: string;
  country?: string;
  notes?: string;
  tracklist: { position: string; type_: string; title: string; duration: string }[];
  images: { type: string; uri: string }[];
  extraartists?: { name: string; role: string }[];
  resource_url: string;
}

interface ImageRecord {
  sha: string;
  width: number;
  height: number;
  blurhash: string;
  palette: string[];
  placeholder: string;
}

type ImagesJson = Record<string, ImageRecord>;

interface WantlistEntry {
  id: number;
  resource_url: string;
  basic_information: {
    title: string;
    year: number;
    artists: { name: string }[];
    cover_image: string;
    resource_url: string;
  };
}

interface ValuationEntry {
  date: string;
  releaseId: number;
  lowestPrice: number | null;
  currency: string;
  numForSale: number;
}

export interface CoverDerivative {
  sha: string;
  blurhash: string;
  palette: string[];
  placeholder: string;
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

export interface InstanceDetail extends CollectionViewItem {
  labels: { name: string; catno: string }[];
  genres: string[];
  styles: string[];
  country?: string;
  released?: string;
  notes?: string;
  tracklist: { position: string; title: string; duration: string }[];
  credits: { name: string; role: string }[];
  latestValuation?: ValuationEntry;
}

export interface WantlistViewItem {
  releaseId: number;
  title: string;
  artists: string;
  year: number;
  discogsUrl: string;
  cover?: CoverDerivative;
}

export interface StatsViewModel {
  totalRecords: number;
  decades: { decade: string; count: number }[];
  genres: { name: string; count: number }[];
  labels: { name: string; count: number }[];
  valueHistory: { date: string; total: number }[];
}

function readJson<T>(filePath: string): T | undefined {
  if (!existsSync(filePath)) return undefined;
  return JSON.parse(readFileSync(filePath, "utf-8"));
}

function readJsonl<T>(filePath: string): T[] {
  if (!existsSync(filePath)) return [];
  return readFileSync(filePath, "utf-8")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line));
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

  return { sha, blurhash: record.blurhash, palette: record.palette, placeholder: record.placeholder, ...derivatives };
}

function primaryImageUrl(release: ReleaseDetail): string | undefined {
  if (!release.images || release.images.length === 0) return undefined;
  return (release.images.find((img) => img.type === "primary") ?? release.images[0]).uri;
}

function discogsReleaseUrl(resourceUrl: string): string {
  return resourceUrl.replace("api.discogs.com/releases", "www.discogs.com/release");
}

let releaseCache: Map<number, ReleaseDetail | undefined> | undefined;
function getRelease(id: number): ReleaseDetail | undefined {
  releaseCache ??= new Map();
  if (!releaseCache.has(id)) {
    releaseCache.set(id, readJson<ReleaseDetail>(path.join(RELEASES_DIR, `${id}.json`)));
  }
  return releaseCache.get(id);
}

let imagesCache: ImagesJson | undefined;
function getImages(): ImagesJson {
  imagesCache ??= readJson<ImagesJson>(path.join(DATA_DIR, "images.json")) ?? {};
  return imagesCache;
}

let collectionStateCache: CollectionState | undefined | null;
function getCollectionState(): CollectionState | undefined {
  if (collectionStateCache === undefined) {
    collectionStateCache = readJson<CollectionState>(path.join(DATA_DIR, "collection.json")) ?? null;
  }
  return collectionStateCache ?? undefined;
}

let cached: CollectionViewItem[] | undefined;

export function getCollection(): CollectionViewItem[] {
  if (cached) return cached;

  const collection = getCollectionState();
  const images = getImages();
  if (!collection) {
    cached = [];
    return cached;
  }

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
      discogsUrl: discogsReleaseUrl(release.resource_url),
      cover: imageRecord ? coverDerivative(imageRecord.sha, imageRecord) : undefined,
    });
  }

  items.sort((a, b) => new Date(b.dateAdded).getTime() - new Date(a.dateAdded).getTime());
  cached = items;
  return items;
}

export function getInstanceDetail(instanceId: number): InstanceDetail | undefined {
  const collection = getCollectionState();
  const instance = collection?.instances[String(instanceId)];
  if (!instance) return undefined;

  const release = getRelease(instance.releaseId);
  if (!release) return undefined;

  const images = getImages();
  const imageUrl = primaryImageUrl(release);
  const imageRecord = imageUrl ? images[imageUrl] : undefined;

  const valuations = readJsonl<ValuationEntry>(path.join(DATA_DIR, "valuations.jsonl"))
    .filter((v) => v.releaseId === instance.releaseId)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return {
    instanceId: instance.instanceId,
    releaseId: instance.releaseId,
    title: release.title,
    artists: release.artists.map((a) => a.name).join(", "),
    year: release.year,
    formats: release.formats.map((f) => f.name),
    dateAdded: instance.dateAdded,
    rating: instance.rating,
    discogsUrl: discogsReleaseUrl(release.resource_url),
    cover: imageRecord ? coverDerivative(imageRecord.sha, imageRecord) : undefined,
    labels: release.labels,
    genres: release.genres,
    styles: release.styles,
    country: release.country,
    released: release.released,
    notes: release.notes,
    tracklist: release.tracklist
      .filter((t) => t.type_ === "track")
      .map((t) => ({ position: t.position, title: t.title, duration: t.duration })),
    credits: release.extraartists ?? [],
    latestValuation: valuations[0],
  };
}

export function getAllInstanceIds(): number[] {
  const collection = getCollectionState();
  if (!collection) return [];
  return Object.values(collection.instances).map((i) => i.instanceId);
}

export function getWantlist(): WantlistViewItem[] {
  const wants = readJson<WantlistEntry[]>(path.join(DATA_DIR, "wantlist.json")) ?? [];
  const images = getImages();
  return wants.map((w) => {
    const imageRecord = images[w.basic_information.cover_image];
    return {
      releaseId: w.id,
      title: w.basic_information.title,
      artists: w.basic_information.artists.map((a) => a.name).join(", "),
      year: w.basic_information.year,
      discogsUrl: discogsReleaseUrl(w.basic_information.resource_url),
      cover: imageRecord ? coverDerivative(imageRecord.sha, imageRecord) : undefined,
    };
  });
}

export function getStats(): StatsViewModel {
  const items = getCollection();

  const decadeCounts = new Map<string, number>();
  const genreCounts = new Map<string, number>();
  const labelCounts = new Map<string, number>();

  for (const item of items) {
    const decade = `${Math.floor(item.year / 10) * 10}s`;
    decadeCounts.set(decade, (decadeCounts.get(decade) ?? 0) + 1);

    const release = getRelease(item.releaseId);
    for (const genre of release?.genres ?? []) {
      genreCounts.set(genre, (genreCounts.get(genre) ?? 0) + 1);
    }
    for (const label of release?.labels ?? []) {
      labelCounts.set(label.name, (labelCounts.get(label.name) ?? 0) + 1);
    }
  }

  const releaseIdsOwned = new Set(items.map((i) => i.releaseId));
  const valuations = readJsonl<ValuationEntry>(path.join(DATA_DIR, "valuations.jsonl")).filter((v) =>
    releaseIdsOwned.has(v.releaseId),
  );
  const totalsByDate = new Map<string, number>();
  for (const v of valuations) {
    if (v.lowestPrice == null) continue;
    totalsByDate.set(v.date, (totalsByDate.get(v.date) ?? 0) + v.lowestPrice);
  }

  const sortEntries = (map: Map<string, number>) =>
    [...map.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));

  return {
    totalRecords: items.length,
    decades: [...decadeCounts.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([decade, count]) => ({ decade, count })),
    genres: sortEntries(genreCounts),
    labels: sortEntries(labelCounts),
    valueHistory: [...totalsByDate.entries()]
      .sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime())
      .map(([date, total]) => ({ date, total })),
  };
}

