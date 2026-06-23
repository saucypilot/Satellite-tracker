const CELESTRAK_GP_BASE_URL = "https://celestrak.org/NORAD/elements/gp.php";
const TLE_CACHE_NAME = "satellite-tracker-tle-v1";
const TLE_CACHE_KEY_PREFIX = "satellite-tracker:tle:";
const TLE_CACHE_VERSION = 2;

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
  const tleUrl = getCelesTrakUrl(group, "tle");
  const jsonUrl = getCelesTrakUrl(group, "json");
  let tleError = null;

  try {
    const res = await fetch(tleUrl);
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

    await writeCachedGroup(group, { format: "tle", text });
    return { group, format: "tle", text, source: "network", fetchedAt: Date.now() };
  } catch (error) {
    tleError = error;
  }

  try {
    const res = await fetch(jsonUrl);
    const records = await res.json();

    if (!res.ok) {
      throw new CelesTrakLoadError(
        group,
        `CelesTrak returned HTTP ${res.status} for "${group}"`,
        { status: res.status }
      );
    }

    if (!hasOmmData(records)) {
      throw new CelesTrakLoadError(
        group,
        `CelesTrak returned no OMM data for "${group}"`,
        { status: res.status }
      );
    }

    await writeCachedGroup(group, { format: "json", records });
    return {
      group,
      format: "json",
      records,
      source: "network",
      fetchedAt: Date.now(),
    };
  } catch (error) {
    const cached = await readCachedGroup(group);

    if (cached) {
      console.warn(
        `Using cached CelesTrak data for "${group}" because the live request failed.`,
        error
      );
      return {
        group,
        format: cached.format,
        text: cached.text,
        records: cached.records,
        source: "cache",
        fetchedAt: cached.fetchedAt,
      };
    }

    if (tleError instanceof CelesTrakLoadError) {
      throw tleError;
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

function getCelesTrakUrl(group, format) {
  const params = new URLSearchParams({
    GROUP: group,
    FORMAT: format,
  });

  return `${CELESTRAK_GP_BASE_URL}?${params}`;
}

async function readCachedGroup(group) {
  const cacheApiEntry = await readCacheApiGroup(group);

  if (cacheApiEntry) return cacheApiEntry;

  try {
    const raw = globalThis.localStorage?.getItem(getTleCacheKey(group));

    if (!raw) return null;

    const cached = JSON.parse(raw);

    if (!isValidGroupData(cached)) return null;

    return cached;
  } catch {
    return null;
  }
}

async function readCacheApiGroup(group) {
  try {
    const cache = await globalThis.caches?.open(TLE_CACHE_NAME);
    const res = await cache?.match(getTleCacheRequest(group));

    if (!res) return null;

    const text = await res.text();
    const format = res.headers.get("x-format") || "tle";

    if (format === "json") {
      const records = JSON.parse(text);

      if (!hasOmmData(records)) return null;

      return {
        format,
        records,
        fetchedAt: Number(res.headers.get("x-fetched-at")) || null,
      };
    }

    if (!hasTleData(text)) return null;

    return {
      format,
      text,
      fetchedAt: Number(res.headers.get("x-fetched-at")) || null,
    };
  } catch {
    return null;
  }
}

async function writeCachedGroup(group, data) {
  const fetchedAt = Date.now();
  const format = data.format ?? "tle";
  const body = format === "json" ? JSON.stringify(data.records) : data.text;

  try {
    const cache = await globalThis.caches?.open(TLE_CACHE_NAME);

    if (cache) {
      await cache.put(
        getTleCacheRequest(group),
        new Response(body, {
          headers: {
            "content-type": format === "json" ? "application/json" : "text/plain",
            "x-format": format,
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
        format,
        fetchedAt,
        text: data.text,
        records: data.records,
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

function hasOmmData(records) {
  return (
    Array.isArray(records) &&
    records.some(
      (record) =>
        record?.OBJECT_NAME &&
        record?.NORAD_CAT_ID &&
        Number.isFinite(Number(record.MEAN_MOTION))
    )
  );
}

function isValidGroupData(data) {
  if (data?.format === "json") return hasOmmData(data.records);
  return Boolean(data?.text && hasTleData(data.text));
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
