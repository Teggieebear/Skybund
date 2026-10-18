import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js';
import {
  getStartNgLeaderboard,
  observeStartNgPlayer,
  saveStartNgScore,
  signInWithStartNg,
} from './startng.js';

const $ = (id) => document.getElementById(id);
const ui = {
  world: $('game-world'),
  loading: $('loading-screen'),
  start: $('start-screen'),
  startButton: $('start-button'),
  signInButton: $('sign-in-button'),
  leaderboardButton: $('leaderboard-button'),
  leaderboardPanel: $('leaderboard-panel'),
  leaderboardClose: $('leaderboard-close'),
  leaderboardList: $('leaderboard-list'),
  connectionStatus: $('connection-status'),
  playerName: $('player-name'),
  playerAccount: $('player-account'),
  identityBadge: $('identity-badge'),
  score: $('score-value'),
  gems: $('gem-value'),
  distance: $('distance-value'),
  pauseButton: $('pause-button'),
  pause: $('pause-screen'),
  resumeButton: $('resume-button'),
  gameover: $('gameover-screen'),
  finalScore: $('final-score'),
  finalGems: $('final-gems'),
  saveStatus: $('save-status'),
  restartButton: $('restart-button'),
  leftButton: $('left-button'),
  rightButton: $('right-button'),
  jumpButton: $('jump-button'),
  soundButton: $('sound-button'),
  toast: $('toast'),
};

const COLORS = ['#63d992', '#ffab72', '#c38cff', '#ffd76b', '#58d3d4', '#f581b4'];
const PERSONAL_BEST_KEY = 'skybund.personalBest';

let renderer;
let scene;
let camera;
let world;
let scenery;
let avatar;
let resizeObserver;
let lastFrame = 0;
let toastTimer;
let audioContext;
let startNgIdentity = null;
let isSignedIn = false;
let stopObservingPlayer = () => {};
let showBoard = false;
let soundEnabled = true;
let steerInput = 0;
let keyboardLeft = false;
let keyboardRight = false;
let runActive = false;
let paused = false;
let gameEnded = false;
let playerX = 0;
let playerY = 0.12;
let playerZ = 0;
let playerVelocityX = 0;
let playerVelocityY = 0;
let grounded = true;
let runStartZ = 0;
let runDistance = 0;
let runScore = 0;
let runGems = 0;
let runSpeed = 5.25;
let personalBest = 0;
try {
  personalBest = Number(localStorage.getItem(PERSONAL_BEST_KEY) || 0);
} catch {
  personalBest = 0;
}
let platforms = [];
let gems = [];
let hazards = [];
let clouds = [];
let nextIslandIndex = 0;
let lastIslandZ = 0;
let toastTimerId = 0;

function safeColor(value, fallback) {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
    ? value
    : fallback;
}

function safeText(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function makeMaterial(color, options = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.72,
    metalness: 0.02,
    ...options,
  });
}

function addMesh(parent, geometry, material, position, scale) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(position[0], position[1], position[2]);
  if (scale) mesh.scale.set(scale[0], scale[1], scale[2]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function addCylinderBetween(parent, start, end, radius, material, radialSegments = 8) {
  const from = new THREE.Vector3(...start);
  const to = new THREE.Vector3(...end);
  const direction = new THREE.Vector3().subVectors(to, from);
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.9, radius, direction.length(), radialSegments),
    material,
  );
  mesh.position.copy(from).add(to).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

function createCloudCluster(parent, position, scale = 1, color = '#ffffff') {
  const group = new THREE.Group();
  group.position.set(position[0], position[1], position[2]);
  const material = makeMaterial(color, { roughness: 1 });
  const puffs = [
    [-0.55, 0, 0, 0.72],
    [0.05, 0.14, 0.02, 0.92],
    [0.58, 0.01, -0.04, 0.67],
  ];
  puffs.forEach(([x, y, z, size]) => {
    addMesh(
      group,
      new THREE.SphereGeometry(size * scale, 12, 10),
      material,
      [x * scale, y * scale, z * scale],
      [1.22, 0.78, 0.92],
    );
  });
  parent.add(group);
  return group;
}

