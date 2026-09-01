const test = require('node:test');
const assert = require('node:assert/strict');
const Education = require('../js/education-panel.js');
const App = require('../js/app.js');

function node(value) {
  const listeners = {};
  return {
    value: value || '', checked: false, disabled: false, textContent: '', classList: { add() {}, remove() {} },
    addEventListener(name, fn) { (listeners[name] ||= []).push(fn); },
    removeEventListener(name, fn) { listeners[name] = (listeners[name] || []).filter((item) => item !== fn); },
    emit(name, event) { (listeners[name] || []).forEach((fn) => fn(event || { target: this, preventDefault() {} })); }
  };
}

function setup() {
  const ids = ['dateTimeInput', 'previousDayButton', 'todayButton', 'nextDayButton', 'playPauseButton', 'speedSelect', 'timeZoneSelect', 'resolvedTimeZone', 'locationSelect', 'latitudeInput', 'longitudeInput', 'showOrbit', 'showLabels', 'showObserver', 'showDayNight', 'heliocentricSceneBtn', 'geocentricSceneBtn', 'appStatus'];
  const nodes = Object.fromEntries(ids.map((id) => [id, node()]));
  nodes.speedSelect.value = '7'; nodes.timeZoneSelect.value = 'Asia/Shanghai'; nodes.locationSelect.value = 'beijing';
  const document = Object.assign(node(), { getElementById: (id) => nodes[id] || null });
  let state = { instantUtc: 0, timeZone: 'Asia/Shanghai', location: { name: '北京', latitudeDeg: 39.9042, longitudeDeg: 116.4074 }, playing: false, daysPerSecond: 7 };
  const calls = [];
  const clock = {
    getState: () => state,
    setInstant: (value) => { calls.push(['setInstant', value]); state = { ...state, instantUtc: value }; },
    stepDays: (value) => { calls.push(['stepDays', value]); }, play: () => { calls.push(['play']); state = { ...state, playing: true }; }, pause: () => { calls.push(['pause']); state = { ...state, playing: false }; },
    setDaysPerSecond: (value) => { calls.push(['speed', value]); state = { ...state, daysPerSecond: value }; }, setTimeZone: (value) => { calls.push(['zone', value]); state = { ...state, timeZone: value }; }, setLocation: (value) => { calls.push(['location', value]); state = { ...state, location: value }; }
  };
  const Calendar = { zonedLocalDateTimeToUtc: () => ({ instantUtc: 123, warning: null, ambiguity: { kind: 'unique' } }) };
  const Observer = { PRESET_LOCATIONS: [{ name: '北京', latitudeDeg: 39.9042, longitudeDeg: 116.4074 }, { name: '上海', latitudeDeg: 31.2304, longitudeDeg: 121.4737 }, { name: '广州', latitudeDeg: 23.1291, longitudeDeg: 113.2644 }] };
  return { nodes, document, clock, Calendar, Observer, calls };
}

test('control model formats selected-zone time without changing UTC', () => {
  const model = Education.controlViewModel({
    clock: { instantUtc: Date.UTC(2026, 0, 1), playing: false, daysPerSecond: 7 },
    displayTime: { isoDate: '2026-01-01', hour: 8, minute: 0, timeZone: 'Asia/Shanghai' }
  });
  assert.equal(model.dateTimeValue, '2026-01-01T08:00');
  assert.equal(model.playLabel, '播放');
  assert.equal(model.speed, 7);
});

test('boundary changes cover term, lunar phase, spring festival, and Li Chun without duplicates', () => {
  const previous = { solarTerms: { current: { name: '惊蛰' } }, moon: { phaseName: '上弦月' }, lunar: { month: 12, day: 29 }, ganzhi: { liChun: { name: '甲辰' } } };
  const next = { solarTerms: { current: { name: '春分' } }, moon: { phaseName: '满月' }, lunar: { month: 1, day: 1 }, ganzhi: { liChun: { name: '乙巳' } } };
  assert.deepEqual(Education.boundaryChanges(previous, next), ['solar-term', 'full-moon', 'spring-festival', 'li-chun']);
});

