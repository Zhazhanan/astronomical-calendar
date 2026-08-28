const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadGanzhiCore() {
  const htmlPath = path.join(__dirname, '..', 'tiangan_dizhi_cycle.html');
  const html = fs.readFileSync(htmlPath, 'utf8');
  const match = html.match(/<script id="ganzhi-core">([\s\S]*?)<\/script>/);

  assert.ok(match, '页面应包含可独立测试的 ganzhi-core 脚本');

  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(match[1], sandbox);
  return sandbox.GanzhiCore;
}

test('uses AD 4 and every following 60th year as 甲子', () => {
  const { getGanzhi } = loadGanzhiCore();

  assert.equal(getGanzhi(4).name, '甲子');
  assert.equal(getGanzhi(1984).name, '甲子');
  assert.equal(getGanzhi(2044).name, '甲子');
});

test('returns hand-checked stem, branch, zodiac and element details', () => {
  const { getGanzhi } = loadGanzhiCore();

  assert.deepEqual(
    JSON.parse(JSON.stringify(getGanzhi(2024))),
    {
      year: 2024,
      cycleIndex: 40,
      stemIndex: 0,
      branchIndex: 4,
      stem: '甲',
      branch: '辰',
      name: '甲辰',
      zodiac: '龙',
      element: '木',
      polarity: '阳',
    },
  );
  assert.equal(getGanzhi(2025).name, '乙巳');
});

test('rejects year zero and skips it when stepping across eras', () => {
  const { getGanzhi, stepYear } = loadGanzhiCore();

  assert.throws(() => getGanzhi(0), /不存在公元 0 年/);
  assert.equal(stepYear(-1, 1), 1);
  assert.equal(stepYear(1, -1), -1);
  assert.equal(getGanzhi(-1).name, '庚申');
});

test('builds a continuous timeline without year zero', () => {
  const { buildTimeline } = loadGanzhiCore();

  assert.deepEqual(
    JSON.parse(JSON.stringify(buildTimeline(1, 2).map((item) => item.year))),
    [-2, -1, 1, 2, 3],
  );
});

test('rejects years that cannot be represented precisely', () => {
  const { getGanzhi, stepYear } = loadGanzhiCore();

  assert.throws(() => getGanzhi(Number.MAX_SAFE_INTEGER + 1), /安全范围/);
  assert.throws(() => stepYear(Number.MAX_SAFE_INTEGER, 1), /安全范围/);
});

test('builds one complete 60-year cycle around the selected year', () => {
  const { buildCycleTimeline } = loadGanzhiCore();
  const items = buildCycleTimeline(2026);

  assert.equal(items.length, 60);
  assert.equal(items[0].year, 1996);
  assert.equal(items[30].year, 2026);
  assert.equal(items[59].year, 2055);
  assert.equal(new Set(items.map((item) => item.name)).size, 60);
});

test('the complete cycle skips year zero at the BCE and CE boundary', () => {
  const { buildCycleTimeline } = loadGanzhiCore();
  const years = buildCycleTimeline(1).map((item) => item.year);

  assert.equal(years.length, 60);
  assert.equal(years[0], -30);
  assert.equal(years[30], 1);
  assert.equal(years[59], 30);
  assert.equal(years.includes(0), false);
});

test('only accepts center years that leave room for the complete cycle', () => {
  const { isTimelineCenterYear } = loadGanzhiCore();

  assert.equal(isTimelineCenterYear(Number.MIN_SAFE_INTEGER + 29), false);
  assert.equal(isTimelineCenterYear(Number.MIN_SAFE_INTEGER + 30), true);
  assert.equal(isTimelineCenterYear(Number.MAX_SAFE_INTEGER - 29), true);
  assert.equal(isTimelineCenterYear(Number.MAX_SAFE_INTEGER - 28), false);
  assert.equal(isTimelineCenterYear(0), false);
});

test('safely rejects slider moves beyond the complete-cycle range', () => {
  const { getTimelineCenterCandidate } = loadGanzhiCore();
  const lowestCenter = Number.MIN_SAFE_INTEGER + 30;
  const highestCenter = Number.MAX_SAFE_INTEGER - 29;

  assert.equal(getTimelineCenterCandidate(2026, 1), 2027);
  assert.equal(getTimelineCenterCandidate(lowestCenter, -30), null);
  assert.equal(getTimelineCenterCandidate(highestCenter, 30), null);
  assert.equal(getTimelineCenterCandidate(highestCenter, 1), null);
});
