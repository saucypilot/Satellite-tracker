import * as THREE from "three";
import * as satellite from "satellite.js";
import { EARTH_RADIUS, getSubsolarPoint } from "./utils/coords.js";

const DEFAULT_LOOKAHEAD_HOURS = 24;
const SEARCH_STEP_SECONDS = 20;
const PASS_SAMPLE_SECONDS = 10;
const HORIZON_ELEVATION_DEGREES = 0;
const DARK_OBSERVER_SUN_ELEVATION_DEGREES = -6;

export function predictNextPass(
  sat,
  groundStation,
  { startDate = new Date(), lookaheadHours = DEFAULT_LOOKAHEAD_HOURS } = {}
) {
  const observerGd = {
    longitude: THREE.MathUtils.degToRad(groundStation.lon),
    latitude: THREE.MathUtils.degToRad(groundStation.lat),
    height: groundStation.heightKm ?? 0,
  };
  const endTime = startDate.getTime() + lookaheadHours * 3600000;
  let previousDate = startDate;
  let previousLook = getLookAngles(sat, observerGd, previousDate);

  for (
    let time = startDate.getTime() + SEARCH_STEP_SECONDS * 1000;
    time <= endTime;
    time += SEARCH_STEP_SECONDS * 1000
  ) {
    const currentDate = new Date(time);
    const currentLook = getLookAngles(sat, observerGd, currentDate);

    if (!previousLook || !currentLook) {
      previousDate = currentDate;
      previousLook = currentLook;
      continue;
    }

    if (
      previousLook.elevationDegrees < HORIZON_ELEVATION_DEGREES &&
      currentLook.elevationDegrees >= HORIZON_ELEVATION_DEGREES
    ) {
      const aos = refineHorizonCrossing(
        sat,
        observerGd,
        previousDate,
        currentDate,
        true
      );
      const pass = buildPassFromAos(sat, observerGd, aos, endTime);

      if (pass) {
        return {
          satelliteName: sat.name,
          groundStationName: groundStation.name || "Ground station",
          ...pass,
        };
      }
    }

    previousDate = currentDate;
    previousLook = currentLook;
  }

  return null;
}

function buildPassFromAos(sat, observerGd, aos, endTime) {
  const samples = [];
  let previousDate = aos;
  let previousLook = getLookAngles(sat, observerGd, previousDate);

  samples.push(createPassSample(sat, observerGd, aos, previousLook));

  for (
    let time = aos.getTime() + PASS_SAMPLE_SECONDS * 1000;
    time <= endTime;
    time += PASS_SAMPLE_SECONDS * 1000
  ) {
    const currentDate = new Date(time);
    const currentLook = getLookAngles(sat, observerGd, currentDate);

    if (!previousLook || !currentLook) {
      previousDate = currentDate;
      previousLook = currentLook;
      continue;
    }

    if (currentLook.elevationDegrees < HORIZON_ELEVATION_DEGREES) {
      const los = refineHorizonCrossing(
        sat,
        observerGd,
        previousDate,
        currentDate,
        false
      );
      const losLook = getLookAngles(sat, observerGd, los);

      samples.push(createPassSample(sat, observerGd, los, losLook));
      return summarizePass(sat, observerGd, aos, los, samples);
    }

    samples.push(createPassSample(sat, observerGd, currentDate, currentLook));
    previousDate = currentDate;
    previousLook = currentLook;
  }

  return null;
}

function summarizePass(sat, observerGd, aos, los, samples) {
  const maxSample = samples.reduce((max, sample) =>
    sample.elevationDegrees > max.elevationDegrees ? sample : max
  );
  const visibilitySample = createPassSample(
    sat,
    observerGd,
    maxSample.date,
    getLookAngles(sat, observerGd, maxSample.date)
  );

  return {
    aos,
    los,
    durationSeconds: Math.round((los.getTime() - aos.getTime()) / 1000),
    maxElevationDegrees: maxSample.elevationDegrees,
    maxElevationAt: maxSample.date,
    visibility: formatVisibility(visibilitySample),
    samples,
  };
}

function refineHorizonCrossing(sat, observerGd, startDate, endDate, rising) {
  let low = startDate.getTime();
  let high = endDate.getTime();

  for (let i = 0; i < 18; i++) {
    const mid = Math.round((low + high) / 2);
    const look = getLookAngles(sat, observerGd, new Date(mid));

    if (!look) break;

    const above = look.elevationDegrees >= HORIZON_ELEVATION_DEGREES;

    if (above === rising) {
      high = mid;
    } else {
      low = mid;
    }
  }

  return new Date(high);
}

