;(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) {
    root.AstroEducation = root.AstroEducation || {};
    root.AstroEducation.Astronomy = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SOLAR_TERMS = Object.freeze([
    '春分', '清明', '谷雨', '立夏', '小满', '芒种',
    '夏至', '小暑', '大暑', '立秋', '处暑', '白露',
    '秋分', '寒露', '霜降', '立冬', '小雪', '大雪',
    '冬至', '小寒', '大寒', '立春', '雨水', '惊蛰'
  ]);
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

  function angularDistanceDegrees(firstDeg, secondDeg) {
    const difference = Math.abs(normalizeDegrees(firstDeg - secondDeg));
    return Math.min(difference, 360 - difference);
  }

  function vectorMagnitude(vector) {
    return Math.hypot(vector.x, vector.y, vector.z);
  }

  function angularSeparationDegrees(firstVector, secondVector) {
    const denominator = vectorMagnitude(firstVector) * vectorMagnitude(secondVector);
    const cosine = (firstVector.x * secondVector.x + firstVector.y * secondVector.y +
      firstVector.z * secondVector.z) / denominator;
    return radiansToDegrees(Math.acos(Math.max(-1, Math.min(1, cosine))));
  }

  function illuminatedFraction(elongationDeg) {
    return (1 - Math.cos(degreesToRadians(normalizeDegrees(elongationDeg)))) / 2;
  }

  function phaseName(elongationDeg) {
    const elongation = normalizeDegrees(elongationDeg);
    if (angularDistanceDegrees(elongation, 0) <= 8) return '朔';
    if (angularDistanceDegrees(elongation, 90) <= 8) return '上弦附近';
    if (angularDistanceDegrees(elongation, 180) <= 8) return '望';
    if (angularDistanceDegrees(elongation, 270) <= 8) return '下弦附近';
    if (elongation < 90) return '娥眉月';
    if (elongation < 180) return '盈凸月';
    if (elongation < 270) return '亏凸月';
    return '残月';
  }

  function eclipseSeasonHint(elongationDeg, nodeDistanceDeg) {
    const isSyzygy = angularDistanceDegrees(elongationDeg, 0) <= 12 ||
      angularDistanceDegrees(elongationDeg, 180) <= 12;
    const possible = isSyzygy && Math.abs(nodeDistanceDeg) <= 15;
    return {
      possible,
      message: possible
        ? '朔望时月球靠近交点，可能进入食季；这是教学提示，不能预测日食或月食。'
        : '当前不满足食季提示条件。'
    };
  }

  function moonGeocentricState(instantUtcMs, sunState) {
    assertFiniteInstant(instantUtcMs);
    const lunarSemiMajorAxisKm = 384400;
    const lunarEccentricity = 0.0549;
    const lunarInclinationDeg = 5.145;
    const lunarSiderealDays = 27.321661;
    const lunarNodalRegressionYears = 18.6;
    const daysSinceEpoch = julianDay(instantUtcMs) - 2451543.5;
    const ascendingNodeLongitudeDeg = normalizeDegrees(125.1228 - 0.0529538083 * daysSinceEpoch);
    const argumentOfPerigeeDeg = normalizeDegrees(318.0634 + 0.1643573223 * daysSinceEpoch);
    const meanAnomalyDeg = normalizeDegrees(115.3654 + 13.0649929509 * daysSinceEpoch);
    const eccentricAnomalyRad = solveKepler(degreesToRadians(meanAnomalyDeg), lunarEccentricity);
    const trueAnomalyRad = 2 * Math.atan2(
      Math.sqrt(1 + lunarEccentricity) * Math.sin(eccentricAnomalyRad / 2),
      Math.sqrt(1 - lunarEccentricity) * Math.cos(eccentricAnomalyRad / 2)
    );
    const distanceKm = lunarSemiMajorAxisKm * (1 - lunarEccentricity * Math.cos(eccentricAnomalyRad));
    const nodeRad = degreesToRadians(ascendingNodeLongitudeDeg);
    const inclinationRad = degreesToRadians(lunarInclinationDeg);
    const argumentLatitudeRad = degreesToRadians(argumentOfPerigeeDeg) + trueAnomalyRad;
    const vectorKm = {
      x: distanceKm * (Math.cos(nodeRad) * Math.cos(argumentLatitudeRad) -
        Math.sin(nodeRad) * Math.sin(argumentLatitudeRad) * Math.cos(inclinationRad)),
      y: distanceKm * Math.sin(argumentLatitudeRad) * Math.sin(inclinationRad),
      z: distanceKm * (Math.sin(nodeRad) * Math.cos(argumentLatitudeRad) +
        Math.cos(nodeRad) * Math.sin(argumentLatitudeRad) * Math.cos(inclinationRad))
    };
    const longitudeDeg = normalizeDegrees(radiansToDegrees(Math.atan2(vectorKm.z, vectorKm.x)));
    const latitudeDeg = radiansToDegrees(Math.asin(vectorKm.y / distanceKm));
    const solarState = sunState || solarGeocentricState(instantUtcMs);
    const longitudeDirectionDeg = normalizeDegrees(longitudeDeg - solarState.longitudeDeg);
    const sunMoonSeparationDeg = angularSeparationDegrees(vectorKm, solarState.vectorAu);
    const elongationDeg = longitudeDirectionDeg <= 180
      ? sunMoonSeparationDeg
      : 360 - sunMoonSeparationDeg;
    const descendingNodeLongitudeDeg = normalizeDegrees(ascendingNodeLongitudeDeg + 180);
    const ascendingNodeDistanceDeg = angularSeparationDegrees(vectorKm, {
      x: Math.cos(nodeRad), y: 0, z: Math.sin(nodeRad)
    });
    const descendingNodeDistanceDeg = angularSeparationDegrees(vectorKm, {
      x: -Math.cos(nodeRad), y: 0, z: -Math.sin(nodeRad)
    });
    const isAscendingNodeNearest = ascendingNodeDistanceDeg <= descendingNodeDistanceDeg;
    const nodeDistanceDeg = Math.min(ascendingNodeDistanceDeg, descendingNodeDistanceDeg);
    const perigeeDistanceKm = lunarSemiMajorAxisKm * (1 - lunarEccentricity);
    const apogeeDistanceKm = lunarSemiMajorAxisKm * (1 + lunarEccentricity);

    return {
      vectorKm,
      longitudeDeg,
      latitudeDeg,
      distanceKm,
      elongationDeg,
      illumination: illuminatedFraction(elongationDeg),
      waxing: longitudeDirectionDeg > 0 && longitudeDirectionDeg < 180,
      phaseName: phaseName(elongationDeg),
      ascendingNodeLongitudeDeg,
      descendingNodeLongitudeDeg,
      ascendingNodeLabel: '升交点',
      descendingNodeLabel: '降交点',
      nearestNodeLabel: isAscendingNodeNearest ? '升交点' : '降交点',
      nodeDistanceDeg,
      perigeeDistanceKm,
      apogeeDistanceKm,
      orbit: {
        inclinationDeg: lunarInclinationDeg,
        eccentricity: lunarEccentricity,
        siderealDays: lunarSiderealDays,
        nodalRegressionYears: lunarNodalRegressionYears
      }
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

  function rotateCanonicalVectorToDisplay(vector, tiltRad) {
    const cosine = Math.cos(tiltRad);
    const sine = Math.sin(tiltRad);
    return {
      x: vector.x,
      y: vector.y * cosine + vector.z * sine,
      z: vector.z * cosine - vector.y * sine
    };
  }

  function tiltedDisplayPoint(longitudeDeg, radius, tiltRad) {
    const longitude = normalizeDegrees(longitudeDeg) * Math.PI / 180;
    return rotateCanonicalVectorToDisplay({
      x: Math.cos(longitude) * radius,
      y: 0,
      z: Math.sin(longitude) * radius
    }, tiltRad);
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
    illuminatedFraction,
    phaseName,
    eclipseSeasonHint,
    moonGeocentricState,
    eclipticToEquatorial,
    solarTermAtLongitude,
    solarTermSectorAtLongitude,
    longitudeArcPoints,
    rotateCanonicalVectorToDisplay,
    tiltedDisplayPoint,
    tiltedLongitudeArcPoints
  });
});
