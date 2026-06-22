const CELESTRAK_TLE_BASE_URL =
  "https://celestrak.org/NORAD/elements/gp.php?FORMAT=tle";
const TLE_CACHE_NAME = "satellite-tracker-tle-v1";
const TLE_CACHE_KEY_PREFIX = "satellite-tracker:tle:";
const TLE_CACHE_VERSION = 1;

export const CELESTRAK_GROUPS = [
  { id: "stations", label: "ISS & space stations" },
  { id: "active", label: "All active satellites" },
  { id: "starlink", label: "Starlink" },
  { id: "gps-ops", label: "GPS satellites" },
  { id: "weather", label: "Weather satellites" },
  { id: "resource", label: "Earth observation" },
  { id: "sar", label: "SAR satellites" },
  { id: "sarsat", label: "Search & rescue" },
  { id: "last-30-days", label: "Last 30 days launches" },
  { id: "geo", label: "Geostationary satellites" },
];

export const SATELLITE_GROUP_COLORS = {
  stations: 0xffffff,
  active: 0x9ca3ff,
  starlink: 0x35d4ff,
  "gps-ops": 0x2eff8f,
  weather: 0xffd166,
  resource: 0xff7f50,
  sar: 0xff4fd8,
  sarsat: 0xff4040,
  "last-30-days": 0xb6ff3b,
  geo: 0xc084fc,
};

export const SATELLITE_GROUP_COLOR_HEX = Object.fromEntries(
  Object.entries(SATELLITE_GROUP_COLORS).map(([group, color]) => [
    group,
    `#${color.toString(16).padStart(6, "0")}`,
  ])
);

class CelesTrakLoadError extends Error {
  constructor(group, message, { status = null } = {}) {
    super(message);
    this.name = "CelesTrakLoadError";
    this.group = group;
    this.status = status;
  }
}

export async function loadCelesTrakGroups(groups) {
  const results = await Promise.allSettled(
    groups.map((group) => fetchGroup(group))
  );
  const failedGroups = results
    .filter((result) => result.status === "rejected")
    .map((result) => result.reason?.group)
    .filter(Boolean);
  const tleGroups = results
    .filter((result) => result.status === "fulfilled")
    .map((result) => result.value);
  const cachedGroups = tleGroups
    .filter((tleGroup) => tleGroup.source === "cache")
    .map((tleGroup) => ({
      group: tleGroup.group,
      age: formatCacheAge(tleGroup.fetchedAt),
    }));

  return { tleGroups, failedGroups, cachedGroups };
}

async function fetchGroup(group) {
  const url = `${CELESTRAK_TLE_BASE_URL}&GROUP=${encodeURIComponent(group)}`;

  try {
    const res = await fetch(url);
    const text = await res.text();

    if (!res.ok) {
      throw new CelesTrakLoadError(
        group,
        `CelesTrak returned HTTP ${res.status} for "${group}"`,
        { status: res.status }
      );
    }

    if (!hasTleData(text)) {
      throw new CelesTrakLoadError(
        group,
        `CelesTrak returned no TLE data for "${group}"`,
        { status: res.status }
      );
    }

    await writeCachedTle(group, text);
    return { group, text, source: "network", fetchedAt: Date.now() };
  } catch (error) {
    const cached = await readCachedTle(group);

    if (cached) {
      console.warn(
        `Using cached CelesTrak data for "${group}" because the live request failed.`,
        error
      );
      return {
        group,
        text: cached.text,
        source: "cache",
        fetchedAt: cached.fetchedAt,
      };
    }

    if (error instanceof CelesTrakLoadError) {
      throw error;
    }

    throw new CelesTrakLoadError(
      group,
      `Failed to load CelesTrak group "${group}"`,
      { status: error?.status ?? null }
    );
  }
}

async function readCachedTle(group) {
  const cacheApiEntry = await readCacheApiTle(group);

  if (cacheApiEntry) return cacheApiEntry;

  try {
    const raw = globalThis.localStorage?.getItem(getTleCacheKey(group));

    if (!raw) return null;

    const cached = JSON.parse(raw);

    if (!cached?.text || !hasTleData(cached.text)) return null;

    return cached;
  } catch {
    return null;
  }
}

async function readCacheApiTle(group) {
  try {
    const cache = await globalThis.caches?.open(TLE_CACHE_NAME);
    const res = await cache?.match(getTleCacheRequest(group));

    if (!res) return null;

    const text = await res.text();

    if (!hasTleData(text)) return null;

    return {
      text,
      fetchedAt: Number(res.headers.get("x-fetched-at")) || null,
    };
  } catch {
    return null;
  }
}

async function writeCachedTle(group, text) {
  const fetchedAt = Date.now();

  try {
    const cache = await globalThis.caches?.open(TLE_CACHE_NAME);

    if (cache) {
      await cache.put(
        getTleCacheRequest(group),
        new Response(text, {
          headers: {
            "content-type": "text/plain",
            "x-fetched-at": String(fetchedAt),
          },
        })
      );
      return;
    }
  } catch {
  }

  try {
    globalThis.localStorage?.setItem(
      getTleCacheKey(group),
      JSON.stringify({
        fetchedAt,
        text,
      })
    );
  } catch {
  }
}

function getTleCacheKey(group) {
  return `${TLE_CACHE_KEY_PREFIX}${TLE_CACHE_VERSION}:${group}`;
}

function getTleCacheRequest(group) {
  return `/tle-cache/${TLE_CACHE_VERSION}/${encodeURIComponent(group)}`;
}

function hasTleData(text) {
  const lines = text.trim().split("\n");

  for (let i = 0; i < lines.length - 2; i += 3) {
    if (lines[i + 1]?.startsWith("1 ") && lines[i + 2]?.startsWith("2 ")) {
      return true;
    }
  }

  return false;
}

function formatCacheAge(timestamp) {
  if (!timestamp) return "unknown age";

  const ageHours = Math.max(0, Math.round((Date.now() - timestamp) / 3600000));

  if (ageHours < 1) return "less than 1 hour old";
  if (ageHours === 1) return "1 hour old";
  if (ageHours < 48) return `${ageHours} hours old`;

  const ageDays = Math.round(ageHours / 24);
  return ageDays === 1 ? "1 day old" : `${ageDays} days old`;
}
