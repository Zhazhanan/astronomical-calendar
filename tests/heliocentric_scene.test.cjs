const test = require('node:test');
const assert = require('node:assert/strict');
const Heliocentric = require('../js/heliocentric-scene.js');

const state = Object.freeze({
  earth: Object.freeze({
    positionAu: Object.freeze({ x: 0.5, y: 0, z: -0.8 }),
    axisUnit: Object.freeze({ x: 0, y: 0.9175, z: 0.3978 }),
    distanceAu: 0.943,
    perihelionLongitudeDeg: 102.9,
    trueLongitudeDeg: 245,
    rotationAngleDeg: 123
  }),
  sun: Object.freeze({ vectorAu: Object.freeze({ x: -0.5, y: 0, z: 0.8 }) }),
  moon: Object.freeze({
    positionKm: Object.freeze({ x: 100000, y: 20000, z: 360000 }),
    distanceKm: 374700,
    illumination: 0.61,
    ascendingNodeLongitudeDeg: 125,
    descendingNodeLongitudeDeg: 305,
    perigeeDistanceKm: 363300,
    apogeeDistanceKm: 405500,
    argumentOfPerigeeDeg: 318,
    orbit: Object.freeze({ inclinationDeg: 5.145, eccentricity: 0.0549 })
  }),
  observer: Object.freeze({ location: Object.freeze({ latitudeDeg: 40, longitudeDeg: 116 }), subsolarPoint: Object.freeze({ latitudeDeg: 23, longitudeDeg: 15 }) })
});

test('visual adapter preserves one source state and applies documented scales', () => {
  const model = Heliocentric.toVisualModel(state);
  assert.deepEqual(model.earth.axisUnit, state.earth.axisUnit);
  assert.equal(model.legend, '大小与距离采用不同增强比例');
  assert.equal(model.moon.orbitInclinationDeg, 5.145);
  assert.equal(model.earth.rotationAngleDeg, 123);
  assert.equal(model.moon.argumentOfPerigeeDeg, 318);
  assert.deepEqual(model.observer.location, { latitudeDeg: 40, longitudeDeg: 116 });
  assert.equal(Object.isFrozen(model.moon), true);
  assert.ok(model.earth.position.length > model.moon.relativePosition.length);
  assert.equal(model.display.earthOrbitRadius, 42);
  assert.ok(Math.abs(model.earth.position.length / Math.hypot(0.5, 0, -0.8) - 42) < 1e-12);
  assert.ok(Math.abs(model.moon.relativePosition.length / Math.hypot(100000, 20000, 360000) - 4.8 / 384400) < 1e-16);
});

test('adapter never points the axis at the Sun', () => {
  const model = Heliocentric.toVisualModel(state);
  assert.notDeepEqual(model.earth.axisUnit, {
    x: -model.earth.position.x,
    y: -model.earth.position.y,
    z: -model.earth.position.z
  });
});

test('adapter rejects missing required WorldState vectors with stable error', () => {
  assert.throws(
    () => Heliocentric.toVisualModel(Object.freeze({ earth: Object.freeze({}) })),
    { name: 'TypeError', message: 'worldState must provide earth, sun, moon, and observer state' }
  );
});

test('module keeps its public seam free of time and astronomy calculations', () => {
  const source = require('node:fs').readFileSync(require.resolve('../js/heliocentric-scene.js'), 'utf8');
  assert.doesNotMatch(source, /\bDate\b|\bAstronomy\b|\bCalendar\b/);
});

test('world-space lunar lighting is invariant when only the camera rotates', () => {
  const normal = { x: 0, y: 0, z: 1 };
  const light = { x: 0, y: 0, z: 1 };
  assert.equal(Heliocentric.worldLightDot(normal, light), 1);
  const cameraRotatedNormal = rotateY(normal, Math.PI / 2);
  const cameraRotatedLight = rotateY(light, Math.PI / 2);
  assert.equal(Heliocentric.worldLightDot(cameraRotatedNormal, cameraRotatedLight), 1);
});

test('Three rotation signs map canonical ecliptic longitude into the displayed orbit frame', () => {
  const perihelion = 102.9 * Math.PI / 180;
  const marker = rotateY({ x: 1, y: 0, z: 0 }, -perihelion);
  assert.ok(Math.abs(marker.x - Math.cos(perihelion)) < 1e-12);
  assert.ok(Math.abs(marker.z - Math.sin(perihelion)) < 1e-12);
  const subsolarLongitude = 40;
  const greenwichRotation = 80;
  const observer = rotateY({ x: Math.cos(subsolarLongitude * Math.PI / 180), y: 0, z: Math.sin(subsolarLongitude * Math.PI / 180) }, -greenwichRotation * Math.PI / 180);
  assert.ok(Math.abs(observer.x - Math.cos((subsolarLongitude + greenwichRotation) * Math.PI / 180)) < 1e-12);
  assert.ok(Math.abs(observer.z - Math.sin((subsolarLongitude + greenwichRotation) * Math.PI / 180)) < 1e-12);
});

