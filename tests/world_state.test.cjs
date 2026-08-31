const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Astronomy = require('../js/astronomy-core.js');
const Calendar = require('../js/calendar-core.js');
const Observer = require('../js/observer-core.js');
const lunarApi = require('../vendor/lunar/lunar.js');
const WorldState = require('../js/world-state.js');

test('one instant produces synchronized Sun, Earth, and Moon state', () => {
  const instantUtc = Date.UTC(2026, 2, 20, 14);
  const state = WorldState.create({ instantUtc });
  assert.equal(state.instantUtc, instantUtc);
  assert.equal(state.sun.longitudeDeg, Astronomy.solarGeocentricState(instantUtc).longitudeDeg);
  assert.ok(Number.isFinite(state.earth.positionAu.x));
  assert.ok(Number.isFinite(state.moon.positionKm.z));
  assert.equal(Object.isFrozen(state), true);
  assert.equal(Object.isFrozen(state.sun), true);
  assert.equal(Object.isFrozen(state.moon.positionKm), true);
  assert.equal(state.moon.eclipseSeasonHint.possible, false);
  assert.equal(Object.isFrozen(state.moon.eclipseSeasonHint), true);
});

test('invalid input returns a stable error rather than partial state', () => {
  assert.throws(
    () => WorldState.create({ instantUtc: Number.NaN }),
    /finite UTC millisecond/
  );
});

test('WorldState.create rejects every invalid public instant with its stable TypeError contract', () => {
  const invalidInstants = [Number.NaN, Infinity, -Infinity, '2026-01-01', undefined];

  for (const invalidInstant of invalidInstants) {
    assert.throws(
      () => WorldState.create({ instantUtc: invalidInstant }),
      (error) => error instanceof TypeError &&
        error.message === 'instantUtc must be a finite UTC millisecond value'
    );
  }
  assert.throws(
    () => WorldState.create(),
    (error) => error instanceof TypeError &&
      error.message === 'instantUtc must be a finite UTC millisecond value'
  );
});

test('full world state contains one synchronized calendar and observer result', () => {
  const instantUtc = Date.UTC(2026, 1, 17, 4);
  const state = WorldState.create({
    instantUtc,
    timeZone: 'Asia/Shanghai',
    location: { name: '北京', latitudeDeg: 39.9042, longitudeDeg: 116.4074 },
    dependencies: { Astronomy, Calendar, Observer, lunarApi }
  });
  assert.equal(state.displayTime.timeZone, 'Asia/Shanghai');
  assert.equal(state.lunar.day, 1);
  assert.equal(state.ganzhi.springFestival.name, '丙午');
  assert.ok(Number.isFinite(state.observer.altitudeDeg));
  assert.equal(Object.isFrozen(state.ganzhi), true);
  assert.equal(state.location.name, '北京');
  assert.equal(state.timeZone, 'Asia/Shanghai');
});

test('timezone changes local calendar fields while location remains independent', () => {
  const instantUtc = Date.UTC(2026, 0, 1, 0, 30);
  const beijing = { name: '北京', latitudeDeg: 39.9042, longitudeDeg: 116.4074 };
  const shanghaiTime = WorldState.create({ instantUtc, timeZone: 'Asia/Shanghai', location: beijing });
  const losAngelesTime = WorldState.create({ instantUtc, timeZone: 'America/Los_Angeles', location: beijing });
  const newYork = WorldState.create({
    instantUtc,
    timeZone: 'Asia/Shanghai',
    location: { name: '纽约', latitudeDeg: 40.7128, longitudeDeg: -74.006 }
  });
  assert.equal(shanghaiTime.instantUtc, losAngelesTime.instantUtc);
  assert.notEqual(shanghaiTime.displayTime.isoDate, losAngelesTime.displayTime.isoDate);
  assert.deepEqual(shanghaiTime.location, losAngelesTime.location);
  assert.equal(newYork.timeZone, shanghaiTime.timeZone);
  assert.notEqual(newYork.location.longitudeDeg, shanghaiTime.location.longitudeDeg);
});

