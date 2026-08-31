;(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) {
    root.AstroEducation = root.AstroEducation || {};
    root.AstroEducation.Observer = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const PRESET_LOCATIONS = Object.freeze([
    Object.freeze({ name: '北京', latitudeDeg: 39.9042, longitudeDeg: 116.4074 }),
    Object.freeze({ name: '上海', latitudeDeg: 31.2304, longitudeDeg: 121.4737 }),
    Object.freeze({ name: '广州', latitudeDeg: 23.1291, longitudeDeg: 113.2644 }),
    Object.freeze({ name: '乌鲁木齐', latitudeDeg: 43.8256, longitudeDeg: 87.6168 }),
    Object.freeze({ name: '伦敦', latitudeDeg: 51.5072, longitudeDeg: -0.1276 }),
    Object.freeze({ name: '纽约', latitudeDeg: 40.7128, longitudeDeg: -74.0060 }),
    Object.freeze({ name: '悉尼', latitudeDeg: -33.8688, longitudeDeg: 151.2093 }),
    Object.freeze({ name: '赤道参考点', latitudeDeg: 0, longitudeDeg: 0 })
  ]);
  const BEIJING = PRESET_LOCATIONS[0];
  const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
  const J2000_JULIAN_DAY = 2451545;
  const SUNRISE_ALTITUDE_DEG = -0.833;

  function freeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.keys(value).forEach((key) => freeze(value[key]));
      Object.freeze(value);
    }
    return value;
  }

  function isValidCoordinate(latitudeDeg, longitudeDeg) {
    return Number.isFinite(latitudeDeg) && Number.isFinite(longitudeDeg) &&
      latitudeDeg >= -90 && latitudeDeg <= 90 && longitudeDeg >= -180 && longitudeDeg <= 180;
  }

  function degreesToRadians(degrees) {
    return degrees * Math.PI / 180;
  }

  function radiansToDegrees(radians) {
    return radians * 180 / Math.PI;
  }

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function normalizeDegrees(value) {
    return ((value % 360) + 360) % 360;
  }

  function normalizeSignedDegrees(value) {
    const normalized = normalizeDegrees(value);
    return normalized > 180 ? normalized - 360 : normalized;
  }

  function assertFiniteInstant(instantUtc) {
    if (!Number.isFinite(instantUtc)) {
      throw new TypeError('instantUtc must be a finite UTC millisecond value');
    }
  }

  function resolveLocation(input) {
    const latitudeDeg = input && input.latitudeDeg;
    const longitudeDeg = input && input.longitudeDeg;
    if (isValidCoordinate(latitudeDeg, longitudeDeg)) {
      return freeze({
        location: { name: typeof input.name === 'string' && input.name ? input.name : '自定义地点', latitudeDeg, longitudeDeg },
        warning: null,
        rejectedInput: null
      });
    }
    return freeze({
      location: { name: BEIJING.name, latitudeDeg: BEIJING.latitudeDeg, longitudeDeg: BEIJING.longitudeDeg },
      warning: { code: 'INVALID_LOCATION', message: '地点经纬度无效，已使用北京。' },
      rejectedInput: input == null ? input : { ...input }
    });
  }

  function greenwichSiderealTimeDeg(instantUtc) {
    assertFiniteInstant(instantUtc);
    const julianDay = instantUtc / MILLISECONDS_PER_DAY + 2440587.5;
    const centuries = (julianDay - J2000_JULIAN_DAY) / 36525;
    return normalizeDegrees(
      280.46061837 + 360.98564736629 * (julianDay - J2000_JULIAN_DAY) +
      0.000387933 * centuries * centuries - centuries * centuries * centuries / 38710000
    );
  }

  function daylightHours(latitudeDeg, solarDeclinationDeg) {
    if (!Number.isFinite(latitudeDeg) || latitudeDeg < -90 || latitudeDeg > 90 ||
      !Number.isFinite(solarDeclinationDeg) || solarDeclinationDeg < -90 || solarDeclinationDeg > 90) {
      throw new TypeError('latitudeDeg and solarDeclinationDeg must be finite degrees in [-90, 90]');
    }
    const latitudeRad = degreesToRadians(latitudeDeg);
    const declinationRad = degreesToRadians(solarDeclinationDeg);
    const thresholdRad = degreesToRadians(SUNRISE_ALTITUDE_DEG);
    const denominator = Math.cos(latitudeRad) * Math.cos(declinationRad);
    const cosineHourAngle = (Math.sin(thresholdRad) - Math.sin(latitudeRad) * Math.sin(declinationRad)) / denominator;
    if (cosineHourAngle >= 1) return 0;
    if (cosineHourAngle <= -1) return 24;
    return 2 * radiansToDegrees(Math.acos(clamp(cosineHourAngle, -1, 1))) / 15;
  }

  function observerState(input) {
    const request = input || {};
    assertFiniteInstant(request.instantUtc);
    const locationResult = resolveLocation({
      name: request.name,
      latitudeDeg: request.latitudeDeg,
      longitudeDeg: request.longitudeDeg
    });
    const sun = request.sun || {};
    if (!Number.isFinite(sun.rightAscensionDeg) || !Number.isFinite(sun.declinationDeg) ||
      sun.declinationDeg < -90 || sun.declinationDeg > 90) {
      throw new TypeError('sun.rightAscensionDeg must be finite and sun.declinationDeg must be finite degrees in [-90, 90]');
    }
    const latitudeDeg = locationResult.location.latitudeDeg;
    const longitudeDeg = locationResult.location.longitudeDeg;
    const latitudeRad = degreesToRadians(latitudeDeg);
    const declinationRad = degreesToRadians(sun.declinationDeg);
    const siderealTimeDeg = greenwichSiderealTimeDeg(request.instantUtc);
    const hourAngleDeg = normalizeSignedDegrees(siderealTimeDeg + longitudeDeg - sun.rightAscensionDeg);
    const hourAngleRad = degreesToRadians(hourAngleDeg);
    const altitudeDeg = radiansToDegrees(Math.asin(clamp(
      Math.sin(latitudeRad) * Math.sin(declinationRad) +
      Math.cos(latitudeRad) * Math.cos(declinationRad) * Math.cos(hourAngleRad),
      -1,
      1
    )));
    // North is 0°, east 90°, south 180°, and west 270°.
    const azimuthDeg = normalizeDegrees(radiansToDegrees(Math.atan2(
      Math.sin(hourAngleRad),
      Math.cos(hourAngleRad) * Math.sin(latitudeRad) - Math.tan(declinationRad) * Math.cos(latitudeRad)
    )) + 180);
    const daylight = daylightHours(latitudeDeg, sun.declinationDeg);
    const hemisphereState = altitudeDeg >= 0 ? 'day' : (altitudeDeg >= -6 ? 'twilight' : 'night');
    return freeze({
      altitudeDeg,
      azimuthDeg,
      daylightHours: daylight,
      nightHours: 24 - daylight,
      subsolarPoint: {
        latitudeDeg: sun.declinationDeg,
        longitudeDeg: normalizeSignedDegrees(sun.rightAscensionDeg - siderealTimeDeg)
      },
      hemisphereState,
      location: locationResult.location,
      warning: locationResult.warning,
      rejectedInput: locationResult.rejectedInput,
      hourAngleDeg
    });
  }

  return freeze({
    PRESET_LOCATIONS,
    resolveLocation,
    greenwichSiderealTimeDeg,
    daylightHours,
    observerState
  });
});
