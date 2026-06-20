import * as THREE from "three";

export const EARTH_RADIUS = 6371;
export const SCALE = 1 / 1000;
export const EARTH_SIZE = EARTH_RADIUS * SCALE;

export function normalizeDegrees(degrees) {
  return ((degrees % 360) + 360) % 360;
}

export function normalizeLongitude(degrees) {
  return ((degrees + 540) % 360) - 180;
}

export function julianDate(date) {
  return date.getTime() / 86400000 + 2440587.5;
}

export function greenwichSiderealTime(jd) {
  const t = (jd - 2451545.0) / 36525;

  return normalizeDegrees(
    280.46061837 +
      360.98564736629 * (jd - 2451545.0) +
      0.000387933 * t * t -
      (t * t * t) / 38710000
  );
}

export function getSubsolarPoint(date) {
  const jd = julianDate(date);
  const daysSinceJ2000 = jd - 2451545.0;

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

  const rightAscension = normalizeDegrees(
    THREE.MathUtils.radToDeg(
      Math.atan2(
        Math.cos(obliquity) * Math.sin(eclipticLongitude),
        Math.cos(eclipticLongitude)
      )
    )
  );
  const declination = THREE.MathUtils.radToDeg(
    Math.asin(Math.sin(obliquity) * Math.sin(eclipticLongitude))
  );
  const longitude = normalizeLongitude(
    rightAscension - greenwichSiderealTime(jd)
  );

  return { lat: declination, lon: longitude };
}

export function geodeticToSceneDirection(lat, lon) {
  const phi = THREE.MathUtils.degToRad(90 - lat);
  const theta = THREE.MathUtils.degToRad(lon + 180);

  return new THREE.Vector3(
    -Math.sin(phi) * Math.cos(theta),
    Math.cos(phi),
    Math.sin(phi) * Math.sin(theta)
  ).normalize();
}

export function geodeticToScenePosition(lat, lon, radius) {
  return geodeticToSceneDirection(lat, lon).multiplyScalar(radius);
}
