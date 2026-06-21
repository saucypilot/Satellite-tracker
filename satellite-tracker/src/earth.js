import * as THREE from "three";
import earthDayMapUrl from "./assets/8k_earth_daymap.jpg";
import earthNightMapUrl from "./assets/8k_earth_nightmap.jpg";
import earthCloudsMapUrl from "./assets/8k_earth_clouds.jpg";
import {
  EARTH_SIZE,
  geodeticToSceneDirection,
  getSubsolarPoint,
} from "./utils/coords.js";

const SUN_DISTANCE = 420;
const SUN_SIZE = 4;
const SUN_GLOW_SIZE = 38;

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
    this.sunMesh.position.copy(this.sunDirection).multiplyScalar(SUN_DISTANCE);
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
    this.sunMesh = new THREE.Mesh(
      new THREE.SphereGeometry(SUN_SIZE, 48, 48),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.95,
        toneMapped: false,
      })
    );
    this.sunGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.createSunGlowTexture(),
        color: 0xffffff,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      })
    );

    this.sunGlow.scale.setScalar(SUN_GLOW_SIZE);
    this.sunMesh.add(this.sunGlow);

    this.group.add(this.sunLight);
    this.group.add(this.ambientLight);
    this.group.add(this.sunMesh);
  }

  createSunGlowTexture() {
    const size = 256;
    const canvas = document.createElement("canvas");
    const center = size / 2;

    canvas.width = size;
    canvas.height = size;

    const context = canvas.getContext("2d");
    const gradient = context.createRadialGradient(
      center,
      center,
      0,
      center,
      center,
      center
    );

    gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
    gradient.addColorStop(0.12, "rgba(255, 255, 255, 0.95)");
    gradient.addColorStop(0.32, "rgba(255, 244, 210, 0.42)");
    gradient.addColorStop(0.62, "rgba(255, 220, 140, 0.14)");
    gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);

    const texture = new THREE.CanvasTexture(canvas);

    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }
}
