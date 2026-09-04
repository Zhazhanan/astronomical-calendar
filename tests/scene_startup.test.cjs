const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('offline app starts both real Three scenes and positions browser-style labels', () => {
  const project = path.join(__dirname, '..');
  const nodes = {};
  const document = { hidden: false, addEventListener() {}, removeEventListener() {}, getElementById: (id) => nodes[id] || null };
  function element(rect = { left: 0, top: 0, width: 1200, height: 400 }) {
    const dataset = {}, listeners = new Map(), children = [];
    return {
      style: {}, get dataset() { return dataset; }, children, textContent: '', tabIndex: -1,
      get offsetWidth() { return Math.min(190, Array.from(this.textContent).reduce((width, char) => width + (char.charCodeAt(0) > 255 ? 13 : 7), 8)); },
      get offsetHeight() { return 24; },
      width: rect.width, height: rect.height, clientWidth: rect.width, clientHeight: rect.height,
      getBoundingClientRect: () => rect, getContext: () => null,
      appendChild(child) { children.push(child); child.parentNode = this; },
      removeChild(child) { children.splice(children.indexOf(child), 1); child.parentNode = null; },
      setAttribute() {}, classList: { add() {}, remove() {} },
      addEventListener(name, fn) { listeners.set(name, fn); }, removeEventListener(name) { listeners.delete(name); },
      querySelector: () => null
    };
  }
  document.createElement = () => element();
  nodes.astronomyCanvas = element({ left: 40, top: 500, width: 1200, height: 400 });
  nodes.sceneGrid = element();
  nodes.astronomyCanvas.parentElement = nodes.sceneGrid;
  nodes.labelLayer = element({ left: 40, top: 500, width: 1200, height: 400 });
  nodes.appStatus = element();
  ['heliocentric', 'geocentric'].forEach((id, index) => {
    const rect = { left: 40 + index * 600, top: 500, width: 600, height: 400 };
    const interaction = element(rect), viewport = element(rect);
    const title = element({ left: rect.left + 14, top: rect.top + 14, width: 225, height: 90 });
    viewport.querySelector = (selector) => selector === '.scene-title' ? title : interaction;
    nodes[id + 'Viewport'] = viewport;
  });
  const window = {
    document, devicePixelRatio: 2, addEventListener() {}, removeEventListener() {},
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    requestAnimationFrame: () => 1, cancelAnimationFrame() {}
  };
  const context = vm.createContext({ document, window, console });
  const html = fs.readFileSync(path.join(project, 'tiangan_dizhi_offline.html'), 'utf8');
  for (const [, source] of html.matchAll(/<script\s+src="([^"]+)"/g)) {
    vm.runInContext(fs.readFileSync(path.join(project, source), 'utf8'), context, { filename: source });
  }
  const draws = [], fallbacks = [];
  context.THREE.WebGLRenderer = class {
    constructor({ canvas }) { this.canvas = canvas; }
    setScissorTest() {}
    setPixelRatio(value) { this.pixelRatio = value; }
    setSize(width, height) { this.canvas.width = Math.floor(width * this.pixelRatio); this.canvas.height = Math.floor(height * this.pixelRatio); }
    setViewport(...rect) { this.viewport = rect; }
    setScissor() {}
    render(scene, camera) {
      scene.updateMatrixWorld(); camera.updateMatrixWorld();
      const frustum = new context.THREE.Frustum().setFromMatrix(new context.THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
      let visibleMeshes = 0;
      scene.traverse((object) => { if (object.isMesh && object.visible && frustum.intersectsObject(object)) visibleMeshes++; });
      draws.push({ scene, camera, viewport: this.viewport, visibleMeshes });
    }
    dispose() {}
  };
  const app = context.AstroEducation.App.start({
    timeController: context.AstroEducation.TimeController.create({ instantUtc: Date.UTC(2026, 8, 2, 9, 7), timeZone: 'Asia/Shanghai', location: { name: '北京', latitudeDeg: 39.9042, longitudeDeg: 116.4074 } }),
    educationPanel: { update() {}, clearFallback() {}, setFallback: (_, code) => fallbacks.push(code), dispose() {} }
  });
  try {
    assert.equal(app.available, true, nodes.appStatus.textContent);
    assert.deepEqual(fallbacks, []);
    assert.equal(draws.length, 2, 'both views must reach the renderer on the first frame');
    assert.notEqual(draws[0].scene, draws[1].scene);
    assert.deepEqual(draws.map((draw) => draw.viewport), [[0, 0, 600, 400], [600, 0, 600, 400]]);
    assert.ok(draws.every((draw) => draw.visibleMeshes > 0), 'both cameras must see actual meshes');
    assert.ok(nodes.labelLayer.children.length > 24);
    assert.ok(nodes.labelLayer.children.every((label) => Number.isFinite(parseFloat(label.style.left)) && Number.isFinite(parseFloat(label.style.top))));
    assert.ok(nodes.labelLayer.children.filter((label) => label.style.visibility === 'visible').length > 10);
    const boxes = nodes.labelLayer.children.map((label, index) => ({ label: label.textContent, visible: label.style.visibility === 'visible', viewLeft: index < 6 ? 0 : 600, x: parseFloat(label.style.left), y: parseFloat(label.style.top), width: label.offsetWidth, height: label.offsetHeight })).filter((box) => box.visible);
    for (let i = 0; i < boxes.length; i++) {
      assert.ok(boxes[i].x >= boxes[i].viewLeft && boxes[i].y >= 0 && boxes[i].x + boxes[i].width <= boxes[i].viewLeft + 600 && boxes[i].y + boxes[i].height <= 400);
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j];
        assert.ok(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y, `${a.label} overlaps ${b.label}`);
      }
    }
  } finally {
    app.stop();
  }
  assert.equal(nodes.labelLayer.children.length, 0, 'startup labels are released with the app');
});

test('labels scroll with the scene grid instead of remaining fixed over the page', () => {
  const project = path.join(__dirname, '..');
  const html = fs.readFileSync(path.join(project, 'tiangan_dizhi_offline.html'), 'utf8');
  const css = fs.readFileSync(path.join(project, 'styles/astronomy-education.css'), 'utf8');
  const sceneMarkup = html.match(/<section id="sceneGrid"[\s\S]*?<\/section>/)[0];
  assert.match(sceneMarkup, /id="labelLayer"/);
  assert.match(css.match(/#labelLayer\s*\{([^}]+)\}/)[1], /position:\s*absolute/);
});