function createScene() {
  if (!ui.world) throw new Error('Skybund is missing its game-world element.');

  scene = new THREE.Scene();
  scene.background = null;
  scene.fog = new THREE.Fog('#b6edff', 42, 118);
  camera = new THREE.PerspectiveCamera(52, 1, 0.1, 180);
  camera.position.set(5, 8.4, -10);

  const canvas = document.createElement('canvas');
  const contextAttributes = {
    antialias: window.innerWidth > 700,
    alpha: true,
    powerPreference: 'high-performance',
  };
  let webglContext = null;
  try {
    webglContext = canvas.getContext('webgl2', contextAttributes);
  } catch {
    webglContext = null;
  }
  if (!webglContext) throw new Error('WebGL context unavailable');
  renderer = new THREE.WebGLRenderer({
    canvas,
    context: webglContext,
    ...contextAttributes,
  });
  renderer.setClearColor('#000000', 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.35));
  renderer.setSize(ui.world.clientWidth || window.innerWidth, ui.world.clientHeight || window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = false;
  renderer.domElement.setAttribute('aria-label', 'Skybund 3D sky adventure game');
  ui.world.append(renderer.domElement);

  scene.add(new THREE.HemisphereLight('#d8f5ff', '#9072a5', 2.1));
  const sun = new THREE.DirectionalLight('#fff2cf', 3.2);
  sun.position.set(-9, 16, -3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -16;
  sun.shadow.camera.right = 16;
  sun.shadow.camera.top = 18;
  sun.shadow.camera.bottom = -18;
  scene.add(sun);
  const fill = new THREE.DirectionalLight('#9aeaff', 1.3);
  fill.position.set(10, 5, 10);
  scene.add(fill);

  scenery = new THREE.Group();
  world = new THREE.Group();
  scene.add(scenery, world);
  createSkyDecor();
  createAvatar(null);

  const resize = () => {
    if (!renderer || !ui.world) return;
    const width = Math.max(1, ui.world.clientWidth || window.innerWidth);
    const height = Math.max(1, ui.world.clientHeight || window.innerHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  if ('ResizeObserver' in window) {
    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(ui.world);
  } else {
    window.addEventListener('resize', resize);
  }
  resize();
  resetWorld();
  if (ui.loading) ui.loading.hidden = true;
}

function createSkyDecor() {
  for (let index = 0; index < 8; index += 1) {
    const x = (Math.random() - 0.5) * 46;
    const y = 3.8 + Math.random() * 10;
    const z = 12 + Math.random() * 112;
    const scale = 0.7 + Math.random() * 1.8;
    clouds.push(createCloudCluster(scenery, [x, y, z], scale));
  }

  for (let index = 0; index < 5; index += 1) {
    const z = 14 + index * 13;
    const x = (index % 2 ? -1 : 1) * (10 + Math.random() * 9);
    const farIsland = new THREE.Group();
    farIsland.position.set(x, -2.3 - Math.random() * 2, z);
    const tint = COLORS[index % COLORS.length];
    addMesh(
      farIsland,
      new THREE.CylinderGeometry(2.8, 1.65, 1.8, 7),
      makeMaterial('#9a83bd'),
      [0, 0, 0],
      [1, 0.75, 1],
    );
    addMesh(
      farIsland,
      new THREE.CylinderGeometry(2.86, 2.6, 0.16, 7),
      makeMaterial(tint),
      [0, 0.91, 0],
      [1, 1, 1],
    );
    scenery.add(farIsland);
  }
}

function clearGroup(group) {
  const geometries = new Set();
  const materials = new Set();
  group.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
    if (Array.isArray(object.material)) object.material.forEach((material) => materials.add(material));
    else if (object.material) materials.add(object.material);
  });
  group.clear();
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
}

function disposeObject(object) {
  object.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    if (Array.isArray(child.material)) child.material.forEach((material) => material.dispose());
    else if (child.material) child.material.dispose();
  });
  object.parent?.remove(object);
}

