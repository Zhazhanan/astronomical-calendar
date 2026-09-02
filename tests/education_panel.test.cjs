const test = require('node:test');
const assert = require('node:assert/strict');
const Education = require('../js/education-panel.js');
const App = require('../js/app.js');
const WorldState = require('../js/world-state.js');

function node(value) {
  const listeners = {};
  const attributes = {}, children = [];
  const result = {
    value: value || '', checked: false, disabled: false, files: null, textContent: '', children, classList: { add() {}, remove() {} },
    addEventListener(name, fn) { (listeners[name] ||= []).push(fn); },
    removeEventListener(name, fn) { listeners[name] = (listeners[name] || []).filter((item) => item !== fn); },
    emit(name, event) { (listeners[name] || []).forEach((fn) => fn(event || { target: this, preventDefault() {} })); },
    setAttribute(key, item) { attributes[key] = String(item); }, getAttribute(key) { return attributes[key]; },
    appendChild(child) { children.push(child); child.parentNode = this; return child; },
    removeChild(child) { children.splice(children.indexOf(child), 1); child.parentNode = null; }
  };
  Object.defineProperty(result, 'firstChild', { get() { return children[0] || null; } });
  return result;
}

function renderDocument() {
  function element(name) {
    const listeners = {}, attributes = {};
    const value = {
      nodeName: name, children: [], style: {}, className: '', textContent: '', clientWidth: 300, scrollLeft: 0,
      setAttribute(key, item) { attributes[key] = String(item); }, getAttribute(key) { return attributes[key]; },
      appendChild(child) { this.children.push(child); child.parentNode = this; return child; },
      removeChild(child) { this.children.splice(this.children.indexOf(child), 1); child.parentNode = null; },
      addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
      emit(type, event) { (listeners[type] || []).forEach((fn) => fn(event || { preventDefault() {} })); }
    };
    Object.defineProperty(value, 'firstChild', { get() { return this.children[0] || null; } });
    Object.defineProperty(value, 'ownerDocument', { value: document });
    return value;
  }
  const document = { createElement: element, createElementNS: (_, name) => element(name) };
  return { document, container: element('div') };
}

function descendants(root) {
  return root.children.reduce((all, child) => all.concat(child, descendants(child)), []);
}

