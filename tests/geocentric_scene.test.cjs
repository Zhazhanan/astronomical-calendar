const test = require('node:test');
const assert = require('node:assert/strict');
const Geocentric = require('../js/geocentric-scene.js');

const state = Object.freeze({
  sun: Object.freeze({
    longitudeDeg: 90,
    vectorAu: Object.freeze({ x: 0, y: 0, z: 1 }),
    solarTerms: Object.freeze({ current: Object.freeze({ name: '夏至' }), next: Object.freeze({ name: '小暑' }) })
  }),
  moon: Object.freeze({ longitudeDeg: 110, latitudeDeg: 5, nodeDistanceDeg: 20, illumination: 0.4, eclipseSeasonHint: Object.freeze({ possible: false }) })
});

test('visual model keeps spring zero and solar longitude aligned', () => {
  const model = Geocentric.toVisualModel(state);
  assert.equal(model.springZeroDeg, 0);
  assert.equal(model.solarLongitudeDeg, 90);
  assert.equal(model.solarTermName, '夏至');
  assert.equal(model.nextSolarTermName, '小暑');
  assert.deepEqual(model.angleArc, { startDeg: 0, endDeg: 90 });
  assert.equal(Object.isFrozen(model), true);
  assert.equal(Object.isFrozen(model.moon), true);
});

test('adapter accepts legacy root solarTerms fixtures but state sun terms win', () => {
  const legacy = Object.assign({}, state, {
    sun: Object.assign({}, state.sun, { solarTerms: undefined }),
    solarTerms: { current: { name: '清明' }, next: { name: '谷雨' } }
  });
  assert.equal(Geocentric.toVisualModel(legacy).solarTermName, '清明');
  const both = Object.assign({}, legacy, { sun: Object.assign({}, legacy.sun, { solarTerms: { current: { name: '春分' }, next: { name: '清明' } } }) });
  assert.equal(Geocentric.toVisualModel(both).solarTermName, '春分');
});

test('Moon latitude remains distinct from ecliptic longitude and preserves signs', () => {
  const negative = Object.assign({}, state, { moon: Object.assign({}, state.moon, { longitudeDeg: 40, latitudeDeg: -4.2, nodeDistanceDeg: 4.2 }) });
  const model = Geocentric.toVisualModel(negative);
  assert.equal(model.moon.latitudeDeg, -4.2);
  assert.equal(model.moon.longitudeDeg, 40);
  assert.equal(model.moon.nodeDistanceDeg, 4.2);
  assert.equal(model.moon.illumination, 0.4);
});

test('longitude helper maps cardinal ecliptic positions and signed latitude', () => {
  const radius = 10;
  assert.deepEqual(Geocentric.lonLatToVector(0, 0, radius), { x: 10, y: 0, z: 0 });
  assert.ok(Math.abs(Geocentric.lonLatToVector(90, 0, radius).z - 10) < 1e-12);
  assert.ok(Math.abs(Geocentric.lonLatToVector(180, 0, radius).x + 10) < 1e-12);
  assert.ok(Math.abs(Geocentric.lonLatToVector(270, 0, radius).z + 10) < 1e-12);
  assert.ok(Geocentric.lonLatToVector(0, -30, radius).y < 0);
});

test('scene updates solar arc only above the display threshold and keeps spring ray fixed', () => {
  const THREE = createFakeThree();
  const labels = [];
  const scene = Geocentric.create({ THREE, interactionElement: {}, labelLayer: labelLayer(labels), solarTermNames: names() });
  scene.update(state);
  const ray = scene.scene.userData.springRay;
  const originalRotation = ray.rotation.y;
  const arc = scene.scene.userData.solarArc.geometry.getAttribute('position');
  const initialWrites = arc.needsUpdateCount;
  scene.update(Object.assign({}, state, { sun: Object.assign({}, state.sun, { longitudeDeg: 90.04 }) }));
  assert.equal(arc.needsUpdateCount, initialWrites);
  scene.update(Object.assign({}, state, { sun: Object.assign({}, state.sun, { longitudeDeg: 90.05 }) }));
  assert.equal(arc.needsUpdateCount, initialWrites + 1);
  assert.equal(ray.rotation.y, originalRotation);
  scene.dispose();
});

