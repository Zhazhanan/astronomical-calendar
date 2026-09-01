const test = require('node:test');
const assert = require('node:assert/strict');
const SceneHost = require('../js/scene-host.js');

test('desktop divides one canvas into two equal scissor viewports', () => {
  assert.deepEqual(SceneHost.computeViewports(1200, 600, 'desktop', 'heliocentric'), [
    { id: 'heliocentric', x: 0, y: 0, width: 600, height: 600, visible: true },
    { id: 'geocentric', x: 600, y: 0, width: 600, height: 600, visible: true }
  ]);
});

test('tablet stacks scenes and mobile exposes only the selected scene', () => {
  assert.deepEqual(SceneHost.computeViewports(800, 1000, 'tablet', 'heliocentric'), [
    { id: 'heliocentric', x: 0, y: 0, width: 800, height: 500, visible: true },
    { id: 'geocentric', x: 0, y: 500, width: 800, height: 500, visible: true }
  ]);
  const mobile = SceneHost.computeViewports(390, 480, 'mobile', 'geocentric');
  assert.equal(mobile.filter((viewport) => viewport.visible).length, 1);
  assert.equal(mobile.find((viewport) => viewport.visible).id, 'geocentric');
});

test('layout breakpoints share one desktop, tablet, and mobile boundary contract', () => {
  assert.equal(SceneHost.layoutModeForWidth(1025), 'desktop');
  assert.equal(SceneHost.layoutModeForWidth(1024), 'tablet');
  assert.equal(SceneHost.layoutModeForWidth(601), 'tablet');
  assert.equal(SceneHost.layoutModeForWidth(600), 'mobile');
});

test('pixel ratio is capped for performance and invalid inputs have a safe fallback', () => {
  assert.equal(SceneHost.cappedPixelRatio(3, false), 1.75);
  assert.equal(SceneHost.cappedPixelRatio(3, true), 1.25);
  assert.equal(SceneHost.cappedPixelRatio(0, false), 1);
  assert.equal(SceneHost.cappedPixelRatio(Number.NaN, true), 1);
});

test('render frame updates each visible scene exactly once', () => {
  const calls = [];
  const host = SceneHost.createForTest({
    viewports: SceneHost.computeViewports(1000, 500, 'desktop', 'heliocentric'),
    scenes: {
      heliocentric: { render: () => calls.push('heliocentric') },
      geocentric: { render: () => calls.push('geocentric') }
    }
  });
  host.renderFrame(Object.freeze({ instantUtc: 0 }));
  assert.deepEqual(calls, ['heliocentric', 'geocentric']);
});

test('mobile does not render its hidden scene', () => {
  const calls = [];
  const host = SceneHost.createForTest({
    viewports: SceneHost.computeViewports(390, 480, 'mobile', 'geocentric'),
    scenes: {
      heliocentric: { render: () => calls.push('heliocentric') },
      geocentric: { render: () => calls.push('geocentric') }
    }
  });
  host.renderFrame(Object.freeze({ instantUtc: 0 }));
  assert.deepEqual(calls, ['geocentric']);
});

test('container rectangles become bottom-left WebGL scissors relative to the canvas', () => {
  assert.deepEqual(
    SceneHost.containerRectToScissor(
      { left: 120, top: 70, width: 200, height: 100 },
      { left: 20, top: 20, width: 600, height: 300 },
      { width: 1200, height: 600 }
    ),
    { x: 200, y: 300, width: 400, height: 200 }
  );
});

test('container rectangle clipping keeps partial intersections and empties fully outside views', () => {
  const canvasRect = { left: 100, top: 100, width: 200, height: 100 };
  const drawingBuffer = { width: 400, height: 200 };
  assert.deepEqual(
    SceneHost.containerRectToScissor({ left: 50, top: 150, width: 100, height: 100 }, canvasRect, drawingBuffer),
    { x: 0, y: 0, width: 100, height: 100 }
  );
  assert.deepEqual(
    SceneHost.containerRectToScissor({ left: 500, top: 500, width: 10, height: 10 }, canvasRect, drawingBuffer),
    { x: 400, y: 0, width: 0, height: 0 }
  );
});

test('create reports unavailable WebGL without throwing', () => {
  const unavailable = SceneHost.create({ canvas: {}, containers: {}, THREE: {} });
  assert.deepEqual(unavailable, { available: false, reason: 'WEBGL_UNAVAILABLE' });
});