test('invalid timezone and location are reported as structured support warnings', () => {
  const state = WorldState.create({
    instantUtc: Date.UTC(2026, 0, 1),
    timeZone: 'Mars/Olympus',
    location: { name: '无效地点', latitudeDeg: 91, longitudeDeg: 0 }
  });
  assert.equal(state.timeZone, 'Asia/Shanghai');
  assert.equal(state.location.name, '北京');
  assert.equal(state.support.timeZone.code, 'INVALID_TIME_ZONE');
  assert.equal(state.support.location.code, 'INVALID_LOCATION');
  assert.equal(Object.isFrozen(state.support), true);
});

test('annual timeline caches by dependency identity and returns isolated frozen clones', () => {
  let calls = 0;
  const fakeAstronomy = {
    earthHeliocentricState() {}, solarGeocentricState() {}, moonGeocentricState() {}, eclipseSeasonHint() {}
  };
  const fakeLunarApi = { Solar: { fromYmd() {} } };
  const fakeCalendar = {
    resolveTimeZone(timeZone) { return { timeZone: timeZone || 'Asia/Shanghai', warning: null }; },
    calendarState() {},
    annualTimeline(year, timeZone) {
      calls += 1;
      return { year, timeZone, gregorian: [{ month: 1 }] };
    }
  };
  const fakeObserver = { observerState() {} };
  const dependencies = { Astronomy: fakeAstronomy, Calendar: fakeCalendar, Observer: fakeObserver, lunarApi: fakeLunarApi };
  const first = WorldState.annualTimeline(2026, 'Asia/Shanghai', dependencies);
  const second = WorldState.annualTimeline(2026, 'Asia/Shanghai', dependencies);
  const alternateLunar = { Solar: { fromYmd() {} } };
  WorldState.annualTimeline(2026, 'Asia/Shanghai', Object.assign({}, dependencies, { lunarApi: alternateLunar }));
  assert.equal(calls, 2);
  assert.notEqual(first, second);
  assert.notEqual(first.gregorian, second.gregorian);
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.gregorian));
  first.gregorian[0].month = 2;
  assert.equal(first.gregorian[0].month, 1);
  assert.equal(second.gregorian[0].month, 1);
});

test('browser-style UMD dependencies compose the same state without CommonJS', () => {
  const source = fs.readFileSync(path.join(__dirname, '../js/world-state.js'), 'utf8');
  const context = {
    AstroEducation: { Astronomy, Calendar, Observer },
    Solar: lunarApi.Solar,
    LunarYear: lunarApi.LunarYear
  };
  context.globalThis = context;
  vm.runInNewContext(source, context);
  const state = context.AstroEducation.WorldState.create({ instantUtc: Date.UTC(2026, 1, 17, 4) });
  assert.equal(state.lunar.day, 1);
  assert.equal(state.location.name, '北京');
});

test('actual offline browser script sequence defines a runnable WorldState without preloaded globals', () => {
  const context = { Intl, Date, Math, Object, Array, Map, WeakMap, Set, Number, String, Boolean, Error, TypeError };
  context.globalThis = context;
  for (const relativePath of [
    '../vendor/lunar/lunar.js',
    '../js/astronomy-core.js',
    '../js/calendar-core.js',
    '../js/observer-core.js',
    '../js/world-state.js',
    '../js/time-controller.js'
  ]) {
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, relativePath), 'utf8'), context, { filename: relativePath });
  }
  const state = context.AstroEducation.WorldState.create({ instantUtc: Date.UTC(2026, 1, 17, 4) });
  assert.equal(state.lunar.day, 1);
  assert.equal(state.displayTime.timeZone, 'Asia/Shanghai');
  assert.equal(typeof context.AstroEducation.TimeController.create, 'function');
});

