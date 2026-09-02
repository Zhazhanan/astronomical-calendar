const test = require('node:test');
const assert = require('node:assert/strict');
const App = require('../js/app.js');

function element() { const events = {}; return { style: {}, dataset: {}, parentElement: {}, textContent: '', addEventListener(n, f) { (events[n] ||= []).push(f); }, removeEventListener() {}, emit(n) { (events[n] || []).forEach((f) => f()); }, querySelector() { return element(); } }; }
function setup() {
  const nodes = Object.fromEntries(['astronomyCanvas','heliocentricViewport','geocentricViewport','labelLayer','appStatus','resetBtn','snapBtn','heliocentricSceneBtn','geocentricSceneBtn','localTime','utcTime','solarLon','solarAngleValue','currentJieqi','toNextJieqi','sunCoords'].map((id) => [id, element()]));
  nodes.astronomyCanvas.toDataURL = () => 'data:image/png;base64,x';
  const document = Object.assign(element(), { hidden: false, getElementById: (id) => nodes[id] || null, createElement: () => element() });
  let listener; let controllerState = { instantUtc: 0, timeZone: 'Asia/Shanghai', location: { name: '北京', latitudeDeg: 1, longitudeDeg: 2 }, playing: false, daysPerSecond: 1 };
  const controller = { getState: () => controllerState, subscribe: (fn) => { listener = fn; return () => { listener = null; }; }, play: () => { controllerState = { ...controllerState, playing: true }; listener(controllerState); }, pause: () => { controllerState = { ...controllerState, playing: false }; listener(controllerState); }, tick() {} };
  const updates = [[], []], renders = []; let creates = 0;
  const scenes = { heliocentric: { update: (s) => updates[0].push(s), controls: element() }, geocentric: { update: (s) => updates[1].push(s), controls: element() } };
  const host = { available: true, renderFrame: (s) => { renders.push(s); scenes.heliocentric.update(s); scenes.geocentric.update(s); }, dispose() {}, setLayoutMode() {}, setSelectedScene() {} };
  const education = { TimeController: { create: () => controller }, WorldState: { create: (s) => { creates++; return Object.freeze({ ...s, displayTime: {}, sun: { longitudeDeg: 1 }, solarTerms: {} }); } }, SceneHost: { layoutModeForWidth: () => 'desktop', create: () => host }, HeliocentricScene: {}, GeocentricScene: {} };
  const media = new Map();
  const window = { innerWidth: 1200, matchMedia: (query) => { if (!media.has(query)) media.set(query, element()); return media.get(query); }, requestAnimationFrame: () => 1, cancelAnimationFrame() {} };
  return { nodes, document, controller, emit: () => listener({ ...controllerState, instantUtc: 1 }), education, window, media, scenes, host, updates, renders, get creates() { return creates; } };
}

test('one WorldState is shared by both scenes and the host per clock update', () => {
  const s = setup(); const handle = App.start({ AstroEducation: s.education, document: s.document, window: s.window, THREE: {}, timeController: s.controller, scenes: s.scenes, host: s.host });
  assert.equal(s.creates, 1); assert.strictEqual(s.updates[0][0], s.updates[1][0]); assert.strictEqual(s.updates[0][0], s.renders[0]); assert.equal(s.updates[0].length, 1);
  s.emit(); assert.equal(s.creates, 2); assert.strictEqual(s.updates[0][1], s.updates[1][1]); handle.stop();
});

test('hidden pause and visible restore never schedules background delta', () => {
  const s = setup(); const handle = App.start({ AstroEducation: s.education, document: s.document, window: s.window, THREE: {}, timeController: s.controller, scenes: s.scenes, host: s.host });
  s.controller.play(); s.document.hidden = true; s.document.emit('visibilitychange'); assert.equal(s.controller.getState().playing, false);
  s.document.hidden = false; s.document.emit('visibilitychange'); assert.equal(s.controller.getState().playing, true); handle.stop();
});

test('missing modules and unavailable WebGL leave an in-page status', () => {
  const s = setup(); const missing = App.start({ AstroEducation: {}, document: s.document, window: s.window }); assert.equal(missing.available, false); assert.match(s.nodes.appStatus.textContent, /缺少/);
  const unavailable = App.start({ AstroEducation: s.education, document: s.document, window: s.window, THREE: {}, timeController: s.controller, scenes: s.scenes, host: { available: false } });
  assert.equal(unavailable.available, false); assert.match(s.nodes.appStatus.textContent, /WEBGL_UNAVAILABLE/);
});

