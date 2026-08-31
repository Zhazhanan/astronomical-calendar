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
  assert.equal(leap.monthName, '闰六');
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

test('principal lunar phases are exact directed ecliptic-longitude events with separate spatial separation', () => {
  const phases = Calendar.principalMoonPhasesForInterval(
    Date.UTC(2026, 0, 1),
    Date.UTC(2026, 3, 1),
    Astronomy
  );
  assert.ok(phases.length >= 11 && phases.length <= 13);
  const expectedNameForTarget = { 0: '朔', 90: '上弦', 180: '望', 270: '下弦' };
  for (const phase of phases) {
    const sun = Astronomy.solarGeocentricState(phase.instantUtc);
    const moon = Astronomy.moonGeocentricState(phase.instantUtc, sun);
    const longitudeDifferenceDeg = Astronomy.normalizeDegrees(moon.longitudeDeg - sun.longitudeDeg);
    assert.equal(phase.name, expectedNameForTarget[phase.targetElongationDeg]);
    assert.ok(angularDistance(longitudeDifferenceDeg, phase.targetElongationDeg) < 0.02);
    assert.ok(angularDistance(longitudeDifferenceDeg, phase.longitudeDifferenceDeg) < 0.02);
    assert.ok(angularDistance(moon.elongationDeg, phase.elongationDeg) < 0.01);
    assert.equal(phase.orientedElongationDeg, phase.elongationDeg);
    assert.ok(phase.spatialSeparationDeg >= 0 && phase.spatialSeparationDeg <= 180);
    assert.equal(
      phase.spatialSeparationDeg,
      Math.min(phase.elongationDeg, 360 - phase.elongationDeg)
    );
  }
  const names = phases.map((phase) => phase.name);
  for (let index = 1; index < names.length; index += 1) {
    const previous = ['朔', '上弦', '望', '下弦'].indexOf(names[index - 1]);
    const current = ['朔', '上弦', '望', '下弦'].indexOf(names[index]);
    assert.equal(current, (previous + 1) % 4);
  }
  const newMoon = phases.find((phase) => phase.name === '朔');
  const fullMoon = phases.find((phase) => phase.name === '望');
  const lowerQuarter = phases.find((phase) => phase.name === '下弦');
  assert.notEqual(newMoon.elongationDeg, 0, 'inclined orbit must not claim exact zero spatial separation');
  assert.notEqual(fullMoon.elongationDeg, 180, 'inclined orbit must not claim exact 180° spatial separation');
  assert.ok(lowerQuarter.elongationDeg > 180, '下弦保留有方向相角');
  assert.ok(lowerQuarter.spatialSeparationDeg < 180, '下弦空间夹角必须为无方向锐角');
  assert.notEqual(lowerQuarter.spatialSeparationDeg, lowerQuarter.elongationDeg);
});

test('solar term cache returns frozen independent values', () => {
  const first = Calendar.solarTermsForGregorianYear(2026, Astronomy);
  const second = Calendar.solarTermsForGregorianYear(2026, Astronomy);
  assert.notEqual(first, second);
  assert.notEqual(first[0], second[0]);
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first[0]));
});

test('solar-term cache is isolated by Astronomy implementation identity', () => {
  const shiftedAstronomy = {
    ...Astronomy,
    solarGeocentricState(instantUtc) {
      const state = Astronomy.solarGeocentricState(instantUtc);
      return { ...state, longitudeDeg: Astronomy.normalizeDegrees(state.longitudeDeg + 1) };
    }
  };
  const standard = Calendar.solarTermsForGregorianYear(2026, Astronomy);
  const shifted = Calendar.solarTermsForGregorianYear(2026, shiftedAstronomy);
  assert.notEqual(standard[0].instantUtc, shifted[0].instantUtc);
  assert.ok(shifted.every((term) =>
    angularDistance(shiftedAstronomy.solarGeocentricState(term.instantUtc).longitudeDeg, term.longitudeDeg) < 0.001
  ));
});

