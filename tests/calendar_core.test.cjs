const test = require('node:test');
const assert = require('node:assert/strict');
const Astronomy = require('../js/astronomy-core.js');
const lunarApi = require('../vendor/lunar/lunar.js');
const Calendar = require('../js/calendar-core.js');

function angularDistance(a, b) {
  const delta = Math.abs(Astronomy.normalizeDegrees(a - b));
  return Math.min(delta, 360 - delta);
}

test('Gregorian leap-year and month lengths are correct', () => {
  assert.equal(Calendar.isLeapYear(2000), true);
  assert.equal(Calendar.isLeapYear(1900), false);
  assert.equal(Calendar.daysInMonth(2024, 2), 29);
  assert.equal(Calendar.daysInMonth(2025, 2), 28);
});

test('same instant can cross a local date boundary by timezone', () => {
  const instant = Date.UTC(2026, 0, 1, 0, 30);
  assert.equal(Calendar.localDateParts(instant, 'Asia/Shanghai').day, 1);
  assert.equal(Calendar.localDateParts(instant, 'America/Los_Angeles').day, 31);
});

test('local time formatting uses a midnight hour of zero', () => {
  const local = Calendar.localDateParts(Date.UTC(2026, 0, 1, 16), 'Asia/Shanghai');
  assert.equal(local.hour, 0);
  assert.equal(local.isoDate, '2026-01-02');
});

test('invalid timezone falls back with a structured warning', () => {
  const result = Calendar.resolveTimeZone('Mars/Olympus');
  assert.equal(result.timeZone, 'Asia/Shanghai');
  assert.equal(result.warning.code, 'INVALID_TIME_ZONE');
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.warning));
});

test('lunar conversion handles Spring Festival and a leap month', () => {
  const spring = Calendar.lunarForLocalDate({ year: 2026, month: 2, day: 17 }, lunarApi);
  assert.deepEqual(
    { month: spring.month, day: spring.day, leap: spring.isLeapMonth },
    { month: 1, day: 1, leap: false }
  );
  const leap = Calendar.lunarForLocalDate({ year: 2025, month: 7, day: 25 }, lunarApi);
  assert.equal(leap.isLeapMonth, true);
  assert.ok(Object.isFrozen(leap));
});

test('lunar support range includes both documented boundary dates', () => {
  assert.equal(Calendar.lunarForLocalDate({ year: 1900, month: 1, day: 1 }, lunarApi).supported, true);
  assert.equal(Calendar.lunarForLocalDate({ year: 2100, month: 12, day: 31 }, lunarApi).supported, true);
});

test('out-of-range lunar dates are explicitly unsupported', () => {
  const result = Calendar.lunarForLocalDate({ year: 2101, month: 1, day: 1 }, lunarApi);
  assert.equal(result.supported, false);
  assert.equal(result.warning.code, 'LUNAR_DATE_OUT_OF_RANGE');
  assert.ok(Object.isFrozen(result));
});

test('Ganzhi index follows the 1984 甲子 anchor', () => {
  assert.equal(Calendar.ganzhiForYear(1984).name, '甲子');
  assert.equal(Calendar.ganzhiForYear(2026).name, '丙午');
  assert.ok(Object.isFrozen(Calendar.ganzhiForYear(1984)));
});

test('zoned local time reports a nonexistent DST wall time', () => {
  const result = Calendar.zonedLocalDateTimeToUtc(
    { year: 2026, month: 3, day: 8, hour: 2, minute: 30, second: 0 },
    'America/Los_Angeles'
  );
  assert.equal(result.instantUtc, null);
  assert.equal(result.warning.code, 'NONEXISTENT_LOCAL_TIME');
  assert.equal(result.ambiguity.kind, 'nonexistent');
  assert.deepEqual(result.ambiguity.candidates, []);
  assert.ok(Object.isFrozen(result.ambiguity.candidates));
});

test('zoned local time chooses the earlier UTC instant for a DST overlap', () => {
  const result = Calendar.zonedLocalDateTimeToUtc(
    { year: 2026, month: 11, day: 1, hour: 1, minute: 30, second: 0 },
    'America/Los_Angeles'
  );
  assert.equal(result.instantUtc, Date.UTC(2026, 10, 1, 8, 30));
  assert.equal(result.warning.code, 'AMBIGUOUS_LOCAL_TIME');
  assert.equal(result.ambiguity.kind, 'ambiguous');
  assert.deepEqual(result.ambiguity.candidates, [
    Date.UTC(2026, 10, 1, 8, 30),
    Date.UTC(2026, 10, 1, 9, 30)
  ]);
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.ambiguity));
});

