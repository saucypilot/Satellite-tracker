import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Earth } from "./earth.js";
import {
  CELESTRAK_GROUPS,
  SATELLITE_GROUP_COLOR_HEX,
  SatelliteTracker,
} from "./satellites.js";
import { SatelliteGroupSelector } from "./SatelliteGroupSelector.js";
import { UserLocationMarker } from "./UserLocationMarker.js";
import { SpaceEnvironment } from "./spaceEnvironment.js";
import { predictNextPass } from "./passPrediction.js";
import "./style.css";

const DEFAULT_SELECTED_GROUPS = ["stations"];
const DEFAULT_CAMERA_POSITION = new THREE.Vector3(0, 20, 8);
const DEFAULT_CAMERA_TARGET = new THREE.Vector3(0, 0, 0);
const TRACKING_CAMERA_DISTANCE = 1.2;
const TRACKING_CAMERA_LIFT = 0.35;

class SatelliteTrackerApp {
  constructor(container = document.body) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.camera = this.createCamera();
    this.renderer = this.createRenderer();
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.trackedSatellite = null;
    this.selectedSatellite = null;
    this.pendingGroundStationLocation = false;
    this.controls = this.createControls();
    this.earth = new Earth(this.renderer);
    this.spaceEnvironment = new SpaceEnvironment(this.renderer);
    this.satelliteTracker = new SatelliteTracker(this.scene, {
      groups: DEFAULT_SELECTED_GROUPS,
    });
    this.groupSelector = new SatelliteGroupSelector({
      groups: CELESTRAK_GROUPS,
      selectedGroups: DEFAULT_SELECTED_GROUPS,
      groupColors: SATELLITE_GROUP_COLOR_HEX,
      onChange: (groups) => this.loadSatelliteGroups(groups),
      onResetView: () => this.resetCameraView(),
      onPredictPass: (groundStation) => this.predictSelectedSatellitePass(groundStation),
      onUseCurrentLocation: () => this.useCurrentLocationForGroundStation(),
    });
    this.userLocationMarker = new UserLocationMarker(this.scene, ({ lat, lon }) => {
      if (!this.pendingGroundStationLocation) return;

      this.groupSelector.setGroundStation({ lat, lon });
      this.pendingGroundStationLocation = false;
    });

