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
  }

  resize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
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
