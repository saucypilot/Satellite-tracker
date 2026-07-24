import * as THREE from "three";
import { json2satrec, twoline2satrec } from "../node_modules/satellite.js/dist/io.js";
import { gstime, propagate } from "../node_modules/satellite.js/dist/propagation.js";
import {
  degreesLat,
  degreesLong,
  eciToGeodetic,
} from "../node_modules/satellite.js/dist/transforms.js";
import { EARTH_RADIUS, SCALE } from "./utils/coords.js";
import {
  SATELLITE_GROUP_COLORS,
  loadCelesTrakGroups,
} from "./celestrak.js";
import { SatellitePropagationPool } from "./SatellitePropagationPool.js";
export { CELESTRAK_GROUPS, SATELLITE_GROUP_COLOR_HEX } from "./celestrak.js";

const SATELLITE_BLINK_SPEED = 0.004;
const SATELLITE_BLINK_MIN_SCALE = 0.82;
const SATELLITE_BLINK_MAX_SCALE = 1;
const SATELLITE_SIZE = 0.04;
const SATELLITE_UPDATE_INTERVAL_MS = 250;
const PROPAGATION_VALUES_PER_SATELLITE = 6;

export class SatelliteTracker {
  constructor(
    scene,
    { maxSatellites = 8000, groups = ["active"] } = {}
  ) {
    this.scene = scene;
    this.maxSatellites = maxSatellites;
    this.groups = groups;
    this.satellites = [];
    this.satelliteByMesh = new Map();
    this.satelliteInstanceMeshes = [];
    this.propagationPool = new SatellitePropagationPool();
    this.propagationGeneration = 0;
    this.propagationInFlight = false;
    this.pendingPropagation = null;
    this.usesWorkerPropagation = false;
    this.lastPositionUpdate = -Infinity;
    this.selectedSatellite = null;
    this.selectionMarker = this.createSelectionMarker();
    this.trajectoryLine = null;
    this.historyTrailLine = null;
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
    const orderedTleGroups = this.getPrioritizedGroups(tleGroups);
    const firstPassLimit = Math.max(
      1,
      Math.floor(this.maxSatellites / orderedTleGroups.length)
    );

    for (const tleGroup of orderedTleGroups) {
      const remainingSlots = this.maxSatellites - satellites.length;

      if (remainingSlots <= 0) break;

      const groupSatellites =
        tleGroup.format === "json"
          ? this.createSatellitesFromOmmGroup(
              tleGroup,
              catalogIds,
              Math.min(firstPassLimit, remainingSlots)
            )
          : this.createSatellitesFromTleGroup(
              tleGroup,
              catalogIds,
              Math.min(firstPassLimit, remainingSlots)
            );

      this.addSatellitesToScene(groupSatellites, satellites);
    }

    for (const tleGroup of orderedTleGroups) {
      const remainingSlots = this.maxSatellites - satellites.length;

      if (remainingSlots <= 0) break;

      const groupSatellites =
        tleGroup.format === "json"
          ? this.createSatellitesFromOmmGroup(tleGroup, catalogIds, remainingSlots)
          : this.createSatellitesFromTleGroup(tleGroup, catalogIds, remainingSlots);

      this.addSatellitesToScene(groupSatellites, satellites);
    }

    this.satellites = satellites;
    this.createSatelliteInstanceMeshes();
    this.initializePropagationWorkers();
    await this.update(new Date(), true);
    return {
      count: satellites.length,
      cachedGroups,
      failedGroups,
      limitedByMax: satellites.length === this.maxSatellites,
    };
  }

  createSatellitesFromTleGroup({ group, text }, catalogIds, maxSatellites) {
    const satellites = [];
    const lines = text
      .trim()
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    for (let i = 0; i < lines.length; i += 3) {
      if (satellites.length >= maxSatellites) break;

      const name = lines[i];
      const tle1 = lines[i + 1];
      const tle2 = lines[i + 2];
      const catalogId = tle1?.slice(2, 7).trim();

      if (!tle1 || !tle2 || catalogIds.has(catalogId)) continue;

      const satrec = twoline2satrec(tle1, tle2);
      const sat = this.createSatellite(group, {
        name,
        catalogId,
        satrec,
        tle1,
        tle2,
      });

      if (!sat) continue;

      catalogIds.add(catalogId);
      satellites.push(sat);
    }

    return satellites;
  }

  createSatellitesFromOmmGroup({ group, records }, catalogIds, maxSatellites) {
    const satellites = [];

    for (const record of records) {
      if (satellites.length >= maxSatellites) break;

      const catalogId = String(record.NORAD_CAT_ID ?? "").trim();

      if (!catalogId || catalogIds.has(catalogId)) continue;

      try {
        const satrec = json2satrec(record);
        const sat = this.createSatellite(group, {
          name: record.OBJECT_NAME,
          catalogId,
          satrec,
        });

        if (!sat) continue;

        catalogIds.add(catalogId);
        satellites.push(sat);
      } catch (error) {
        console.warn("Unable to parse CelesTrak OMM record:", record, error);
      }
    }

    return satellites;
  }

