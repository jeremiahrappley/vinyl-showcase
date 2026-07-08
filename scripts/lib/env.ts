// Shared --mock / real-credentials wiring for sync.ts, images.ts, valuations.ts.

import { DiscogsClient } from "./discogs.ts";
import { createMockFetch } from "../fixtures/mock-fetch.ts";

export const isMockRun = () => process.argv.includes("--mock");

export function buildClient(mock: boolean): DiscogsClient {
  if (mock) {
    return new DiscogsClient({
      token: "mock",
      username: "fixture-user",
      userAgent: "VinylShowcase/mock",
      fetchImpl: createMockFetch(),
      sleepImpl: async () => {}, // fixtures don't need real rate-limit pacing
    });
  }

  const token = process.env.DISCOGS_TOKEN;
  const username = process.env.DISCOGS_USERNAME;
  const userAgent = process.env.DISCOGS_UA;
  if (!token || !username || !userAgent) {
    throw new Error(
      "Missing DISCOGS_TOKEN, DISCOGS_USERNAME, or DISCOGS_UA. Copy .env.example to .env and fill it in, " +
        "or run with --mock to exercise the pipeline against fixtures.",
    );
  }
  return new DiscogsClient({ token, username, userAgent });
}