test('perihelion Earth and subsolar observer align with their rendered directions', () => {
  const THREE = createFakeThree();
  const scene = Heliocentric.create({ THREE, interactionElement: {} });
  const perihelion = 102.9;
  const sidereal = 80;
  const rightAscension = 100;
  const aligned = Object.assign({}, state, {
    earth: Object.assign({}, state.earth, {
      positionAu: { x: Math.cos(perihelion * Math.PI / 180), y: 0, z: Math.sin(perihelion * Math.PI / 180) },
      axisUnit: { x: 0, y: 1, z: 0 }, perihelionLongitudeDeg: perihelion, rotationAngleDeg: sidereal
    }),
    sun: { vectorAu: { x: Math.cos(rightAscension * Math.PI / 180), y: 0, z: Math.sin(rightAscension * Math.PI / 180) } },
    observer: { location: { latitudeDeg: 0, longitudeDeg: rightAscension - sidereal }, subsolarPoint: null }
  });
  scene.update(aligned);
  const markerDirection = rotateY({ x: 1, y: 0, z: 0 }, scene.scene.userData.earthOrbitGroup.rotation.y);
  assert.ok(Math.abs(markerDirection.x - aligned.earth.positionAu.x) < 1e-12);
  assert.ok(Math.abs(markerDirection.z - aligned.earth.positionAu.z) < 1e-12);
  const observerDirection = rotateY(scene.scene.userData.observerMarker.position, scene.scene.userData.earthSpinGroup.rotation.y);
  assert.ok(Math.abs(observerDirection.x / Math.hypot(observerDirection.x, observerDirection.z) - aligned.sun.vectorAu.x) < 1e-12);
  assert.ok(Math.abs(observerDirection.z / Math.hypot(observerDirection.x, observerDirection.z) - aligned.sun.vectorAu.z) < 1e-12);
  scene.dispose();
});

test('create builds static teaching objects, updates in place, and releases resources once', () => {
  const THREE = createFakeThree();
  const interactionElement = {};
  const labels = [];
  const labelLayer = { appendChild: (label) => labels.push(label) };
  const scene = Heliocentric.create({ THREE, interactionElement, labelLayer });
  assert.equal(scene.controls.domElement, interactionElement);
  assert.ok(scene.scene.children[0].children.length >= 6);
  assert.equal(labels.some((label) => label.textContent === '大小与距离采用不同增强比例'), true);

  scene.update(state);
  const earthPosition = scene.scene.userData.earthGroup.position;
  assert.equal(earthPosition.x, 21);
  assert.equal(earthPosition.z, -33.6);
  const positionVector = earthPosition;
  scene.update(state);
  assert.equal(scene.scene.userData.earthGroup.position, positionVector);
  assert.equal(scene.scene.userData.moon.position.x !== 0, true);
  assert.equal(scene.scene.userData.earthSpinGroup.rotation.y, -123 * Math.PI / 180);
  assert.match(scene.scene.userData.moon.material.vertexShader, /worldNormal=normalize\(mat3\(modelMatrix\)\*normal\)/);
  assert.match(scene.scene.userData.moon.material.fragmentShader, /dot\(normalize\(worldNormal\),normalize\(lightDirection\)\)/);
  const lightDirection = scene.scene.userData.moon.material.uniforms.lightDirection.value;
  assert.ok(Math.abs(lightDirection.x + 0.5 / Math.hypot(0.5, 0, 0.8)) < 1e-12);
  assert.equal(labels.some((label) => /^近地点/.test(label.textContent)), true);
  const orbitPosition = scene.scene.userData.moonOrbit.geometry.getAttribute('position');
  orbitPosition.needsUpdate = false;

  scene.setLabelsVisible(false);
  assert.equal(labels.every((label) => label.style.display === 'none'), true);
  scene.update(state);
  assert.equal(orbitPosition.needsUpdate, false);
  const changedSun = Object.assign({}, state, { sun: Object.freeze({ vectorAu: Object.freeze({ x: 1, y: 0, z: 0 }) }) });
  scene.update(changedSun);
  assert.equal(lightDirection.x, 1);
  const vectorsBeforeOrbitUpdate = THREE.vectorCreations;
  const changedOrbit = Object.assign({}, changedSun, {
    moon: Object.assign({}, state.moon, { ascendingNodeLongitudeDeg: 126 })
  });
  scene.update(changedOrbit);
  assert.equal(THREE.vectorCreations, vectorsBeforeOrbitUpdate);
  scene.dispose();
  scene.dispose();
  assert.equal(THREE.controlsDisposed, 1);
  assert.equal(THREE.disposedGeometries > 0, true);
  assert.equal(THREE.disposedMaterials > 0, true);
  assert.equal(THREE.disposedTextures, 1);
});

