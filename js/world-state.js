;(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const api = factory(
    isNode ? require('./astronomy-core.js') : root && root.AstroEducation && root.AstroEducation.Astronomy,
    isNode ? require('./calendar-core.js') : root && root.AstroEducation && root.AstroEducation.Calendar,
    isNode ? require('./observer-core.js') : root && root.AstroEducation && root.AstroEducation.Observer,
    isNode ? require('../vendor/lunar/lunar.js') : root && root.Solar ? { Solar: root.Solar, LunarYear: root.LunarYear } : null
  );
  if (isNode) module.exports = api;
  if (root) {
    root.AstroEducation = root.AstroEducation || {};
    root.AstroEducation.WorldState = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (defaultAstronomy, defaultCalendar, defaultObserver, defaultLunarApi) {
  'use strict';

  const annualTimelineCache = new WeakMap();

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

  function cloneFrozen(value) {
    if (Array.isArray(value)) return deepFreeze(value.map(cloneFrozen));
    if (value && typeof value === 'object') {
      const copy = {};
      Object.keys(value).forEach(function (key) { copy[key] = cloneFrozen(value[key]); });
      return deepFreeze(copy);
    }
    return value;
  }

  function snapshot(value) {
    if (Array.isArray(value)) return value.map(snapshot);
    if (value && typeof value === 'object') {
      const copy = {};
      Object.keys(value).forEach(function (key) { copy[key] = snapshot(value[key]); });
      return copy;
    }
    return value;
  }

  function resolveDependencies(injected) {
    const dependencies = injected || {};
    const Astronomy = dependencies.Astronomy || defaultAstronomy;
    const Calendar = dependencies.Calendar || defaultCalendar;
    const Observer = dependencies.Observer || defaultObserver;
    const lunarApi = dependencies.lunarApi || defaultLunarApi;
    if (!Astronomy || typeof Astronomy.earthHeliocentricState !== 'function' ||
      typeof Astronomy.solarGeocentricState !== 'function' || typeof Astronomy.moonGeocentricState !== 'function') {
      throw new Error('Astronomy dependency must provide earthHeliocentricState, solarGeocentricState, moonGeocentricState, and eclipseSeasonHint');
    }
    if (typeof Astronomy.eclipseSeasonHint !== 'function') {
      throw new Error('Astronomy dependency must provide earthHeliocentricState, solarGeocentricState, moonGeocentricState, and eclipseSeasonHint');
    }
    if (!Calendar || typeof Calendar.calendarState !== 'function' || typeof Calendar.annualTimeline !== 'function' ||
      typeof Calendar.resolveTimeZone !== 'function') {
      throw new Error('Calendar dependency must provide calendarState, annualTimeline, and resolveTimeZone');
    }
    if (!Observer || typeof Observer.observerState !== 'function' || typeof Observer.greenwichSiderealTimeDeg !== 'function') {
      throw new Error('Observer dependency must provide observerState and greenwichSiderealTimeDeg');
    }
    if (!lunarApi || !lunarApi.Solar || typeof lunarApi.Solar.fromYmd !== 'function') {
      throw new Error('lunarApi dependency must provide Solar.fromYmd');
    }
    return { Astronomy, Calendar, Observer, lunarApi };
  }

  function assertInstant(instantUtc) {
    if (!Number.isFinite(instantUtc)) {
      throw new TypeError('instantUtc must be a finite UTC millisecond value');
    }
  }

  function adjacentLocalInstant(displayTime, timeZone, direction, Calendar, fallbackInstant) {
    if (typeof Calendar.zonedLocalDateTimeToUtc !== 'function' || !displayTime) return fallbackInstant + direction * 86400000;
    const date = new Date(Date.UTC(displayTime.year, displayTime.month - 1, displayTime.day + direction));
    const result = Calendar.zonedLocalDateTimeToUtc({
      year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate(),
      hour: displayTime.hour || 0, minute: displayTime.minute || 0, second: displayTime.second || 0
    }, timeZone);
    return result && Number.isFinite(result.instantUtc) ? result.instantUtc : fallbackInstant + direction * 86400000;
  }

  function daylightTrend(instantUtc, displayTime, timeZone, location, dependencies) {
    const previousInstant = adjacentLocalInstant(displayTime, timeZone, -1, dependencies.Calendar, instantUtc);
    const nextInstant = adjacentLocalInstant(displayTime, timeZone, 1, dependencies.Calendar, instantUtc);
    const previousSun = dependencies.Astronomy.solarGeocentricState(previousInstant);
    const nextSun = dependencies.Astronomy.solarGeocentricState(nextInstant);
    const previous = dependencies.Observer.observerState(Object.assign({ instantUtc: previousInstant }, location, { sun: previousSun }));
    const next = dependencies.Observer.observerState(Object.assign({ instantUtc: nextInstant }, location, { sun: nextSun }));
    const changeHours = next.daylightHours - previous.daylightHours;
    // Thirty seconds across two local days is deliberately treated as stable near solstices and polar plateaus.
    if (!Number.isFinite(changeHours) || Math.abs(changeHours) <= 1 / 120) return 'stable';
    return changeHours > 0 ? 'increasing' : 'decreasing';
  }

  function annualCacheFor(Astronomy, Calendar, lunarApi) {
    let calendarCache = annualTimelineCache.get(Astronomy);
    if (!calendarCache) {
      calendarCache = new WeakMap();
      annualTimelineCache.set(Astronomy, calendarCache);
    }
    let lunarCache = calendarCache.get(Calendar);
    if (!lunarCache) {
      lunarCache = new WeakMap();
      calendarCache.set(Calendar, lunarCache);
    }
    let yearCache = lunarCache.get(lunarApi);
    if (!yearCache) {
      yearCache = new Map();
      lunarCache.set(lunarApi, yearCache);
    }
    return yearCache;
  }

  function annualTimeline(year, timeZone, injectedDependencies) {
    const dependencies = resolveDependencies(injectedDependencies);
    const zone = dependencies.Calendar.resolveTimeZone(timeZone);
    const cache = annualCacheFor(dependencies.Astronomy, dependencies.Calendar, dependencies.lunarApi);
    const key = `${year}|${zone.timeZone}`;
    let cached = cache.get(key);
    if (!cached) {
      cached = deepFreeze(snapshot(dependencies.Calendar.annualTimeline(
        year,
        zone.timeZone,
        dependencies.Astronomy,
        dependencies.lunarApi
      )));
      cache.set(key, cached);
    }
    return cloneFrozen(cached);
  }

  function create(options) {
    const instantUtc = options && options.instantUtc;
    assertInstant(instantUtc);
    const dependencies = resolveDependencies(options && options.dependencies);
    const timeZone = options && options.timeZone === undefined ? 'Asia/Shanghai' : options && options.timeZone;
    const location = options && options.location === undefined
      ? { name: '北京', latitudeDeg: 39.9042, longitudeDeg: 116.4074 }
      : options && options.location;
    const calendar = dependencies.Calendar.calendarState({
      instantUtc,
      timeZone,
      Astronomy: dependencies.Astronomy,
      lunarApi: dependencies.lunarApi
    });
    const earth = Object.assign({}, dependencies.Astronomy.earthHeliocentricState(instantUtc), {
      rotationAngleDeg: dependencies.Observer.greenwichSiderealTimeDeg(instantUtc)
    });
    const sunBase = dependencies.Astronomy.solarGeocentricState(instantUtc);
    const moonState = dependencies.Astronomy.moonGeocentricState(instantUtc, sunBase);
    const observerBase = dependencies.Observer.observerState({
      instantUtc,
      name: location && location.name,
      latitudeDeg: location && location.latitudeDeg,
      longitudeDeg: location && location.longitudeDeg,
      sun: sunBase
    });
    const observer = Object.assign({}, observerBase, {
      daylightTrend: daylightTrend(instantUtc, calendar.displayTime, calendar.displayTime.timeZone, observerBase.location, dependencies)
    });
    const moon = Object.assign({
      positionKm: moonState.vectorKm,
      eclipseSeasonHint: dependencies.Astronomy.eclipseSeasonHint(moonState.elongationDeg, moonState.nodeDistanceDeg)
    }, moonState);
    const sun = Object.assign({ solarTerms: calendar.solarTerms }, sunBase);
    return deepFreeze(snapshot({
      instantUtc,
      timeZone: calendar.displayTime.timeZone,
      location: observer.location,
      displayTime: calendar.displayTime,
      earth,
      sun,
      moon,
      observer,
      gregorian: calendar.gregorian,
      lunar: calendar.lunar,
      ganzhi: calendar.ganzhi,
      support: {
        astronomy: true,
        teachingAccuracy: true,
        lunar: calendar.support.lunar,
        timeZone: calendar.support.timeZone,
        ganzhi: calendar.support.ganzhi,
        location: observer.warning
      }
    }));
  }

  return Object.freeze({ create, annualTimeline });
});
