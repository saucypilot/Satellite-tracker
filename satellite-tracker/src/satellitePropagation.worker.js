import { gstime, propagate } from "../node_modules/satellite.js/dist/propagation.js";
import {
  degreesLat,
  degreesLong,
  eciToGeodetic,
} from "../node_modules/satellite.js/dist/transforms.js";

const EARTH_RADIUS_KM = 6371;
const SCENE_SCALE = 1 / 1000;
const VALUES_PER_SATELLITE = 6;
const X = 0;
const Y = 1;
const Z = 2;
const LATITUDE = 3;
const LONGITUDE = 4;
const ALTITUDE = 5;

let satrecs = [];

self.addEventListener("message", (event) => {
  if (event.data?.type === "initialize") {
    satrecs = event.data.satrecs;
    return;
  }

  if (event.data?.type !== "propagate") return;

  const date = new Date(event.data.timestamp);
  const gmst = gstime(date);
  const positions = new Float64Array(satrecs.length * VALUES_PER_SATELLITE);

  positions.fill(Number.NaN);

  for (let index = 0; index < satrecs.length; index++) {
    let positionEci = null;

    try {
      positionEci = propagate(satrecs[index], date)?.position;
    } catch {
      continue;
    }

    if (
      !positionEci ||
      !Number.isFinite(positionEci.x) ||
      !Number.isFinite(positionEci.y) ||
      !Number.isFinite(positionEci.z)
    ) {
      continue;
    }

    const positionGd = eciToGeodetic(positionEci, gmst);
    const latitude = degreesLat(positionGd.latitude);
    const longitude = degreesLong(positionGd.longitude);
    const altitude = positionGd.height;
    const radius = (EARTH_RADIUS_KM + altitude) * SCENE_SCALE;
    const phi = ((90 - latitude) * Math.PI) / 180;
    const theta = ((longitude + 180) * Math.PI) / 180;
    const offset = index * VALUES_PER_SATELLITE;

    positions[offset + X] = -radius * Math.sin(phi) * Math.cos(theta);
    positions[offset + Y] = radius * Math.cos(phi);
    positions[offset + Z] = radius * Math.sin(phi) * Math.sin(theta);
    positions[offset + LATITUDE] = latitude;
    positions[offset + LONGITUDE] = longitude;
    positions[offset + ALTITUDE] = altitude;
  }

  self.postMessage(
    {
      type: "positions",
      requestId: event.data.requestId,
      positions,
    },
    [positions.buffer]
  );
});