test('procedural glow texture receives a local 64px radial canvas', () => {
  const priorDocument = global.document;
  const calls = [];
  global.document = {
    createElement: (name) => name === 'canvas' ? {
      getContext: () => ({
        createRadialGradient: () => ({ addColorStop: () => calls.push('stop') }),
        fillRect: () => calls.push('fill')
      })
    } : { style: {} }
  };
  try {
    const THREE = createFakeThree();
    const scene = Heliocentric.create({ THREE, interactionElement: {} });
    const glow = scene.scene.children[0].children.find((entry) => entry instanceof THREE.Sprite);
    assert.equal(glow.material.map.canvas.width, 64);
    assert.equal(glow.material.map.canvas.height, 64);
    assert.equal(calls.filter((call) => call === 'stop').length, 3);
    assert.equal(calls.includes('fill'), true);
    scene.dispose();
  } finally {
    global.document = priorDocument;
  }
});

function rotateY(vector, radians) {
  return {
    x: Math.cos(radians) * vector.x + Math.sin(radians) * vector.z,
    y: vector.y,
    z: -Math.sin(radians) * vector.x + Math.cos(radians) * vector.z
  };
}

function createFakeThree() {
  const stats = { disposedGeometries: 0, disposedMaterials: 0, disposedTextures: 0, controlsDisposed: 0, vectorCreations: 0 };
  class Vector3 {
    constructor(x = 0, y = 0, z = 0) { stats.vectorCreations += 1; this.set(x, y, z); }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
    copy(vector) { return this.set(vector.x, vector.y, vector.z); }
    normalize() { const length = Math.hypot(this.x, this.y, this.z) || 1; return this.set(this.x / length, this.y / length, this.z / length); }
    multiplyScalar(value) { return this.set(this.x * value, this.y * value, this.z * value); }
    subVectors(a, b) { return this.set(a.x - b.x, a.y - b.y, a.z - b.z); }
  }
  class Object3D {
    constructor() { this.children = []; this.position = new Vector3(); this.rotation = new Vector3(); this.scale = new Vector3(1, 1, 1); this.quaternion = { setFromUnitVectors: () => this.quaternion }; this.userData = {}; }
    add(...items) { this.children.push(...items); }
  }
  class Group extends Object3D {}
  class Scene extends Group {}
  class Camera extends Object3D { constructor() { super(); this.lookAt = () => {}; } }
  class Geometry { dispose() { stats.disposedGeometries += 1; } }
  class BufferGeometry extends Geometry { constructor() { super(); this.attributes = {}; } setFromPoints(points) { this.points = points; this.attributes.position = new BufferAttribute(new Float32Array(points.flatMap((point) => [point.x, point.y, point.z])), 3); return this; } setAttribute(name, value) { this.attributes[name] = value; return this; } getAttribute(name) { return this.attributes[name]; } }
  class BufferAttribute { constructor(array, itemSize) { this.array = array; this.itemSize = itemSize; this.needsUpdate = false; } }
  class Material { constructor(options) { Object.assign(this, options); } dispose() { stats.disposedMaterials += 1; } }
  class Texture { dispose() { stats.disposedTextures += 1; } }
  class Mesh extends Object3D { constructor(geometry, material) { super(); this.geometry = geometry; this.material = material; } }
  class Line extends Mesh {}
  class Sprite extends Object3D { constructor(material) { super(); this.material = material; } }
  class SpriteMaterial extends Material {}
  class ShaderMaterial extends Material { constructor(options) { super(options); this.uniforms = options.uniforms; this.vertexShader = options.vertexShader; this.fragmentShader = options.fragmentShader; } }
  class CanvasTexture extends Texture { constructor(canvas) { super(); this.canvas = canvas; } }
  class PointLight extends Object3D { constructor(color, intensity, distance) { super(); this.color = color; this.intensity = intensity; this.distance = distance; } }
  class OrbitControls { constructor(camera, domElement) { this.camera = camera; this.domElement = domElement; } dispose() { stats.controlsDisposed += 1; } }
  return Object.assign(stats, {
    Vector3, Object3D, Group, Scene, PerspectiveCamera: Camera, Mesh, Line, Sprite, PointLight,
    SphereGeometry: Geometry, RingGeometry: Geometry, BufferGeometry, BufferAttribute, TubeGeometry: Geometry,
    MeshPhongMaterial: Material, MeshBasicMaterial: Material, LineBasicMaterial: Material,
    SpriteMaterial, ShaderMaterial, CanvasTexture, OrbitControls, AdditiveBlending: 2
  });
}