function createAvatar(style) {
  if (avatar) {
    disposeObject(avatar.group);
  }

  const skinColor = safeColor(style?.skinColor, '#e3a078');
  const hairColor = safeColor(style?.hairColor, '#33251f');
  const primaryColor = safeColor(style?.primaryColor, '#7564dc');
  const secondaryColor = safeColor(style?.secondaryColor, '#34476e');
  const skin = makeMaterial(skinColor);
  const hair = makeMaterial(hairColor);
  const shirt = makeMaterial(primaryColor);
  const bottoms = makeMaterial(secondaryColor);
  const shoes = makeMaterial('#f9f4e9');
  const dark = makeMaterial('#27314f', { roughness: 0.42 });
  const gold = makeMaterial('#ffcf5d', { metalness: 0.55, roughness: 0.34 });
  const accent = makeMaterial('#fff1a8', { emissive: '#8a641d', emissiveIntensity: 0.15 });

  const group = new THREE.Group();
  const torso = new THREE.Group();
  group.add(torso);

  addMesh(
    torso,
    new THREE.CapsuleGeometry(0.3, 0.52, 4, 8),
    shirt,
    [0, 1.22, 0],
    [0.9, 1, 0.7],
  );
  addMesh(torso, new THREE.SphereGeometry(0.32, 14, 12), skin, [0, 1.89, 0], [0.89, 1, 0.82]);
  addMesh(torso, new THREE.CylinderGeometry(0.13, 0.15, 0.18, 10), skin, [0, 1.61, 0]);

  const leftArm = new THREE.Group();
  const rightArm = new THREE.Group();
  leftArm.position.set(-0.31, 1.47, 0);
  rightArm.position.set(0.31, 1.47, 0);
  addMesh(leftArm, new THREE.CylinderGeometry(0.09, 0.115, 0.47, 8), shirt, [0, -0.24, 0]);
  addMesh(rightArm, new THREE.CylinderGeometry(0.09, 0.115, 0.47, 8), shirt, [0, -0.24, 0]);
  addMesh(leftArm, new THREE.SphereGeometry(0.095, 10, 8), skin, [0, -0.51, 0]);
  addMesh(rightArm, new THREE.SphereGeometry(0.095, 10, 8), skin, [0, -0.51, 0]);
  group.add(leftArm, rightArm);

  const leftLeg = new THREE.Group();
  const rightLeg = new THREE.Group();
  leftLeg.position.set(-0.14, 0.77, 0);
  rightLeg.position.set(0.14, 0.77, 0);
  [leftLeg, rightLeg].forEach((leg) => {
    addMesh(leg, new THREE.CylinderGeometry(0.105, 0.12, 0.47, 8), bottoms, [0, -0.24, 0]);
    addMesh(leg, new THREE.SphereGeometry(0.115, 10, 8), shoes, [0, -0.51, 0.09], [1, 0.62, 1.5]);
  });
  group.add(leftLeg, rightLeg);

  if (style?.body === 'female') {
    addMesh(
      torso,
      new THREE.CylinderGeometry(0.27, 0.43, 0.34, 9),
      bottoms,
      [0, 0.7, 0],
    );
  } else {
    addMesh(torso, new THREE.CylinderGeometry(0.27, 0.31, 0.22, 9), bottoms, [0, 0.72, 0]);
  }

  const hairStyle = style?.hair;
  if (hairStyle === 'short') {
    addMesh(torso, new THREE.SphereGeometry(0.3, 12, 10), hair, [0, 2.06, -0.035], [1.03, 0.48, 0.98]);
  } else if (hairStyle === 'afro') {
    const curls = [
      [-0.2, 2.04, 0],
      [0, 2.15, 0],
      [0.2, 2.04, 0],
      [-0.28, 1.94, 0.02],
      [0.28, 1.94, 0.02],
      [-0.13, 2.17, -0.04],
      [0.13, 2.17, -0.04],
    ];
    curls.forEach((point, index) => {
      addMesh(torso, new THREE.SphereGeometry(index === 1 ? 0.17 : 0.14, 9, 8), hair, point);
    });
  } else if (hairStyle === 'braids' || hairStyle === 'dreads') {
    addMesh(torso, new THREE.SphereGeometry(0.29, 12, 10), hair, [0, 2.02, -0.035], [1, 0.49, 0.96]);
    const strandCount = hairStyle === 'braids' ? 2 : 5;
    for (let index = 0; index < strandCount; index += 1) {
      const side = index % 2 === 0 ? -1 : 1;
      const offset = hairStyle === 'braids' ? side * 0.23 : -0.25 + index * 0.125;
      addCylinderBetween(
        torso,
        [offset, 2.01, -0.03],
        [offset * 1.12, 1.43 + (index % 2) * 0.14, -0.08],
        hairStyle === 'braids' ? 0.055 : 0.042,
        hair,
      );
    }
  } else if (hairStyle === 'bun') {
    addMesh(torso, new THREE.SphereGeometry(0.28, 12, 10), hair, [0, 2.03, -0.02], [1, 0.49, 0.92]);
    addMesh(torso, new THREE.SphereGeometry(0.14, 10, 8), hair, [0, 2.23, -0.19]);
  } else if (hairStyle === 'ponytail') {
    addMesh(torso, new THREE.SphereGeometry(0.28, 12, 10), hair, [0, 2.03, -0.02], [1, 0.49, 0.92]);
    addCylinderBetween(torso, [0.03, 2.02, -0.21], [0.09, 1.55, -0.42], 0.075, hair, 9);
  }

  const hat = style?.hat;
  if (hat === 'cap') {
    addMesh(torso, new THREE.SphereGeometry(0.29, 12, 9, 0, Math.PI * 2, 0, Math.PI * 0.58), shirt, [0, 2.12, 0]);
    addMesh(torso, new THREE.CylinderGeometry(0.24, 0.3, 0.07, 12), shirt, [0, 2.03, 0.08], [1.12, 1, 1.2]);
  } else if (hat === 'beanie') {
    addMesh(torso, new THREE.CylinderGeometry(0.25, 0.3, 0.31, 12), primaryColor ? makeMaterial(primaryColor) : shirt, [0, 2.15, 0]);
    addMesh(torso, new THREE.SphereGeometry(0.09, 8, 6), accent, [0, 2.33, 0]);
  } else if (hat === 'tophat') {
    addMesh(torso, new THREE.CylinderGeometry(0.17, 0.2, 0.34, 12), dark, [0, 2.25, 0]);
    addMesh(torso, new THREE.CylinderGeometry(0.32, 0.32, 0.06, 12), dark, [0, 2.08, 0]);
    addMesh(torso, new THREE.CylinderGeometry(0.2, 0.2, 0.055, 12), gold, [0, 2.12, 0]);
  } else if (hat === 'crown') {
    addMesh(torso, new THREE.CylinderGeometry(0.24, 0.29, 0.08, 10), gold, [0, 2.11, 0]);
    addMesh(torso, new THREE.ConeGeometry(0.29, 0.28, 5), gold, [0, 2.27, 0]);
  }

  const accessory = style?.accessory;
  if (accessory === 'glasses') {
    const lens = makeMaterial('#263348', { metalness: 0.2, roughness: 0.35 });
    [-0.105, 0.105].forEach((x) => {
      addMesh(torso, new THREE.TorusGeometry(0.075, 0.018, 5, 12), lens, [x, 1.9, 0.275]);
    });
    addMesh(torso, new THREE.BoxGeometry(0.08, 0.025, 0.025), lens, [0, 1.9, 0.28]);
  } else if (accessory === 'earrings') {
    [-0.28, 0.28].forEach((x) => {
      addMesh(torso, new THREE.TorusGeometry(0.045, 0.018, 5, 10), gold, [x, 1.77, 0.01]);
    });
  } else if (accessory === 'beard') {
    addMesh(torso, new THREE.SphereGeometry(0.18, 10, 8), hair, [0, 1.73, 0.18], [1.15, 0.62, 0.65]);
  } else if (accessory === 'scarf') {
    addMesh(torso, new THREE.TorusGeometry(0.22, 0.075, 7, 14), accent, [0, 1.58, 0]);
    addMesh(torso, new THREE.BoxGeometry(0.12, 0.35, 0.09), accent, [0.18, 1.36, 0.16], [1, 1, 0.8]);
  } else if (accessory === 'backpack') {
    addMesh(torso, new THREE.BoxGeometry(0.43, 0.49, 0.2), accent, [0, 1.25, -0.27], [1, 1, 0.9]);
    addMesh(torso, new THREE.BoxGeometry(0.26, 0.12, 0.22), gold, [0, 1.1, -0.39]);
  }

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.5, 20),
    new THREE.MeshBasicMaterial({ color: '#397c9e', transparent: true, opacity: 0.18 }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.025;
  group.add(shadow);

  world?.add(group);
  avatar = { group, torso, leftArm, rightArm, leftLeg, rightLeg, shadow, isStyled: !!style };
  syncAvatarPosition();
}

