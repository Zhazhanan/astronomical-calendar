const test = require('node:test');
const assert = require('node:assert/strict');
const lunarApi = require('../vendor/lunar/lunar.js');

test('vendored lunar library converts the documented example', () => {
  const lunar = lunarApi.Solar.fromYmd(1986, 5, 29).getLunar();
  assert.equal(lunar.getYearInGanZhi(), '丙寅');
  assert.equal(lunar.getMonthInChinese(), '四');
  assert.equal(lunar.getDayInChinese(), '廿一');
});

test('negative lunar month identifies a leap month', () => {
  const leapMonth = lunarApi.LunarYear.fromYear(2025)
    .getMonthsInYear()
    .find((month) => month.isLeap());
  assert.ok(leapMonth);
  assert.ok(leapMonth.getMonth() < 0);
});
