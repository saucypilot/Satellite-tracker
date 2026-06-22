import * as THREE from "three";
import * as satellite from "satellite.js";
import { EARTH_RADIUS, SCALE } from "./utils/coords.js";
import {
  SATELLITE_GROUP_COLORS,
  loadCelesTrakGroups,
} from "./celestrak.js";
export { CELESTRAK_GROUPS, SATELLITE_GROUP_COLOR_HEX } from "./celestrak.js";

const SATELLITE_BLINK_SPEED = 0.004;
const SATELLITE_BLINK_MIN_OPACITY = 0.72;
const SATELLITE_BLINK_MAX_OPACITY = 1;
const SATELLITE_SIZE = 0.04;

export class SatelliteTracker {
  constructor(
    scene,
    { maxSatellites = 3000, groups = ["active"] } = {}
  ) {
    this.scene = scene;
    this.maxSatellites = maxSatellites;
    this.groups = groups;
    this.satellites = [];
    this.satelliteByMesh = new Map();
    this.selectedSatellite = null;
    this.selectionMarker = this.createSelectionMarker();
    this.trajectoryLine = null;
    this.loadId = 0;
    this.scene.add(this.selectionMarker);
  }

  async load(groups = this.groups) {
    const loadId = ++this.loadId;

    this.groups = groups;
    this.clearSatellites();

    if (groups.length === 0) {
      return {
        count: 0,
        cachedGroups: [],
        failedGroups: [],
        limitedByMax: false,
      };
    }

    const { tleGroups, failedGroups, cachedGroups } =
      await loadCelesTrakGroups(groups);

    if (loadId !== this.loadId) {
      return {
        count: this.satellites.length,
        cachedGroups: [],
        failedGroups: [],
        limitedByMax: false,
      };
    }

    if (tleGroups.length === 0) {
      const failedGroupList = groups.join(", ");
      throw new Error(`No CelesTrak groups loaded: ${failedGroupList}`);
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
        const sat = {
          name,
          group,
          catalogId,
          satrec,
          tle1,
          tle2,
          mesh,
          orbitalPeriodMinutes: this.getOrbitalPeriodMinutes({ satrec }),
          inclinationDegrees: THREE.MathUtils.radToDeg(satrec.inclo),
          eccentricity: satrec.ecco,
          blinkPhase: satellites.length * 0.73,
        };

        catalogIds.add(catalogId);
        this.satelliteByMesh.set(mesh, sat);
        this.scene.add(mesh);
        satellites.push(sat);
      }
    }

    this.satellites = satellites;
    return {
      count: satellites.length,
      cachedGroups,
      failedGroups,
      limitedByMax: satellites.length === this.maxSatellites,
    };
  }

  clearSatellites() {
    this.clearSelection();
    this.satelliteByMesh.clear();

    for (const sat of this.satellites) {
      this.scene.remove(sat.mesh);
      sat.mesh.geometry.dispose();
      sat.mesh.material.dispose();
    }

    this.satellites = [];
  }

  update(date) {
    const timestamp = date.getTime();

    for (const sat of this.satellites) {
      this.updateSatellitePosition(sat, date);
      this.updateSatelliteBlink(sat, timestamp);
    }
  }

  createSatelliteMesh(group) {
    return new THREE.Mesh(
      new THREE.SphereGeometry(SATELLITE_SIZE, 16, 16),
      new THREE.MeshBasicMaterial({
        color: SATELLITE_GROUP_COLORS[group] ?? 0xffffff,
        transparent: true,
        opacity: SATELLITE_BLINK_MAX_OPACITY,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      })
    );
  }

  updateSatelliteBlink(sat, timestamp) {
    const blink =
      (Math.sin(timestamp * SATELLITE_BLINK_SPEED + sat.blinkPhase) + 1) / 2;

    sat.mesh.material.opacity = THREE.MathUtils.lerp(
      SATELLITE_BLINK_MIN_OPACITY,
      SATELLITE_BLINK_MAX_OPACITY,
      blink
    );
  }

  createSelectionMarker() {
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(0.065, 16, 16),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        wireframe: true,
        transparent: true,
        opacity: 0.95,
        toneMapped: false,
      })
    );

    marker.visible = false;
    return marker;
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

    if (!sat) return null;

    return this.selectSatellite(sat, date);
  }

  getSatelliteByMesh(mesh) {
    return this.satelliteByMesh.get(mesh) ?? null;
  }

  selectSatellite(sat, date) {
    if (this.selectedSatellite) {
      this.selectedSatellite.mesh.scale.setScalar(1);
    }

    this.updateSatelliteScenePosition(sat, date);
    this.selectedSatellite = sat;
    sat.mesh.scale.setScalar(1.9);
    this.selectionMarker.visible = true;
    this.selectionMarker.position.copy(sat.mesh.position);
    this.drawTrajectory(sat, date);

    return sat;
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

  clearSelection() {
    if (this.selectedSatellite) {
      this.selectedSatellite.mesh.scale.setScalar(1);
    }

    this.selectedSatellite = null;
    this.selectionMarker.visible = false;
    this.clearTrajectory();
  }

  getOrbitalPeriodMinutes(sat) {
    if (!sat.satrec.no) return 90;

    return (2 * Math.PI) / sat.satrec.no;
  }

  updateSatellitePosition(sat, date) {
    const position = this.updateSatelliteScenePosition(sat, date);

    if (!position) return;

    sat.mesh.position.copy(position);

    if (sat === this.selectedSatellite) {
      this.selectionMarker.position.copy(position);
    }
  }

  getSatelliteScenePosition(sat, date) {
    const position = this.getSatellitePositionData(sat, date);

    if (!position) return null;

    return position.scenePosition;
  }

  updateSatelliteScenePosition(sat, date) {
    const position = this.getSatellitePositionData(sat, date);

    if (!position) return null;

    sat.latitude = position.lat;
    sat.longitude = position.lon;
    sat.altitudeKm = position.alt;
    return position.scenePosition;
  }

  getSatellitePositionData(sat, date) {
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

    return {
      lat,
      lon,
      alt,
      scenePosition: new THREE.Vector3(
        -radius * Math.sin(phi) * Math.cos(theta),
        radius * Math.cos(phi),
        radius * Math.sin(phi) * Math.sin(theta)
      ),
    };
  }
}