test('dispose is idempotent and removes its basic window listeners', () => {
  const listeners = new Map();
  const windowFake = {
    devicePixelRatio: 1,
    addEventListener: (name, callback) => listeners.set(name, callback),
    removeEventListener: (name) => listeners.delete(name),
    requestAnimationFrame: () => 1,
    cancelAnimationFrame: () => {}
  };
  const canvas = fakeElement({ left: 0, top: 0, width: 600, height: 300 });
  const containers = {
    heliocentric: fakeElement({ left: 0, top: 0, width: 300, height: 300 }),
    geocentric: fakeElement({ left: 300, top: 0, width: 300, height: 300 })
  };
  const host = SceneHost.create({
    canvas,
    containers,
    THREE: fakeThree(),
    scenes: { heliocentric: {}, geocentric: {} },
    window: windowFake
  });
  assert.equal(host.available, true);
  assert.ok(listeners.has('resize'));
  host.dispose();
  host.dispose();
  assert.equal(listeners.size, 0);
});

test('production host uses one renderer, independent interaction targets, measured scissors, and cleaned listeners', () => {
  const environment = productionFakes();
  const controlsTargets = [];
  const sceneCalls = [];
  const host = SceneHost.create({
    canvas: environment.canvas,
    containers: environment.containers,
    sceneGrid: environment.sceneGrid,
    THREE: environment.THREE,
    scenes: sceneEntries(controlsTargets, sceneCalls, environment.cameras),
    window: environment.window,
    ResizeObserver: environment.ResizeObserver
  });
  host.renderFrame(Object.freeze({ instantUtc: 0 }));
  assert.equal(host.available, true);
  assert.equal(environment.renderers.length, 1);
  assert.deepEqual(controlsTargets, [environment.interactions.heliocentric, environment.interactions.geocentric]);
  assert.equal(environment.renderer.pixelRatio, 1.75);
  assert.deepEqual(environment.renderer.viewports, [[0, 0, 300, 300], [300, 0, 300, 300]]);
  assert.deepEqual(environment.renderer.scissors, [[0, 0, 300, 300], [300, 0, 300, 300]]);
  assert.deepEqual(sceneCalls, ['heliocentric', 'geocentric']);
  assert.equal(environment.cameras.heliocentric.aspect, 1);
  assert.equal(environment.cameras.geocentric.aspect, 1);
  assert.ok(environment.window.listeners.has('resize'));
  assert.equal(environment.observer.observed.length, 3);
  host.dispose();
  assert.equal(environment.window.listeners.size, 0);
  assert.equal(environment.canvas.listeners.size, 0);
  assert.equal(environment.observer.disconnected, true);
});

test('layout mode updates the real grid and mobile hides the non-selected interaction layer', () => {
  const environment = productionFakes();
  const host = SceneHost.create({
    canvas: environment.canvas,
    containers: environment.containers,
    sceneGrid: environment.sceneGrid,
    THREE: environment.THREE,
    scenes: sceneEntries([], [], environment.cameras),
    window: environment.window
  });
  host.setLayoutMode('tablet');
  assert.equal(environment.sceneGrid.dataset.layout, 'tablet');
  assert.equal(environment.sceneGrid.classList.contains('scene-layout-tablet'), true);
  host.setLayoutMode('mobile');
  host.setSelectedScene('geocentric');
  assert.equal(environment.sceneGrid.dataset.layout, 'mobile');
  assert.equal(environment.containers.heliocentric.style.display, 'none');
  assert.equal(environment.interactions.heliocentric.style.pointerEvents, 'none');
  assert.equal(environment.containers.geocentric.style.display, '');
  host.dispose();
});

