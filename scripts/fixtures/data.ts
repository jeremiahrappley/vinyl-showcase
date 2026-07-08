// Hand-written fixtures shaped like real Discogs API responses, used by
// --mock mode so the sync/image pipeline is testable before a real
// DISCOGS_TOKEN exists. Covers: multi-artist, multi-format, a reissue pair
// that shares cover art (image-dedupe test), and a release owned twice
// (instance_id-as-primary-key test).

import type { BasicInformation, CollectionItem, MarketplaceStats, ReleaseDetail } from "../lib/discogs.ts";

const artist = (name: string, id: number) => ({ name, id, resource_url: `https://api.discogs.com/artists/${id}` });
const label = (name: string, catno: string, id: number) => ({
  name,
  catno,
  id,
  resource_url: `https://api.discogs.com/labels/${id}`,
});

function basicInfo(overrides: Partial<BasicInformation> & { id: number; title: string; year: number }): BasicInformation {
  return {
    resource_url: `https://api.discogs.com/releases/${overrides.id}`,
    thumb: `https://i.discogs.com/fixtures/${overrides.id}/thumb.jpg`,
    cover_image: `https://i.discogs.com/fixtures/${overrides.id}/cover.jpg`,
    formats: [{ name: "Vinyl", qty: "1", descriptions: ["LP", "Album"] }],
    labels: [label("Fixture Records", "FIX-001", 9001)],
    artists: [artist("Fixture Artist", 8001)],
    genres: ["Jazz"],
    styles: ["Modal"],
    ...overrides,
  };
}

// release_id -> collection item (before wrapping in instance_id)
const RELEASES: Record<number, ReleaseDetail> = {
  123001: {
    id: 123001,
    title: "Kind of Blue",
    artists: [artist("Miles Davis", 8001)],
    labels: [label("Columbia", "CS 8163", 9001)],
    formats: [{ name: "Vinyl", qty: "1", descriptions: ["LP", "Album", "Stereo"] }],
    genres: ["Jazz"],
    styles: ["Modal"],
    year: 1959,
    released: "1959-08-17",
    country: "US",
    notes: "Recorded at Columbia 30th Street Studio, NYC.",
    tracklist: [
      { position: "A1", type_: "track", title: "So What", duration: "9:22" },
      { position: "A2", type_: "track", title: "Freddie Freeloader", duration: "9:46" },
      { position: "B1", type_: "track", title: "Blue in Green", duration: "5:37" },
    ],
    images: [
      { type: "primary", uri: "https://i.discogs.com/fixtures/123001/hero.jpg", uri150: "https://i.discogs.com/fixtures/123001/thumb.jpg", width: 600, height: 600 },
    ],
    extraartists: [{ name: "Teo Macero", role: "Producer" }],
    resource_url: "https://api.discogs.com/releases/123001",
  },
  123002: {
    id: 123002,
    title: "A Love Supreme",
    artists: [artist("John Coltrane", 8002)],
    labels: [label("Impulse!", "A-77", 9002)],
    formats: [{ name: "Vinyl", qty: "1", descriptions: ["LP", "Album"] }],
    genres: ["Jazz"],
    styles: ["Spiritual Jazz"],
    year: 1965,
    released: "1965-02",
    country: "US",
    tracklist: [
      { position: "A1", type_: "track", title: "Acknowledgement", duration: "7:43" },
      { position: "A2", type_: "track", title: "Resolution", duration: "7:20" },
    ],
    images: [
      { type: "primary", uri: "https://i.discogs.com/fixtures/123002/hero.jpg", uri150: "https://i.discogs.com/fixtures/123002/thumb.jpg", width: 600, height: 600 },
    ],
    resource_url: "https://api.discogs.com/releases/123002",
  },
  123003: {
    id: 123003,
    title: "Blue Note Sampler Vol. 1",
    artists: [
      { name: "Various", id: 194, resource_url: "https://api.discogs.com/artists/194" },
    ],
    labels: [label("Blue Note", "BST-9999", 9003)],
    formats: [{ name: "Vinyl", qty: "2", descriptions: ["LP", "Compilation", "Stereo"] }],
    genres: ["Jazz"],
    styles: ["Hard Bop", "Post Bop"],
    year: 1967,
    country: "US",
    tracklist: [
      { position: "A1", type_: "track", title: "Cantaloupe Island", duration: "5:33" },
      { position: "A2", type_: "track", title: "Song for My Father", duration: "6:38" },
    ],
    images: [
      { type: "primary", uri: "https://i.discogs.com/fixtures/123003/hero.jpg", uri150: "https://i.discogs.com/fixtures/123003/thumb.jpg", width: 600, height: 600 },
    ],
    resource_url: "https://api.discogs.com/releases/123003",
  },
  123004: {
    id: 123004,
    title: "The Complete Fixture Sessions (Box Set)",
    artists: [artist("Fixture Quartet", 8004)],
    labels: [label("Fixture Records", "FIX-BOX-1", 9001)],
    formats: [
      { name: "Vinyl", qty: "3", descriptions: ["LP", "Box Set", "Album"] },
      { name: "Booklet", qty: "1", descriptions: ["Liner Notes"] },
    ],
    genres: ["Jazz"],
    styles: ["Bop"],
    year: 1962,
    country: "US",
    tracklist: [{ position: "1-A1", type_: "track", title: "Take One", duration: "4:10" }],
    images: [
      { type: "primary", uri: "https://i.discogs.com/fixtures/123004/hero.jpg", uri150: "https://i.discogs.com/fixtures/123004/thumb.jpg", width: 600, height: 600 },
    ],
    resource_url: "https://api.discogs.com/releases/123004",
  },
  // Reissue pair: distinct release_ids, same physical sleeve art, so the
  // image pipeline should dedupe them to one sha256-keyed file.
  123005: {
    id: 123005,
    title: "Moanin' (Original Pressing)",
    artists: [artist("Art Blakey", 8005)],
    labels: [label("Blue Note", "BLP 4003", 9003)],
    formats: [{ name: "Vinyl", qty: "1", descriptions: ["LP", "Album", "Mono"] }],
    genres: ["Jazz"],
    styles: ["Hard Bop"],
    year: 1958,
    country: "US",
    tracklist: [{ position: "A1", type_: "track", title: "Moanin'", duration: "9:32" }],
    images: [
      { type: "primary", uri: "https://i.discogs.com/fixtures/shared-moanin/hero.jpg", uri150: "https://i.discogs.com/fixtures/shared-moanin/thumb.jpg", width: 600, height: 600 },
    ],
    resource_url: "https://api.discogs.com/releases/123005",
  },
  123006: {
    id: 123006,
    title: "Moanin' (2015 Reissue)",
    artists: [artist("Art Blakey", 8005)],
    labels: [label("Blue Note", "BLP 4003-RE", 9003)],
    formats: [{ name: "Vinyl", qty: "1", descriptions: ["LP", "Album", "Reissue", "180g"] }],
    genres: ["Jazz"],
    styles: ["Hard Bop"],
    year: 2015,
    country: "US",
    tracklist: [{ position: "A1", type_: "track", title: "Moanin'", duration: "9:32" }],
    images: [
      // same URL as 123005 on purpose — reissue reuses the original scan
      { type: "primary", uri: "https://i.discogs.com/fixtures/shared-moanin/hero.jpg", uri150: "https://i.discogs.com/fixtures/shared-moanin/thumb.jpg", width: 600, height: 600 },
    ],
    resource_url: "https://api.discogs.com/releases/123006",
  },
  // Owned twice: one release_id, two instance_ids.
  123007: {
    id: 123007,
    title: "Head Hunters",
    artists: [artist("Herbie Hancock", 8007)],
    labels: [label("Columbia", "KC 32731", 9001)],
    formats: [{ name: "Vinyl", qty: "1", descriptions: ["LP", "Album"] }],
    genres: ["Jazz", "Funk / Soul"],
    styles: ["Jazz-Funk"],
    year: 1973,
    country: "US",
    tracklist: [{ position: "A1", type_: "track", title: "Chameleon", duration: "15:41" }],
    images: [
      { type: "primary", uri: "https://i.discogs.com/fixtures/123007/hero.jpg", uri150: "https://i.discogs.com/fixtures/123007/thumb.jpg", width: 600, height: 600 },
    ],
    resource_url: "https://api.discogs.com/releases/123007",
  },
};