test('calendar HUD continues updating when WebGL is unavailable', () => {
  const s = setup();
  const unavailableHost = { available: false };
  App.start({ AstroEducation: s.education, document: s.document, window: s.window, THREE: {}, timeController: s.controller, scenes: s.scenes, host: unavailableHost });
  assert.equal(s.creates, 1);
  assert.match(s.nodes.localTime.textContent, /本地时间/);
  s.emit();
  assert.equal(s.creates, 2);
});

test('responsive layout uses media-query matches and mobile tabs select the visible scene', () => {
  const s = setup();
  const layouts = [], selections = [];
  s.host.setLayoutMode = (value) => layouts.push(value);
  s.host.setSelectedScene = (value) => selections.push(value);
  s.media.set('(max-width: 600px)', Object.assign(element(), { matches: true }));
  s.media.set('(max-width: 1024px)', Object.assign(element(), { matches: true }));
  App.start({ AstroEducation: s.education, document: s.document, window: s.window, THREE: {}, timeController: s.controller, scenes: s.scenes, host: s.host });
  s.media.get('(max-width: 600px)').emit('change');
  assert.deepEqual(layouts, ['mobile']);
  s.nodes.geocentricSceneBtn.emit('click');
  assert.deepEqual(selections, ['geocentric']);
});

test('reset button resets both scene cameras and reduced motion schedules only one redraw', () => {
  const s = setup();
  let heliocentricResets = 0, geocentricResets = 0, scheduled = 0;
  s.scenes.heliocentric.resetView = () => { heliocentricResets += 1; };
  s.scenes.geocentric.resetView = () => { geocentricResets += 1; };
  s.window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
  s.window.requestAnimationFrame = () => { scheduled += 1; return scheduled; };
  const handle = App.start({ AstroEducation: s.education, document: s.document, window: s.window, THREE: {}, timeController: s.controller, scenes: s.scenes, host: s.host });
  s.nodes.resetBtn.emit('click');
  assert.equal(heliocentricResets, 1);
  assert.equal(geocentricResets, 1);
  assert.equal(scheduled, 1);
  handle.stop();
});

test('WebGL loss pauses the page clock, reports its status, and restores only prior playback', () => {
  const s = setup();
  let options;
  s.education.SceneHost.create = (next) => { options = next; return s.host; };
  App.start({ AstroEducation: s.education, document: s.document, window: s.window, THREE: {}, timeController: s.controller, scenes: s.scenes });
  s.controller.play();
  options.onContextChange({ type: 'lost' });
  assert.equal(s.controller.getState().playing, false);
  assert.match(s.nodes.appStatus.textContent, /WEBGL_CONTEXT_LOST/);
  options.onContextChange({ type: 'restored' });
  assert.equal(s.controller.getState().playing, true);
  s.controller.pause();
  options.onContextChange({ type: 'lost' });
  options.onContextChange({ type: 'restored' });
  assert.equal(s.controller.getState().playing, false);
});

test('context restored while hidden waits for visibility before restoring prior playback', () => {
  const s = setup();
  let options;
  s.education.SceneHost.create = (next) => { options = next; return s.host; };
  App.start({ AstroEducation: s.education, document: s.document, window: s.window, THREE: {}, timeController: s.controller, scenes: s.scenes });
  s.controller.play();
  options.onContextChange({ type: 'lost' });
  s.document.hidden = true;
  s.document.emit('visibilitychange');
  options.onContextChange({ type: 'restored' });
  assert.equal(s.controller.getState().playing, false);
  s.document.hidden = false;
  s.document.emit('visibilitychange');
  assert.equal(s.controller.getState().playing, true);
});

