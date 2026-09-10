const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadGanzhiCore(options = {}) {
  const htmlPath = path.join(__dirname, '..', 'tiangan_dizhi_cycle.html');
  const html = fs.readFileSync(htmlPath, 'utf8');
  const match = html.match(/<script id="ganzhi-core">([\s\S]*?)<\/script>/);

  assert.ok(match, '页面应包含可独立测试的 ganzhi-core 脚本');

  const sandbox = {};
  vm.createContext(sandbox);
  if (options.withLunar) {
    const lunarPath = path.join(__dirname, '..', 'vendor', 'lunar', 'lunar.js');
    vm.runInContext(fs.readFileSync(lunarPath, 'utf8'), sandbox);
  }
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

test('queries Gregorian dates for the solar-term month pillar and day pillar', () => {
  const { getDateGanzhi } = loadGanzhiCore({ withLunar: true });

  assert.deepEqual(
    JSON.parse(JSON.stringify(getDateGanzhi(2026, 9, 4))),
    {
      year: 2026,
      month: 9,
      day: 4,
      yearPillar: '丙午',
      monthPillar: '丙申',
      dayPillar: '辛巳',
    },
  );
  assert.equal(getDateGanzhi(2024, 2, 10).monthPillar, '丙寅');
  assert.throws(() => getDateGanzhi(2024, 2, 30), /公历日期无效/);
});

test('queries exact year, month, day and time pillars for a local date-time', () => {
  const { getDateTimeGanzhi } = loadGanzhiCore({ withLunar: true });

  assert.deepEqual(
    JSON.parse(JSON.stringify(getDateTimeGanzhi(2026, 9, 29, 12, 0))),
    {
      year: 2026,
      month: 9,
      day: 29,
      hour: 12,
      minute: 0,
      yearPillar: '丙午',
      monthPillar: '丁酉',
      dayPillar: '丙午',
      timePillar: '甲午',
    },
  );
  assert.equal(getDateTimeGanzhi(2026, 9, 29, 23, 30).dayPillar, '丁未');
  assert.throws(() => getDateTimeGanzhi(2026, 9, 29, 24, 0), /00:00 至 23:59/);
});

test('renders the selected time in the visible date-time field', () => {
  const htmlPath = path.join(__dirname, '..', 'tiangan_dizhi_cycle.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  assert.match(html, /function formatDateTimeValue\(year, month, day, hour, minute\)/);
  assert.match(html, /dateInput\.value = formatDateTimeValue\(parts\.year, parts\.month, parts\.day, parts\.hour, parts\.minute\)/);
});

test('uses a searchable, page-native IANA timezone picker and no time-picker completion button', () => {
  const htmlPath = path.join(__dirname, '..', 'tiangan_dizhi_cycle.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  assert.match(html, /id="timezone-panel" class="timezone-panel"/);
  assert.match(html, /id="timezone-search"/);
  assert.match(html, /Intl\.supportedValuesOf\('timeZone'\)/);
  assert.match(html, /new Intl\.DateTimeFormat\('zh-CN'/);
  assert.match(html, /timeZoneName: 'shortGeneric'/);
  assert.match(html, /function renderTimeZoneOptions\(filter\)/);
  assert.doesNotMatch(html, /calendar-complete|>完成</);
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

function loadTimeControls(extraFunctions = []) {
  const html = fs.readFileSync(path.join(__dirname, '..', 'tiangan_dizhi_cycle.html'), 'utf8');
  const sandbox = {
    dateInput: { value: '2026-09-06 08:15' },
    timeInput: { value: '08:15' },
    timePickerHour: { value: '8' },
    timePickerMinute: { value: '15' },
    querySelectedDate() {},
  };
  vm.createContext(sandbox);
  for (const name of ['formatDateValue', 'formatTimeValue', 'formatDateTimeValue', 'readDateInput', 'readTimeInput', 'syncTimePicker', 'updateSelectedTime', ...extraFunctions]) {
    const match = html.match(new RegExp('    function ' + name + '\\([^]*?\\n    \\}'));
    assert.ok(match, name);
    vm.runInContext(match[0], sandbox);
  }
  return sandbox;
}

test('typed time is used by the popup and date query', () => {
  const controls = loadTimeControls();
  controls.dateInput.value = '2026-09-06 23:47';
  controls.syncTimePicker();
  assert.equal(controls.timePickerHour.value, '23');
  assert.equal(controls.timePickerMinute.value, '47');
  assert.equal(controls.readTimeInput().hour, 23);
  assert.equal(controls.readTimeInput().minute, 47);
  controls.timePickerMinute.value = '48';
  controls.updateSelectedTime();
  assert.equal(controls.dateInput.value, '2026-09-06 23:48');
});

test('invalid typed times do not silently use the previous hidden time', () => {
  const controls = loadTimeControls();
  for (const value of ['24:00', '12:60', '12:']) {
    controls.dateInput.value = '2026-09-06 ' + value;
    assert.equal(controls.readTimeInput(), null, value);
  }
});

function loadYearControls() {
  const controls = loadTimeControls(['daysInMonth', 'setDateTimeInputs', 'setYear', 'querySelectedDate']);
  Object.assign(controls, {
    core: loadGanzhiCore({ withLunar: true }),
    state: { year: 2026 },
    yearInput: { value: '1900' },
    inputHint: { textContent: '' },
    dateHint: { textContent: '' },
    dateResult: { hidden: false },
    calendarView: null,
    datePickerPanel: { hidden: true },
    render() {},
    renderCalendar() {},
    stopPlayback() {},
    renderDateResult(date, time) { controls.result = { ...date, ...time }; },
  });
  return controls;
}

test('year selection updates the date while preserving month, day and time', () => {
  const controls = loadYearControls();
  controls.setYear(1900);
  assert.equal(controls.dateInput.value, '1900-09-06 08:15');
  assert.equal(controls.result.year, 1900);
  controls.setYear(1901);
  assert.equal(controls.yearInput.value, '1901');
});

test('date queries update a stale year field without changing the selected date', () => {
  const controls = loadYearControls();
  controls.querySelectedDate();
  assert.equal(controls.yearInput.value, '2026');
  assert.equal(controls.dateInput.value, '2026-09-06 08:15');
});

test('changing a leap-day year clamps to the last day of February', () => {
  const controls = loadYearControls();
  controls.dateInput.value = '2024-02-29 23:47';
  controls.setYear(1900);
  assert.equal(controls.dateInput.value, '1900-02-28 23:47');
});

test('early AD years remain parseable after synchronization', () => {
  const controls = loadYearControls();
  controls.setYear(4);
  assert.equal(controls.dateInput.value, '0004-09-06 08:15');
  assert.equal(controls.readDateInput().year, 4);
});

test('an open calendar follows the date year and rejected years leave inputs unchanged', () => {
  const controls = loadYearControls();
  controls.datePickerPanel.hidden = false;
  controls.setYear(1900);
  assert.equal(controls.calendarView.year, 1900);
  controls.setYear(0);
  assert.equal(controls.yearInput.value, '1900');
  assert.equal(controls.dateInput.value, '1900-09-06 08:15');
});
