// Discogs API client with a serialized in-process rate limiter.
// No Redis, no distributed token bucket — this runs as a solo cron job,
// not a user-facing request path. See ARCHITECTURE.md §3.

const API_BASE = "https://api.discogs.com";

export interface DiscogsClientOptions {
  token: string;
  username: string;
  userAgent: string;
  /** Injectable for tests / --mock mode. Defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Override sleep for tests so the suite doesn't take 19 minutes. */
  sleepImpl?: (ms: number) => Promise<void>;
}

export interface CollectionPage {
  pagination: { page: number; pages: number; per_page: number; items: number };
  releases: CollectionItem[];
}

export interface CollectionItem {
  id: number; // release_id
  instance_id: number;
  date_added: string;
  rating: number;
  basic_information: BasicInformation;
}

export interface BasicInformation {
  id: number;
  title: string;
  year: number;
  resource_url: string;
  thumb: string;
  cover_image: string;
  formats: { name: string; qty: string; descriptions?: string[] }[];
  labels: { name: string; catno: string; id: number; resource_url: string }[];
  artists: { name: string; id: number; resource_url: string; join?: string; role?: string }[];
  genres: string[];
  styles: string[];
}

export interface ReleaseDetail {
  id: number;
  title: string;
  artists: BasicInformation["artists"];
  labels: BasicInformation["labels"];
  formats: BasicInformation["formats"];
  genres: string[];
  styles: string[];
  year: number;
  released?: string;
  country?: string;
  notes?: string;
  tracklist: { position: string; type_: string; title: string; duration: string }[];
  images: { type: string; uri: string; uri150: string; width: number; height: number }[];
  extraartists?: { name: string; role: string }[];
  resource_url: string;
}

export interface WantlistPage {
  pagination: { page: number; pages: number; per_page: number; items: number };
  wants: { id: number; resource_url: string; basic_information: BasicInformation }[];
}

export interface MarketplaceStats {
  lowest_price: { value: number; currency: string } | null;
  num_for_sale: number;
  blocked_from_sale: boolean;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class DiscogsClient {
  private remaining = 60;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly opts: DiscogsClientOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.sleep = opts.sleepImpl ?? defaultSleep;
  }

  /** Low-level rate-limited call. `pathOrUrl` may be a path (prefixed with
   * the API base) or a full URL (e.g. an authenticated image fetch on a
   * different host). Retries on 429 up to 3 times total. */
  async call(pathOrUrl: string, retries = 3): Promise<Response> {
    if (this.remaining < 5) await this.sleep(60_000);
    await this.sleep(1100);

    const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${API_BASE}${pathOrUrl}`;
    const res = await this.fetchImpl(url, {
      headers: {
        Authorization: `Discogs token=${this.opts.token}`,
        "User-Agent": this.opts.userAgent,
      },
    });

    const headerRemaining = res.headers.get("X-Discogs-Ratelimit-Remaining");
    if (headerRemaining !== null) this.remaining = Number(headerRemaining);

    if (res.status === 429) {
      if (retries <= 0) {
        throw new Error(`Discogs rate limit exceeded retries for ${url}`);
      }
      await this.sleep(60_000);
      return this.call(pathOrUrl, retries - 1);
    }

    if (!res.ok) {
      throw new Error(`Discogs API error ${res.status} for ${url}: ${await res.text()}`);
    }

    return res;
  }

  async getCollectionPage(page: number, perPage = 100): Promise<CollectionPage> {
    const res = await this.call(
      `/users/${this.opts.username}/collection/folders/0/releases?per_page=${perPage}&page=${page}&sort=added&sort_order=desc`,
    );
    return res.json();
  }

  /** Yields collection items newest-first. If `since` is given, stops
   * paginating as soon as a `date_added` older than it is seen (per the
   * doc's incremental-sync note — removals still require a full
   * reconciliation pass separately, since this is a short-circuit). */
  async *iterateCollection(since?: Date, perPage = 100): AsyncGenerator<CollectionItem> {
    let page = 1;
    while (true) {
      const data = await this.getCollectionPage(page, perPage);
      for (const item of data.releases) {
        if (since && new Date(item.date_added) <= since) return;
        yield item;
      }
      if (page >= data.pagination.pages) return;
      page += 1;
    }
  }

  async getRelease(id: number): Promise<ReleaseDetail> {
    const res = await this.call(`/releases/${id}`);
    return res.json();
  }

  async *iterateWantlist(perPage = 100): AsyncGenerator<WantlistPage["wants"][number]> {
    let page = 1;
    while (true) {
      const res = await this.call(`/users/${this.opts.username}/wants?per_page=${perPage}&page=${page}`);
      const data: WantlistPage = await res.json();
      for (const item of data.wants) yield item;
      if (page >= data.pagination.pages) return;
      page += 1;
    }
  }

  async getMarketplaceStats(releaseId: number): Promise<MarketplaceStats> {
    const res = await this.call(`/marketplace/stats/${releaseId}`);
    return res.json();
  }

  /** Authenticated image fetch — image requests count against the same
   * rate limit and cannot be hotlinked from the browser, so this always
   * routes through the same limiter as API calls. */
  async fetchImageBytes(url: string): Promise<ArrayBuffer> {
    const res = await this.call(url);
    return res.arrayBuffer();
  }
}
