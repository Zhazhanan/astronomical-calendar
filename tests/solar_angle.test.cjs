const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Astronomy = require('../js/astronomy-core.js');

function assertNear(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${message}: expected ${expected}, got ${actual}`);
}

function vectorMagnitude(vector) {
  return Math.hypot(vector.x, vector.y, vector.z);
}

function vectorSeparationDegrees(first, second) {
  const denominator = vectorMagnitude(first) * vectorMagnitude(second);
  const cosine = (first.x * second.x + first.y * second.y + first.z * second.z) / denominator;
  return Math.acos(Math.max(-1, Math.min(1, cosine))) * 180 / Math.PI;
}

test('normalizes angles into [0, 360)', () => {
  assert.equal(Astronomy.normalizeDegrees(-15), 345);
  assert.equal(Astronomy.normalizeDegrees(375), 15);
});

test('maps cardinal solar longitudes to the four principal terms', () => {
  assert.equal(Astronomy.solarTermAtLongitude(0).name, '春分');
  assert.equal(Astronomy.solarTermAtLongitude(90).name, '夏至');
  assert.equal(Astronomy.solarTermAtLongitude(180).name, '秋分');
  assert.equal(Astronomy.solarTermAtLongitude(270).name, '冬至');
});

test('creates a counter-clockwise ecliptic arc from spring zero', () => {
  const arc = Astronomy.longitudeArcPoints(90, 4, 10);
  assert.equal(arc.length, 5);
  assert.deepEqual(arc[0], { x: 10, y: 0, z: 0 });
  assert.ok(Math.abs(arc[4].x) < 1e-10);
  assert.ok(Math.abs(arc[4].z - 10) < 1e-10);
});

test('maps cardinal solar longitudes onto the tilted display plane', () => {
  const tilt = 23.43929111 * Math.PI / 180;

  const spring = Astronomy.tiltedDisplayPoint(0, 10, tilt);
  assertNear(spring.x, 10, '0° x');
  assertNear(spring.y, 0, '0° y');
  assertNear(spring.z, 0, '0° z');

  const summer = Astronomy.tiltedDisplayPoint(90, 10, tilt);
  assertNear(summer.x, 0, '90° x');
  assertNear(summer.y, 10 * Math.sin(tilt), '90° y');
  assertNear(summer.z, 10 * Math.cos(tilt), '90° z');

  const autumn = Astronomy.tiltedDisplayPoint(180, 10, tilt);
  assertNear(autumn.x, -10, '180° x');
  assertNear(autumn.y, 0, '180° y');
  assertNear(autumn.z, 0, '180° z');
});

test('rotates canonical ecliptic vectors into the shared tilted display frame', () => {
  const tilt = 23.43929111 * Math.PI / 180;
  const canonicalNode = { x: 0, y: 0, z: 10 };
  const displayNode = Astronomy.rotateCanonicalVectorToDisplay(canonicalNode, tilt);
  const eclipticPoint = Astronomy.tiltedDisplayPoint(90, 10, tilt);

  assertNear(displayNode.x, eclipticPoint.x, 'node x follows ecliptic plane');
  assertNear(displayNode.y, eclipticPoint.y, 'node y follows ecliptic plane');
  assertNear(displayNode.z, eclipticPoint.z, 'node z follows ecliptic plane');
});

test('display-frame rotation preserves vector magnitude and angular separation', () => {
  const tilt = 23.43929111 * Math.PI / 180;
  const first = { x: 3, y: -4, z: 12 };
  const second = { x: -5, y: 8, z: 2 };
  const rotatedFirst = Astronomy.rotateCanonicalVectorToDisplay(first, tilt);
  const rotatedSecond = Astronomy.rotateCanonicalVectorToDisplay(second, tilt);

  assertNear(vectorMagnitude(rotatedFirst), vectorMagnitude(first), 'first magnitude');
  assertNear(vectorMagnitude(rotatedSecond), vectorMagnitude(second), 'second magnitude');
  assertNear(
    vectorSeparationDegrees(rotatedFirst, rotatedSecond),
    vectorSeparationDegrees(first, second),
    'angular separation'
  );
});

test('builds a tilted solar-longitude arc whose endpoint follows the sun direction', () => {
  const tilt = 23.43929111 * Math.PI / 180;
  const points = Astronomy.tiltedLongitudeArcPoints(90, 10, tilt, 30);

  assert.equal(points.length, 4);
  assertNear(points[0].x, 10, 'arc start x');
  assertNear(points[0].y, 0, 'arc start y');
  assertNear(points[3].x, 0, 'arc end x');
  assertNear(points[3].y, 10 * Math.sin(tilt), 'arc end y');
  assertNear(points[3].z, 10 * Math.cos(tilt), 'arc end z');
});

test('labels seasonal cardinal longitudes and floor-sector boundaries correctly', () => {
  assert.equal(Astronomy.solarTermSectorAtLongitude(0).name, '春分');
  assert.equal(Astronomy.solarTermSectorAtLongitude(90).name, '夏至');
  assert.equal(Astronomy.solarTermSectorAtLongitude(180).name, '秋分');
  assert.equal(Astronomy.solarTermSectorAtLongitude(270).name, '冬至');
  assert.equal(Astronomy.solarTermSectorAtLongitude(315).name, '立春');
  assert.equal(Astronomy.solarTermSectorAtLongitude(14.999).name, '春分');
  assert.equal(Astronomy.solarTermSectorAtLongitude(15).name, '清明');
  assert.equal(Astronomy.solarTermSectorAtLongitude(359.9).name, '惊蛰');
});

test('labels solar-angle values as teaching approximations only', () => {
  const htmlPath = path.join(__dirname, '..', 'tiangan_dizhi_offline.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  assert.match(html, /教学级近似/);
  assert.match(html, /仅用于可视化与教育展示/);
  assert.match(html, /不可用于导航或日食、月食预测/);
  assert.doesNotMatch(html, /精确天文算法|精确位置/);
});

test('solar terms are immutable public constants', () => {
  assert.equal(Object.isFrozen(Astronomy.SOLAR_TERMS), true);
  assert.throws(() => Astronomy.SOLAR_TERMS.push('伪造节气'), TypeError);
  assert.equal(Astronomy.SOLAR_TERMS[0], '春分');
});
