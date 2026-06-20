import * as THREE from "three";
import { EARTH_SIZE, geodeticToScenePosition } from "./utils/coords.js";

export class UserLocationMarker {
  constructor(scene) {
    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 24, 24),
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

    navigator.geolocation.watchPosition(
      ({ coords }) => {
        this.update(coords.latitude, coords.longitude);
      },
      (error) => {
        console.warn("Unable to get user location:", error.message);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 30000,
        timeout: 10000,
      }
    );
  }

  update(lat, lon) {
    this.mesh.position.copy(
      geodeticToScenePosition(lat, lon, EARTH_SIZE * 1.025)
    );
    this.mesh.visible = true;
  }
}
