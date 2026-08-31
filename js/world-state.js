;(function (root, factory) {
  const astronomy = typeof module === 'object' && module.exports
    ? require('./astronomy-core.js')
    : root && root.AstroEducation && root.AstroEducation.Astronomy;
  const api = factory(astronomy);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) {
    root.AstroEducation = root.AstroEducation || {};
    root.AstroEducation.WorldState = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Astronomy) {
  'use strict';

  function isPlainObject(value) {
    if (!value || typeof value !== 'object') return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function deepFreeze(value) {
    if (!Array.isArray(value) && !isPlainObject(value)) return value;
    Object.keys(value).forEach(function (key) {
      deepFreeze(value[key]);
    });
    return Object.freeze(value);
  }

  function create(options) {
    const instantUtc = options && options.instantUtc;
    if (!Number.isFinite(instantUtc)) {
      throw new TypeError('instantUtc must be a finite UTC millisecond value');
    }
    if (!Astronomy) throw new Error('Astronomy dependency is required');

    const earth = Astronomy.earthHeliocentricState(instantUtc);
    const sun = Astronomy.solarGeocentricState(instantUtc);
    const moonState = Astronomy.moonGeocentricState(instantUtc, sun);
    const moon = Object.assign({
      positionKm: moonState.vectorKm,
      eclipseSeasonHint: Astronomy.eclipseSeasonHint(moonState.elongationDeg, moonState.nodeDistanceDeg)
    }, moonState);

    return deepFreeze({
      instantUtc,
      earth,
      sun,
      moon,
      support: { astronomy: true, teachingAccuracy: true }
    });
  }

  return Object.freeze({ create });
});