function syncAvatarPosition() {
  if (!avatar) return;
  avatar.group.position.set(playerX, playerY, playerZ);
}

function addIslandTree(parent, x, z, tint) {
  const tree = new THREE.Group();
  tree.position.set(x, 0.1, z);
  addMesh(tree, new THREE.CylinderGeometry(0.08, 0.13, 0.7, 7), makeMaterial('#9c6847'), [0, 0.35, 0]);
  addMesh(tree, new THREE.SphereGeometry(0.4, 9, 8), makeMaterial(tint), [0, 0.78, 0]);
  addMesh(tree, new THREE.SphereGeometry(0.28, 8, 7), makeMaterial('#ffe693'), [0.22, 0.82, 0.12]);
  parent.add(tree);
}

function createGem(x, y, z) {
  const mesh = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.36, 0),
    makeMaterial('#8ffaff', {
      color: '#80f8f0',
      emissive: '#18aca9',
      emissiveIntensity: 0.75,
      metalness: 0.32,
      roughness: 0.19,
    }),
  );
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  world.add(mesh);
  gems.push({ mesh, x, y, z, collected: false, phase: Math.random() * Math.PI * 2 });
}

function createHazard(x, y, z) {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  const material = makeMaterial('#ff795f', { emissive: '#9b2617', emissiveIntensity: 0.14 });
  for (let index = 0; index < 3; index += 1) {
    const spike = addMesh(
      group,
      new THREE.ConeGeometry(0.25, 0.8 + index * 0.1, 6),
      material,
      [(index - 1) * 0.3, 0.42, 0],
    );
    spike.rotation.z = (index - 1) * -0.18;
  }
  addMesh(group, new THREE.SphereGeometry(0.35, 8, 7), makeMaterial('#faad69'), [0, 0.06, 0], [1.25, 0.65, 1]);
  world.add(group);
  hazards.push({ group, x, y, z, hit: false, phase: Math.random() * Math.PI * 2 });
}

function createPlatform(index, x, z, depth, width, topY) {
  const group = new THREE.Group();
  group.position.set(x, topY, z);
  const baseMat = makeMaterial(index === 0 ? '#9778bd' : '#8e79a9', { roughness: 1 });
  const topColor = index === 0 ? '#68d98f' : COLORS[(index - 1) % COLORS.length];
  addMesh(
    group,
    new THREE.CylinderGeometry(width * 0.49, width * 0.43, 0.84, 9),
    baseMat,
    [0, -0.42, 0],
    [1, 0.82, depth / width],
  );
  addMesh(
    group,
    new THREE.CylinderGeometry(width * 0.49, width * 0.49, 0.16, 9),
    makeMaterial(topColor),
    [0, 0.02, 0],
    [1, 1, depth / width],
  );

  for (let rockIndex = 0; rockIndex < 2; rockIndex += 1) {
    const side = rockIndex % 2 ? 1 : -1;
    addMesh(
      group,
      new THREE.DodecahedronGeometry(0.31 + (rockIndex % 2) * 0.13, 0),
      makeMaterial(rockIndex % 2 ? '#aa8bc5' : '#7f70a5'),
      [side * width * 0.31, -0.74 - (rockIndex % 2) * 0.1, (rockIndex - 1.5) * depth * 0.15],
      [1, 1.6, 1],
    );
  }

  if (index > 0) {
    addIslandTree(group, -width * 0.28, -depth * 0.23, '#a8ec8c');
  }

  world.add(group);
  platforms.push({ group, x, z, width, depth, topY: topY + 0.1, index });

  if (index > 0) {
    const gemOffsetX = (Math.random() - 0.5) * Math.min(2.1, width * 0.35);
    createGem(x + gemOffsetX, topY + 1.24, z + (Math.random() - 0.5) * depth * 0.28);
    if (index % 4 === 0) createGem(x - gemOffsetX * 0.4, topY + 1.15, z + depth * 0.22);
    if (index > 1 && index % 3 === 0) {
      const hazardX = x + (Math.random() < 0.5 ? -1 : 1) * Math.min(1.55, width * 0.3);
      createHazard(hazardX, topY + 0.1, z + (Math.random() - 0.5) * depth * 0.24);
    }
  }
}

