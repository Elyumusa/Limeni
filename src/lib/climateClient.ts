/**
 * Getting weather records in the browser, without asking twice.
 *
 *  1. Points are grouped by rainfall grid cell (lib/cell).
 *  2. Finished profiles are kept in memory and on the phone (localStorage),
 *     so going back to a spot is instant, even after a reload.
 *  3. A download in progress is shared: clicking away does not cancel it, and
 *     clicking back joins it instead of starting again.
 *  4. Only then does it ask the server, which has its own cache and also
 *     joins downloads already running for that cell.
 */
import { cellOf } from "@/lib/cell";
import type { ClimateProfile } from "@/lib/climate";

const STORE_KEY = "limeni.climate.v1";
/** About 9 KB each, so this stays well under storage limits. */
const STORE_MAX = 30;
const POLL_MS = 4000;

type Stored = { key: string; profile: ClimateProfile }[];

const memory = new Map<string, ClimateProfile>();
let loadedStore = false;

function readStore(): Stored {
  try {
    return JSON.parse(window.localStorage.getItem(STORE_KEY) ?? "[]") as Stored;
  } catch {
    return [];
  }
}

function loadStore() {
  if (loadedStore || typeof window === "undefined") return;
  loadedStore = true;
  for (const { key, profile } of readStore()) memory.set(key, profile);
}

function save(key: string, profile: ClimateProfile) {
  memory.set(key, profile);
  try {
    const kept = readStore().filter((e) => e.key !== key);
    kept.push({ key, profile });
    window.localStorage.setItem(STORE_KEY, JSON.stringify(kept.slice(-STORE_MAX)));
  } catch {
    /* storage full or blocked: memory still works for this visit */
  }
}

/** A finished profile for this point, if one is already on the phone. */
export function cachedClimate(lat: number, lon: number): ClimateProfile | null {
  loadStore();
  return memory.get(cellOf(lat, lon).key) ?? null;
}

type Download = {
  promise: Promise<ClimateProfile>;
  progress: number;
  listeners: Set<(progress: number) => void>;
};
const downloads = new Map<string, Download>();

type Reply =
  | { status: "done"; profile: ClimateProfile }
  | { status: "pending"; jobs?: string[]; progress?: number }
  | { status: "none" }
  | { error: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(input: string, init?: RequestInit): Promise<Reply> {
  const res = await fetch(input, init);
  return (await res.json()) as Reply;
}

async function download(lat: number, lon: number, report: (p: number) => void): Promise<ClimateProfile> {
  const q = `lat=${lat}&lon=${lon}`;
  // A finished profile the server (or the CDN in front of it) already has.
  let reply = await fetchJson(`/api/climate?${q}`);
  if ("status" in reply && reply.status === "done") return reply.profile;

  reply = await fetchJson("/api/climate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lat, lon }),
  });
  const jobs = "jobs" in reply ? (reply.jobs ?? []) : [];
  while ("status" in reply && reply.status === "pending") {
    await sleep(POLL_MS);
    reply = await fetchJson(`/api/climate?${q}&jobs=${jobs.join(",")}`);
    if ("status" in reply && reply.status === "pending") report(reply.progress ?? 0);
  }
  if ("error" in reply) throw new Error(reply.error);
  if (reply.status !== "done") throw new Error("Unexpected reply from the weather service.");
  return reply.profile;
}

/**
 * The climate profile for a point: from the phone, from a download already
 * running, or from a new download. `onProgress` gets 0–100 while it loads.
 * Returns the cell key so callers can tell which answer is which.
 */
export function loadClimate(
  lat: number,
  lon: number,
  onProgress?: (progress: number) => void,
): { key: string; promise: Promise<ClimateProfile>; progress: number } {
  loadStore();
  const cell = cellOf(lat, lon);
  const known = memory.get(cell.key);
  if (known) return { key: cell.key, promise: Promise.resolve(known), progress: 100 };

  let d = downloads.get(cell.key);
  if (!d) {
    const listeners = new Set<(p: number) => void>();
    const entry: Download = { progress: 0, listeners, promise: Promise.resolve(null as unknown as ClimateProfile) };
    entry.promise = download(cell.lat, cell.lon, (p) => {
      entry.progress = p;
      for (const l of listeners) l(p);
    })
      .then((profile) => {
        save(cell.key, profile);
        return profile;
      })
      .finally(() => downloads.delete(cell.key));
    downloads.set(cell.key, entry);
    d = entry;
  }
  if (onProgress) {
    d.listeners.add(onProgress);
    const listeners = d.listeners;
    d.promise.finally(() => listeners.delete(onProgress)).catch(() => {});
  }
  return { key: cell.key, promise: d.promise, progress: d.progress };
}

export function climateErrorMessage(error: unknown): string {
  return error instanceof Error && error.message && !/fetch|network|JSON/i.test(error.message)
    ? error.message
    : "Could not reach the weather service. Check your connection and try again.";
}
