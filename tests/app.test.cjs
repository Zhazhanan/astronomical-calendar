const test = require('node:test');
const assert = require('node:assert/strict');
const App = require('../js/app.js');

function element() { const events = {}; return { style: {}, dataset: {}, parentElement: {}, textContent: '', addEventListener(n, f) { (events[n] ||= []).push(f); }, removeEventListener() {}, emit(n) { (events[n] || []).forEach((f) => f()); }, querySelector() { return element(); } }; }
function setup() {
  const nodes = Object.fromEntries(['astronomyCanvas','heliocentricViewport','geocentricViewport','labelLayer','appStatus','resetBtn','snapBtn','localTime','utcTime','solarLon','solarAngleValue','currentJieqi','toNextJieqi','sunCoords'].map((id) => [id, element()]));
  nodes.astronomyCanvas.toDataURL = () => 'data:image/png;base64,x';
  const document = Object.assign(element(), { hidden: false, getElementById: (id) => nodes[id] || null, createElement: () => element() });
  let listener; let controllerState = { instantUtc: 0, timeZone: 'Asia/Shanghai', location: { name: '北京', latitudeDeg: 1, longitudeDeg: 2 }, playing: false, daysPerSecond: 1 };
  const controller = { getState: () => controllerState, subscribe: (fn) => { listener = fn; return () => { listener = null; }; }, play: () => { controllerState = { ...controllerState, playing: true }; listener(controllerState); }, pause: () => { controllerState = { ...controllerState, playing: false }; listener(controllerState); }, tick() {} };
  const updates = [[], []], renders = []; let creates = 0;
  const scenes = { heliocentric: { update: (s) => updates[0].push(s), controls: element() }, geocentric: { update: (s) => updates[1].push(s), controls: element() } };
  const host = { available: true, renderFrame: (s) => renders.push(s), dispose() {} };
  const education = { TimeController: { create: () => controller }, WorldState: { create: (s) => { creates++; return Object.freeze({ ...s, displayTime: {}, sun: { longitudeDeg: 1 }, solarTerms: {} }); } }, SceneHost: { layoutModeForWidth: () => 'desktop', create: () => host }, HeliocentricScene: {}, GeocentricScene: {} };
  const window = { innerWidth: 1200, matchMedia: () => ({ matches: false }), requestAnimationFrame: () => 1, cancelAnimationFrame() {} };
  return { nodes, document, controller, emit: () => listener({ ...controllerState, instantUtc: 1 }), education, window, scenes, host, updates, renders, get creates() { return creates; } };
}

test('one WorldState is shared by both scenes and the host per clock update', () => {
  const s = setup(); const handle = App.start({ AstroEducation: s.education, document: s.document, window: s.window, THREE: {}, timeController: s.controller, scenes: s.scenes, host: s.host });
  assert.equal(s.creates, 1); assert.strictEqual(s.updates[0][0], s.updates[1][0]); assert.strictEqual(s.updates[0][0], s.renders[0]);
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
  assert.equal(unavailable.available, false); assert.match(s.nodes.appStatus.textContent, /WebGL/);
});
