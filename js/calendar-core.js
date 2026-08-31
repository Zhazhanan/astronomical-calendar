;(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) {
    root.AstroEducation = root.AstroEducation || {};
    root.AstroEducation.Calendar = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const DEFAULT_TIME_ZONE = 'Asia/Shanghai';
  const MIN_SUPPORTED_YEAR = 1900;
  const MAX_SUPPORTED_YEAR = 2100;
  const MILLISECONDS_PER_HOUR = 60 * 60 * 1000;
  const OFFSET_SAMPLE_WINDOW = 36 * MILLISECONDS_PER_HOUR;
  const STEMS = Object.freeze(['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸']);
  const BRANCHES = Object.freeze(['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥']);
  const formatterCache = new Map();

  function freeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.keys(value).forEach((key) => freeze(value[key]));
      Object.freeze(value);
    }
    return value;
  }

  function warning(code, message) {
    return freeze({ code, message });
  }

  function assertFiniteInstant(instantUtc) {
    if (!Number.isFinite(instantUtc)) {
      throw new TypeError('instantUtc must be a finite UTC millisecond value');
    }
  }

  function isLeapYear(year) {
    return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  }

  function daysInMonth(year, month) {
    const lengths = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return lengths[month - 1] || 0;
  }

  function resolveTimeZone(requested) {
    try {
      if (typeof requested !== 'string' || requested.length === 0) throw new RangeError('timezone required');
      new Intl.DateTimeFormat('en-US', { timeZone: requested });
      return freeze({ timeZone: requested, warning: null });
    } catch (error) {
      return freeze({
        timeZone: DEFAULT_TIME_ZONE,
        warning: warning('INVALID_TIME_ZONE', `无法识别时区“${String(requested)}”，已使用 Asia/Shanghai。`)
      });
    }
  }

  function formatterFor(timeZone) {
    let formatter = formatterCache.get(timeZone);
    if (!formatter) {
      formatter = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        weekday: 'short',
        hourCycle: 'h23'
      });
      formatterCache.set(timeZone, formatter);
    }
    return formatter;
  }

  function localDateParts(instantUtc, requestedTimeZone) {
    assertFiniteInstant(instantUtc);
    const zone = resolveTimeZone(requestedTimeZone);
    const parts = formatterFor(zone.timeZone).formatToParts(new Date(instantUtc));
    const values = {};
    for (const part of parts) {
      if (part.type !== 'literal') values[part.type] = part.value;
    }
    const year = Number(values.year);
    const month = Number(values.month);
    const day = Number(values.day);
    const rawHour = Number(values.hour);
    return freeze({
      year,
      month,
      day,
      hour: rawHour === 24 ? 0 : rawHour,
      minute: Number(values.minute),
      second: Number(values.second),
      weekday: values.weekday,
      isoDate: `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      timeZone: zone.timeZone
    });
  }

  function isValidLocalDateTime(fields) {
    if (!fields || !Number.isInteger(fields.year) || !Number.isInteger(fields.month) ||
      !Number.isInteger(fields.day) || !Number.isInteger(fields.hour) ||
      !Number.isInteger(fields.minute) || !Number.isInteger(fields.second)) return false;
    return fields.month >= 1 && fields.month <= 12 && fields.day >= 1 &&
      fields.day <= daysInMonth(fields.year, fields.month) && fields.hour >= 0 && fields.hour <= 23 &&
      fields.minute >= 0 && fields.minute <= 59 && fields.second >= 0 && fields.second <= 59;
  }

  function sameLocalDateTime(parts, fields) {
    return parts.year === fields.year && parts.month === fields.month && parts.day === fields.day &&
      parts.hour === fields.hour && parts.minute === fields.minute && parts.second === fields.second;
  }

  function offsetMillisecondsAt(instantUtc, timeZone) {
    const parts = localDateParts(instantUtc, timeZone);
    const localWallTime = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second
    );
    return localWallTime - instantUtc;
  }

  function candidateOffsets(nominalUtc, timeZone) {
    const samples = [
      nominalUtc - OFFSET_SAMPLE_WINDOW,
      nominalUtc,
      nominalUtc + OFFSET_SAMPLE_WINDOW
    ];
    return [...new Set(samples.map((instantUtc) => offsetMillisecondsAt(instantUtc, timeZone)))];
  }

  function zonedLocalDateTimeToUtc(fields, requestedTimeZone) {
    const zone = resolveTimeZone(requestedTimeZone);
    if (!isValidLocalDateTime(fields)) {
      return freeze({
        instantUtc: null,
        warning: warning('INVALID_LOCAL_DATE_TIME', '本地日期或时间无效。'),
        ambiguity: freeze({ kind: 'invalid', candidates: [] })
      });
    }
    const nominalUtc = Date.UTC(fields.year, fields.month - 1, fields.day, fields.hour, fields.minute, fields.second);
    const candidates = [];
    for (const offsetMilliseconds of candidateOffsets(nominalUtc, zone.timeZone)) {
      const candidate = nominalUtc - offsetMilliseconds;
      if (sameLocalDateTime(localDateParts(candidate, zone.timeZone), fields)) candidates.push(candidate);
    }
    candidates.sort((first, second) => first - second);
    if (candidates.length === 0) {
      return freeze({
        instantUtc: null,
        warning: warning('NONEXISTENT_LOCAL_TIME', '该本地时间在时区夏令时切换中不存在。'),
        ambiguity: freeze({ kind: 'nonexistent', candidates: [] })
      });
    }
    if (candidates.length > 1) {
      return freeze({
        instantUtc: candidates[0],
        warning: warning('AMBIGUOUS_LOCAL_TIME', '该本地时间在时区夏令时切换中出现两次，已选择较早的 UTC 时刻。'),
        ambiguity: freeze({ kind: 'ambiguous', candidates })
      });
    }
    return freeze({
      instantUtc: candidates[0],
      warning: zone.warning,
      ambiguity: freeze({ kind: 'unique', candidates })
    });
  }

  function zonedLocalMidnightToUtc(date, timeZone) {
    const result = zonedLocalDateTimeToUtc({
      year: date && date.year,
      month: date && date.month,
      day: date && date.day,
      hour: 0,
      minute: 0,
      second: 0
    }, timeZone);
    return freeze({ instantUtc: result.instantUtc, warning: result.warning });
  }

  function lunarForLocalDate(date, lunarApi) {
    const year = date && date.year;
    const month = date && date.month;
    const day = date && date.day;
    if (!Number.isInteger(year) || year < MIN_SUPPORTED_YEAR || year > MAX_SUPPORTED_YEAR) {
      return freeze({
        supported: false,
        year: null,
        month: null,
        day: null,
        isLeapMonth: false,
        monthName: null,
        dayName: null,
        yearGanzhi: null,
        warning: warning('LUNAR_DATE_OUT_OF_RANGE', '农历转换仅支持 1900-01-01 至 2100-12-31 的本地日期。')
      });
    }
    if (!Number.isInteger(month) || !Number.isInteger(day) || day < 1 || day > daysInMonth(year, month)) {
      return freeze({
        supported: false,
        year: null,
        month: null,
        day: null,
        isLeapMonth: false,
        monthName: null,
        dayName: null,
        yearGanzhi: null,
        warning: warning('INVALID_LOCAL_DATE', '本地日期无效。')
      });
    }
    if (!lunarApi || !lunarApi.Solar || typeof lunarApi.Solar.fromYmd !== 'function') {
      throw new TypeError('lunarApi must provide Solar.fromYmd');
    }
    const lunar = lunarApi.Solar.fromYmd(year, month, day).getLunar();
    const lunarMonth = lunar.getMonth();
    return freeze({
      supported: true,
      year: lunar.getYear(),
      month: Math.abs(lunarMonth),
      day: lunar.getDay(),
      isLeapMonth: lunarMonth < 0,
      monthName: lunar.getMonthInChinese(),
      dayName: lunar.getDayInChinese(),
      yearGanzhi: lunar.getYearInGanZhi(),
      warning: null
    });
  }

  function ganzhiForYear(year) {
    if (!Number.isInteger(year)) throw new TypeError('year must be an integer');
    const index = ((year - 1984) % 60 + 60) % 60;
    return freeze({
      index,
      stem: STEMS[index % STEMS.length],
      branch: BRANCHES[index % BRANCHES.length],
      name: STEMS[index % STEMS.length] + BRANCHES[index % BRANCHES.length]
    });
  }

  return freeze({
    resolveTimeZone,
    localDateParts,
    zonedLocalDateTimeToUtc,
    zonedLocalMidnightToUtc,
    isLeapYear,
    daysInMonth,
    lunarForLocalDate,
    ganzhiForYear
  });
});
