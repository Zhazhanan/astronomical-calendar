const test = require('node:test');
const assert = require('node:assert/strict');
const Astronomy = require('../js/astronomy-core.js');
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
