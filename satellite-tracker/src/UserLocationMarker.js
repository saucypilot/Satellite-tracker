import * as THREE from "three";
import { EARTH_SIZE, geodeticToScenePosition } from "./utils/coords.js";

export class UserLocationMarker {
  constructor(scene, onUpdate = null) {
    this.onUpdate = onUpdate;
    this.currentLocation = null;
    this.watchId = null;
    this.retryTimeoutId = null;
    this.permissionStatus = null;
    this.mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.12, 0.12),
      new THREE.MeshBasicMaterial({ color: 0xff0000 })
    );

    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  startTracking() {
    if (!("geolocation" in navigator)) {
      console.warn("Geolocation is not supported by this browser.");
      return;
    }

    this.observePermissionChanges();
    this.requestCurrentPosition();
  }

  observePermissionChanges() {
    if (!navigator.permissions?.query || this.permissionStatus) return;

    navigator.permissions
      .query({ name: "geolocation" })
      .then((permissionStatus) => {
        this.permissionStatus = permissionStatus;
        permissionStatus.onchange = () => {
          if (permissionStatus.state === "granted") {
            this.requestCurrentPosition();
          }
        };
      })
      .catch(() => {
        this.permissionStatus = null;
      });
  }

  requestCurrentPosition() {
    window.clearTimeout(this.retryTimeoutId);

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        this.update(coords.latitude, coords.longitude);
        this.startWatchingPosition();
      },
      (error) => {
        this.handleLocationError(error);
      },
      this.getPositionOptions()
    );
  }

  startWatchingPosition() {
    if (this.watchId !== null) return;

    this.watchId = navigator.geolocation.watchPosition(
      ({ coords }) => {
        this.update(coords.latitude, coords.longitude);
      },
      (error) => {
        this.handleLocationError(error);
      },
      this.getPositionOptions()
    );
  }

  handleLocationError(error) {
    console.warn("Unable to get user location:", error.message);

    if (error.code === error.PERMISSION_DENIED) return;

    this.retryTimeoutId = window.setTimeout(() => {
      this.requestCurrentPosition();
    }, 1500);
  }

  getPositionOptions() {
    return {
      enableHighAccuracy: true,
      maximumAge: 30000,
      timeout: 20000,
    };
  }

  stopTracking() {
    window.clearTimeout(this.retryTimeoutId);

    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
  }

  update(lat, lon) {
    this.currentLocation = { lat, lon };
    this.mesh.position.copy(
      geodeticToScenePosition(lat, lon, EARTH_SIZE * 1.025)
    );
    this.mesh.visible = true;
    this.onUpdate?.(this.currentLocation);
  }
}
