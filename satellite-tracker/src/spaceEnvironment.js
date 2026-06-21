import * as THREE from "three";
import moonTextureUrl from "./assets/2k_moon.jpg";
import starsTextureUrl from "./assets/2k_stars_milky_way.jpg";
import {
  SCALE,
  geodeticToScenePosition,
  greenwichSiderealTime,
  julianDate,
  normalizeDegrees,
  normalizeLongitude,
} from "./utils/coords.js";

const MOON_RADIUS_KM = 1737.4;
const STARFIELD_RADIUS = 5000;
const LUNAR_ORBIT_DAYS = 27.321661;
const LUNAR_ORBIT_STEPS = 240;
const J2000 = 2451545.0;

export class SpaceEnvironment {
  constructor(renderer) {
    this.renderer = renderer;
    this.group = new THREE.Group();
    this.textureLoader = new THREE.TextureLoader();
    this.moonOrbitUpdateKey = null;

    this.createStars();
    this.createMoon();
    this.createMoonOrbit();
  }

  addTo(scene) {
    scene.add(this.group);
  }

  update(date) {
    const moonPosition = getMoonScenePosition(date);

    this.moon.position.copy(moonPosition);
    this.moon.quaternion.copy(getMoonSceneQuaternion(date));
    this.updateMoonOrbitIfNeeded(date);
  }

  createStars() {
    const starsTexture = this.loadTexture(starsTextureUrl);

    starsTexture.wrapS = THREE.RepeatWrapping;
    starsTexture.repeat.x = -1;

    this.stars = new THREE.Mesh(
      new THREE.SphereGeometry(STARFIELD_RADIUS, 64, 64),
      new THREE.MeshBasicMaterial({
        map: starsTexture,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
      })
    );

    this.group.add(this.stars);
  }

  createMoon() {
    const moonTexture = this.loadTexture(moonTextureUrl);
    const moonRadius = MOON_RADIUS_KM * SCALE;

    this.moon = new THREE.Mesh(
      new THREE.SphereGeometry(moonRadius, 64, 64),
      new THREE.MeshPhongMaterial({
        map: moonTexture,
        shininess: 0,
      })
    );

    this.group.add(this.moon);
  }

  createMoonOrbit() {
    const geometry = new THREE.BufferGeometry();
    const material = new THREE.LineBasicMaterial({
      color: 0xaecbff,
      transparent: true,
      opacity: 0.45,
    });

    this.moonOrbit = new THREE.LineLoop(geometry, material);
    this.moonOrbit.visible = false;
    this.group.add(this.moonOrbit);
  }

  getMoonMesh() {
    return this.moon;
  }

  showMoonOrbit() {
    this.moonOrbit.visible = true;
  }

  hideMoonOrbit() {
    this.moonOrbit.visible = false;
  }

  updateMoonOrbitIfNeeded(date) {
    const updateKey = Math.floor(date.getTime() / 3600000);

    if (this.moonOrbitUpdateKey === updateKey) return;

    this.moonOrbitUpdateKey = updateKey;
    this.updateMoonOrbit(date);
  }

  updateMoonOrbit(date) {
    const points = [];
    const startTime = date.getTime();

    for (let step = 0; step < LUNAR_ORBIT_STEPS; step++) {
      const offsetMs =
        (LUNAR_ORBIT_DAYS * 86400000 * step) / LUNAR_ORBIT_STEPS;
      points.push(getMoonScenePosition(new Date(startTime + offsetMs)));
    }

    this.moonOrbit.geometry.dispose();
    this.moonOrbit.geometry = new THREE.BufferGeometry().setFromPoints(points);
  }

  loadTexture(url) {
    const texture = this.textureLoader.load(url);

    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    return texture;
  }
}

export function getMoonScenePosition(date) {
  const geocentricPosition = getMoonGeocentricPosition(date);
  const sceneRadius = geocentricPosition.distanceKm * SCALE;

  return geodeticToScenePosition(
    geocentricPosition.dec,
    geocentricPosition.lon,
    sceneRadius
  );
}

function getMoonSceneQuaternion(date) {
  const { xAxis, yAxis, zAxis } = getMoonSceneAxes(date);
  const rotationMatrix = new THREE.Matrix4();

  rotationMatrix.makeBasis(yAxis, zAxis, xAxis);
  return new THREE.Quaternion().setFromRotationMatrix(rotationMatrix);
}

