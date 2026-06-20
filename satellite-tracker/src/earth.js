import * as THREE from "three";
import earthDayMapUrl from "./assets/2k_earth_daymap.jpg";
import earthNightMapUrl from "./assets/2k_earth_nightmap.jpg";
import earthCloudsMapUrl from "./assets/2k_earth_clouds.jpg";
import {
  EARTH_SIZE,
  geodeticToSceneDirection,
  getSubsolarPoint,
} from "./utils/coords.js";

export class Earth {
  constructor(renderer) {
    this.renderer = renderer;
    this.group = new THREE.Group();
    this.sunDirection = new THREE.Vector3();
    this.sunPosition = new THREE.Vector3();

    this.createTextures();
    this.createSurface();
    this.createClouds();
    this.createLighting();
  }

  addTo(scene) {
    scene.add(this.group);
  }

  update(date) {
    const subsolarPoint = getSubsolarPoint(date);

    this.sunDirection.copy(
      geodeticToSceneDirection(subsolarPoint.lat, subsolarPoint.lon)
    );
    this.sunLight.position.copy(
      this.sunPosition.copy(this.sunDirection).multiplyScalar(8)
    );
  }

  createTextures() {
    const textureLoader = new THREE.TextureLoader();

    this.dayTexture = this.loadTexture(textureLoader, earthDayMapUrl);
    this.nightTexture = this.loadTexture(textureLoader, earthNightMapUrl);
    this.cloudsTexture = this.loadTexture(textureLoader, earthCloudsMapUrl);
  }

  loadTexture(textureLoader, url) {
    const texture = textureLoader.load(url);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    return texture;
  }

  createSurface() {
    this.surface = new THREE.Mesh(
      new THREE.SphereGeometry(EARTH_SIZE, 96, 96),
      new THREE.ShaderMaterial({
        uniforms: {
          dayTexture: { value: this.dayTexture },
          nightTexture: { value: this.nightTexture },
          sunDirection: { value: this.sunDirection },
        },
        vertexShader: `
          varying vec2 vUv;
          varying vec3 vWorldNormal;

          void main() {
            vUv = uv;
            vWorldNormal = normalize(mat3(modelMatrix) * normal);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform sampler2D dayTexture;
          uniform sampler2D nightTexture;
          uniform vec3 sunDirection;

          varying vec2 vUv;
          varying vec3 vWorldNormal;

          void main() {
            vec3 dayColor = texture2D(dayTexture, vUv).rgb;
            vec3 nightColor = texture2D(nightTexture, vUv).rgb;
            float sunlight = dot(normalize(vWorldNormal), normalize(sunDirection));
            float dayMix = smoothstep(-0.18, 0.18, sunlight);
            vec3 color = mix(nightColor * 1.35, dayColor, dayMix);
            gl_FragColor = vec4(color, 1.0);
          }
        `,
      })
    );

    this.group.add(this.surface);
  }

  createClouds() {
    this.clouds = new THREE.Mesh(
      new THREE.SphereGeometry(EARTH_SIZE * 1.01, 96, 96),
      new THREE.MeshPhongMaterial({
        map: this.cloudsTexture,
        alphaMap: this.cloudsTexture,
        transparent: true,
        opacity: 0.34,
        depthWrite: false,
        blending: THREE.NormalBlending,
      })
    );

    this.group.add(this.clouds);
  }

  createLighting() {
    this.sunLight = new THREE.DirectionalLight(0xffffff, 2);
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.15);

    this.group.add(this.sunLight);
    this.group.add(this.ambientLight);
  }
}
