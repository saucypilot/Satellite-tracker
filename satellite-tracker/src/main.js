import * as THREE from "three";
import * as satellite from "satellite.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import earthDayMapUrl from "./assets/2k_earth_daymap.jpg";
import earthNightMapUrl from "./assets/2k_earth_nightmap.jpg";
import earthCloudsMapUrl from "./assets/2k_earth_clouds.jpg";

const EARTH_RADIUS = 6371;
const SCALE = 1 / 1000;
const EARTH_SIZE = EARTH_RADIUS * SCALE;

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  10000
);

camera.position.set(0, 4, 8);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

const textureLoader = new THREE.TextureLoader();

function loadEarthTexture(url) {
  const texture = textureLoader.load(url);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return texture;
}

const dayTexture = loadEarthTexture(earthDayMapUrl);
const nightTexture = loadEarthTexture(earthNightMapUrl);
const cloudsTexture = loadEarthTexture(earthCloudsMapUrl);
const sunDirection = new THREE.Vector3();
const sunPosition = new THREE.Vector3();

const earth = new THREE.Mesh(
  new THREE.SphereGeometry(EARTH_SIZE, 96, 96),
  new THREE.ShaderMaterial({
    uniforms: {
      dayTexture: { value: dayTexture },
      nightTexture: { value: nightTexture },
      sunDirection: { value: sunDirection },
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

scene.add(earth);

const clouds = new THREE.Mesh(
  new THREE.SphereGeometry(EARTH_SIZE * 1.01, 96, 96),
  new THREE.MeshPhongMaterial({
    map: cloudsTexture,
    alphaMap: cloudsTexture,
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
    blending: THREE.NormalBlending,
  })
);

scene.add(clouds);

const light = new THREE.DirectionalLight(0xffffff, 2);
light.position.set(5, 3, 5);
scene.add(light);

scene.add(new THREE.AmbientLight(0xffffff, 0.15));

function normalizeDegrees(degrees) {
  return ((degrees % 360) + 360) % 360;
}

function normalizeLongitude(degrees) {
  return ((degrees + 540) % 360) - 180;
}

function julianDate(date) {
  return date.getTime() / 86400000 + 2440587.5;
}

function greenwichSiderealTime(jd) {
  const t = (jd - 2451545.0) / 36525;
  return normalizeDegrees(
    280.46061837 +
      360.98564736629 * (jd - 2451545.0) +
      0.000387933 * t * t -
      (t * t * t) / 38710000
  );
}

function getSubsolarPoint(date) {
  const jd = julianDate(date);
  const daysSinceJ2000 = jd - 2451545.0;

  const meanLongitude = normalizeDegrees(280.460 + 0.9856474 * daysSinceJ2000);
  const meanAnomaly = THREE.MathUtils.degToRad(
    normalizeDegrees(357.528 + 0.9856003 * daysSinceJ2000)
  );
  const eclipticLongitude = THREE.MathUtils.degToRad(
    normalizeDegrees(
      meanLongitude +
        1.915 * Math.sin(meanAnomaly) +
        0.02 * Math.sin(2 * meanAnomaly)
    )
  );
  const obliquity = THREE.MathUtils.degToRad(
    23.439 - 0.0000004 * daysSinceJ2000
  );

  const rightAscension = normalizeDegrees(
    THREE.MathUtils.radToDeg(
      Math.atan2(
        Math.cos(obliquity) * Math.sin(eclipticLongitude),
        Math.cos(eclipticLongitude)
      )
    )
  );
  const declination = THREE.MathUtils.radToDeg(
    Math.asin(Math.sin(obliquity) * Math.sin(eclipticLongitude))
  );
  const longitude = normalizeLongitude(
    rightAscension - greenwichSiderealTime(jd)
  );

  return { lat: declination, lon: longitude };
}

function geodeticToSceneDirection(lat, lon) {
  const phi = THREE.MathUtils.degToRad(90 - lat);
  const theta = THREE.MathUtils.degToRad(lon + 180);

  return new THREE.Vector3(
    -Math.sin(phi) * Math.cos(theta),
    Math.cos(phi),
    Math.sin(phi) * Math.sin(theta)
  ).normalize();
}

function updateSunPosition(date) {
  const subsolarPoint = getSubsolarPoint(date);
  sunDirection.copy(
    geodeticToSceneDirection(subsolarPoint.lat, subsolarPoint.lon)
  );
  light.position.copy(sunPosition.copy(sunDirection).multiplyScalar(8));
}

async function loadTLEs() {
  const res = await fetch(
    "https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle"
  );

  const text = await res.text();
  const lines = text.trim().split("\n");

  const sats = [];

  for (let i = 0; i < lines.length; i += 3) {
    const name = lines[i].trim();
    const tle1 = lines[i + 1].trim();
    const tle2 = lines[i + 2].trim();

    const satrec = satellite.twoline2satrec(tle1, tle2);

    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.015, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xffcc00 })
    );

    scene.add(mesh);

    sats.push({ name, satrec, mesh });
  }

  return sats;
}

function updateSatellitePosition(sat, date) {
  const positionAndVelocity = satellite.propagate(sat.satrec, date);
  const positionEci = positionAndVelocity.position;

  if (!positionEci) return;

  const gmst = satellite.gstime(date);
  const positionGd = satellite.eciToGeodetic(positionEci, gmst);

  const lat = satellite.degreesLat(positionGd.latitude);
  const lon = satellite.degreesLong(positionGd.longitude);
  const alt = positionGd.height;

  const radius = (EARTH_RADIUS + alt) * SCALE;

  const phi = THREE.MathUtils.degToRad(90 - lat);
  const theta = THREE.MathUtils.degToRad(lon + 180);

  sat.mesh.position.set(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

let satellites = [];

loadTLEs().then((loaded) => {
  satellites = loaded.slice(0, 1000);
});

function animate() {
  requestAnimationFrame(animate);
  const now = new Date();

  updateSunPosition(now);

  for (const sat of satellites) {
    updateSatellitePosition(sat, now);
  }

  controls.update();
  renderer.render(scene, camera);
}

animate();
