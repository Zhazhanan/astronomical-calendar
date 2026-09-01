const test = require('node:test');
const assert = require('node:assert/strict');
const Geocentric = require('../js/geocentric-scene.js');
const SceneHost = require('../js/scene-host.js');

const state = Object.freeze({
  sun: Object.freeze({ longitudeDeg: 90, vectorAu: Object.freeze({ x: 0, y: 0, z: 1 }), solarTerms: Object.freeze({ current: Object.freeze({ name: '夏至' }), next: Object.freeze({ name: '小暑' }) }) }),
  moon: Object.freeze({ longitudeDeg: 110, latitudeDeg: 5, nodeDistanceDeg: 20, illumination: 0.4, phaseName: '上弦月', elongationDeg: 90, waxing: true, eclipseSeasonHint: Object.freeze({ possible: false }) })
});

test('visual model keeps spring zero, solar terms, and moon phase state aligned', () => {
  const model = Geocentric.toVisualModel(state);
  assert.equal(model.springZeroDeg, 0); assert.equal(model.solarLongitudeDeg, 90);
  assert.equal(model.solarTermName, '夏至'); assert.equal(model.nextSolarTermName, '小暑');
  assert.deepEqual(model.angleArc, { startDeg: 0, endDeg: 90 });
  assert.deepEqual(model.moon, { longitudeDeg: 110, latitudeDeg: 5, nodeDistanceDeg: 20, illumination: 0.4, phaseName: '上弦月', elongationDeg: 90, waxing: true, eclipseSeason: state.moon.eclipseSeasonHint });
  assert.equal(Object.isFrozen(model), true);
});
test('adapter accepts legacy root solarTerms fixtures but state sun terms win', () => {
  const legacy = Object.assign({}, state, { sun: Object.assign({}, state.sun, { solarTerms: undefined }), solarTerms: { current: { name: '清明' }, next: { name: '谷雨' } } });
  assert.equal(Geocentric.toVisualModel(legacy).solarTermName, '清明');
  const both = Object.assign({}, legacy, { sun: Object.assign({}, legacy.sun, { solarTerms: { current: { name: '春分' }, next: { name: '清明' } } }) });
  assert.equal(Geocentric.toVisualModel(both).solarTermName, '春分');
});
test('equator is the reverse x rotation perpendicular to the teaching earth axis', () => {
  const points = Geocentric.tiltedEquatorCoordinates(24, 4), epsilon = Geocentric.DISPLAY.obliquityDeg * Math.PI / 180, axis = { x: 0, y: Math.cos(epsilon), z: Math.sin(epsilon) };
  points.forEach((point) => assert.ok(Math.abs(point.x * axis.x + point.y * axis.y + point.z * axis.z) < 1e-10));
  assert.ok(points[1].y < 0);
});
test('longitude helper maps cardinal ecliptic positions and signed latitude', () => {
  const radius = 10;
  assert.deepEqual(Geocentric.lonLatToVector(0, 0, radius), { x: 10, y: 0, z: 0 });
  assert.ok(Math.abs(Geocentric.lonLatToVector(90, 0, radius).z - 10) < 1e-12);
  assert.ok(Math.abs(Geocentric.lonLatToVector(180, 0, radius).x + 10) < 1e-12);
  assert.ok(Math.abs(Geocentric.lonLatToVector(270, 0, radius).z + 10) < 1e-12);
  assert.ok(Geocentric.lonLatToVector(0, -30, radius).y < 0);
});
test('static teaching labels are anchored and equator uses a dashed line', () => {
  const THREE = createFakeThree(), labels = [], scene = Geocentric.create({ THREE, interactionElement: {}, labelLayer: labelLayer(labels), solarTermNames: names() });
  assert.equal(scene.scene.userData.equator.material.constructor, THREE.LineDashedMaterial);
  assert.equal(scene.scene.userData.equator.lineDistancesComputed, true);
  assert.ok(scene.scene.userData.equator.geometry.getAttribute('lineDistance'));
  const staticLabels = labels.filter((label) => /^节气\d+$/.test(label.textContent) || /°/.test(label.textContent));
  assert.equal(staticLabels.length, 24); assert.ok(staticLabels.every((label) => label.anchor instanceof THREE.Vector3));
  assert.ok(staticLabels.every((label) => label.style.position === 'absolute' && label.style.pointerEvents === 'none'));
  const firstTerm = labels.find((label) => label.textContent === '0° · 春分');
  assert.ok(Math.abs(firstTerm.anchor.x - (Geocentric.DISPLAY.sphereRadius + 1.7)) < 1e-12);
  scene.dispose();
});
test('solar and lunar updates respect thresholds, wrapping, and fixed spring zero', () => {
  const THREE = createFakeThree(), labels = [], scene = Geocentric.create({ THREE, interactionElement: {}, labelLayer: labelLayer(labels), solarTermNames: names() });
  scene.update(Object.assign({}, state, { sun: Object.assign({}, state.sun, { longitudeDeg: 359.99 }) }));
  const ray = scene.scene.userData.springRay, rotation = ray.rotation.y, solar = scene.scene.userData.solarArc.geometry.getAttribute('position'), latitude = scene.scene.userData.latitudeArc.geometry.getAttribute('position');
  const solarWrites = solar.needsUpdateCount, latitudeWrites = latitude.needsUpdateCount;
  scene.update(Object.assign({}, state, { sun: Object.assign({}, state.sun, { longitudeDeg: 0.01 }) }));
  assert.equal(solar.needsUpdateCount, solarWrites + 1);
  assert.ok(Math.abs(solar.array[solar.itemSize * 64 + 2]) < 0.01, 'crossing zero redraws a near-zero arc');
  const wrappedWrites = solar.needsUpdateCount;
  scene.update(Object.assign({}, state, { sun: Object.assign({}, state.sun, { longitudeDeg: 0.03 }) }));
  assert.equal(solar.needsUpdateCount, wrappedWrites);
  scene.update(Object.assign({}, state, { moon: Object.assign({}, state.moon, { latitudeDeg: 5.01 }) })); assert.equal(latitude.needsUpdateCount, latitudeWrites);
  scene.update(Object.assign({}, state, { moon: Object.assign({}, state.moon, { latitudeDeg: 5.05 }) })); assert.equal(latitude.needsUpdateCount, latitudeWrites + 1);
  assert.equal(ray.rotation.y, rotation); scene.dispose();
});
test('labels project reusable anchors, lambda changes with state, and phase direction is not illumination alone', () => {
  const THREE = createFakeThree(), labels = [], scene = Geocentric.create({ THREE, interactionElement: {}, labelLayer: labelLayer(labels), solarTermNames: names() });
  scene.update(state); scene.render({});
  const lambda = labels.find((label) => label.textContent.startsWith('λ☉'));
  assert.equal(lambda.textContent, 'λ☉ = 90.00°'); assert.ok(lambda.anchor instanceof THREE.Vector3); assert.equal(lambda.style.left.endsWith('px'), true); assert.equal(scene.scene.userData.labelProjection.projectCalls > 0, true);
  const beforeAnchorX = lambda.anchor.x, phaseScale = scene.scene.userData.phaseIndicator.scale.x;
  const changed = Object.assign({}, state, { sun: Object.assign({}, state.sun, { longitudeDeg: 120 }), moon: Object.assign({}, state.moon, { longitudeDeg: 140, phaseName: '下弦月', waxing: false }) });
  scene.update(changed);
  assert.equal(lambda.textContent, 'λ☉ = 120.00°'); assert.notEqual(lambda.anchor.x, beforeAnchorX); assert.equal(scene.scene.userData.phaseIndicator.scale.x, -phaseScale);
  assert.equal(labels.some((label) => label.textContent === '月相：下弦月 · 亏'), true); assert.equal(labels.some((label) => label.textContent === '月球黄纬：+5.00°'), true); assert.equal(labels.some((label) => label.textContent === '距交点：20.00°'), true);
  scene.dispose();
});
test('labels are positioned inside their own right or lower viewport, not the full layer NDC', () => {
  const desktop = positionedScene({ left: 300, top: 0, width: 300, height: 300 }, { left: 0, top: 0, width: 600, height: 300 });
  desktop.scene.scene.userData.labels.lambda.anchor.set(0, 0, 0); desktop.scene.updateLabelPositions();
  assert.equal(desktop.labels.find((label) => label.textContent.startsWith('λ☉')).style.left, '450.00px');
  desktop.scene.dispose();
  const tablet = positionedScene({ left: 0, top: 300, width: 600, height: 300 }, { left: 0, top: 0, width: 600, height: 600 });
  tablet.scene.scene.userData.labels.lambda.anchor.set(0, 0, 0); tablet.scene.updateLabelPositions();
  assert.equal(tablet.labels.find((label) => label.textContent.startsWith('λ☉')).style.top, '450.00px');
  tablet.scene.dispose();
});
test('production scene host invokes real geocentric renderer exactly once per visible frame', () => {
  const THREE = createFakeThree(), renders = [];
  THREE.WebGLRenderer = class { constructor({ canvas }) { this.canvas = canvas; } setScissorTest() {} setPixelRatio() {} setSize(width, height) { this.canvas.width = width; this.canvas.height = height; } setViewport() {} setScissor() {} render(scene, camera) { renders.push([scene, camera]); } dispose() {} };
  const interaction = element({ left: 300, top: 0, width: 300, height: 300 }), geo = Geocentric.create({ THREE, interactionElement: interaction, labelLayer: labelLayerWithRect([], { left: 0, top: 0, width: 600, height: 300 }), solarTermNames: names() });
  const canvas = element({ left: 0, top: 0, width: 600, height: 300 }), host = SceneHost.create({ canvas, containers: { heliocentric: element({ left: 0, top: 0, width: 300, height: 300 }), geocentric: Object.assign(element({ left: 300, top: 0, width: 300, height: 300 }), { querySelector: () => interaction }) }, THREE, scenes: { heliocentric: {}, geocentric: geo }, window: { devicePixelRatio: 1, addEventListener() {}, removeEventListener() {} } });
  host.renderFrame(state);
  assert.equal(renders.length, 1); assert.equal(renders[0][0], geo.scene); assert.equal(renders[0][1], geo.camera);
  host.dispose(); geo.dispose();
});
test('same state no-op and hot updates make no vectors or plain coordinate objects', () => {
  const THREE = createFakeThree(), labels = [], scene = Geocentric.create({ THREE, interactionElement: {}, labelLayer: labelLayer(labels), solarTermNames: names() });
  scene.update(state); const vectors = THREE.vectorCreations, coordinates = Geocentric.debugCoordinateAllocations();
  scene.update(state); scene.update(Object.assign({}, state, { sun: Object.assign({}, state.sun, { longitudeDeg: 91 }), moon: Object.assign({}, state.moon, { longitudeDeg: 111, latitudeDeg: 5.2 }) }));
  assert.equal(THREE.vectorCreations, vectors); assert.equal(Geocentric.debugCoordinateAllocations(), coordinates);
  scene.dispose(); scene.dispose(); assert.equal(THREE.controlsDisposed, 1); assert.ok(THREE.disposedGeometries > 0 && THREE.disposedMaterials > 0);
});
test('module public seam has no clock or calculation dependencies', () => {
  const source = require('node:fs').readFileSync(require.resolve('../js/geocentric-scene.js'), 'utf8'); assert.doesNotMatch(source, /\bDate\b|\bAstronomy\b|\bCalendar\b/);
});
test('resetView restores the geocentric teaching camera and its control target', () => {
  const THREE = createFakeThree(), scene = Geocentric.create({ THREE, interactionElement: {}, solarTermNames: names() });
  scene.camera.position.set(9, 8, 7);
  scene.controls.target = new THREE.Vector3(3, 2, 1);
  scene.resetView();
  assert.deepEqual({ x: scene.camera.position.x, y: scene.camera.position.y, z: scene.camera.position.z }, { x: 0, y: 31, z: 53 });
  assert.deepEqual({ x: scene.controls.target.x, y: scene.controls.target.y, z: scene.controls.target.z }, { x: 0, y: 0, z: 0 });
  scene.dispose();
});