    this.spaceEnvironment.addTo(this.scene);
    this.earth.addTo(this.scene);
    this.userLocationMarker.startTracking();
    this.loadSatelliteGroups(DEFAULT_SELECTED_GROUPS);
    this.bindEvents();
  }

  start() {
    this.animate();
  }

  createCamera() {
    const camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      10000
    );

    camera.position.set(0, 20, 8);
    return camera;
  }

  createRenderer() {
    const renderer = new THREE.WebGLRenderer({ antialias: true });

    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container.appendChild(renderer.domElement);

    return renderer;
  }

  createControls() {
    const controls = new OrbitControls(this.camera, this.renderer.domElement);

    controls.enableDamping = true;
    controls.target.copy(DEFAULT_CAMERA_TARGET);
    return controls;
  }

  bindEvents() {
    window.addEventListener("resize", () => this.resize());
    this.renderer.domElement.addEventListener("click", (event) =>
      this.handleClick(event)
    );
    this.renderer.domElement.addEventListener("mousemove", (event) =>
      this.handleMouseMove(event)
    );
    this.renderer.domElement.addEventListener("mouseleave", () =>
      this.groupSelector.hideSatelliteHover()
    );
    this.renderer.domElement.addEventListener("dblclick", (event) =>
      this.handleDoubleClick(event)
    );
  }

  async loadSatelliteGroups(groups) {
    this.trackedSatellite = null;
    this.selectedSatellite = null;
    this.groupSelector.setLoading(true);
    this.groupSelector.setStatus("Loading...");
    this.groupSelector.setSelectedSatellite(null);
    this.groupSelector.hideSatelliteHover();

    try {
      const result = await this.satelliteTracker.load(groups);
      this.groupSelector.setStatus(this.createLoadStatus(result));
    } catch (error) {
      console.error("Unable to load satellite data:", error);
      this.groupSelector.setStatus(
        `${error.message}. Try again after CelesTrak updates.`
      );
    } finally {
      this.groupSelector.setLoading(false);
    }
  }

  createLoadStatus({ count, cachedGroups, failedGroups, limitedByMax }) {
    const details = [];

    if (limitedByMax) {
      details.push("display limit reached");
    }

    if (cachedGroups.length > 0) {
      const cachedSummary = cachedGroups
        .map(({ group, age }) => `${group} cache ${age}`)
        .join(", ");
      details.push(`using ${cachedSummary}`);
    }

    if (failedGroups.length > 0) {
      details.push(`failed: ${failedGroups.join(", ")}`);
    }

    return details.length > 0
      ? `${count} satellites (${details.join("; ")})`
      : `${count} satellites`;
  }

  resize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  handleClick(event) {
    if (event.detail > 1) return;

    this.updatePointer(event);

    const moonIntersects = this.raycaster.intersectObject(
      this.spaceEnvironment.getMoonMesh(),
      false
    );

    if (moonIntersects.length > 0) {
      this.trackedSatellite = null;
      this.spaceEnvironment.showMoonOrbit();
      this.satelliteTracker.clearSelection();
      this.selectedSatellite = null;
      this.groupSelector.setSelectedSatellite(null);
      return;
    }

    this.spaceEnvironment.hideMoonOrbit();
    this.trackedSatellite = null;

    const sat = this.findSatelliteFromPointer(event);

    if (!sat) {
      this.satelliteTracker.clearSelection();
      this.selectedSatellite = null;
      this.groupSelector.setSelectedSatellite(null);
      return;
    }

    const selected = this.satelliteTracker.selectSatellite(sat, new Date());
    this.selectedSatellite = selected;
    this.groupSelector.setSelectedSatellite(selected);
  }

  handleMouseMove(event) {
    const sat = this.findSatelliteFromPointer(event);

    if (!sat) {
      this.groupSelector.hideSatelliteHover();
      return;
    }

    this.groupSelector.showSatelliteHover(sat, event.clientX, event.clientY);
  }

  handleDoubleClick(event) {
    const sat = this.findSatelliteFromPointer(event);

    if (!sat) return;

    this.spaceEnvironment.hideMoonOrbit();
    this.trackedSatellite = sat;
    this.selectedSatellite = this.satelliteTracker.selectSatellite(sat, new Date());
    this.groupSelector.setSelectedSatellite(this.selectedSatellite);
    this.updateTrackingCamera(true);
  }

  findSatelliteFromPointer(event) {
    this.updatePointer(event);

    const intersects = this.raycaster.intersectObjects(
      this.satelliteTracker.getSatelliteMeshes(),
      false
    );

    if (intersects.length > 0) {
      return this.satelliteTracker.getSatelliteByMesh(intersects[0].object);
    }

    return this.satelliteTracker.findSatelliteNearScreenPoint(
      event.clientX,
      event.clientY,
      this.camera,
      this.renderer.domElement
    );
  }

  updatePointer(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();

    this.pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
  }

  resetCameraView() {
    this.trackedSatellite = null;
    this.selectedSatellite = null;
    this.spaceEnvironment.hideMoonOrbit();
    this.satelliteTracker.clearSelection();
    this.groupSelector.setSelectedSatellite(null);
    this.groupSelector.hideSatelliteHover();
    this.camera.position.copy(DEFAULT_CAMERA_POSITION);
    this.controls.target.copy(DEFAULT_CAMERA_TARGET);
    this.controls.update();
  }

  predictSelectedSatellitePass(groundStation) {
    if (!this.selectedSatellite) {
      throw new Error("Select a satellite before predicting a pass.");
    }

    this.userLocationMarker.update(groundStation.lat, groundStation.lon);
    return predictNextPass(this.selectedSatellite, groundStation);
  }

  useCurrentLocationForGroundStation() {
    if (this.userLocationMarker.currentLocation) {
      this.groupSelector.setGroundStation(this.userLocationMarker.currentLocation);
      return;
    }

    this.pendingGroundStationLocation = true;
    this.userLocationMarker.requestCurrentPosition();
  }

  updateTrackingCamera(force = false) {
    if (!this.trackedSatellite) return;

    const target = this.trackedSatellite.mesh.position;
    const radialDirection = target.clone().normalize();
    const offset = radialDirection
      .multiplyScalar(TRACKING_CAMERA_DISTANCE)
      .add(new THREE.Vector3(0, TRACKING_CAMERA_LIFT, 0));

    this.controls.target.copy(target);

    if (force) {
      this.camera.position.copy(target).add(offset);
      return;
    }

    this.camera.position.lerp(target.clone().add(offset), 0.18);
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    const now = new Date();
    this.spaceEnvironment.update(now);
    this.earth.update(now);
    this.satelliteTracker.update(now);
    this.updateTrackingCamera();
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}

new SatelliteTrackerApp().start();