test('scene reads terms and moon concepts directly from state, supports labels and no-op updates', () => {
  const THREE = createFakeThree();
  const labels = [];
  const scene = Geocentric.create({ THREE, interactionElement: {}, labelLayer: labelLayer(labels), solarTermNames: names() });
  scene.update(state);
  assert.equal(labels.some((label) => label.textContent === '当前节气：夏至'), true);
  assert.equal(labels.some((label) => label.textContent === '月球黄纬：+5.00°'), true);
  assert.equal(labels.some((label) => label.textContent === '距交点：20.00°'), true);
  assert.equal(labels.some((label) => label.textContent === '照亮：40%'), true);
  const moonPosition = scene.scene.userData.moon.position;
  const vectorCreations = THREE.vectorCreations;
  scene.update(state);
  assert.equal(scene.scene.userData.moon.position, moonPosition);
  assert.equal(THREE.vectorCreations, vectorCreations);
  scene.setLabelsVisible(false);
  assert.equal(labels.every((label) => label.style.display === 'none'), true);
  scene.setLabelsVisible(true);
  assert.equal(labels.every((label) => label.style.display === ''), true);
  scene.dispose();
  scene.dispose();
  assert.equal(THREE.controlsDisposed, 1);
  assert.ok(THREE.disposedGeometries > 0);
  assert.ok(THREE.disposedMaterials > 0);
});

test('module public seam has no clock or calculation dependencies', () => {
  const source = require('node:fs').readFileSync(require.resolve('../js/geocentric-scene.js'), 'utf8');
  assert.doesNotMatch(source, /\bDate\b|\bAstronomy\b|\bCalendar\b/);
});

function names() { return Array.from({ length: 24 }, (_, index) => '节气' + index); }
function labelLayer(items) { return { appendChild(label) { items.push(label); } }; }

function createFakeThree() {
  const stats = { vectorCreations: 0, disposedGeometries: 0, disposedMaterials: 0, controlsDisposed: 0 };
  class Vector3 { constructor(x = 0, y = 0, z = 0) { stats.vectorCreations++; this.set(x, y, z); } set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } copy(v) { return this.set(v.x, v.y, v.z); } }
  class Object3D { constructor() { this.children = []; this.position = new Vector3(); this.rotation = new Vector3(); this.userData = {}; } add(...items) { this.children.push(...items); } }
  class Group extends Object3D {}
  class Scene extends Group {}
  class PerspectiveCamera extends Object3D { lookAt() {} }
  class BufferAttribute { constructor(array, itemSize) { this.array = array; this.itemSize = itemSize; this.needsUpdate = false; this.needsUpdateCount = 0; } setXYZ(index, x, y, z) { const base = index * this.itemSize; this.array[base] = x; this.array[base + 1] = y; this.array[base + 2] = z; } }
  class BufferGeometry { constructor() { this.attributes = {}; } setFromPoints(points) { this.attributes.position = new BufferAttribute(new Float32Array(points.length * 3), 3); points.forEach((p, i) => this.attributes.position.setXYZ(i, p.x, p.y, p.z)); return this; } setAttribute(name, attribute) { this.attributes[name] = attribute; return this; } getAttribute(name) { return this.attributes[name]; } dispose() { stats.disposedGeometries++; } }
  class Geometry { dispose() { stats.disposedGeometries++; } }
  class Material { constructor(options) { Object.assign(this, options); } dispose() { stats.disposedMaterials++; } }
  class Mesh extends Object3D { constructor(geometry, material) { super(); this.geometry = geometry; this.material = material; } }
  class Line extends Mesh {}
  class OrbitControls { constructor(camera, element) { this.camera = camera; this.domElement = element; } dispose() { stats.controlsDisposed++; } }
  return Object.assign(stats, { Vector3, Group, Scene, PerspectiveCamera, BufferAttribute, BufferGeometry, SphereGeometry: Geometry, RingGeometry: Geometry, MeshBasicMaterial: Material, LineBasicMaterial: Material, Mesh, Line, OrbitControls });
}
