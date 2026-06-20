import * as THREE from "three";
import * as satellite from "satellite.js";
import { EARTH_RADIUS, SCALE } from "./utils/coords.js";

const STATIONS_TLE_URL =
  "https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=tle";

export class SatelliteTracker {
  constructor(
    scene,
    { maxSatellites = 1000, tleUrl = STATIONS_TLE_URL } = {}
  ) {
    this.scene = scene;
    this.maxSatellites = maxSatellites;
    this.tleUrl = tleUrl;
    this.satellites = [];
    this.satelliteByMesh = new Map();
    this.selectedSatellite = null;
    this.trajectoryLine = null;
  }

  async load() {
    const res = await fetch(this.tleUrl);
    const text = await res.text();
    const lines = text.trim().split("\n");
    const satellites = [];

    for (
      let i = 0;
      i < lines.length && satellites.length < this.maxSatellites;
      i += 3
    ) {
      const name = lines[i].trim();
      const tle1 = lines[i + 1]?.trim();
      const tle2 = lines[i + 2]?.trim();

      if (!tle1 || !tle2) continue;

      const satrec = satellite.twoline2satrec(tle1, tle2);
      const mesh = this.createSatelliteMesh();

      this.scene.add(mesh);
      const sat = { name, satrec, mesh };

      this.satelliteByMesh.set(mesh, sat);
      satellites.push(sat);
    }

    this.satellites = satellites;
  }

  update(date) {
    for (const sat of this.satellites) {
      this.updateSatellitePosition(sat, date);
    }
  }

  createSatelliteMesh() {
    return new THREE.Mesh(
      new THREE.SphereGeometry(0.015, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
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