export const FIXTURE_RELEASES = RELEASES;

function toBasicInformation(r: ReleaseDetail): BasicInformation {
  return basicInfo({
    id: r.id,
    title: r.title,
    year: r.year,
    artists: r.artists,
    labels: r.labels,
    formats: r.formats,
    genres: r.genres,
    styles: r.styles,
    cover_image: r.images[0]?.uri ?? `https://i.discogs.com/fixtures/${r.id}/cover.jpg`,
    thumb: r.images[0]?.uri150 ?? `https://i.discogs.com/fixtures/${r.id}/thumb.jpg`,
  });
}

export const FIXTURE_COLLECTION: CollectionItem[] = [
  { id: 123001, instance_id: 900001, date_added: "2024-01-10T10:00:00-08:00", rating: 5, basic_information: toBasicInformation(RELEASES[123001]) },
  { id: 123002, instance_id: 900002, date_added: "2024-02-14T10:00:00-08:00", rating: 5, basic_information: toBasicInformation(RELEASES[123002]) },
  { id: 123003, instance_id: 900003, date_added: "2024-03-01T10:00:00-08:00", rating: 3, basic_information: toBasicInformation(RELEASES[123003]) },
  { id: 123004, instance_id: 900004, date_added: "2024-04-20T10:00:00-08:00", rating: 4, basic_information: toBasicInformation(RELEASES[123004]) },
  { id: 123005, instance_id: 900005, date_added: "2024-05-05T10:00:00-08:00", rating: 4, basic_information: toBasicInformation(RELEASES[123005]) },
  { id: 123006, instance_id: 900006, date_added: "2024-05-06T10:00:00-08:00", rating: 4, basic_information: toBasicInformation(RELEASES[123006]) },
  // same release_id 123007, two separate instances (two physical copies)
  { id: 123007, instance_id: 900007, date_added: "2024-06-01T10:00:00-08:00", rating: 5, basic_information: toBasicInformation(RELEASES[123007]) },
  { id: 123007, instance_id: 900008, date_added: "2024-06-15T10:00:00-08:00", rating: 3, basic_information: toBasicInformation(RELEASES[123007]) },
];

export const FIXTURE_WANTLIST = [
  {
    id: 990001,
    resource_url: "https://api.discogs.com/releases/990001",
    basic_information: basicInfo({ id: 990001, title: "Maggot Brain", year: 1971, artists: [artist("Funkadelic", 8010)] }),
  },
  {
    id: 990002,
    resource_url: "https://api.discogs.com/releases/990002",
    basic_information: basicInfo({ id: 990002, title: "Bitches Brew", year: 1970, artists: [artist("Miles Davis", 8001)] }),
  },
];

export const FIXTURE_MARKETPLACE_STATS: Record<number, MarketplaceStats> = Object.fromEntries(
  Object.keys(RELEASES).map((id, i) => [
    Number(id),
    { lowest_price: { value: 12.5 + i * 3.25, currency: "USD" }, num_for_sale: (i % 5) + 1, blocked_from_sale: false },
  ]),
);