test('resume is idempotent and context restoration resumes only a host that was running', () => {
  const environment = productionFakes();
  let rebuilds = 0;
  const host = SceneHost.create({
    canvas: environment.canvas,
    containers: environment.containers,
    THREE: environment.THREE,
    scenes: {
      heliocentric: { rebuild: () => { rebuilds += 1; } },
      geocentric: { rebuild: () => { rebuilds += 1; } }
    },
    window: environment.window
  });
  host.resume();
  host.resume();
  assert.equal(environment.window.pendingFrames.size, 1);
  let prevented = false;
  environment.canvas.listeners.get('webglcontextlost')({ preventDefault: () => { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(environment.window.pendingFrames.size, 0);
  environment.canvas.listeners.get('webglcontextrestored')();
  environment.canvas.listeners.get('webglcontextrestored')();
  assert.equal(rebuilds, 2);
  assert.equal(environment.window.pendingFrames.size, 1);
  host.pause();
  environment.canvas.listeners.get('webglcontextlost')({ preventDefault() {} });
  environment.canvas.listeners.get('webglcontextrestored')();
  assert.equal(environment.window.pendingFrames.size, 0);
  host.dispose();
});

function fakeElement(rect, interaction) {
  const listeners = new Map();
  const classes = new Set();
  return {
    width: rect.width,
    height: rect.height,
    getBoundingClientRect: () => rect,
    querySelector: (selector) => selector === '.scene-interaction' ? interaction : null,
    addEventListener: (name, callback) => listeners.set(name, callback),
    removeEventListener: (name) => listeners.delete(name),
    style: {},
    dataset: {},
    classList: {
      add: (...names) => names.forEach((name) => classes.add(name)),
      remove: (...names) => names.forEach((name) => classes.delete(name)),
      contains: (name) => classes.has(name)
    },
    listeners
  };
}

function fakeThree() {
  return {
    WebGLRenderer: class {
      constructor({ canvas }) { this.domElement = canvas; }
      setScissorTest() {}
      setPixelRatio() {}
      setSize(width, height) { this.domElement.width = width; this.domElement.height = height; }
      setViewport() {}
      setScissor() {}
      render() {}
      dispose() {}
    }
  };
}

function productionFakes() {
  const windowFake = {
    devicePixelRatio: 3,
    listeners: new Map(),
    pendingFrames: new Map(),
    nextFrame: 1,
    addEventListener(name, callback) { this.listeners.set(name, callback); },
    removeEventListener(name) { this.listeners.delete(name); },
    requestAnimationFrame(callback) { const id = this.nextFrame++; this.pendingFrames.set(id, callback); return id; },
    cancelAnimationFrame(id) { this.pendingFrames.delete(id); }
  };
  const canvas = fakeElement({ left: 0, top: 0, width: 600, height: 300 });
  const interactions = {
    heliocentric: fakeElement({ left: 0, top: 0, width: 300, height: 300 }),
    geocentric: fakeElement({ left: 300, top: 0, width: 300, height: 300 })
  };
  const containers = {
    heliocentric: fakeElement({ left: 0, top: 0, width: 300, height: 300 }, interactions.heliocentric),
    geocentric: fakeElement({ left: 300, top: 0, width: 300, height: 300 }, interactions.geocentric)
  };
  const sceneGrid = fakeElement({ left: 0, top: 0, width: 600, height: 300 });
  const renderers = [];
  const THREE = {
    WebGLRenderer: class {
      constructor({ canvas: target }) { this.domElement = target; this.viewports = []; this.scissors = []; renderers.push(this); }
      setScissorTest() {}
      setPixelRatio(value) { this.pixelRatio = value; }
      setSize(width, height) { this.domElement.width = width; this.domElement.height = height; }
      setViewport(...values) { this.viewports.push(values); }
      setScissor(...values) { this.scissors.push(values); }
      render() {}
      dispose() { this.disposed = true; }
    }
  };
  const observer = { observed: [], disconnected: false };
  class ResizeObserver {
    constructor(callback) { observer.callback = callback; }
    observe(target) { observer.observed.push(target); }
    disconnect() { observer.disconnected = true; }
  }
  const cameras = { heliocentric: {}, geocentric: {} };
  return { window: windowFake, canvas, containers, interactions, sceneGrid, THREE, renderers, get renderer() { return renderers[0]; }, ResizeObserver, observer, cameras };
}

function sceneEntries(controlsTargets, sceneCalls, cameras) {
  return {
    heliocentric: {
      camera: Object.assign(cameras ? cameras.heliocentric : {}, { updateProjectionMatrix() {} }),
      createControls: (element) => { controlsTargets.push(element); return { update() {}, dispose() {} }; },
      render: () => sceneCalls.push('heliocentric')
    },
    geocentric: {
      camera: Object.assign(cameras ? cameras.geocentric : {}, { updateProjectionMatrix() {} }),
      createControls: (element) => { controlsTargets.push(element); return { update() {}, dispose() {} }; },
      render: () => sceneCalls.push('geocentric')
    }
  };
}