function resetWorld() {
  if (world) {
    if (avatar?.group.parent === world) world.remove(avatar.group);
    clearGroup(world);
    if (avatar) world.add(avatar.group);
  }
  platforms = [];
  gems = [];
  hazards = [];
  nextIslandIndex = 1;
  lastIslandZ = 0;
  createPlatform(0, 0, 0, 15, 9, 0.02);
  createPlatform(1, 0.25, 14.1, 7.4, 6.5, 0.08);
  lastIslandZ = 14.1;
  nextIslandIndex = 2;
  while (lastIslandZ < 72) appendNextIsland();
  playerX = 0;
  playerY = platforms[0].topY;
  playerZ = 0;
  playerVelocityX = 0;
  playerVelocityY = 0;
  grounded = true;
  runStartZ = 0;
  runDistance = 0;
  runScore = 0;
  runGems = 0;
  runSpeed = 5.25;
  steerInput = 0;
  keyboardLeft = false;
  keyboardRight = false;
  syncAvatarPosition();
  updateHud();
}

function appendNextIsland() {
  const previous = platforms[platforms.length - 1];
  const step = 11.5;
  const dx = (Math.random() - 0.5) * 3.5;
  const x = THREE.MathUtils.clamp(previous.x + dx, -4.5, 4.5);
  const z = lastIslandZ + step;
  const topY = THREE.MathUtils.clamp(previous.topY - 0.1 + (Math.random() - 0.48) * 0.46, -0.25, 0.48);
  createPlatform(nextIslandIndex, x, z, 7.3, 6.2, topY);
  lastIslandZ = z;
  nextIslandIndex += 1;
}

function updateHud() {
  if (ui.score) ui.score.textContent = Math.round(runScore).toLocaleString();
  if (ui.gems) ui.gems.textContent = String(runGems).padStart(2, '0');
  if (ui.distance) ui.distance.textContent = `${Math.floor(runDistance)} m`;
}

function setToast(message, duration = 2600) {
  if (!ui.toast) return;
  ui.toast.textContent = message;
  ui.toast.hidden = false;
  ui.toast.classList.add('is-visible');
  window.clearTimeout(toastTimerId);
  toastTimerId = window.setTimeout(() => {
    ui.toast?.classList.remove('is-visible');
    if (ui.toast) ui.toast.hidden = true;
  }, duration);
}

function displayPlayer(player, signedIn) {
  startNgIdentity = player ?? null;
  isSignedIn = Boolean(player && signedIn);
  createAvatar(player?.style ?? null);

  if (ui.playerName) {
    ui.playerName.textContent = safeText(player?.name, 'Preview explorer');
  }
  if (ui.playerAccount) {
    const account = isSignedIn ? safeText(player?.account) : '';
    ui.playerAccount.textContent = account ? `@${account}` : '';
    ui.playerAccount.hidden = !account;
  }
  if (ui.identityBadge) {
    ui.identityBadge.dataset.connected = player ? 'true' : 'false';
    ui.identityBadge.setAttribute(
      'aria-label',
      isSignedIn ? 'Signed in to Start.ng' : player ? 'Start.ng guest' : 'Preview avatar',
    );
  }
  if (ui.connectionStatus) {
    const status = player
      ? isSignedIn
        ? 'Connected to Start.ng'
        : 'Playing as Start.ng guest'
      : 'Start.ng identity loads on your game page';
    setConnectionStatus(status);
  }
  if (ui.signInButton) ui.signInButton.hidden = isSignedIn;

  const face = typeof player?.face === 'string' && player.face.startsWith('data:image/png;base64,')
    ? player.face
    : null;
  const avatarSlot = document.querySelector('[data-player-face], #player-avatar');
  if (avatarSlot) {
    if (avatarSlot instanceof HTMLImageElement) {
      avatarSlot.src = face ?? '';
      avatarSlot.hidden = !face;
    } else {
      avatarSlot.replaceChildren();
      avatarSlot.hidden = !face;
      if (face) {
        const image = document.createElement('img');
        image.src = face;
        image.alt = `${safeText(player?.name, 'Start.ng player')} character portrait`;
        avatarSlot.append(image);
      }
    }
  }
}

function setIdentityUnavailable() {
  if (startNgIdentity) return;
  setConnectionStatus('Start.ng identity is available on *.start.ng');
}

function setConnectionStatus(message) {
  if (!ui.connectionStatus) return;
  const indicator = ui.connectionStatus.querySelector('span');
  ui.connectionStatus.replaceChildren();
  if (indicator) ui.connectionStatus.append(indicator);
  ui.connectionStatus.append(document.createTextNode(` ${message}`));
}

function showPanel(name) {
  if (name === 'start') {
    if (ui.start) ui.start.hidden = false;
    if (ui.pause) ui.pause.hidden = true;
    if (ui.gameover) ui.gameover.hidden = true;
  } else if (name === 'pause') {
    if (ui.start) ui.start.hidden = true;
    if (ui.pause) ui.pause.hidden = false;
    if (ui.gameover) ui.gameover.hidden = true;
  } else if (name === 'gameover') {
    if (ui.start) ui.start.hidden = true;
    if (ui.pause) ui.pause.hidden = true;
    if (ui.gameover) ui.gameover.hidden = false;
  } else {
    if (ui.start) ui.start.hidden = true;
    if (ui.pause) ui.pause.hidden = true;
    if (ui.gameover) ui.gameover.hidden = true;
  }
}