function names() { return Array.from({ length: 24 }, (_, index) => '节气' + index); }
function labelLayer(items) { return { appendChild(label) { items.push(label); } }; }
function labelLayerWithRect(items, rect) { return { appendChild(label) { items.push(label); }, getBoundingClientRect: () => rect }; }
function element(rect) { return { width: rect.width, height: rect.height, style: {}, getBoundingClientRect: () => rect, addEventListener() {}, removeEventListener() {}, setAttribute() {}, querySelector: () => null }; }
function positionedScene(interactionRect, layerRect) { const labels = [], THREE = createFakeThree(), interaction = element(interactionRect); return { labels, scene: Geocentric.create({ THREE, interactionElement: interaction, labelLayer: labelLayerWithRect(labels, layerRect), solarTermNames: names() }) }; }
function createFakeThree() {
  const stats = { vectorCreations: 0, disposedGeometries: 0, disposedMaterials: 0, controlsDisposed: 0 };
  class Vector3 { constructor(x = 0, y = 0, z = 0) { stats.vectorCreations++; this.set(x, y, z); this.projectCalls = 0; } set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } copy(v) { return this.set(v.x, v.y, v.z); } project() { this.projectCalls++; return this; } }
  class Object3D { constructor() { this.children = []; this.position = new Vector3(); this.rotation = new Vector3(); this.scale = new Vector3(1, 1, 1); this.userData = {}; } add(...items) { this.children.push(...items); } }
  class Group extends Object3D {} class Scene extends Group {} class PerspectiveCamera extends Object3D { lookAt() {} }
  class BufferAttribute { constructor(array, itemSize) { this.array = array; this.itemSize = itemSize; this.needsUpdate = false; this.needsUpdateCount = 0; } setXYZ(index, x, y, z) { const base = index * this.itemSize; this.array[base] = x; this.array[base + 1] = y; this.array[base + 2] = z; } }
  class BufferGeometry { constructor() { this.attributes = {}; } setFromPoints(points) { this.attributes.position = new BufferAttribute(new Float32Array(points.length * 3), 3); points.forEach((p, i) => this.attributes.position.setXYZ(i, p.x, p.y, p.z)); return this; } setAttribute(name, attribute) { this.attributes[name] = attribute; return this; } getAttribute(name) { return this.attributes[name]; } dispose() { stats.disposedGeometries++; } }
  class Geometry { dispose() { stats.disposedGeometries++; } } class Material { constructor(options) { Object.assign(this, options); } dispose() { stats.disposedMaterials++; } }
  class Mesh extends Object3D { constructor(geometry, material) { super(); this.geometry = geometry; this.material = material; } } class Line extends Mesh { computeLineDistances() { this.lineDistancesComputed = true; this.geometry.setAttribute('lineDistance', new BufferAttribute(new Float32Array(2), 1)); } } class OrbitControls { constructor(camera, element) { this.camera = camera; this.domElement = element; } dispose() { stats.controlsDisposed++; } }
  return Object.assign(stats, { Vector3, Group, Scene, PerspectiveCamera, BufferAttribute, BufferGeometry, SphereGeometry: Geometry, RingGeometry: Geometry, MeshBasicMaterial: Material, LineBasicMaterial: Material, LineDashedMaterial: class LineDashedMaterial extends Material {}, Mesh, Line, OrbitControls });
}
