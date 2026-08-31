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
  const SOLAR_TERM_SAMPLE_MS = 6 * MILLISECONDS_PER_HOUR;
  const SOLAR_TERM_TOLERANCE_MS = 1000;
  const PHASE_TOLERANCE_MS = 60 * 1000;
  const MILLISECONDS_PER_DAY = 24 * MILLISECONDS_PER_HOUR;
  const formatterCache = new Map();
  const solarTermsCache = new WeakMap();

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

  function signedAngleDifference(valueDeg, targetDeg) {
    return ((valueDeg - targetDeg + 540) % 360) - 180;
  }

  function cloneFrozen(value) {
    if (Array.isArray(value)) return freeze(value.map((item) => cloneFrozen(item)));
    if (value && typeof value === 'object') {
      const copy = {};
      Object.keys(value).forEach((key) => { copy[key] = cloneFrozen(value[key]); });
      return freeze(copy);
    }
    return value;
  }

  function assertAstronomy(Astronomy) {
    if (!Astronomy || typeof Astronomy.solarGeocentricState !== 'function' ||
      typeof Astronomy.moonGeocentricState !== 'function') {
      throw new TypeError('Astronomy must provide solarGeocentricState and moonGeocentricState');
    }
  }

  function findForwardCrossing(options, sampleValue, toleranceMs) {
    const startUtc = options && options.startUtc;
    const endUtc = options && options.endUtc;
    const targetDeg = options && options.targetLongitudeDeg;
    if (!Number.isFinite(startUtc) || !Number.isFinite(endUtc) || startUtc >= endUtc || !Number.isFinite(targetDeg)) {
      throw new TypeError('crossing options require finite startUtc, endUtc, and targetLongitudeDeg');
    }
    let lowUtc = startUtc;
    let lowDifference = signedAngleDifference(sampleValue(lowUtc), targetDeg);
    for (let sampleUtc = Math.min(lowUtc + SOLAR_TERM_SAMPLE_MS, endUtc);
      sampleUtc <= endUtc; sampleUtc = Math.min(sampleUtc + SOLAR_TERM_SAMPLE_MS, endUtc)) {
      const highDifference = signedAngleDifference(sampleValue(sampleUtc), targetDeg);
      if (lowDifference <= 0 && highDifference >= 0 && !(lowDifference === highDifference)) {
        let highUtc = sampleUtc;
        while (highUtc - lowUtc > toleranceMs) {
          const middleUtc = Math.floor((lowUtc + highUtc) / 2);
          const middleDifference = signedAngleDifference(sampleValue(middleUtc), targetDeg);
          if (middleDifference >= 0) highUtc = middleUtc;
          else lowUtc = middleUtc;
        }
        return Math.round((lowUtc + highUtc) / 2);
      }
      if (sampleUtc === endUtc) break;
      lowUtc = sampleUtc;
      lowDifference = highDifference;
    }
    return null;
  }

  function findSolarLongitudeCrossing(options, Astronomy) {
    assertAstronomy(Astronomy);
    const instantUtc = findForwardCrossing(
      options,
      (instant) => Astronomy.solarGeocentricState(instant).longitudeDeg,
      SOLAR_TERM_TOLERANCE_MS
    );
    return instantUtc === null ? null : freeze({
      instantUtc,
      longitudeDeg: ((options.targetLongitudeDeg % 360) + 360) % 360
    });
  }

  function solarTermsForGregorianYear(year, Astronomy) {
    if (!Number.isInteger(year)) throw new TypeError('year must be an integer');
    assertAstronomy(Astronomy);
    let yearCache = solarTermsCache.get(Astronomy);
    if (!yearCache) {
      yearCache = new Map();
      solarTermsCache.set(Astronomy, yearCache);
    }
    const cached = yearCache.get(year);
    if (cached) return cloneFrozen(cached);
    const searchStart = Date.UTC(year, 0, 1) - 5 * MILLISECONDS_PER_DAY;
    const searchEnd = Date.UTC(year + 1, 0, 1) + 5 * MILLISECONDS_PER_DAY;
    const names = Astronomy.SOLAR_TERMS || [];
    if (names.length !== 24) throw new TypeError('Astronomy.SOLAR_TERMS must contain 24 terms');
    const terms = names.map((name, index) => {
      const crossing = findSolarLongitudeCrossing({
        startUtc: searchStart,
        endUtc: searchEnd,
        targetLongitudeDeg: index * 15
      }, Astronomy);
      if (!crossing || crossing.instantUtc < Date.UTC(year, 0, 1) || crossing.instantUtc >= Date.UTC(year + 1, 0, 1)) {
        throw new Error(`unable to solve ${name} for Gregorian year ${year}`);
      }
      return freeze({ name, longitudeDeg: index * 15, instantUtc: crossing.instantUtc });
    }).sort((first, second) => first.instantUtc - second.instantUtc);
    if (terms.length !== 24 || new Set(terms.map((term) => term.longitudeDeg)).size !== 24) {
      throw new Error(`expected 24 unique solar terms for Gregorian year ${year}`);
    }
    const immutable = freeze(terms);
    yearCache.set(year, immutable);
    return cloneFrozen(immutable);
  }

  function currentAndNextSolarTerm(instantUtc, yearTerms, nextYearTerms) {
    assertFiniteInstant(instantUtc);
    const all = (yearTerms || []).concat(nextYearTerms || []).slice()
      .sort((first, second) => first.instantUtc - second.instantUtc);
    if (!all.length) return freeze({ current: null, next: null, millisecondsRemaining: null });
    let current = null;
    let next = null;
    for (const term of all) {
      if (term.instantUtc <= instantUtc) current = term;
      if (term.instantUtc > instantUtc) {
        next = term;
        break;
      }
    }
    return freeze({
      current: current ? cloneFrozen(current) : null,
      next: next ? cloneFrozen(next) : null,
      millisecondsRemaining: next ? next.instantUtc - instantUtc : null
    });
  }

  function principalMoonPhasesForInterval(startUtc, endUtc, Astronomy) {
    assertAstronomy(Astronomy);
    assertFiniteInstant(startUtc);
    assertFiniteInstant(endUtc);
    if (startUtc >= endUtc) throw new RangeError('phase interval endUtc must be after startUtc');
    const phaseNames = ['朔', '上弦', '望', '下弦'];
    const phases = [];
    const phaseStateAt = (instant) => {
      const sun = Astronomy.solarGeocentricState(instant);
      const moon = Astronomy.moonGeocentricState(instant, sun);
      return {
        longitudeDifferenceDeg: ((moon.longitudeDeg - sun.longitudeDeg) % 360 + 360) % 360,
        elongationDeg: moon.elongationDeg
      };
    };
    for (const target of [0, 90, 180, 270]) {
      let cursor = startUtc;
      while (cursor < endUtc) {
        const instantUtc = findForwardCrossing({
          startUtc: cursor,
          endUtc,
          targetLongitudeDeg: target
        }, (instant) => phaseStateAt(instant).longitudeDifferenceDeg, PHASE_TOLERANCE_MS);
        if (instantUtc === null) break;
        const phaseState = phaseStateAt(instantUtc);
        phases.push(freeze({
          name: phaseNames[target / 90],
          targetElongationDeg: target,
          longitudeDifferenceDeg: phaseState.longitudeDifferenceDeg,
          elongationDeg: phaseState.elongationDeg,
          spatialSeparationDeg: phaseState.elongationDeg,
          instantUtc
        }));
        cursor = instantUtc + PHASE_TOLERANCE_MS;
      }
    }
    return freeze(phases.sort((first, second) => first.instantUtc - second.instantUtc));
  }

  function ratio(instantUtc, startUtc, endUtc) {
    return Math.max(0, Math.min(1, (instantUtc - startUtc) / (endUtc - startUtc)));
  }

  function annualTimeline(year, requestedTimeZone, Astronomy, lunarApi) {
    if (!Number.isInteger(year)) throw new TypeError('year must be an integer');
    assertAstronomy(Astronomy);
    const zone = resolveTimeZone(requestedTimeZone);
    const startBoundary = zonedLocalMidnightToUtc({ year, month: 1, day: 1 }, zone.timeZone);
    const endBoundary = zonedLocalMidnightToUtc({ year: year + 1, month: 1, day: 1 }, zone.timeZone);
    if (startBoundary.instantUtc === null || endBoundary.instantUtc === null) throw new Error('unable to resolve local year boundary');
    const startUtc = startBoundary.instantUtc;
    const endUtc = endBoundary.instantUtc;
    const gregorian = [];
    for (let month = 1; month <= 12; month += 1) {
      const monthStart = zonedLocalMidnightToUtc({ year, month, day: 1 }, zone.timeZone).instantUtc;
      const monthEnd = month === 12 ? endUtc : zonedLocalMidnightToUtc({ year, month: month + 1, day: 1 }, zone.timeZone).instantUtc;
      gregorian.push(freeze({ month, startUtc: monthStart, endUtc: monthEnd, startRatio: ratio(monthStart, startUtc, endUtc), endRatio: ratio(monthEnd, startUtc, endUtc) }));
    }
    const solarTerms = solarTermsForGregorianYear(year, Astronomy).map((term) => freeze({
      name: term.name,
      longitudeDeg: term.longitudeDeg,
      instantUtc: term.instantUtc,
      startRatio: ratio(term.instantUtc, startUtc, endUtc)
    }));
    const phases = principalMoonPhasesForInterval(startUtc - 40 * MILLISECONDS_PER_DAY, endUtc + 40 * MILLISECONDS_PER_DAY, Astronomy);
    const newMoons = phases.filter((phase) => phase.targetElongationDeg === 0);
    const fullMoons = phases.filter((phase) => phase.targetElongationDeg === 180);
    const lunarMonths = [];
    for (let index = 0; index < newMoons.length - 1; index += 1) {
      const newMoon = newMoons[index];
      const first = newMoon.instantUtc;
      const second = newMoons[index + 1].instantUtc;
      if (second <= startUtc || first >= endUtc) continue;
      const labelDate = localDateParts(
        Math.max(first, startUtc) + 12 * MILLISECONDS_PER_HOUR,
        zone.timeZone
      );
      const lunar = lunarForLocalDate(labelDate, lunarApi);
      const fullMoon = fullMoons.find((phase) => phase.instantUtc > first && phase.instantUtc < second);
      const estimated = !fullMoon;
      lunarMonths.push(freeze({
        lunarYear: lunar.year,
        month: lunar.month,
        isLeapMonth: lunar.isLeapMonth,
        label: lunar.supported
          ? `${lunar.isLeapMonth && !lunar.monthName.startsWith('闰') ? '闰' : ''}${lunar.monthName}月`
          : '农历日期超出支持范围',
        startUtc: first,
        endUtc: second,
        startRatio: ratio(first, startUtc, endUtc),
        endRatio: ratio(second, startUtc, endUtc),
        fullMoonEstimateUtc: fullMoon ? fullMoon.instantUtc : Math.round((first + second) / 2),
        fullMoonLabel: estimated ? '望附近' : '望',
        newMoonTargetElongationDeg: newMoon.targetElongationDeg,
        newMoonLongitudeDifferenceDeg: newMoon.longitudeDifferenceDeg,
        newMoonElongationDeg: newMoon.elongationDeg,
        newMoonSpatialSeparationDeg: newMoon.spatialSeparationDeg,
        fullMoonTargetElongationDeg: fullMoon ? fullMoon.targetElongationDeg : null,
        fullMoonLongitudeDifferenceDeg: fullMoon ? fullMoon.longitudeDifferenceDeg : null,
        fullMoonElongationDeg: fullMoon ? fullMoon.elongationDeg : null,
        fullMoonSpatialSeparationDeg: fullMoon ? fullMoon.spatialSeparationDeg : null,
        estimated
      }));
    }
    return freeze({ startUtc, endUtc, gregorian: freeze(gregorian), solarTerms: freeze(solarTerms), lunarMonths: freeze(lunarMonths) });
  }

  function calendarState(options) {
    const instantUtc = options && options.instantUtc;
    assertFiniteInstant(instantUtc);
    const zone = resolveTimeZone(options && options.timeZone);
    const displayTime = localDateParts(instantUtc, zone.timeZone);
    const lunar = lunarForLocalDate(displayTime, options && options.lunarApi);
    const terms = solarTermsForGregorianYear(displayTime.year, options && options.Astronomy);
    const nextTerms = solarTermsForGregorianYear(displayTime.year + 1, options && options.Astronomy);
    const previousTerms = solarTermsForGregorianYear(displayTime.year - 1, options && options.Astronomy);
    const solarTermState = currentAndNextSolarTerm(instantUtc, previousTerms.concat(terms), nextTerms);
    const liChun = terms.find((term) => term.name === '立春');
    const springFestival = lunar.supported ? ganzhiForYear(lunar.year) : null;
    const liChunGanzhi = ganzhiForYear(instantUtc < liChun.instantUtc ? displayTime.year - 1 : displayTime.year);
    const differs = Boolean(springFestival && springFestival.name !== liChunGanzhi.name);
    return freeze({
      displayTime,
      gregorian: freeze({ year: displayTime.year, month: displayTime.month, day: displayTime.day }),
      lunar,
      solarTerms: solarTermState,
      ganzhi: freeze({
        springFestival,
        liChun: liChunGanzhi,
        differs,
        explanation: differs ? '春节与立春采用不同的年界，因此此时干支年名称不同。' : '春节与立春年界在此时给出相同的干支年名称。'
      }),
      support: freeze({ lunar: lunar.warning, timeZone: zone.warning })
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
    ganzhiForYear,
    findSolarLongitudeCrossing,
    solarTermsForGregorianYear,
    currentAndNextSolarTerm,
    principalMoonPhasesForInterval,
    annualTimeline,
    calendarState
  });
});