function startRun() {
  resetWorld();
  runActive = true;
  paused = false;
  gameEnded = false;
  showPanel('none');
  playSound(440, 0.09, 'sine');
  ui.pauseButton?.focus({ preventScroll: true });
}

function endRun(reason) {
  if (gameEnded) return;
  gameEnded = true;
  runActive = false;
  paused = false;
  showPanel('gameover');
  if (ui.finalScore) ui.finalScore.textContent = Math.round(runScore).toLocaleString();
  if (ui.finalGems) ui.finalGems.textContent = String(runGems);

  personalBest = Math.max(personalBest, Math.round(runScore));
  try {
    localStorage.setItem(PERSONAL_BEST_KEY, String(personalBest));
  } catch {
    // Browser storage can be disabled; the current run still works.
  }

  if (ui.saveStatus) {
    ui.saveStatus.textContent = isSignedIn
      ? 'Saving your best run to Start.ng…'
      : startNgIdentity
        ? 'Sign in to save this score to Start.ng.'
        : 'Start.ng scores are available when the game is live.';
  }

  if (isSignedIn) {
    void saveStartNgScore(Math.min(1_000_000_000, Math.round(runScore)), Math.min(1_000_000_000, runGems))
      .then((reply) => {
        if (!ui.saveStatus) return;
        ui.saveStatus.textContent = reply?.ok
          ? reply.result?.improved
            ? 'New best saved to Start.ng.'
            : 'Your best score is saved on Start.ng.'
          : reply?.error
            ? reply.error
            : 'Could not save this run to Start.ng.';
      });
  }

  if (reason) setToast(reason);
  playSound(160, 0.24, 'triangle');
  ui.restartButton?.focus({ preventScroll: true });
}

function togglePause(force) {
  if (!runActive || gameEnded) return;
  paused = typeof force === 'boolean' ? force : !paused;
  showPanel(paused ? 'pause' : 'none');
  if (!paused) lastFrame = performance.now();
}

function jump() {
  if (gameEnded || !runActive || paused || !grounded) return;
  playerVelocityY = 8.15;
  grounded = false;
  playSound(560, 0.08, 'triangle');
}

function platformUnderPlayer() {
  for (let index = platforms.length - 1; index >= 0; index -= 1) {
    const platform = platforms[index];
    const withinX = Math.abs(playerX - platform.x) <= platform.width * 0.47;
    const withinZ = Math.abs(playerZ - platform.z) <= platform.depth * 0.47;
    if (withinX && withinZ) return platform;
  }
  return null;
}

function checkHazards() {
  for (const hazard of hazards) {
    if (hazard.hit) continue;
    const closeX = Math.abs(playerX - hazard.x) < 0.66;
    const closeZ = Math.abs(playerZ - hazard.z) < 0.7;
    const lowEnough = playerY < hazard.y + 1.2;
    if (closeX && closeZ && lowEnough) {
      hazard.hit = true;
      endRun('A gust caught you. Try another route.');
      return true;
    }
  }
  return false;
}

function updatePhysics(delta) {
  if (!runActive || paused || gameEnded) return;
  runSpeed = Math.min(8.5, 5.25 + runDistance / 86);
  const steering = (keyboardRight || steerInput > 0 ? 1 : 0) - (keyboardLeft || steerInput < 0 ? 1 : 0);
  playerVelocityX += steering * 16.5 * delta;
  playerVelocityX *= Math.pow(0.08, delta);
  playerVelocityX = THREE.MathUtils.clamp(playerVelocityX, -5.1, 5.1);
  playerX = THREE.MathUtils.clamp(playerX + playerVelocityX * delta, -7.2, 7.2);
  playerZ += runSpeed * delta;

  const previousY = playerY;
  if (!grounded) {
    playerVelocityY -= 18.2 * delta;
    playerY += playerVelocityY * delta;
  }

  const surface = platformUnderPlayer();
  if (surface && grounded && Math.abs(playerY - surface.topY) < 0.32) {
    playerY = surface.topY;
  } else if (
    surface &&
    !grounded &&
    playerVelocityY <= 0 &&
    previousY >= surface.topY - 0.04 &&
    playerY <= surface.topY + 0.09
  ) {
    if (!grounded && playerVelocityY < -3) playSound(300, 0.05, 'sine');
    playerY = surface.topY;
    playerVelocityY = 0;
    grounded = true;
  } else if (grounded) {
    grounded = false;
    playerVelocityY = -0.15;
  }

  runDistance = Math.max(0, playerZ - runStartZ);
  runScore = Math.floor(runDistance * 12 + runGems * 100);
  while (lastIslandZ < playerZ + 95) appendNextIsland();
  collectGems();
  if (checkHazards()) return;
  removeOldIslands();
  syncAvatarPosition();

  if (playerY < -7 || Math.abs(playerX) > 7.15) {
    endRun('The clouds are a long way down. Ready for another run?');
    return;
  }
  updateHud();
}

