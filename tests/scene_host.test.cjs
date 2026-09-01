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

function fakeElement(rect) {
  const listeners = new Map();
  return {
    width: rect.width,
    height: rect.height,
    getBoundingClientRect: () => rect,
    addEventListener: (name, callback) => listeners.set(name, callback),
    removeEventListener: (name) => listeners.delete(name),
    style: {}
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