function getMoonSceneAxes(date) {
  const jd = julianDate(date);
  const daysSinceJ2000 = jd - J2000;
  const centuriesSinceJ2000 = daysSinceJ2000 / 36525;
  const angles = getMoonOrientationAngles(daysSinceJ2000, centuriesSinceJ2000);
  const poleRa = THREE.MathUtils.degToRad(angles.rightAscension);
  const poleDec = THREE.MathUtils.degToRad(angles.declination);
  const primeMeridian = THREE.MathUtils.degToRad(angles.primeMeridian);
  const xAxisInertial = new THREE.Vector3(
    -Math.sin(poleRa) * Math.cos(primeMeridian) -
      Math.cos(poleRa) * Math.sin(poleDec) * Math.sin(primeMeridian),
    Math.cos(poleRa) * Math.cos(primeMeridian) -
      Math.sin(poleRa) * Math.sin(poleDec) * Math.sin(primeMeridian),
    Math.cos(poleDec) * Math.sin(primeMeridian)
  );
  const yAxisInertial = new THREE.Vector3(
    Math.sin(poleRa) * Math.sin(primeMeridian) -
      Math.cos(poleRa) * Math.sin(poleDec) * Math.cos(primeMeridian),
    -Math.cos(poleRa) * Math.sin(primeMeridian) -
      Math.sin(poleRa) * Math.sin(poleDec) * Math.cos(primeMeridian),
    Math.cos(poleDec) * Math.cos(primeMeridian)
  );
  const zAxisInertial = new THREE.Vector3(
    Math.cos(poleRa) * Math.cos(poleDec),
    Math.sin(poleRa) * Math.cos(poleDec),
    Math.sin(poleDec)
  );

  return {
    xAxis: inertialToSceneDirection(xAxisInertial, jd),
    yAxis: inertialToSceneDirection(yAxisInertial, jd),
    zAxis: inertialToSceneDirection(zAxisInertial, jd),
  };
}

function getMoonOrientationAngles(daysSinceJ2000, centuriesSinceJ2000) {
  const e = getMoonOrientationArguments(daysSinceJ2000);
  const rightAscension =
    269.9949 +
    0.0031 * centuriesSinceJ2000 -
    3.8787 * sinDeg(e[1]) -
    0.1204 * sinDeg(e[2]) +
    0.07 * sinDeg(e[3]) -
    0.0172 * sinDeg(e[4]) +
    0.0072 * sinDeg(e[6]) -
    0.0052 * sinDeg(e[10]) +
    0.0043 * sinDeg(e[13]);
  const declination =
    66.5392 +
    0.013 * centuriesSinceJ2000 +
    1.5419 * cosDeg(e[1]) +
    0.0239 * cosDeg(e[2]) -
    0.0278 * cosDeg(e[3]) +
    0.0068 * cosDeg(e[4]) -
    0.0029 * cosDeg(e[6]) +
    0.0009 * cosDeg(e[7]) +
    0.0008 * cosDeg(e[10]) -
    0.0009 * cosDeg(e[13]);
  const primeMeridian =
    38.3213 +
    13.17635815 * daysSinceJ2000 -
    0.0000000000014 * daysSinceJ2000 * daysSinceJ2000 +
    3.561 * sinDeg(e[1]) +
    0.1208 * sinDeg(e[2]) -
    0.0642 * sinDeg(e[3]) +
    0.0158 * sinDeg(e[4]) +
    0.0252 * sinDeg(e[5]) -
    0.0066 * sinDeg(e[6]) -
    0.0047 * sinDeg(e[7]) -
    0.0046 * sinDeg(e[8]) +
    0.0028 * sinDeg(e[9]) +
    0.0052 * sinDeg(e[10]) +
    0.004 * sinDeg(e[11]) +
    0.0019 * sinDeg(e[12]) -
    0.0044 * sinDeg(e[13]);

  return {
    rightAscension: normalizeDegrees(rightAscension),
    declination,
    primeMeridian: normalizeDegrees(primeMeridian),
  };
}

function getMoonOrientationArguments(daysSinceJ2000) {
  return {
    1: normalizeDegrees(125.045 - 0.0529921 * daysSinceJ2000),
    2: normalizeDegrees(250.089 - 0.1059842 * daysSinceJ2000),
    3: normalizeDegrees(260.008 + 13.0120009 * daysSinceJ2000),
    4: normalizeDegrees(176.625 + 13.3407154 * daysSinceJ2000),
    5: normalizeDegrees(357.529 + 0.9856003 * daysSinceJ2000),
    6: normalizeDegrees(311.589 + 26.4057084 * daysSinceJ2000),
    7: normalizeDegrees(134.963 + 13.064993 * daysSinceJ2000),
    8: normalizeDegrees(276.617 + 0.3287146 * daysSinceJ2000),
    9: normalizeDegrees(34.226 + 1.7484877 * daysSinceJ2000),
    10: normalizeDegrees(15.134 - 0.1589763 * daysSinceJ2000),
    11: normalizeDegrees(119.743 + 0.0036096 * daysSinceJ2000),
    12: normalizeDegrees(239.961 + 0.1643573 * daysSinceJ2000),
    13: normalizeDegrees(25.053 + 12.9590088 * daysSinceJ2000),
  };
}