function getLookAngles(sat, observerGd, date) {
  const positionAndVelocity = satellite.propagate(sat.satrec, date);
  const positionEci = positionAndVelocity.position;

  if (!positionEci) return null;

  const gmst = satellite.gstime(date);
  const positionEcf = satellite.eciToEcf(positionEci, gmst);
  const lookAngles = satellite.ecfToLookAngles(observerGd, positionEcf);

  return {
    azimuthDegrees: normalizeDegrees(
      THREE.MathUtils.radToDeg(lookAngles.azimuth)
    ),
    elevationDegrees: THREE.MathUtils.radToDeg(lookAngles.elevation),
    rangeKm: lookAngles.rangeSat,
    positionEci,
  };
}

function createPassSample(sat, observerGd, date, look) {
  const observerLat = THREE.MathUtils.radToDeg(observerGd.latitude);
  const observerLon = THREE.MathUtils.radToDeg(observerGd.longitude);

  return {
    date,
    azimuthDegrees: look?.azimuthDegrees ?? Number.NaN,
    elevationDegrees: look?.elevationDegrees ?? Number.NaN,
    rangeKm: look?.rangeKm ?? Number.NaN,
    sunlit: look?.positionEci ? isSatelliteSunlit(look.positionEci, date) : false,
    observerSunElevationDegrees: getObserverSunElevationDegrees(
      observerLat,
      observerLon,
      date
    ),
  };
}

function isSatelliteSunlit(positionEci, date) {
  const satPosition = new THREE.Vector3(
    positionEci.x,
    positionEci.y,
    positionEci.z
  );
  const sunDirection = getSunEciDirection(date);
  const projection = satPosition.dot(sunDirection);

  if (projection >= 0) return true;

  const perpendicularDistance = satPosition
    .clone()
    .sub(sunDirection.clone().multiplyScalar(projection))
    .length();

  return perpendicularDistance > EARTH_RADIUS;
}

function getSunEciDirection(date) {
  const daysSinceJ2000 = date.getTime() / 86400000 + 2440587.5 - 2451545.0;
  const meanLongitude = normalizeDegrees(280.460 + 0.9856474 * daysSinceJ2000);
  const meanAnomaly = THREE.MathUtils.degToRad(
    normalizeDegrees(357.528 + 0.9856003 * daysSinceJ2000)
  );
  const eclipticLongitude = THREE.MathUtils.degToRad(
    normalizeDegrees(
      meanLongitude +
        1.915 * Math.sin(meanAnomaly) +
        0.02 * Math.sin(2 * meanAnomaly)
    )
  );
  const obliquity = THREE.MathUtils.degToRad(
    23.439 - 0.0000004 * daysSinceJ2000
  );

  return new THREE.Vector3(
    Math.cos(eclipticLongitude),
    Math.cos(obliquity) * Math.sin(eclipticLongitude),
    Math.sin(obliquity) * Math.sin(eclipticLongitude)
  ).normalize();
}

function getObserverSunElevationDegrees(lat, lon, date) {
  const subsolarPoint = getSubsolarPoint(date);
  const angularDistance = centralAngleDegrees(
    lat,
    lon,
    subsolarPoint.lat,
    subsolarPoint.lon
  );

  return 90 - angularDistance;
}

function centralAngleDegrees(lat1, lon1, lat2, lon2) {
  const lat1Rad = THREE.MathUtils.degToRad(lat1);
  const lat2Rad = THREE.MathUtils.degToRad(lat2);
  const deltaLon = THREE.MathUtils.degToRad(lon2 - lon1);
  const cosine =
    Math.sin(lat1Rad) * Math.sin(lat2Rad) +
    Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.cos(deltaLon);

  return THREE.MathUtils.radToDeg(
    Math.acos(THREE.MathUtils.clamp(cosine, -1, 1))
  );
}

function formatVisibility(sample) {
  const observerLight =
    sample.observerSunElevationDegrees < DARK_OBSERVER_SUN_ELEVATION_DEGREES
      ? "dark observer"
      : sample.observerSunElevationDegrees < 0
        ? "twilight observer"
        : "daylight observer";
  const satelliteLight = sample.sunlit ? "Sunlit satellite" : "eclipsed satellite";

  return `${satelliteLight}, ${observerLight}`;
}

function normalizeDegrees(degrees) {
  return ((degrees % 360) + 360) % 360;
}
