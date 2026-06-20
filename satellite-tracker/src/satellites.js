import * as THREE from "three";
import * as satellite from "satellite.js";
import { EARTH_RADIUS, SCALE } from "./utils/coords.js";

const CELESTRAK_TLE_BASE_URL =
  "https://celestrak.org/NORAD/elements/gp.php?FORMAT=tle";

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

const SATELLITE_GROUP_COLORS = {
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

export class SatelliteTracker {
  constructor(
    scene,
    { maxSatellites = 3000, groups = ["stations"] } = {}
  ) {
    this.scene = scene;
    this.maxSatellites = maxSatellites;
    this.groups = groups;
    this.satellites = [];
    this.satelliteByMesh = new Map();
    this.selectedSatellite = null;
    this.trajectoryLine = null;
    this.loadId = 0;
  }

  async load(groups = this.groups) {
    const loadId = ++this.loadId;

    this.groups = groups;
    this.clearSatellites();

    if (groups.length === 0) {
      return 0;
    }

    const results = await Promise.allSettled(
      groups.map((group) => this.fetchGroup(group))
    );
    const tleGroups = results
      .filter((result) => result.status === "fulfilled")
      .map((result) => result.value);

    if (loadId !== this.loadId) {
      return this.satellites.length;
    }

    if (tleGroups.length === 0) {
      const failedGroups = groups.join(", ");
      throw new Error(`No CelesTrak groups loaded: ${failedGroups}`);
    }

    const satellites = [];
    const catalogIds = new Set();

    for (const { group, text } of tleGroups) {
      const lines = text.trim().split("\n");

      for (
        let i = 0;
        i < lines.length && satellites.length < this.maxSatellites;
        i += 3
      ) {
        const name = lines[i].trim();
        const tle1 = lines[i + 1]?.trim();
        const tle2 = lines[i + 2]?.trim();
        const catalogId = tle1?.slice(2, 7);

        if (!tle1 || !tle2 || catalogIds.has(catalogId)) continue;

        const satrec = satellite.twoline2satrec(tle1, tle2);
        const mesh = this.createSatelliteMesh(group);
        const sat = { name, group, satrec, mesh };

        catalogIds.add(catalogId);
        this.satelliteByMesh.set(mesh, sat);
        this.scene.add(mesh);
        satellites.push(sat);
      }
    }

    this.satellites = satellites;
    return satellites.length;
  }

  async fetchGroup(group) {
    const url = `${CELESTRAK_TLE_BASE_URL}&GROUP=${encodeURIComponent(group)}`;
    const res = await fetch(url);

    if (!res.ok) {
      throw new Error(`Failed to load CelesTrak group "${group}"`);
    }

    return { group, text: await res.text() };
  }

  clearSatellites() {
    this.clearTrajectory();
    this.selectedSatellite = null;
    this.satelliteByMesh.clear();

    for (const sat of this.satellites) {
      this.scene.remove(sat.mesh);
      sat.mesh.geometry.dispose();
      sat.mesh.material.dispose();
    }

    this.satellites = [];
  }

  update(date) {
    for (const sat of this.satellites) {
      this.updateSatellitePosition(sat, date);
    }
  }

  createSatelliteMesh(group) {
    return new THREE.Mesh(
      new THREE.SphereGeometry(0.025, 12, 12),
      new THREE.MeshBasicMaterial({
        color: SATELLITE_GROUP_COLORS[group] ?? 0xffffff,
        toneMapped: false,
      })
    );
  }

  getSatelliteMeshes() {
    return this.satellites.map((sat) => sat.mesh);
  }

  findSatelliteNearScreenPoint(x, y, camera, domElement, maxDistancePx = 12) {
    const rect = domElement.getBoundingClientRect();
    let nearestSatellite = null;
    let nearestDistance = maxDistancePx;

    for (const sat of this.satellites) {
      const screenPosition = sat.mesh.position.clone().project(camera);

      if (screenPosition.z < -1 || screenPosition.z > 1) continue;

      const screenX = ((screenPosition.x + 1) / 2) * rect.width + rect.left;
      const screenY = ((-screenPosition.y + 1) / 2) * rect.height + rect.top;
      const distance = Math.hypot(screenX - x, screenY - y);

      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestSatellite = sat;
      }
    }

    return nearestSatellite;
  }

  selectSatelliteByMesh(mesh, date) {
    const sat = this.satelliteByMesh.get(mesh);

    if (!sat) return;

    this.selectSatellite(sat, date);
  }

  selectSatellite(sat, date) {
    this.selectedSatellite = sat;
    this.drawTrajectory(sat, date);
  }

  drawTrajectory(sat, date) {
    this.clearTrajectory();

    const periodMinutes = this.getOrbitalPeriodMinutes(sat);
    const points = [];
    const steps = 180;

    for (let step = 0; step <= steps; step++) {
      const offsetMinutes = (periodMinutes * step) / steps;
      const pointDate = new Date(date.getTime() + offsetMinutes * 60000);
      const position = this.getSatelliteScenePosition(sat, pointDate);

      if (position) {
        points.push(position);
      }
    }

    if (points.length < 2) return;

    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      color: 0x66ccff,
      transparent: true,
      opacity: 0.85,
    });

    this.trajectoryLine = new THREE.Line(geometry, material);
    this.scene.add(this.trajectoryLine);
  }

  clearTrajectory() {
    if (!this.trajectoryLine) return;

    this.scene.remove(this.trajectoryLine);
    this.trajectoryLine.geometry.dispose();
    this.trajectoryLine.material.dispose();
    this.trajectoryLine = null;
  }

  getOrbitalPeriodMinutes(sat) {
    if (!sat.satrec.no) return 90;

    return (2 * Math.PI) / sat.satrec.no;
  }

  updateSatellitePosition(sat, date) {
    const position = this.getSatelliteScenePosition(sat, date);

    if (!position) return;

    sat.mesh.position.copy(position);
  }

  getSatelliteScenePosition(sat, date) {
    const positionAndVelocity = satellite.propagate(sat.satrec, date);
    const positionEci = positionAndVelocity.position;

    if (!positionEci) return null;

    const gmst = satellite.gstime(date);
    const positionGd = satellite.eciToGeodetic(positionEci, gmst);
    const lat = satellite.degreesLat(positionGd.latitude);
    const lon = satellite.degreesLong(positionGd.longitude);
    const alt = positionGd.height;
    const radius = (EARTH_RADIUS + alt) * SCALE;
    const phi = THREE.MathUtils.degToRad(90 - lat);
    const theta = THREE.MathUtils.degToRad(lon + 180);

    return new THREE.Vector3(
      -radius * Math.sin(phi) * Math.cos(theta),
      radius * Math.cos(phi),
      radius * Math.sin(phi) * Math.sin(theta)
    );
  }
}
