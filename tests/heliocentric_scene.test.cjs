const test = require('node:test');
const assert = require('node:assert/strict');
const Heliocentric = require('../js/heliocentric-scene.js');

const state = Object.freeze({
  earth: Object.freeze({
    positionAu: Object.freeze({ x: 0.5, y: 0, z: -0.8 }),
    axisUnit: Object.freeze({ x: 0, y: 0.9175, z: 0.3978 }),
    distanceAu: 0.943,
    perihelionLongitudeDeg: 102.9,
    trueLongitudeDeg: 245
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
    orbit: Object.freeze({ inclinationDeg: 5.145, eccentricity: 0.0549 })
  }),
  observer: Object.freeze({ subsolarPoint: Object.freeze({ latitudeDeg: 23, longitudeDeg: 15 }) })
});

test('visual adapter preserves one source state and applies documented scales', () => {
  const model = Heliocentric.toVisualModel(state);
  assert.deepEqual(model.earth.axisUnit, state.earth.axisUnit);
  assert.equal(model.legend, '大小与距离采用不同增强比例');
  assert.equal(model.moon.orbitInclinationDeg, 5.145);
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

test('create builds static teaching objects, updates in place, and releases resources once', () => {
  const THREE = createFakeThree();
  const interactionElement = {};
  const labels = [];
  const labelLayer = { appendChild: (label) => labels.push(label) };
  const scene = Heliocentric.create({ THREE, interactionElement, labelLayer });
  assert.equal(scene.controls.domElement, interactionElement);
  assert.ok(scene.scene.children[0].children.length >= 8);
  assert.equal(labels.some((label) => label.textContent === '大小与距离采用不同增强比例'), true);

  scene.update(state);
  const earthPosition = scene.scene.userData.earthGroup.position;
  assert.equal(earthPosition.x, 21);
  assert.equal(earthPosition.z, -33.6);
  const positionVector = earthPosition;
  scene.update(state);
  assert.equal(scene.scene.userData.earthGroup.position, positionVector);
  assert.equal(scene.scene.userData.moon.position.x !== 0, true);

  scene.setLabelsVisible(false);
  assert.equal(labels.every((label) => label.style.display === 'none'), true);
  scene.dispose();
  scene.dispose();
  assert.equal(THREE.controlsDisposed, 1);
  assert.equal(THREE.disposedGeometries > 0, true);
  assert.equal(THREE.disposedMaterials > 0, true);
  assert.equal(THREE.disposedTextures, 1);
});

function createFakeThree() {
  const stats = { disposedGeometries: 0, disposedMaterials: 0, disposedTextures: 0, controlsDisposed: 0 };
  class Vector3 {
    constructor(x = 0, y = 0, z = 0) { this.set(x, y, z); }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
    copy(vector) { return this.set(vector.x, vector.y, vector.z); }
    normalize() { const length = Math.hypot(this.x, this.y, this.z) || 1; return this.set(this.x / length, this.y / length, this.z / length); }
    multiplyScalar(value) { return this.set(this.x * value, this.y * value, this.z * value); }
    subVectors(a, b) { return this.set(a.x - b.x, a.y - b.y, a.z - b.z); }
  }
  class Object3D {
    constructor() { this.children = []; this.position = new Vector3(); this.rotation = new Vector3(); this.quaternion = { setFromUnitVectors: () => this.quaternion }; this.userData = {}; }
    add(...items) { this.children.push(...items); }
  }
  class Group extends Object3D {}
  class Scene extends Group {}
  class Camera extends Object3D { constructor() { super(); this.lookAt = () => {}; } }
  class Geometry { dispose() { stats.disposedGeometries += 1; } }
  class BufferGeometry extends Geometry { setFromPoints(points) { this.points = points; return this; } }
  class Material { constructor(options) { Object.assign(this, options); } dispose() { stats.disposedMaterials += 1; } }
  class Texture { dispose() { stats.disposedTextures += 1; } }
  class Mesh extends Object3D { constructor(geometry, material) { super(); this.geometry = geometry; this.material = material; } }
  class Line extends Mesh {}
  class Sprite extends Mesh {}
  class SpriteMaterial extends Material {}
  class CanvasTexture extends Texture { constructor(canvas) { super(); this.canvas = canvas; } }
  class PointLight extends Object3D { constructor(color, intensity, distance) { super(); this.color = color; this.intensity = intensity; this.distance = distance; } }
  class OrbitControls { constructor(camera, domElement) { this.camera = camera; this.domElement = domElement; } dispose() { stats.controlsDisposed += 1; } }
  return Object.assign(stats, {
    Vector3, Object3D, Group, Scene, PerspectiveCamera: Camera, Mesh, Line, Sprite, PointLight,
    SphereGeometry: Geometry, RingGeometry: Geometry, BufferGeometry, TubeGeometry: Geometry,
    MeshPhongMaterial: Material, MeshBasicMaterial: Material, LineBasicMaterial: Material,
    SpriteMaterial, CanvasTexture, OrbitControls, AdditiveBlending: 2
  });
}
