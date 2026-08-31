const test = require('node:test');
const assert = require('node:assert/strict');
const Astronomy = require('../js/astronomy-core.js');

function angularDistance(a, b) {
  const delta = Math.abs(Astronomy.normalizeDegrees(a - b));
  return Math.min(delta, 360 - delta);
}

test('Julian day is J2000 at 2000-01-01T12:00:00Z', () => {
  assert.equal(Astronomy.julianDay(Date.UTC(2000, 0, 1, 12)), 2451545);
});

test('Earth distance changes between perihelion and aphelion seasons', () => {
  const january = Astronomy.earthHeliocentricState(Date.UTC(2026, 0, 3, 12));
  const july = Astronomy.earthHeliocentricState(Date.UTC(2026, 6, 6, 12));
  assert.ok(january.distanceAu < july.distanceAu);
  assert.ok(january.distanceAu > 0.97 && january.distanceAu < 1.02);
  assert.ok(july.distanceAu > 0.98 && july.distanceAu < 1.03);
});

test('solar longitude is near cardinal values at 2026 equinoxes and solstices', () => {
  const cases = [
    [Date.UTC(2026, 2, 20, 14), 0],
    [Date.UTC(2026, 5, 21, 8), 90],
    [Date.UTC(2026, 8, 23, 0), 180],
    [Date.UTC(2026, 11, 21, 20), 270]
  ];
  for (const [instant, target] of cases) {
    const state = Astronomy.solarGeocentricState(instant);
    assert.ok(angularDistance(state.longitudeDeg, target) < 2);
  }
});

test('Earth axial direction stays inertially fixed over an orbit', () => {
  const first = Astronomy.earthHeliocentricState(Date.UTC(2026, 0, 1));
  const second = Astronomy.earthHeliocentricState(Date.UTC(2026, 6, 1));
  assert.deepEqual(first.axisUnit, second.axisUnit);
  assert.ok(Math.abs(first.obliquityDeg - 23.44) < 0.1);
});

test('Moon orbit uses the real mean inclination', () => {
  const moon = Astronomy.moonGeocentricState(Date.UTC(2026, 0, 1));
  assert.ok(Math.abs(moon.orbit.inclinationDeg - 5.145) < 0.001);
  assert.equal(moon.orbit.nodalRegressionYears, 18.6);
});

test('Moon phase illumination follows Sun-Moon elongation', () => {
  assert.ok(Math.abs(Astronomy.illuminatedFraction(0)) < 1e-12);
  assert.ok(Math.abs(Astronomy.illuminatedFraction(90) - 0.5) < 1e-12);
  assert.ok(Math.abs(Astronomy.illuminatedFraction(180) - 1) < 1e-12);
});

test('phase names cover the four principal phases', () => {
  assert.equal(Astronomy.phaseName(2), '朔');
  assert.equal(Astronomy.phaseName(90), '上弦附近');
  assert.equal(Astronomy.phaseName(178), '望');
  assert.equal(Astronomy.phaseName(270), '下弦附近');
});

test('eclipse-season hint requires both syzygy and a nearby node', () => {
  assert.equal(Astronomy.eclipseSeasonHint(3, 2).possible, true);
  assert.equal(Astronomy.eclipseSeasonHint(90, 2).possible, false);
  assert.equal(Astronomy.eclipseSeasonHint(3, 18).possible, false);
});