function collectGems() {
  for (const gem of gems) {
    if (gem.collected) continue;
    const closeEnough = Math.hypot(playerX - gem.x, playerZ - gem.z) < 0.78;
    const closeHeight = Math.abs(playerY + 1.1 - gem.y) < 1.55;
    if (closeEnough && closeHeight) {
      gem.collected = true;
      gem.mesh.visible = false;
      runGems += 1;
      runScore = Math.floor(runDistance * 12 + runGems * 100);
      updateHud();
      setToast('+100 sky points', 1000);
      playSound(760 + (runGems % 4) * 90, 0.11, 'sine');
    }
  }
}

function removeOldIslands() {
  const cutoff = playerZ - 24;
  platforms = platforms.filter((platform) => {
    if (platform.z > cutoff) return true;
    disposeObject(platform.group);
    return false;
  });
  gems = gems.filter((gem) => {
    if (gem.z > cutoff) return true;
    if (gem.mesh.parent) disposeObject(gem.mesh);
    return false;
  });
  hazards = hazards.filter((hazard) => {
    if (hazard.z > cutoff) return true;
    disposeObject(hazard.group);
    return false;
  });
}

function animateScene(time, delta) {
  const animating = !runActive || (!paused && !gameEnded);
  if (animating && avatar) {
    const elapsed = time * 0.001;
    const bob = runActive && !paused && !grounded ? 0 : Math.sin(elapsed * (runActive ? 15 : 2.5)) * (runActive ? 0.045 : 0.026);
    avatar.torso.position.y = bob;
    const running = runActive && !paused && !grounded ? 0.42 : runActive && !paused ? 0.82 : 0.08;
    const swing = Math.sin(elapsed * 11) * running;
    avatar.leftArm.rotation.x = swing;
    avatar.rightArm.rotation.x = -swing;
    avatar.leftLeg.rotation.x = -swing * 0.88;
    avatar.rightLeg.rotation.x = swing * 0.88;
    avatar.shadow.material.opacity = Math.max(0.08, 0.2 - Math.max(0, playerY - 0.15) * 0.07);
    avatar.shadow.scale.setScalar(1 + Math.max(0, playerY - 0.15) * 0.12);
  }

  for (const gem of gems) {
    if (gem.collected) continue;
    gem.mesh.rotation.y += delta * 1.5;
    gem.mesh.rotation.z = Math.sin(time * 0.0016 + gem.phase) * 0.12;
    gem.mesh.position.y = gem.y + Math.sin(time * 0.002 + gem.phase) * 0.14;
  }
  for (const hazard of hazards) {
    hazard.group.rotation.y += delta * 0.75;
    hazard.group.position.y = hazard.y + Math.sin(time * 0.0018 + hazard.phase) * 0.08;
  }
  clouds.forEach((cloud, index) => {
    cloud.position.x += Math.sin(time * 0.0002 + index) * delta * 0.035;
  });

  if (avatar) {
    const target = new THREE.Vector3(playerX * 0.35, playerY + 1.05, playerZ + 0.5);
    const cameraGoal = new THREE.Vector3(playerX + 3.2, playerY + 7.1, playerZ - 9.5);
    camera.position.lerp(cameraGoal, 1 - Math.pow(0.001, delta));
    camera.lookAt(target);
  }
}

function tick(time) {
  const elapsed = Math.max(0, (time - lastFrame) / 1000 || 0);
  const delta = Math.min(0.18, elapsed);
  lastFrame = time;
  if (runActive && !paused && !gameEnded) {
    const stepCount = Math.max(1, Math.ceil(delta / (1 / 60)));
    const stepDelta = delta / stepCount;
    for (let step = 0; step < stepCount; step += 1) updatePhysics(stepDelta);
  }
  animateScene(time, delta);
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

function playSound(frequency, duration, type = 'sine') {
  if (!soundEnabled) return;
  try {
    audioContext ??= new window.AudioContext();
    if (audioContext.state === 'suspended') void audioContext.resume();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
    gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, audioContext.currentTime + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + duration);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + duration + 0.02);
  } catch {
    // Audio is optional and can be unavailable in restricted browser contexts.
  }
}

function appendLeaderboardMessage(message) {
  if (!ui.leaderboardList) return;
  const item = document.createElement('li');
  item.className = 'leaderboard-empty';
  item.textContent = message;
  ui.leaderboardList.replaceChildren(item);
}

async function loadLeaderboard() {
  if (!ui.leaderboardPanel || !ui.leaderboardList) return;
  showBoard = true;
  ui.leaderboardPanel.hidden = false;
  appendLeaderboardMessage('Loading the Start.ng leaderboard…');
  const board = await getStartNgLeaderboard(10);
  if (!showBoard) return;
  if (!board?.ok || !Array.isArray(board.entries)) {
    appendLeaderboardMessage('The shared leaderboard is available when Skybund is live on Start.ng.');
    return;
  }

  const fragment = document.createDocumentFragment();
  if (board.entries.length === 0) {
    appendLeaderboardMessage('No sky scores yet. Be the first to fly!');
    return;
  }

  for (const entry of board.entries) {
    const item = document.createElement('li');
    item.className = 'leaderboard-entry';
    const isCurrentPlayer = isSignedIn && entry.player_id === startNgIdentity?.id;
    if (isCurrentPlayer) item.classList.add('is-current-player');
    const color = safeColor(entry.color, '#ffffff');
    item.style.setProperty('--entry-color', color);

    const rank = document.createElement('span');
    rank.className = 'leaderboard-rank';
    rank.textContent = `#${entry.rank}`;
    const name = document.createElement('span');
    name.textContent = `${safeText(entry.name, 'Player')} · ${Number(entry.stats?.gems ?? 0)} gems`;
    const score = document.createElement('strong');
    score.className = 'leaderboard-score';
    score.textContent = Number(entry.score || 0).toLocaleString();
    const gemsValue = document.createElement('span');
    gemsValue.className = 'leaderboard-gems';
    gemsValue.textContent = String(entry.stats?.gems ?? 0);
    item.append(rank, name, score, gemsValue);
    fragment.append(item);
  }
  ui.leaderboardList.replaceChildren(fragment);
}