function setup() {
  const ids = ['dateTimeInput', 'previousDayButton', 'todayButton', 'nextDayButton', 'playPauseButton', 'speedSelect', 'timeZoneSelect', 'resolvedTimeZone', 'locationSelect', 'latitudeInput', 'longitudeInput', 'showOrbit', 'showLabels', 'showObserver', 'showDayNight', 'heliocentricSceneBtn', 'geocentricSceneBtn', 'appStatus', 'timelineScroll', 'timelineNotice', 'currentMomentCardBody', 'solarSeasonCardBody', 'calendarMoonCardBody', 'ganzhiCardBody', 'ganzhiCardValues', 'observerCardBody', 'whyCardBody', 'yearLookupInput', 'yearLookupResult', 'sixtyYearRingToggle', 'sixtyYearRing', 'advancedAstronomy', 'advancedMilkyWay', 'advancedMansions', 'advancedCatalogInput', 'advancedRaUnit', 'advancedCatalogStatus', 'advancedCatalogSummary'];
  const nodes = Object.fromEntries(ids.map((id) => [id, node()]));
  nodes.speedSelect.value = '7'; nodes.timeZoneSelect.value = 'Asia/Shanghai'; nodes.locationSelect.value = 'beijing';
  nodes.advancedRaUnit.value = 'degrees';
  const document = Object.assign(node(), { getElementById: (id) => nodes[id] || null, createElement: () => node(), createElementNS: () => node() });
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

test('Ganzhi card neutrally explains differing boundaries', () => {
  const card = Education.ganzhiCardView({
    springFestival: { name: '乙巳' },
    liChun: { name: '丙午' },
    differs: true
  });
  assert.match(card.explanation, /春节换年/);
  assert.match(card.explanation, /立春换年/);
  assert.doesNotMatch(card.explanation, /错误|唯一正确/);
});

test('why card chooses current evidence instead of static copy', () => {
  const card = Education.whyCardView({
    observer: { daylightTrend: 'increasing' },
    moon: { phaseName: '上弦附近', waxing: true },
    ganzhi: { differs: false },
    solarTerms: { millisecondsUntilNext: 20 * 86400000 }
  });
  assert.match(card.body, /昼渐长|月相/);
});

test('year lookup is anchored to 甲子 cycle', () => {
  assert.equal(Education.yearLookupView(1984).ganzhi, '甲子');
  assert.equal(Education.yearLookupView(2044).ganzhi, '甲子');
});

test('card refresh preserves year query controls and keeps the clock unchanged', () => {
  const s = setup(); s.Calendar.ganzhiForYear = (year) => ({ name: year === 1984 ? '甲子' : '乙丑', index: 0 });
  const panel = Education.create({ root: s.document, clock: s.clock, Calendar: s.Calendar, Observer: s.Observer });
  const state = { instantUtc: Date.UTC(2026, 0, 30), displayTime: { year: 2026, month: 1, day: 30, timeZone: 'Asia/Shanghai' }, solarTerms: {}, ganzhi: { springFestival: { name: '乙巳' }, liChun: { name: '乙巳' }, differs: false }, sun: {}, moon: {}, observer: {} };
  panel.update(s.clock.getState(), state); const input = s.nodes.yearLookupInput;
  input.value = '1984'; input.emit('change'); assert.match(s.nodes.yearLookupResult.textContent, /甲子/);
  panel.update(s.clock.getState(), state); assert.strictEqual(s.nodes.yearLookupInput, input);
  input.value = '1800'; input.emit('change'); assert.match(s.nodes.yearLookupResult.textContent, /1900/);
  assert.equal(s.calls.some((call) => call[0] === 'setInstant'), false);
  s.nodes.sixtyYearRingToggle.emit('click'); assert.equal(s.nodes.sixtyYearRing.children.length, 1);
  s.nodes.sixtyYearRingToggle.emit('click'); assert.equal(s.nodes.sixtyYearRing.children.length, 0);
  panel.dispose();
});

test('why card reads solar terms from a real WorldState-shaped sun object', () => {
  const state = WorldState.create({ instantUtc: Date.UTC(2026, 0, 30, 4), timeZone: 'Asia/Shanghai' });
  assert.ok(state.sun.solarTerms.millisecondsRemaining < 7 * 86400000);
  const card = Education.whyCardView(state);
  assert.match(card.body, new RegExp(state.sun.solarTerms.next.name)); assert.equal(card.body.split('。').filter(Boolean).length, 2);
});

test('Ganzhi card marks unsupported years neutrally', () => {
  const state = WorldState.create({ instantUtc: Date.UTC(1800, 0, 1), timeZone: 'Asia/Shanghai' });
  const card = Education.ganzhiCardView(Object.assign({}, state.ganzhi, { support: state.support }));
  assert.match(card.explanation, /不在 1900–2100 支持范围，未计算干支年/);
  assert.doesNotMatch(card.explanation, /相同/);
});

test('boundary changes cover term, lunar phase, spring festival, and Li Chun without duplicates', () => {
  const previous = { solarTerms: { current: { name: '惊蛰' } }, moon: { phaseName: '上弦月' }, lunar: { month: 12, day: 29 }, ganzhi: { liChun: { name: '甲辰' } } };
  const next = { solarTerms: { current: { name: '春分' } }, moon: { phaseName: '满月' }, lunar: { month: 1, day: 1 }, ganzhi: { liChun: { name: '乙巳' } } };
  assert.deepEqual(Education.boundaryChanges(previous, next), ['solar-term', 'full-moon', 'spring-festival', 'li-chun']);
});

test('timeline model aligns all rows and current pointer to one scale', () => {
  const annual = {
    startUtc: 0,
    endUtc: 1000,
    gregorian: [{ label: '1月', startRatio: 0, endRatio: 0.1 }],
    solarTerms: [{ name: '立春', startRatio: 0.2 }],
    lunarMonths: [{ label: '正月', startRatio: 0.15, endRatio: 0.24, isLeapMonth: false }]
  };
  const model = Education.timelineViewModel(annual, 250);
  assert.equal(model.pointerRatio, 0.25);
  assert.equal(model.rows[0].kind, 'gregorian');
  assert.equal(model.rows[1].kind, 'solar-terms');
  assert.equal(model.rows[2].kind, 'lunar');
});

test('leap lunar month has both text and pattern encoding', () => {
  const segment = Education.lunarSegmentView({ label: '闰六月', isLeapMonth: true });
  assert.equal(segment.ariaLabel, '农历闰六月');
  assert.equal(segment.pattern, 'diagonal');
});

test('timeline scrub commands use the shared clock and preserve local-year boundaries', () => {
  const calls = [];
  const scrub = Education.timelineScrubController({
    clock: { stepDays: (days) => calls.push(['stepDays', days]), setInstant: (instant) => calls.push(['setInstant', instant]) },
    annual: { startUtc: 100, endUtc: 900 }
  });
  scrub.keydown({ key: 'ArrowRight', preventDefault() {} });
  scrub.keydown({ key: 'PageUp', preventDefault() {} });
  scrub.keydown({ key: 'Home', preventDefault() {} });
  scrub.keydown({ key: 'End', preventDefault() {} });
  assert.deepEqual(calls, [['stepDays', 1], ['stepDays', 7], ['setInstant', 100], ['setInstant', 899]]);
});

test('timeline data is requested once per selected local year and timezone, not per tick', () => {
  const s = setup(), requested = [], annual = { startUtc: 0, endUtc: 1000, gregorian: [], solarTerms: [], lunarMonths: [] };
  const panel = Education.create({ root: s.document, clock: s.clock, Calendar: s.Calendar, Observer: s.Observer, getAnnualTimeline: (year, zone) => { requested.push([year, zone]); return annual; } });
  const state = { instantUtc: 100, displayTime: { year: 2026, month: 1, day: 1, timeZone: 'Asia/Shanghai' } };
  panel.update(s.clock.getState(), state); panel.update(s.clock.getState(), Object.assign({}, state, { instantUtc: 200 }));
  panel.update(s.clock.getState(), { instantUtc: 300, displayTime: { year: 2027, month: 1, day: 1, timeZone: 'Asia/Shanghai' } });
  assert.deepEqual(requested, [[2026, 'Asia/Shanghai'], [2027, 'Asia/Shanghai']]);
  panel.dispose();
});

test('rendered term controls remain focusable and share one hover/focus tooltip outside an image leaf', () => {
  const rendered = renderDocument();
  const model = Education.timelineViewModel({
    startUtc: 0, endUtc: 1000, gregorian: [],
    solarTerms: [{ name: '立春', instantUtc: 200, startRatio: 0.2 }],
    lunarMonths: []
  }, 250, { year: 2026, month: 1, day: 2 });
  const result = Education.renderTimeline(rendered.container, model, { document: rendered.document, timeZone: 'Asia/Shanghai', clock: {} });
  const all = descendants(rendered.container), svg = all.find((item) => item.nodeName === 'svg'), term = all.find((item) => item.textContent === '立春'), tooltip = all.find((item) => item.className === 'timeline-tooltip');
  assert.equal(svg.getAttribute('role'), 'group');
  assert.equal(term.getAttribute('role'), 'button');
  assert.equal(term.getAttribute('tabindex'), '0');
  assert.equal(tooltip.getAttribute('aria-live'), undefined);
  assert.equal(term.getAttribute('aria-describedby'), 'annualTimelineTooltip');
  assert.match(term.getAttribute('aria-label'), /立春/);
  term.emit('mouseenter'); const hover = tooltip.textContent;
  tooltip.textContent = ''; term.emit('focus'); assert.equal(tooltip.textContent, hover);
  term.emit('keydown', { key: 'Enter', preventDefault() {} }); assert.equal(tooltip.textContent, hover);
  assert.ok(result);
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
  let panelOptions;
  const education = { TimeController: { create: () => clock }, WorldState: { create: (input) => { creates += 1; return { ...input, displayTime: {}, sun: { longitudeDeg: 0 }, solarTerms: {} }; }, annualTimeline: (year, zone) => ({ year, zone }) }, EducationPanel: { create: (options) => { panelOptions = options; return panel; } }, SceneHost: { create: () => host }, HeliocentricScene: {}, GeocentricScene: {} };
  const window = { matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }), requestAnimationFrame: () => 1, cancelAnimationFrame() {} };
  const handle = App.start({ AstroEducation: education, document: s.document, window, THREE: {}, timeController: clock, scenes: { heliocentric: { controls: node(), update() {} }, geocentric: { controls: node(), update() {} } }, host });
  assert.equal(creates, 1); assert.strictEqual(updates[0][1], renders[0]); assert.deepEqual(panelOptions.getAnnualTimeline(2026, 'Asia/Shanghai'), { year: 2026, zone: 'Asia/Shanghai' });
  subscriber({ ...state, instantUtc: 1 });
  assert.equal(creates, 2); assert.strictEqual(updates[1][1], renders[1]); handle.stop();
});

