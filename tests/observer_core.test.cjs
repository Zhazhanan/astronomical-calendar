const test = require('node:test');
const assert = require('node:assert/strict');
const Observer = require('../js/observer-core.js');

test('invalid coordinates fall back to Beijing but preserve input', () => {
  const result = Observer.resolveLocation({ name: '输入', latitudeDeg: 98, longitudeDeg: 220 });
  assert.equal(result.location.name, '北京');
  assert.equal(result.warning.code, 'INVALID_LOCATION');
  assert.deepEqual(result.rejectedInput, { name: '输入', latitudeDeg: 98, longitudeDeg: 220 });
});

test('non-object location input falls back without losing serializable rejected input', () => {
  for (const input of [0, '39.9,116.4', [39.9, 116.4]]) {
    const result = Observer.resolveLocation(input);
    assert.equal(result.location.name, '北京');
    assert.equal(result.warning.code, 'INVALID_LOCATION');
    assert.deepEqual(result.rejectedInput, input);
    assert.doesNotThrow(() => JSON.stringify(result));
    assert.ok(Object.isFrozen(result));
  }
});

test('equinox daylight is close to twelve hours near the equator', () => {
  const state = Observer.observerState({
    instantUtc: Date.UTC(2026, 2, 20, 12),
    latitudeDeg: 0,
    longitudeDeg: 0,
    sun: { rightAscensionDeg: 0, declinationDeg: 0 }
  });
  assert.ok(Math.abs(state.daylightHours - 12) < 0.2);
  assert.ok(state.altitudeDeg > 85);
});

test('northern summer day is longer than northern winter day', () => {
  const summer = Observer.daylightHours(39.9042, 23.44);
  const winter = Observer.daylightHours(39.9042, -23.44);
  assert.ok(summer > winter);
});

test('polar summer and winter produce full-day and no-day daylight', () => {
  assert.equal(Observer.daylightHours(80, 23.44), 24);
  assert.equal(Observer.daylightHours(80, -23.44), 0);
});

test('GMST and subsolar longitude are normalized in degrees', () => {
  assert.ok(Math.abs(Observer.greenwichSiderealTimeDeg(Date.UTC(2000, 0, 1, 12)) - 280.46061837) < 0.00001);
  const state = Observer.observerState({
    instantUtc: Date.UTC(2000, 0, 1, 12),
    latitudeDeg: 0,
    longitudeDeg: 180,
    sun: { rightAscensionDeg: 720, declinationDeg: 0 }
  });
  assert.ok(state.subsolarPoint.longitudeDeg >= -180 && state.subsolarPoint.longitudeDeg <= 180);
  assert.ok(state.azimuthDeg >= 0 && state.azimuthDeg < 360);
});

test('observer API rejects non-finite UTC and coordinate inputs', () => {
  assert.throws(() => Observer.greenwichSiderealTimeDeg(NaN), TypeError);
  assert.throws(() => Observer.daylightHours(Infinity, 0), TypeError);
  assert.throws(() => Observer.observerState({
    instantUtc: Infinity,
    latitudeDeg: 0,
    longitudeDeg: 0,
    sun: { rightAscensionDeg: 0, declinationDeg: 0 }
  }), TypeError);
});

test('observer state and location results are frozen', () => {
  const location = Observer.resolveLocation({ name: '北京', latitudeDeg: 39.9042, longitudeDeg: 116.4074 });
  const state = Observer.observerState({
    instantUtc: Date.UTC(2026, 2, 20, 12),
    latitudeDeg: 39.9042,
    longitudeDeg: 116.4074,
    sun: { rightAscensionDeg: 0, declinationDeg: 0 }
  });
  assert.ok(Object.isFrozen(location));
  assert.ok(Object.isFrozen(location.location));
  assert.ok(Object.isFrozen(state));
  assert.ok(Object.isFrozen(state.subsolarPoint));
});

test('eight frozen preset locations include the supported city references', () => {
  assert.equal(Observer.PRESET_LOCATIONS.length, 8);
  assert.deepEqual(Observer.PRESET_LOCATIONS.map((location) => location.name), [
    '北京', '上海', '广州', '乌鲁木齐', '伦敦', '纽约', '悉尼', '赤道参考点'
  ]);
  assert.ok(Object.isFrozen(Observer.PRESET_LOCATIONS));
});

test('azimuth uses north-zero clockwise convention', () => {
  const instantUtc = Date.UTC(2000, 0, 1, 12);
  const gmst = Observer.greenwichSiderealTimeDeg(instantUtc);
  const easternSun = Observer.observerState({
    instantUtc,
    latitudeDeg: 0,
    longitudeDeg: 0,
    sun: { rightAscensionDeg: gmst + 90, declinationDeg: 0 }
  });
  const westernSun = Observer.observerState({
    instantUtc,
    latitudeDeg: 0,
    longitudeDeg: 0,
    sun: { rightAscensionDeg: gmst - 90, declinationDeg: 0 }
  });
  const localNoon = Observer.observerState({
    instantUtc,
    latitudeDeg: 40,
    longitudeDeg: 0,
    sun: { rightAscensionDeg: gmst, declinationDeg: 0 }
  });
  assert.ok(Math.abs(easternSun.azimuthDeg - 90) < 0.0001);
  assert.ok(Math.abs(westernSun.azimuthDeg - 270) < 0.0001);
  assert.ok(Math.abs(localNoon.azimuthDeg - 180) < 0.0001);
});

test('hemisphere state includes the zero and civil-twilight boundaries', () => {
  const instantUtc = Date.UTC(2000, 0, 1, 12);
  const gmst = Observer.greenwichSiderealTimeDeg(instantUtc);
  function stateAtHourAngle(hourAngleDeg) {
    return Observer.observerState({
      instantUtc,
      latitudeDeg: 0,
      longitudeDeg: 0,
      sun: { rightAscensionDeg: gmst - hourAngleDeg, declinationDeg: 0 }
    });
  }
  assert.equal(stateAtHourAngle(90).hemisphereState, 'day');
  assert.equal(stateAtHourAngle(96).hemisphereState, 'twilight');
  assert.equal(stateAtHourAngle(96.001).hemisphereState, 'night');
});