function closeLeaderboard() {
  showBoard = false;
  if (ui.leaderboardPanel) ui.leaderboardPanel.hidden = true;
  ui.leaderboardButton?.focus({ preventScroll: true });
}

function setSteer(direction) {
  steerInput = direction;
}

function bindHoldButton(button, direction) {
  if (!button) return;
  const start = (event) => {
    event.preventDefault();
    setSteer(direction);
    button.setPointerCapture?.(event.pointerId);
  };
  const stop = (event) => {
    event.preventDefault();
    if (steerInput === direction) setSteer(0);
  };
  button.addEventListener('pointerdown', start);
  button.addEventListener('pointerup', stop);
  button.addEventListener('pointercancel', stop);
  button.addEventListener('lostpointercapture', stop);
  button.addEventListener('click', () => {
    setSteer(direction);
    window.setTimeout(() => {
      if (steerInput === direction) setSteer(0);
    }, 180);
  });
  button.addEventListener('contextmenu', (event) => event.preventDefault());
}

function bindControls() {
  ui.startButton?.addEventListener('click', startRun);
  ui.restartButton?.addEventListener('click', startRun);
  ui.signInButton?.addEventListener('click', signInWithStartNg);
  ui.pauseButton?.addEventListener('click', () => togglePause(true));
  ui.resumeButton?.addEventListener('click', () => togglePause(false));
  ui.jumpButton?.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    jump();
  });
  ui.jumpButton?.addEventListener('click', jump);
  ui.leaderboardButton?.addEventListener('click', () => void loadLeaderboard());
  document.querySelectorAll('.gameover-leaderboard').forEach((button) => {
    button.addEventListener('click', () => void loadLeaderboard());
  });
  ui.leaderboardClose?.addEventListener('click', closeLeaderboard);
  ui.soundButton?.addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    ui.soundButton.setAttribute('aria-pressed', String(!soundEnabled));
    ui.soundButton.setAttribute('aria-label', soundEnabled ? 'Turn sound off' : 'Turn sound on');
    if (soundEnabled) playSound(520, 0.07);
  });

  bindHoldButton(ui.leftButton, -1);
  bindHoldButton(ui.rightButton, 1);

  window.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft' || event.key.toLowerCase() === 'a') {
      keyboardLeft = true;
      event.preventDefault();
    } else if (event.key === 'ArrowRight' || event.key.toLowerCase() === 'd') {
      keyboardRight = true;
      event.preventDefault();
    } else if (event.key === ' ' || event.key === 'ArrowUp' || event.key.toLowerCase() === 'w') {
      if (!event.repeat) jump();
      event.preventDefault();
    } else if (event.key === 'Escape' && runActive) {
      togglePause();
    }
  });
  window.addEventListener('keyup', (event) => {
    if (event.key === 'ArrowLeft' || event.key.toLowerCase() === 'a') keyboardLeft = false;
    if (event.key === 'ArrowRight' || event.key.toLowerCase() === 'd') keyboardRight = false;
  });
  window.addEventListener('blur', () => {
    keyboardLeft = false;
    keyboardRight = false;
    steerInput = 0;
    if (runActive && !paused && !gameEnded) togglePause(true);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && showBoard) closeLeaderboard();
  });
}

function bindStartNg() {
  stopObservingPlayer = observeStartNgPlayer(displayPlayer, setIdentityUnavailable);
}

try {
  bindControls();
  createScene();
  displayPlayer(null, false);
  bindStartNg();
  showPanel('start');
  requestAnimationFrame((time) => {
    lastFrame = time;
    requestAnimationFrame(tick);
  });
} catch (error) {
  if (ui.loading) ui.loading.hidden = true;
  displayPlayer(null, false);
  setConnectionStatus('3D graphics unavailable in this browser');
  if (ui.startButton) {
    ui.startButton.disabled = true;
    ui.startButton.setAttribute('aria-describedby', 'renderer-warning');
  }
  const notice = document.createElement('p');
  notice.id = 'renderer-warning';
  notice.className = 'renderer-warning';
  notice.setAttribute('role', 'alert');
  notice.textContent = 'This browser could not start WebGL. Try a browser with 3D graphics enabled.';
  ui.start?.querySelector('.intro-copy')?.after(notice);
  if (!(error instanceof Error) || error.message !== 'WebGL context unavailable') {
    console.error('Skybund could not start:', error);
  }
}

window.addEventListener('pagehide', () => {
  stopObservingPlayer();
  resizeObserver?.disconnect();
  renderer?.dispose();
});
