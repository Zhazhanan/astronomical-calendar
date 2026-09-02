/* Bounded, local-only CSV parsing for optional teaching star catalogs. */
;(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) { root.AstroEducation = root.AstroEducation || {}; root.AstroEducation.StarCatalog = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const DEFAULT_MAX_BYTES = 2_000_000;
  const DEFAULT_MAX_ROWS = 10_000;

  function validateFile(file, options) {
    const maxBytes = options && Number.isFinite(options.maxBytes) ? options.maxBytes : DEFAULT_MAX_BYTES;
    if (!file || !Number.isFinite(file.size)) throw new TypeError('请选择可读取的本地 CSV 文件。');
    if (file.size > maxBytes) throw new RangeError(`文件超过 ${(maxBytes / 1_000_000).toFixed(maxBytes % 1_000_000 ? 1 : 0)} MB 限制。`);
    return true;
  }

  function csvRows(text) {
    const rows = [], row = [];
    let field = '', quoted = false, atStart = true;
    const source = String(text == null ? '' : text);
    for (let index = 0; index < source.length; index += 1) {
      const char = source[index];
      if (quoted) {
        if (char === '"') { if (source[index + 1] === '"') { field += '"'; index += 1; } else quoted = false; }
        else field += char;
      } else if (char === '"' && atStart) { quoted = true; atStart = false; }
      else if (char === ',') { row.push(field); field = ''; atStart = true; }
      else if (char === '\n' || char === '\r') {
        if (char === '\r' && source[index + 1] === '\n') index += 1;
        row.push(field); rows.push(row.splice(0)); field = ''; atStart = true;
      } else { field += char; atStart = false; }
    }
    if (quoted) throw new SyntaxError('CSV 中存在未闭合的引号。');
    if (field.length || row.length) { row.push(field); rows.push(row); }
    return rows;
  }
  function isBlank(row) { return !row || row.every(function (cell) { return String(cell).trim() === ''; }); }
  function value(row, index) { return index < 0 ? '' : String(row[index] == null ? '' : row[index]).trim(); }
  function headerIndex(headers, name) { return headers.indexOf(name); }
  function number(value) { const result = Number(value); return String(value).trim() === '' || !Number.isFinite(result) ? null : result; }
  function toUnitVector(raDeg, decDeg) {
    if (!Number.isFinite(raDeg) || !Number.isFinite(decDeg)) throw new TypeError('RA 和 Dec 必须是有限数值。');
    const ra = raDeg * Math.PI / 180, dec = decDeg * Math.PI / 180, cosDec = Math.cos(dec);
    return Object.freeze({ x: cosDec * Math.cos(ra), y: cosDec * Math.sin(ra), z: Math.sin(dec) });
  }
  function parseCsv(text, options) {
    const config = options || {}, maxRows = Number.isFinite(config.maxRows) ? Math.min(DEFAULT_MAX_ROWS, Math.max(0, Math.floor(config.maxRows))) : DEFAULT_MAX_ROWS;
    const result = { stars: [], acceptedRows: 0, skippedRows: 0, fatalErrors: [] };
    let rows;
    try { rows = csvRows(text); } catch (error) { result.fatalErrors.push(error.message); return Object.freeze(result); }
    const first = rows.findIndex(function (row) { return !isBlank(row); });
    if (first < 0) { result.fatalErrors.push('CSV 缺少表头。'); return Object.freeze(result); }
    const headers = rows[first].map(function (header) { return String(header).trim().toLowerCase(); });
    const raDegIndex = headerIndex(headers, 'ra_deg'), decDegIndex = headerIndex(headers, 'dec_deg');
    const genericRaIndex = headerIndex(headers, 'ra'), genericDecIndex = headerIndex(headers, 'dec');
    const degreeHeaders = raDegIndex >= 0 || decDegIndex >= 0;
    const genericHeaders = genericRaIndex >= 0 || genericDecIndex >= 0;
    if ((degreeHeaders && (raDegIndex < 0 || decDegIndex < 0)) || (genericHeaders && (genericRaIndex < 0 || genericDecIndex < 0)) || (!degreeHeaders && !genericHeaders)) {
      result.fatalErrors.push('CSV 必须同时包含 RA 和 Dec 表头（ra_deg/dec_deg 或 ra/dec）。'); return Object.freeze(result);
    }
    const raUnit = degreeHeaders ? 'degrees' : config.raUnit;
    if (raUnit !== 'degrees' && raUnit !== 'hours') { result.fatalErrors.push('ra/dec 表头需要明确选择 RA 单位（degrees 或 hours）。'); return Object.freeze(result); }
    const raIndex = degreeHeaders ? raDegIndex : genericRaIndex, decIndex = degreeHeaders ? decDegIndex : genericDecIndex;
    const nameIndex = headerIndex(headers, 'name'), magnitudeIndex = headerIndex(headers, 'magnitude');
    let dataRows = 0;
    for (let index = first + 1; index < rows.length; index += 1) {
      const row = rows[index]; if (isBlank(row)) continue;
      dataRows += 1;
      if (dataRows > maxRows) { result.fatalErrors.push(`CSV 数据行超过 ${maxRows} 条限制。`); break; }
      const rawRa = number(value(row, raIndex)), decDeg = number(value(row, decIndex));
      const raDeg = rawRa == null ? null : (raUnit === 'hours' ? rawRa * 15 : rawRa);
      const maxRa = raUnit === 'hours' ? 24 : 360;
      const magnitudeText = value(row, magnitudeIndex), magnitude = magnitudeIndex < 0 || magnitudeText === '' ? null : number(magnitudeText);
      if (rawRa == null || decDeg == null || rawRa < 0 || rawRa >= maxRa || decDeg < -90 || decDeg > 90 || (magnitudeText !== '' && magnitude == null)) { result.skippedRows += 1; continue; }
      const star = Object.freeze({ name: value(row, nameIndex) || `未命名星体 ${dataRows}`, raDeg, decDeg, magnitude, vector: toUnitVector(raDeg, decDeg) });
      result.stars.push(star); result.acceptedRows += 1;
    }
    return Object.freeze(result);
  }
  return Object.freeze({ DEFAULT_MAX_BYTES, DEFAULT_MAX_ROWS, validateFile, parseCsv, toUnitVector });
});