test('offline page loads world-state dependencies in the required order', () => {
  const page = fs.readFileSync(path.join(__dirname, '../tiangan_dizhi_offline.html'), 'utf8');
  const scripts = [
    'vendor/lunar/lunar.js',
    'js/astronomy-core.js',
    'js/calendar-core.js',
    'js/observer-core.js',
    'js/world-state.js',
    'js/time-controller.js'
  ];
  let previous = -1;
  for (const script of scripts) {
    const position = page.indexOf(`src="${script}"`);
    assert.ok(position > previous, `${script} must follow its dependency`);
    previous = position;
  }
  assert.match(page, /TimeController\.create\(\{/);
  assert.match(page, /timeController\.subscribe/);
  assert.match(page, /if\s*\(timeController\.getState\(\)\.playing\)\s*\{\s*timeController\.tick\(dt\);\s*\}/);
  assert.doesNotMatch(page, /setInterval\(updateHUD/);
  assert.doesNotMatch(page, /solarTermSectorAtLongitude/);
  assert.doesNotMatch(page, /365\.2422/);
});

test('WorldState snapshots dependency results without freezing or retaining their objects', () => {
  const sharedEarth = { positionAu: { x: 1, y: 2, z: 3 } };
  const sharedSun = { longitudeDeg: 1, rightAscensionDeg: 2, declinationDeg: 3 };
  const sharedMoon = { vectorKm: { x: 4, y: 5, z: 6 }, elongationDeg: 7, nodeDistanceDeg: 8 };
  const sharedCalendar = {
    displayTime: { timeZone: 'Asia/Shanghai' }, gregorian: {}, lunar: {}, solarTerms: {}, ganzhi: {}, support: {}
  };
  const dependencies = {
    Astronomy: {
      earthHeliocentricState: () => sharedEarth,
      solarGeocentricState: () => sharedSun,
      moonGeocentricState: () => sharedMoon,
      eclipseSeasonHint: () => ({ possible: false })
    },
    Calendar: {
      resolveTimeZone: (timeZone) => ({ timeZone, warning: null }),
      calendarState: () => sharedCalendar,
      annualTimeline: () => ({})
    },
    Observer: { observerState: () => ({ location: { name: '测试', latitudeDeg: 1, longitudeDeg: 2 }, warning: null }) },
    lunarApi: { Solar: { fromYmd() {} } }
  };
  const state = WorldState.create({ instantUtc: 1, timeZone: 'Asia/Shanghai', dependencies });
  assert.notEqual(state.earth, sharedEarth);
  assert.notEqual(state.sun, sharedSun);
  assert.notEqual(state.moon.positionKm, sharedMoon.vectorKm);
  assert.notEqual(state.gregorian, sharedCalendar.gregorian);
  assert.equal(Object.isFrozen(sharedEarth), false);
  sharedEarth.positionAu.x = 99;
  assert.equal(state.earth.positionAu.x, 1);
});

test('WorldState annual timeline cache includes Calendar implementation identity', () => {
  let firstCalls = 0;
  let secondCalls = 0;
  const AstronomyDependency = { earthHeliocentricState() {}, solarGeocentricState() {}, moonGeocentricState() {}, eclipseSeasonHint() {} };
  const lunarDependency = { Solar: { fromYmd() {} } };
  function calendar(callsRef, marker) {
    return {
      resolveTimeZone: (timeZone) => ({ timeZone, warning: null }), calendarState() {},
      annualTimeline: () => { callsRef.count += 1; return { marker }; }
    };
  }
  const firstRef = { count: firstCalls };
  const secondRef = { count: secondCalls };
  const firstCalendar = calendar(firstRef, 'first');
  const secondCalendar = calendar(secondRef, 'second');
  const base = { Astronomy: AstronomyDependency, Observer: { observerState() {} }, lunarApi: lunarDependency };
  assert.equal(WorldState.annualTimeline(2026, 'Asia/Shanghai', Object.assign({}, base, { Calendar: firstCalendar })).marker, 'first');
  assert.equal(WorldState.annualTimeline(2026, 'Asia/Shanghai', Object.assign({}, base, { Calendar: secondCalendar })).marker, 'second');
  assert.equal(firstRef.count, 1);
  assert.equal(secondRef.count, 1);
});

test('WorldState rejects incomplete dependencies with stable method contracts', () => {
  assert.throws(
    () => WorldState.create({ instantUtc: 1, dependencies: { Astronomy: {} } }),
    /Astronomy dependency must provide earthHeliocentricState, solarGeocentricState, moonGeocentricState, and eclipseSeasonHint/
  );
});
