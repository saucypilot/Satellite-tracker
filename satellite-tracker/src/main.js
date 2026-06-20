import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Earth } from "./earth.js";
import { SatelliteTracker } from "./satellites.js";
import { UserLocationMarker } from "./UserLocationMarker.js";

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
    this.satelliteTracker = new SatelliteTracker(this.scene);
    this.userLocationMarker = new UserLocationMarker(this.scene);

    this.earth.addTo(this.scene);
    this.userLocationMarker.startTracking();
    this.satelliteTracker.load();
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
        this.satelliteTracker.selectSatellite(nearbySatellite, new Date());
        return;
      }

      this.satelliteTracker.clearTrajectory();
      return;
    }

    this.satelliteTracker.selectSatelliteByMesh(intersects[0].object, new Date());
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