  createSatellite(group, { name, catalogId, satrec, tle1 = null, tle2 = null }) {
    if (!satrec || satrec.error) return null;

    const mesh = this.createSatelliteMesh(group);

    return {
      name: name?.trim() || `NORAD ${catalogId}`,
      group,
      catalogId,
      satrec,
      tle1,
      tle2,
      mesh,
      orbitalPeriodMinutes: this.getOrbitalPeriodMinutes({ satrec }),
      inclinationDegrees: THREE.MathUtils.radToDeg(satrec.inclo),
      eccentricity: satrec.ecco,
      blinkPhase: 0,
    };
  }

  getPrioritizedGroups(tleGroups) {
    return [...tleGroups].sort((a, b) => {
      if (a.group === "active" && b.group !== "active") return 1;
      if (a.group !== "active" && b.group === "active") return -1;
      return 0;
    });
  }

  addSatellitesToScene(groupSatellites, satellites) {
    for (const sat of groupSatellites) {
      if (satellites.length >= this.maxSatellites) break;

      sat.blinkPhase = satellites.length * 0.73;
      this.satelliteByMesh.set(sat.mesh, sat);
      satellites.push(sat);
    }
  }

  clearSatellites() {
    this.propagationGeneration++;
    this.propagationPool.terminate();
    this.propagationInFlight = false;
    this.pendingPropagation = null;
    this.usesWorkerPropagation = false;
    this.clearSelection();
    this.satelliteByMesh.clear();

    for (const instanceMesh of this.satelliteInstanceMeshes) {
      this.scene.remove(instanceMesh);
      instanceMesh.geometry.dispose();
      instanceMesh.material.dispose();
    }

    this.satelliteInstanceMeshes = [];
    this.satellites = [];
  }

  initializePropagationWorkers() {
    try {
      this.usesWorkerPropagation = this.propagationPool.initialize(
        this.satellites
      );
    } catch (error) {
      console.warn(
        "Web Workers are unavailable; using main-thread satellite propagation.",
        error
      );
      this.propagationPool.terminate();
      this.usesWorkerPropagation = false;
    }
  }

  update(date, force = false) {
    const frameTime = performance.now();

    if (
      !force &&
      (this.propagationInFlight ||
        frameTime - this.lastPositionUpdate < SATELLITE_UPDATE_INTERVAL_MS)
    ) {
      return this.pendingPropagation ?? Promise.resolve();
    }

    this.lastPositionUpdate = frameTime;

    if (!this.usesWorkerPropagation) {
      this.updateSatellitesSynchronously(date);
      return Promise.resolve();
    }

    const generation = this.propagationGeneration;
    const timestamp = date.getTime();

    this.propagationInFlight = true;
    this.pendingPropagation = this.propagationPool
      .propagate(date)
      .then((batches) => {
        if (generation !== this.propagationGeneration) return;

        this.applyPropagationBatches(batches, timestamp);
      })
      .catch((error) => {
        if (generation !== this.propagationGeneration) return;

        console.warn(
          "Satellite worker propagation failed; falling back to the main thread.",
          error
        );
        this.propagationPool.terminate();
        this.usesWorkerPropagation = false;
        this.updateSatellitesSynchronously(date);
      })
      .finally(() => {
        if (generation !== this.propagationGeneration) return;

        this.propagationInFlight = false;
        this.pendingPropagation = null;
      });

    return this.pendingPropagation;
  }

  updateSatellitesSynchronously(date) {
    const timestamp = date.getTime();

    for (const sat of this.satellites) {
      this.updateSatellitePosition(sat, date);
      this.updateSatelliteBlink(sat, timestamp);
    }

    this.markInstanceMatricesForUpdate();
  }

  applyPropagationBatches(batches, timestamp) {
    for (const batch of batches) {
      for (let index = 0; index < batch.satelliteCount; index++) {
        const offset = index * PROPAGATION_VALUES_PER_SATELLITE;
        const x = batch.positions[offset];

        if (!Number.isFinite(x)) continue;

        const sat = this.satellites[batch.startIndex + index];

        if (!sat) continue;

        sat.mesh.position.set(
          x,
          batch.positions[offset + 1],
          batch.positions[offset + 2]
        );
        sat.latitude = batch.positions[offset + 3];
        sat.longitude = batch.positions[offset + 4];
        sat.altitudeKm = batch.positions[offset + 5];

        if (sat === this.selectedSatellite) {
          this.selectionMarker.position.copy(sat.mesh.position);
        }

        this.updateSatelliteBlink(sat, timestamp);
      }
    }

    this.markInstanceMatricesForUpdate();
  }

  markInstanceMatricesForUpdate() {
    for (const instanceMesh of this.satelliteInstanceMeshes) {
      instanceMesh.instanceMatrix.needsUpdate = true;
    }
  }

  createSatelliteMesh(group) {
    return new THREE.Object3D();
  }