test('bindings change only the requested clock field and reject invalid custom locations', () => {
  const s = setup();
  const panel = Education.create({ root: s.document, clock: s.clock, Calendar: s.Calendar, Observer: s.Observer, now: () => 999, onSelectedScene: (id) => s.calls.push(['scene', id]) });
  panel.update(s.clock.getState(), { displayTime: { year: 2026, month: 1, day: 2, hour: 3, minute: 4, timeZone: 'Asia/Shanghai' } });
  s.nodes.nextDayButton.emit('click'); s.nodes.timeZoneSelect.value = 'local'; s.nodes.timeZoneSelect.emit('change'); s.nodes.geocentricSceneBtn.emit('click');
  s.nodes.locationSelect.value = 'custom'; s.nodes.locationSelect.emit('change'); s.nodes.latitudeInput.value = '91'; s.nodes.longitudeInput.value = '1'; s.nodes.latitudeInput.emit('change');
  assert.deepEqual(s.calls.slice(0, 3), [['stepDays', 1], ['zone', Intl.DateTimeFormat().resolvedOptions().timeZone], ['scene', 'geocentric']]);
  assert.equal(s.calls.some((call) => call[0] === 'location'), false);
  assert.match(s.nodes.appStatus.textContent, /纬度/);
  panel.dispose();
});

test('ambiguous local times choose Calendar result and show a stable warning', () => {
  const s = setup(); s.Calendar.zonedLocalDateTimeToUtc = () => ({ instantUtc: 456, warning: { code: 'AMBIGUOUS_LOCAL_TIME', message: '已选较早时刻' }, ambiguity: { kind: 'ambiguous' } });
  const panel = Education.create({ root: s.document, clock: s.clock, Calendar: s.Calendar, Observer: s.Observer });
  s.nodes.dateTimeInput.value = '2026-11-01T01:30'; s.nodes.dateTimeInput.emit('change');
  assert.deepEqual(s.calls[0], ['setInstant', 456]);
  assert.match(s.nodes.appStatus.textContent, /已选较早时刻/);
  panel.dispose();
});

test('app supplies one shared WorldState to the panel and SceneHost without direct scene updates', () => {
  const s = setup();
  for (const id of ['astronomyCanvas', 'heliocentricViewport', 'geocentricViewport', 'labelLayer', 'localTime', 'utcTime', 'solarLon', 'solarAngleValue', 'currentJieqi', 'toNextJieqi', 'resetBtn', 'snapBtn']) s.nodes[id] = node();
  s.nodes.astronomyCanvas.parentElement = {}; s.nodes.heliocentricViewport.querySelector = () => node(); s.nodes.geocentricViewport.querySelector = () => node();
  let subscriber, creates = 0; const updates = [], renders = [];
  const state = s.clock.getState();
  const clock = Object.assign({}, s.clock, { getState: () => state, subscribe: (fn) => { subscriber = fn; return () => {}; } });
  const host = { available: true, renderFrame: (world) => renders.push(world), dispose() {}, setLayoutMode() {}, setSelectedScene() {} };
  const panel = { update: (clockState, world) => updates.push([clockState, world]), dispose() {} };
  const education = { TimeController: { create: () => clock }, WorldState: { create: (input) => { creates += 1; return { ...input, displayTime: {}, sun: { longitudeDeg: 0 }, solarTerms: {} }; } }, SceneHost: { create: () => host }, HeliocentricScene: {}, GeocentricScene: {} };
  const window = { matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }), requestAnimationFrame: () => 1, cancelAnimationFrame() {} };
  const handle = App.start({ AstroEducation: education, document: s.document, window, THREE: {}, timeController: clock, scenes: { heliocentric: { controls: node(), update() {} }, geocentric: { controls: node(), update() {} } }, host, educationPanel: panel });
  assert.equal(creates, 1); assert.strictEqual(updates[0][1], renders[0]);
  subscriber({ ...state, instantUtc: 1 });
  assert.equal(creates, 2); assert.strictEqual(updates[1][1], renders[1]); handle.stop();
});