test('zoned local midnight round-trips through the selected timezone', () => {
  const result = Calendar.zonedLocalMidnightToUtc(
    { year: 2026, month: 1, day: 2 },
    'Asia/Shanghai'
  );
  assert.equal(result.instantUtc, Date.UTC(2026, 0, 1, 16));
  assert.equal(result.warning, null);
  assert.ok(Object.isFrozen(result));
});

test('historical Shanghai local midnight preserves its second-level UTC offset', () => {
  const instant = Date.UTC(1899, 11, 31, 15, 54, 17);
  const result = Calendar.zonedLocalDateTimeToUtc(
    { year: 1900, month: 1, day: 1, hour: 0, minute: 0, second: 0 },
    'Asia/Shanghai'
  );
  assert.equal(result.instantUtc, instant);
  assert.equal(result.ambiguity.kind, 'unique');
  assert.deepEqual(result.ambiguity.candidates, [instant]);
  assert.deepEqual(
    Calendar.localDateParts(instant, 'Asia/Shanghai'),
    {
      year: 1900,
      month: 1,
      day: 1,
      hour: 0,
      minute: 0,
      second: 0,
      weekday: 'Mon',
      isoDate: '1900-01-01',
      timeZone: 'Asia/Shanghai'
    }
  );
});

test('2026 contains 24 ordered solar-longitude crossings', () => {
  const terms = Calendar.solarTermsForGregorianYear(2026, Astronomy);
  assert.equal(terms.length, 24);
  for (let index = 1; index < terms.length; index += 1) {
    assert.ok(terms[index].instantUtc > terms[index - 1].instantUtc);
  }
  for (const term of terms) {
    const longitude = Astronomy.solarGeocentricState(term.instantUtc).longitudeDeg;
    assert.ok(angularDistance(longitude, term.longitudeDeg) < 0.001);
  }
});

test('2026 spring equinox is solved inside the expected UTC day', () => {
  const term = Calendar.solarTermsForGregorianYear(2026, Astronomy)
    .find((item) => item.name === '春分');
  assert.ok(term.instantUtc >= Date.UTC(2026, 2, 20));
  assert.ok(term.instantUtc < Date.UTC(2026, 2, 21));
});

test('annual timeline uses one normalized UTC scale for all rows', () => {
  const timeline = Calendar.annualTimeline(2026, 'Asia/Shanghai', Astronomy, lunarApi);
  assert.equal(timeline.gregorian.length, 12);
  assert.equal(timeline.solarTerms.length, 24);
  assert.ok(timeline.lunarMonths.length >= 12 && timeline.lunarMonths.length <= 14);
  for (const row of [timeline.gregorian, timeline.solarTerms, timeline.lunarMonths]) {
    for (const segment of row) {
      assert.ok(segment.startRatio >= 0 && segment.startRatio <= 1);
    }
  }
});

test('principal lunar phases are solved from Sun-Moon elongation', () => {
  const phases = Calendar.principalMoonPhasesForInterval(
    Date.UTC(2026, 0, 1),
    Date.UTC(2026, 2, 1),
    Astronomy
  );
  assert.ok(phases.length >= 7 && phases.length <= 9);
  for (const phase of phases) {
    const sun = Astronomy.solarGeocentricState(phase.instantUtc);
    const moon = Astronomy.moonGeocentricState(phase.instantUtc, sun);
    assert.ok(angularDistance(moon.elongationDeg, phase.elongationDeg) < 0.01);
  }
});

test('solar term cache returns frozen independent values', () => {
  const first = Calendar.solarTermsForGregorianYear(2026, Astronomy);
  const second = Calendar.solarTermsForGregorianYear(2026, Astronomy);
  assert.notEqual(first, second);
  assert.notEqual(first[0], second[0]);
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first[0]));
});

test('solar crossing reports an explicit bracket failure when the interval has none', () => {
  const crossing = Calendar.findSolarLongitudeCrossing({
    startUtc: Date.UTC(2026, 0, 1),
    endUtc: Date.UTC(2026, 0, 2),
    targetLongitudeDeg: 180
  }, Astronomy);
  assert.equal(crossing, null);
});

test('calendar state exposes the Spring Festival and Li Chun Ganzhi difference', () => {
  const state = Calendar.calendarState({
    instantUtc: Date.UTC(2026, 1, 10),
    timeZone: 'Asia/Shanghai',
    Astronomy,
    lunarApi
  });
  assert.equal(state.ganzhi.springFestival.name, '乙巳');
  assert.equal(state.ganzhi.liChun.name, '丙午');
  assert.equal(state.ganzhi.differs, true);
});
