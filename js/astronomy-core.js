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

  function normalizeDegrees(value) {
    return ((value % 360) + 360) % 360;
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
    solarTermAtLongitude,
    solarTermSectorAtLongitude,
    longitudeArcPoints,
    tiltedDisplayPoint,
    tiltedLongitudeArcPoints
  });
});
