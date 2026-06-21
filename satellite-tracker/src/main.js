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
import "./style.css";

const DEFAULT_SELECTED_GROUPS = ["stations"];

class SatelliteTrackerApp {
  constructor(container = document.body) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.camera = this.createCamera();
    this.renderer = this.createRenderer();
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.controls = this.createControls();
    this.earth = new Earth(this.renderer);
    this.satelliteTracker = new SatelliteTracker(this.scene, {
      groups: DEFAULT_SELECTED_GROUPS,
    });
    this.userLocationMarker = new UserLocationMarker(this.scene);
    this.groupSelector = new SatelliteGroupSelector({
      groups: CELESTRAK_GROUPS,
      selectedGroups: DEFAULT_SELECTED_GROUPS,
      groupColors: SATELLITE_GROUP_COLOR_HEX,
      onChange: (groups) => this.loadSatelliteGroups(groups),
    });

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
    return controls;
  }

  bindEvents() {
    window.addEventListener("resize", () => this.resize());
    this.renderer.domElement.addEventListener("click", (event) =>
      this.handleClick(event)
    );
  }

  async loadSatelliteGroups(groups) {
    this.groupSelector.setLoading(true);
    this.groupSelector.setStatus("Loading...");
    this.groupSelector.setSelectedSatellite(null);

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
    const rect = this.renderer.domElement.getBoundingClientRect();

    this.pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);

    const intersects = this.raycaster.intersectObjects(
      this.satelliteTracker.getSatelliteMeshes(),
      false
    );

    if (intersects.length === 0) {
      const nearbySatellite = this.satelliteTracker.findSatelliteNearScreenPoint(
        event.clientX,
        event.clientY,
        this.camera,
        this.renderer.domElement
      );

      if (nearbySatellite) {
        const selected = this.satelliteTracker.selectSatellite(
          nearbySatellite,
          new Date()
        );
        this.groupSelector.setSelectedSatellite(selected);
        return;
      }

      this.satelliteTracker.clearSelection();
      this.groupSelector.setSelectedSatellite(null);
      return;
    }

    const selected = this.satelliteTracker.selectSatelliteByMesh(
      intersects[0].object,
      new Date()
    );
    this.groupSelector.setSelectedSatellite(selected);
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    const now = new Date();
    this.earth.update(now);
    this.satelliteTracker.update(now);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}

new SatelliteTrackerApp().start();