test('advanced layers reach a real scene once and are reapplied after a rebuild', () => {
  const s = setup(), calls = []; let panelOptions, hostOptions;
  s.scenes.geocentric.initializeAdvancedLayers = () => calls.push(['initialize']);
  s.scenes.geocentric.setAdvancedLayer = (kind, value, worldState) => calls.push([kind, value, worldState]);
  s.education.EducationPanel = { create: (options) => { panelOptions = options; return { update() {}, dispose() {} }; } };
  s.education.SceneHost.create = (options) => { hostOptions = options; return s.host; };
  App.start({ AstroEducation: s.education, document: s.document, window: s.window, THREE: {}, timeController: s.controller, scenes: s.scenes });
  assert.equal(panelOptions.onAdvancedLayer('initialize', true), true);
  assert.equal(panelOptions.onAdvancedLayer('advancedMilkyWay', true), true);
  assert.equal(panelOptions.onAdvancedLayer('starCatalog', [{ name: 'A' }]), true);
  assert.equal(calls.filter((call) => call[0] === 'initialize').length, 1);
  assert.strictEqual(calls.find((call) => call[0] === 'advancedMilkyWay')[2], s.renders[0]);
  hostOptions.onScenesRebuilt();
  assert.equal(calls.filter((call) => call[0] === 'initialize').length, 2);
  assert.equal(calls.filter((call) => call[0] === 'advancedMilkyWay').length, 2);
  assert.equal(calls.filter((call) => call[0] === 'starCatalog').length, 2);
});

test('no WebGL keeps shared state updates and asks the panel for a 2D fallback', () => {
  const s = setup(), fallback = [], updates = [];
  s.education.EducationPanel = { create: () => ({ update: (_, state) => updates.push(state), setFallback: (state, code, retry) => fallback.push([state, code, retry]), dispose() {} }) };
  const handle = App.start({ AstroEducation: s.education, document: s.document, window: s.window, timeController: s.controller });
  assert.equal(handle.available, false);
  assert.equal(fallback[0][1], 'WEBGL_UNAVAILABLE');
  s.emit();
  assert.equal(updates.length, 2);
  assert.match(s.nodes.appStatus.textContent, /此设备无法显示 3D 场景/);
});

test('a 3D render failure falls back without pausing the shared clock', () => {
  const s = setup(), fallback = [];
  s.host.renderFrame = () => { throw new Error('render'); };
  const panel = { update() {}, setFallback: (_, code, retry) => fallback.push([code, retry]), dispose() {} };
  const handle = App.start({ AstroEducation: s.education, document: s.document, window: s.window, THREE: {}, timeController: s.controller, scenes: s.scenes, host: s.host, educationPanel: panel });
  assert.equal(handle.available, false);
  assert.deepEqual(fallback[0], ['THREE_RENDER_FAILED', true]);
  assert.equal(s.controller.getState().playing, false);
  assert.match(s.nodes.appStatus.textContent, /THREE_RENDER_FAILED/);
});

test('computation failure pauses playback and retains the last good learning state', () => {
  const s = setup(), states = [];
  let fail = false;
  s.education.WorldState.create = (input) => { if (fail) throw new Error('bad data'); return Object.freeze({ ...input, displayTime: {}, sun: { longitudeDeg: 1 }, solarTerms: {} }); };
  const panel = { update: (_, state) => states.push(state), dispose() {} };
  App.start({ AstroEducation: s.education, document: s.document, window: s.window, THREE: {}, timeController: s.controller, scenes: s.scenes, host: s.host, educationPanel: panel });
  s.controller.play(); const lastGood = states[states.length - 1]; fail = true; s.emit();
  assert.equal(s.controller.getState().playing, false);
  assert.strictEqual(states[states.length - 1], lastGood);
  assert.match(s.nodes.appStatus.textContent, /COMPUTATION_FAILED/);
});

test('retry recreates 3D without rebuilding the clock and preserves fallback on failure', () => {
  const s = setup(), fallback = [], clear = [];
  let attempts = 0;
  const panel = { update() {}, setFallback: (_, code) => fallback.push(code), clearFallback: () => clear.push('clear'), dispose() {} };
  s.education.SceneHost.create = () => (++attempts === 1 ? { available: false } : s.host);
  const handle = App.start({ AstroEducation: s.education, document: s.document, window: s.window, THREE: {}, timeController: s.controller, scenes: s.scenes, educationPanel: panel });
  assert.equal(handle.available, false);
  assert.equal(handle.retry3d(), true);
  assert.equal(attempts, 2);
  assert.equal(clear.length, 1);
  s.host.dispose();
  handle.stop();
});