function inertialToSceneDirection(vector, jd) {
  const rightAscension = normalizeDegrees(
    THREE.MathUtils.radToDeg(Math.atan2(vector.y, vector.x))
  );
  const declination = THREE.MathUtils.radToDeg(
    Math.asin(THREE.MathUtils.clamp(vector.z / vector.length(), -1, 1))
  );

  return geodeticToScenePosition(
    declination,
    normalizeLongitude(rightAscension - greenwichSiderealTime(jd)),
    1
  ).normalize();
}

function getMoonGeocentricPosition(date) {
  const jd = julianDate(date);
  const daysSinceJ2000 = jd - J2000;
  const meanLongitude = normalizeDegrees(
    218.3164477 + 13.17639648 * daysSinceJ2000
  );
  const meanElongation = normalizeDegrees(
    297.8501921 + 12.19074912 * daysSinceJ2000
  );
  const solarMeanAnomaly = normalizeDegrees(
    357.5291092 + 0.98560028 * daysSinceJ2000
  );
  const lunarMeanAnomaly = normalizeDegrees(
    134.9633964 + 13.06499295 * daysSinceJ2000
  );
  const argumentOfLatitude = normalizeDegrees(
    93.272095 + 13.22935024 * daysSinceJ2000
  );
  const longitude = normalizeDegrees(
    meanLongitude +
      6.289 * sinDeg(lunarMeanAnomaly) +
      1.274 * sinDeg(2 * meanElongation - lunarMeanAnomaly) +
      0.658 * sinDeg(2 * meanElongation) +
      0.214 * sinDeg(2 * lunarMeanAnomaly) -
      0.186 * sinDeg(solarMeanAnomaly) -
      0.114 * sinDeg(2 * argumentOfLatitude)
  );
  const latitude =
    5.128 * sinDeg(argumentOfLatitude) +
    0.28 * sinDeg(lunarMeanAnomaly + argumentOfLatitude) +
    0.277 * sinDeg(lunarMeanAnomaly - argumentOfLatitude) +
    0.173 * sinDeg(2 * meanElongation - argumentOfLatitude) +
    0.055 * sinDeg(2 * meanElongation + argumentOfLatitude - lunarMeanAnomaly) +
    0.046 * sinDeg(2 * meanElongation - argumentOfLatitude - lunarMeanAnomaly) +
    0.033 * sinDeg(2 * meanElongation + argumentOfLatitude) +
    0.017 * sinDeg(2 * lunarMeanAnomaly + argumentOfLatitude);
  const distanceKm =
    385000.56 -
    20905.355 * cosDeg(lunarMeanAnomaly) -
    3699.111 * cosDeg(2 * meanElongation - lunarMeanAnomaly) -
    2955.968 * cosDeg(2 * meanElongation) -
    569.925 * cosDeg(2 * lunarMeanAnomaly);
  const obliquity = 23.439291 - 0.00000036 * daysSinceJ2000;
  const rightAscension = normalizeDegrees(
    THREE.MathUtils.radToDeg(
      Math.atan2(
        sinDeg(longitude) * cosDeg(obliquity) -
          Math.tan(THREE.MathUtils.degToRad(latitude)) * sinDeg(obliquity),
        cosDeg(longitude)
      )
    )
  );
  const declination = THREE.MathUtils.radToDeg(
    Math.asin(
      sinDeg(latitude) * cosDeg(obliquity) +
        cosDeg(latitude) * sinDeg(obliquity) * sinDeg(longitude)
    )
  );
  const sublunarLongitude = normalizeLongitude(
    rightAscension - greenwichSiderealTime(jd)
  );

  return {
    dec: declination,
    lon: sublunarLongitude,
    distanceKm,
  };
}

function sinDeg(degrees) {
  return Math.sin(THREE.MathUtils.degToRad(degrees));
}

function cosDeg(degrees) {
  return Math.cos(THREE.MathUtils.degToRad(degrees));
}
