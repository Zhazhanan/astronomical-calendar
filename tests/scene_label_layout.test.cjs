const test = require('node:test');
const assert = require('node:assert/strict');
const THREE = require('../three.min.js');
const Layout = require('../js/scene-label-layout.js');

function setup(width = 600, height = 400) {
  const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 200);
  camera.position.set(0, 0, 40);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const view = { left: 640, top: 500, width, height }, layer = { left: 40, top: 500, width: width * 2, height };
  const options = { interactionElement: { getBoundingClientRect: () => view }, labelLayer: { getBoundingClientRect: () => layer } };
  return { camera, view, layer, options, position: (records) => Layout.position(records, camera, new THREE.Vector3(), options) };
}
function label(width = 130, height = 24) {
  return { element: { style: {}, offsetWidth: width, offsetHeight: height }, anchor: new THREE.Vector3() };
}
function box(record) {
  const e = record.element;
  return { x: parseFloat(e.style.left), y: parseFloat(e.style.top), width: e.offsetWidth, height: e.offsetHeight };
}
function disjoint(a, b) { return a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y; }

test('coincident lunar annotations do not overlap each other or the viewport title', () => {
  const s = setup(), records = Array.from({ length: 4 }, () => label());
  const title = { left: 654, top: 514, width: 230, height: 90 };
  s.options.titleElement = { getBoundingClientRect: () => title };
  records.push({ ...label(), hudSlot: { x: 0.04, y: 0.06 } });
  const marker = { ...label(70), priority: 0, keepAnchor: true };
  records.push(marker);
  s.position(records);
  assert.ok(records.slice(0, 5).every((record) => record.element.style.visibility === 'visible'));
  assert.equal(marker.element.style.visibility, 'hidden', 'crowded minor ticks yield to teaching annotations');
  const boxes = records.filter((record) => record.element.style.visibility === 'visible').map(box);
  boxes.push({ x: title.left - s.layer.left, y: title.top - s.layer.top, width: title.width, height: title.height });
  boxes.forEach((a, i) => boxes.slice(i + 1).forEach((b) => assert.ok(disjoint(a, b))));
});

test('local lunar anchors follow the Earth group and the camera rotation', () => {
  const s = setup(), record = label(80, 20), parent = new THREE.Group();
  parent.position.set(8, 3, 0); parent.updateMatrixWorld();
  record.anchorParent = parent;
  function assertAnchored() {
    s.position([record]);
    const world = parent.localToWorld(record.anchor.clone()).project(s.camera);
    assert.equal(record.element.style.visibility, 'visible');
    assert.ok(Math.abs(box(record).x - (600 + (world.x + 1) * 300 - 40)) < 0.01);
    assert.ok(Math.abs(box(record).y - ((1 - world.y) * 200 - 10)) < 0.01);
    assert.deepEqual(record.anchor.toArray(), [0, 0, 0], 'projection must not mutate the local anchor');
  }
  assertAnchored();
  const before = box(record);
  s.camera.position.set(12, 15, 40); s.camera.lookAt(0, 0, 0); s.camera.updateMatrixWorld();
  assertAnchored();
  assert.notEqual(box(record).y, before.y);
});

test('scrolling up or down keeps label coordinates relative to the same scene', () => {
  const s = setup(), records = [label()];
  s.position(records);
  const before = box(records[0]);
  for (const top of [160, -120, 700]) {
    s.view.top = top; s.layer.top = top;
    s.position(records);
    assert.deepEqual(box(records[0]), before);
  }
});

test('mobile annotations stay within their viewport and behind-camera labels disappear', () => {
  const s = setup(320, 288), records = Array.from({ length: 4 }, () => label(165));
  const behind = label(), outside = label();
  behind.anchor.z = 60; outside.anchor.x = 1000;
  s.position([...records, behind, outside]);
  assert.equal(behind.element.style.visibility, 'hidden');
  assert.equal(outside.element.style.visibility, 'hidden');
  assert.ok(records.every((record) => record.element.style.visibility === 'visible'));
  const boxes = records.map(box);
  boxes.forEach((a, i) => {
    assert.ok(a.x >= 600 && a.x + a.width <= 920 && a.y >= 0 && a.y + a.height <= 288);
    boxes.slice(i + 1).forEach((b) => assert.ok(disjoint(a, b)));
  });
});
