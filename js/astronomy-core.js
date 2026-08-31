;(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) {
    root.AstroEducation = root.AstroEducation || {};
    root.AstroEducation.Astronomy = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SOLAR_TERMS = [
    '春分', '清明', '谷雨', '立夏', '小满', '芒种',
    '夏至', '小暑', '大暑', '立秋', '处暑', '白露',
    '秋分', '寒露', '霜降', '立冬', '小雪', '大雪',
    '冬至', '小寒', '大寒', '立春', '雨水', '惊蛰'
  ];
  const J2000_JULIAN_DAY = 2451545;
  const MILLISECONDS_PER_DAY = 86400000;
  const TEACHING_OBLIQUITY_DEG = 23.43928;

  function degreesToRadians(degrees) {
    return degrees * Math.PI / 180;
  }

  function radiansToDegrees(radians) {
    return radians * 180 / Math.PI;
  }

  function assertFiniteInstant(instantUtcMs) {
    if (!Number.isFinite(instantUtcMs)) {
      throw new TypeError('instantUtcMs must be a finite UTC millisecond value');
    }
  }

  function normalizeDegrees(value) {
    return ((value % 360) + 360) % 360;
  }

  function julianDay(instantUtcMs) {
    assertFiniteInstant(instantUtcMs);
    return instantUtcMs / MILLISECONDS_PER_DAY + 2440587.5;
  }

  function centuriesSinceJ2000(instantUtcMs) {
    assertFiniteInstant(instantUtcMs);
    return (julianDay(instantUtcMs) - J2000_JULIAN_DAY) / 36525;
  }

  function solveKepler(meanAnomalyRad, eccentricity) {
    let eccentricAnomaly = meanAnomalyRad;
    for (let iteration = 0; iteration < 12; iteration += 1) {
      const correction = (eccentricAnomaly - eccentricity * Math.sin(eccentricAnomaly) - meanAnomalyRad) /
        (1 - eccentricity * Math.cos(eccentricAnomaly));
      eccentricAnomaly -= correction;
      if (Math.abs(correction) < 1e-12) break;
    }
    return eccentricAnomaly;
  }

  function earthHeliocentricState(instantUtcMs) {
    assertFiniteInstant(instantUtcMs);
    const centuries = centuriesSinceJ2000(instantUtcMs);
    const semiMajorAxisAu = 1.00000261 + 0.00000562 * centuries;
    const eccentricity = 0.01671123 - 0.00004392 * centuries;
    const inclinationRad = degreesToRadians(-0.00001531 - 0.01294668 * centuries);
    const meanLongitudeDeg = 100.46457166 + 35999.37244981 * centuries;
    const perihelionLongitudeDeg = 102.93768193 + 0.32327364 * centuries;
    const meanAnomalyDeg = normalizeDegrees(meanLongitudeDeg - perihelionLongitudeDeg);
    const eccentricAnomalyRad = solveKepler(degreesToRadians(meanAnomalyDeg), eccentricity);
    const trueAnomalyRad = 2 * Math.atan2(
      Math.sqrt(1 + eccentricity) * Math.sin(eccentricAnomalyRad / 2),
      Math.sqrt(1 - eccentricity) * Math.cos(eccentricAnomalyRad / 2)
    );
    const distanceAu = semiMajorAxisAu * (1 - eccentricity * Math.cos(eccentricAnomalyRad));
    const trueLongitudeDeg = normalizeDegrees(perihelionLongitudeDeg + radiansToDegrees(trueAnomalyRad));
    const trueLongitudeRad = degreesToRadians(trueLongitudeDeg);
    const obliquityRad = degreesToRadians(TEACHING_OBLIQUITY_DEG);

    return {
      positionAu: {
        x: distanceAu * Math.cos(trueLongitudeRad),
        y: distanceAu * Math.sin(trueLongitudeRad) * Math.sin(inclinationRad),
        z: distanceAu * Math.sin(trueLongitudeRad) * Math.cos(inclinationRad)
      },
      distanceAu,
      trueLongitudeDeg,
      meanAnomalyDeg,
      obliquityDeg: TEACHING_OBLIQUITY_DEG,
      axisUnit: {
        x: 0,
        y: Math.cos(obliquityRad),
        z: Math.sin(obliquityRad)
      },
      perihelionLongitudeDeg: normalizeDegrees(perihelionLongitudeDeg),
      teachingAccuracy: true
    };
  }

  function eclipticToEquatorial(longitudeDeg, latitudeDeg, obliquityDeg) {
    const longitudeRad = degreesToRadians(longitudeDeg);
    const latitudeRad = degreesToRadians(latitudeDeg);
    const obliquityRad = degreesToRadians(obliquityDeg);
    const rightAscensionDeg = normalizeDegrees(radiansToDegrees(Math.atan2(
      Math.sin(longitudeRad) * Math.cos(obliquityRad) - Math.tan(latitudeRad) * Math.sin(obliquityRad),
      Math.cos(longitudeRad)
    )));
    const declinationDeg = radiansToDegrees(Math.asin(
      Math.sin(latitudeRad) * Math.cos(obliquityRad) +
      Math.cos(latitudeRad) * Math.sin(obliquityRad) * Math.sin(longitudeRad)
    ));
    return { rightAscensionDeg, declinationDeg };
  }

  function solarGeocentricState(instantUtcMs) {
    assertFiniteInstant(instantUtcMs);
    const earth = earthHeliocentricState(instantUtcMs);
    const vectorAu = {
      x: -earth.positionAu.x,
      y: -earth.positionAu.y,
      z: -earth.positionAu.z
    };
    const longitudeDeg = normalizeDegrees(radiansToDegrees(Math.atan2(vectorAu.z, vectorAu.x)));
    const equatorial = eclipticToEquatorial(longitudeDeg, 0, earth.obliquityDeg);
    return {
      vectorAu,
      distanceAu: earth.distanceAu,
      longitudeDeg,
      latitudeDeg: 0,
      rightAscensionDeg: equatorial.rightAscensionDeg,
      declinationDeg: equatorial.declinationDeg
    };
  }

  function solarTermAtLongitude(longitudeDeg) {
    const index = Math.round(normalizeDegrees(longitudeDeg) / 15) % 24;
    return { index, name: SOLAR_TERMS[index], longitudeDeg: index * 15 };
  }

  function solarTermSectorAtLongitude(longitudeDeg) {
    const index = Math.floor(normalizeDegrees(longitudeDeg) / 15) % 24;
    return { index, name: SOLAR_TERMS[index], longitudeDeg: index * 15 };
  }

  function longitudeArcPoints(longitudeDeg, segments, radius) {
    const count = Math.max(1, Math.floor(segments));
    const end = normalizeDegrees(longitudeDeg) * Math.PI / 180;
    const points = [];
    for (let index = 0; index <= count; index += 1) {
      const angle = end * index / count;
      points.push({ x: radius * Math.cos(angle), y: 0, z: radius * Math.sin(angle) });
    }
    return points;
  }

  function tiltedDisplayPoint(longitudeDeg, radius, tiltRad) {
    const longitude = normalizeDegrees(longitudeDeg) * Math.PI / 180;
    return {
      x: Math.cos(longitude) * radius,
      y: Math.sin(longitude) * Math.sin(tiltRad) * radius,
      z: Math.sin(longitude) * Math.cos(tiltRad) * radius
    };
  }

  function tiltedLongitudeArcPoints(longitudeDeg, radius, tiltRad, stepDeg) {
    const longitude = normalizeDegrees(longitudeDeg);
    const step = Math.max(0.5, Math.abs(stepDeg || 3));
    const segmentCount = Math.max(1, Math.ceil(longitude / step));
    const points = [];
    for (let index = 0; index <= segmentCount; index += 1) {
      points.push(tiltedDisplayPoint(longitude * index / segmentCount, radius, tiltRad));
    }
    return points;
  }

  return Object.freeze({
    SOLAR_TERMS,
    normalizeDegrees,
    julianDay,
    centuriesSinceJ2000,
    solveKepler,
    earthHeliocentricState,
    solarGeocentricState,
    eclipticToEquatorial,
    solarTermAtLongitude,
    solarTermSectorAtLongitude,
    longitudeArcPoints,
    tiltedDisplayPoint,
    tiltedLongitudeArcPoints
  });
});