test('annual lunar rows use one non-duplicated leap prefix and exact phase boundaries', () => {
  const timeline = Calendar.annualTimeline(2025, 'Asia/Shanghai', Astronomy, lunarApi);
  const leapSix = timeline.lunarMonths.find((month) => month.isLeapMonth && month.month === 6);
  assert.equal(leapSix.label, '闰六月');
  for (const month of timeline.lunarMonths) {
    assert.equal(month.label.includes('闰闰'), false);
    assert.equal(month.estimated, false);
    assert.equal(month.newMoonTargetElongationDeg, 0);
    assert.equal(month.fullMoonTargetElongationDeg, 180);
    assert.equal(month.newMoonOrientedElongationDeg, month.newMoonElongationDeg);
    assert.equal(month.fullMoonOrientedElongationDeg, month.fullMoonElongationDeg);
    assert.equal(
      month.newMoonSpatialSeparationDeg,
      Math.min(month.newMoonElongationDeg, 360 - month.newMoonElongationDeg)
    );
    assert.equal(
      month.fullMoonSpatialSeparationDeg,
      Math.min(month.fullMoonElongationDeg, 360 - month.fullMoonElongationDeg)
    );
    const boundarySun = Astronomy.solarGeocentricState(month.startUtc);
    const boundaryMoon = Astronomy.moonGeocentricState(month.startUtc, boundarySun);
    assert.ok(angularDistance(
      Astronomy.normalizeDegrees(boundaryMoon.longitudeDeg - boundarySun.longitudeDeg), 0
    ) < 0.02);
    assert.ok(angularDistance(month.newMoonLongitudeDifferenceDeg, 0) < 0.02);
    assert.ok(angularDistance(month.fullMoonLongitudeDifferenceDeg, 180) < 0.02);
    assert.notEqual(month.newMoonElongationDeg, 0);
    assert.notEqual(month.fullMoonElongationDeg, 180);
  }
});

test('annual timelines retain overlapping lunar rows at both supported-year boundaries', () => {
  for (const year of [1900, 2100]) {
    const timeline = Calendar.annualTimeline(year, 'Asia/Shanghai', Astronomy, lunarApi);
    assert.ok(timeline.lunarMonths.length >= 12);
    assert.ok(timeline.lunarMonths[0].startUtc < timeline.startUtc);
    assert.ok(timeline.lunarMonths.at(-1).endUtc > timeline.endUtc);
    assert.ok(timeline.lunarMonths.every((month) => month.label !== '农历日期超出支持范围'));
    assert.ok(timeline.lunarMonths.every((month) => month.estimated === false));
  }
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

test('calendar state exposes local-year boundaries, progress, and exact neighboring phases', () => {
  const instantUtc = Date.UTC(2026, 2, 20, 12);
  const state = Calendar.calendarState({ instantUtc, timeZone: 'Asia/Shanghai', Astronomy, lunarApi });
  assert.equal(state.gregorian.year, 2026);
  assert.equal(state.gregorian.dayOfYear, 79);
  assert.ok(state.gregorian.startUtc < instantUtc && instantUtc < state.gregorian.endUtc);
  assert.ok(state.gregorian.yearProgressRatio > 0 && state.gregorian.yearProgressRatio < 1);
  assert.ok(Object.isFrozen(state.gregorian));
  assert.ok(state.lunar.currentPhase.instantUtc <= instantUtc);
  assert.ok(state.lunar.nextPhase.instantUtc > instantUtc);
  assert.equal(state.lunar.millisecondsUntilNextPhase, state.lunar.nextPhase.instantUtc - instantUtc);
  for (const phase of [state.lunar.currentPhase, state.lunar.nextPhase]) {
    const sun = Astronomy.solarGeocentricState(phase.instantUtc);
    const moon = Astronomy.moonGeocentricState(phase.instantUtc, sun);
    assert.ok(angularDistance(
      Astronomy.normalizeDegrees(moon.longitudeDeg - sun.longitudeDeg), phase.targetElongationDeg
    ) < 0.02);
  }
});

test('calendar state keeps Ganzhi unsupported outside the documented local-year range', () => {
  for (const year of [1899, 2101]) {
    const state = Calendar.calendarState({
      instantUtc: Date.UTC(year, 6, 1), timeZone: 'Asia/Shanghai', Astronomy, lunarApi
    });
    assert.equal(state.ganzhi.springFestival, null);
    assert.equal(state.ganzhi.liChun, null);
    assert.equal(state.support.ganzhi.code, 'GANZHI_YEAR_OUT_OF_RANGE');
  }
  for (const year of [1900, 2100]) {
    const state = Calendar.calendarState({
      instantUtc: Date.UTC(year, 6, 1), timeZone: 'Asia/Shanghai', Astronomy, lunarApi
    });
    assert.ok(state.ganzhi.springFestival);
    assert.ok(state.ganzhi.liChun);
    assert.equal(state.support.ganzhi, null);
  }
});
