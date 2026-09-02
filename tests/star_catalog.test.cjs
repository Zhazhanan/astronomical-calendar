const test = require('node:test');
const assert = require('node:assert/strict');
const StarCatalog = require('../js/star-catalog.js');

test('parses valid RA/Dec rows and skips invalid data', () => {
  const csv = 'name,ra_deg,dec_deg,magnitude\r\n"Sirius, A",101.287,-16.716,-1.46\r\nBad,400,95,x\r\n\r\n';
  const result = StarCatalog.parseCsv(csv, { maxRows: 1000 });
  assert.equal(result.acceptedRows, 1);
  assert.equal(result.skippedRows, 1);
  assert.equal(result.fatalErrors.length, 0);
  assert.equal(result.stars[0].name, 'Sirius, A');
});

test('rejects excessive input before parsing', () => {
  assert.throws(() => StarCatalog.validateFile({ size: 2_000_001 }, { maxBytes: 2_000_000 }), /2 MB/);
});

test('requires RA and Dec headers and enforces numeric bounds', () => {
  const missing = StarCatalog.parseCsv('name,ra_deg\nSirius,1');
  assert.match(missing.fatalErrors[0], /RA.*Dec/);
  const bounds = StarCatalog.parseCsv('name,ra,dec\nA,24,0\nB,1,-91', { raUnit: 'hours' });
  assert.equal(bounds.acceptedRows, 0);
  assert.equal(bounds.skippedRows, 2);
});

test('converts hour RA to a normalized unit vector', () => {
  const parsed = StarCatalog.parseCsv('name,ra,dec\nEast,6,0', { raUnit: 'hours' });
  assert.equal(parsed.stars.length, 1);
  assert.equal(parsed.stars[0].raDeg, 90);
  const vector = StarCatalog.toUnitVector(90, 0);
  assert.ok(Math.abs(vector.x) < 1e-12);
  assert.ok(Math.abs(vector.y - 1) < 1e-12);
  assert.ok(Math.abs(Math.hypot(vector.x, vector.y, vector.z) - 1) < 1e-12);
});

test('stops safely at the data row cap', () => {
  const csv = 'name,ra_deg,dec_deg\n' + Array.from({ length: 3 }, (_, i) => `S${i},${i},0`).join('\n');
  const result = StarCatalog.parseCsv(csv, { maxRows: 2 });
  assert.equal(result.acceptedRows, 2);
  assert.match(result.fatalErrors[0], /2/);
});