  createSatelliteInstanceMeshes() {
    const satellitesByGroup = new Map();

    for (const sat of this.satellites) {
      const groupSatellites = satellitesByGroup.get(sat.group) ?? [];

      groupSatellites.push(sat);
      satellitesByGroup.set(sat.group, groupSatellites);
    }

    for (const [group, satellites] of satellitesByGroup) {
      const geometry = new THREE.SphereGeometry(SATELLITE_SIZE, 8, 8);
      const material = new THREE.MeshBasicMaterial({
        color: SATELLITE_GROUP_COLORS[group] ?? 0xffffff,
        transparent: true,
        opacity: 0.92,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      });
      const instanceMesh = new THREE.InstancedMesh(
        geometry,
        material,
        satellites.length
      );

      instanceMesh.frustumCulled = false;
      instanceMesh.userData.satellites = satellites;
      satellites.forEach((sat, index) => {
        sat.instanceMesh = instanceMesh;
        sat.instanceIndex = index;
      });
      this.satelliteInstanceMeshes.push(instanceMesh);
      this.scene.add(instanceMesh);
    }
  }

  updateSatelliteBlink(sat, timestamp) {
    const blink =
      (Math.sin(timestamp * SATELLITE_BLINK_SPEED + sat.blinkPhase) + 1) / 2;

    if (sat !== this.selectedSatellite) {
      sat.mesh.scale.setScalar(
        THREE.MathUtils.lerp(
          SATELLITE_BLINK_MIN_SCALE,
          SATELLITE_BLINK_MAX_SCALE,
          blink
        )
      );
    }

    this.updateSatelliteInstance(sat);
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
    return this.satelliteInstanceMeshes;
  }

  searchSatellites(query, limit = 8) {
    const normalizedQuery = String(query).trim().toUpperCase();

    if (!normalizedQuery) return [];

    return this.satellites
      .filter((sat) => {
        const name = sat.name.toUpperCase();
        return name.includes(normalizedQuery) || sat.catalogId.includes(normalizedQuery);
      })
      .sort((a, b) => this.getSearchScore(a, normalizedQuery) - this.getSearchScore(b, normalizedQuery))
      .slice(0, limit);
  }

  getSearchScore(sat, query) {
    const name = sat.name.toUpperCase();

    if (sat.catalogId === query || name === query) return 0;
    if (sat.catalogId.startsWith(query) || name.startsWith(query)) return 1;
    return 2;
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

  getSatelliteByMesh(mesh, instanceId = null) {
    if (instanceId != null) {
      return mesh.userData.satellites?.[instanceId] ?? null;
    }

    return this.satelliteByMesh.get(mesh) ?? null;
  }

  selectSatellite(sat, date) {
    if (this.selectedSatellite) {
      this.selectedSatellite.mesh.scale.setScalar(1);
    }

    this.updateSatellitePosition(sat, date);
    this.selectedSatellite = sat;
    sat.mesh.scale.setScalar(1.9);
    this.updateSatelliteInstance(sat);
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

  drawHistoryTrail(sat, startDate, endDate, intervalMinutes = 10) {
    this.clearHistoryTrail();

    if (!sat || !startDate || !endDate) return;

    const points = [];
    const intervalMs = intervalMinutes * 60000;

    for (
      let time = startDate.getTime();
      time <= endDate.getTime();
      time += intervalMs
    ) {
      const position = this.getSatelliteScenePosition(sat, new Date(time));

      if (position) {
        points.push(position);
      }
    }

    if (points.length < 2) return;

    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      color: SATELLITE_GROUP_COLORS[sat.group] ?? 0x66ccff,
      transparent: true,
      opacity: 0.46,
    });

    this.historyTrailLine = new THREE.Line(geometry, material);
    this.scene.add(this.historyTrailLine);
  }

  clearHistoryTrail() {
    if (!this.historyTrailLine) return;

    this.scene.remove(this.historyTrailLine);
    this.historyTrailLine.geometry.dispose();
    this.historyTrailLine.material.dispose();
    this.historyTrailLine = null;
  }

  clearSelection() {
    if (this.selectedSatellite) {
      this.selectedSatellite.mesh.scale.setScalar(1);
    }

    this.selectedSatellite = null;
    this.selectionMarker.visible = false;
    this.clearTrajectory();
    this.clearHistoryTrail();
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

  updateSatelliteInstance(sat) {
    if (!sat.instanceMesh || sat.instanceIndex == null) return;

    sat.mesh.updateMatrix();
    sat.instanceMesh.setMatrixAt(sat.instanceIndex, sat.mesh.matrix);
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
    let positionEci = null;

    try {
      positionEci = propagate(sat.satrec, date)?.position;
    } catch {
      return null;
    }

    if (
      !positionEci ||
      !Number.isFinite(positionEci.x) ||
      !Number.isFinite(positionEci.y) ||
      !Number.isFinite(positionEci.z)
    ) {
      return null;
    }

    const gmst = gstime(date);
    const positionGd = eciToGeodetic(positionEci, gmst);
    const lat = degreesLat(positionGd.latitude);
    const lon = degreesLong(positionGd.longitude);
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