test('advanced panel initializes once, toggles independent layers, and preserves offline fallback', () => {
  const s = setup(), calls = [];
  const panel = Education.create({ root: s.document, clock: s.clock, Calendar: s.Calendar, Observer: s.Observer, onAdvancedLayer: (kind, value) => { calls.push([kind, value]); return false; } });
  s.nodes.advancedAstronomy.open = true; s.nodes.advancedAstronomy.emit('toggle'); s.nodes.advancedAstronomy.emit('toggle');
  s.nodes.advancedMilkyWay.checked = true; s.nodes.advancedMilkyWay.emit('change');
  s.nodes.advancedMansions.checked = true; s.nodes.advancedMansions.emit('change');
  assert.deepEqual(calls, [['initialize', true], ['advancedMilkyWay', true], ['advancedMansions', true]]);
  assert.match(s.nodes.advancedCatalogStatus.textContent, /三维场景不可用/); panel.dispose();
});

test('catalog readers ignore stale callbacks and disposal callbacks', () => {
  const s = setup(), calls = [], readers = [];
  class Reader { constructor() { readers.push(this); this.result = ''; this.aborted = false; } readAsText() {} abort() { this.aborted = true; if (this.onabort) this.onabort(); } }
  const catalog = { validateFile() {}, parseCsv: (text) => ({ stars: [{ name: text, raDeg: 1, decDeg: 2 }], acceptedRows: 1, skippedRows: 0, fatalErrors: [] }) };
  const panel = Education.create({ root: s.document, clock: s.clock, Calendar: s.Calendar, Observer: s.Observer, StarCatalog: catalog, FileReader: Reader, onAdvancedLayer: (kind, value) => { calls.push([kind, value]); return true; } });
  s.nodes.advancedCatalogInput.files = [{ size: 1 }]; s.nodes.advancedCatalogInput.emit('change');
  s.nodes.advancedCatalogInput.files = [{ size: 1 }]; s.nodes.advancedCatalogInput.emit('change');
  assert.equal(readers.length, 2); assert.equal(readers[0].aborted, true);
  readers[0].result = 'old'; readers[0].onload(); assert.equal(calls.length, 0);
  readers[1].result = 'new'; readers[1].onload(); assert.equal(calls.length, 1); assert.equal(calls[0][1][0].name, 'new');
  s.nodes.advancedCatalogInput.files = [{ size: 1 }]; s.nodes.advancedCatalogInput.emit('change'); const late = readers[2]; panel.dispose(); late.result = 'late'; late.onload();
  assert.equal(calls.length, 1);
});
