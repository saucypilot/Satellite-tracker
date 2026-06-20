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
      satellites.push({ name, satrec, mesh });
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

  updateSatellitePosition(sat, date) {
    const positionAndVelocity = satellite.propagate(sat.satrec, date);
    const positionEci = positionAndVelocity.position;

    if (!positionEci) return;

    const gmst = satellite.gstime(date);
    const positionGd = satellite.eciToGeodetic(positionEci, gmst);
    const lat = satellite.degreesLat(positionGd.latitude);
    const lon = satellite.degreesLong(positionGd.longitude);
    const alt = positionGd.height;
    const radius = (EARTH_RADIUS + alt) * SCALE;
    const phi = THREE.MathUtils.degToRad(90 - lat);
    const theta = THREE.MathUtils.degToRad(lon + 180);

    sat.mesh.position.set(
      -radius * Math.sin(phi) * Math.cos(theta),
      radius * Math.cos(phi),
      radius * Math.sin(phi) * Math.sin(theta)
    );
  }
}
