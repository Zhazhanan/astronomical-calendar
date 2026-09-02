;(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) { root.AstroEducation = root.AstroEducation || {}; root.AstroEducation.EducationPanel = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const PRESET_KEYS = Object.freeze({ beijing: '北京', shanghai: '上海', guangzhou: '广州' });
  const LAYER_IDS = Object.freeze(['showOrbit', 'showLabels', 'showObserver', 'showDayNight']);
  const YEAR_MIN = 1900, YEAR_MAX = 2100;
  function pad(value, length) { return String(value == null ? 0 : value).padStart(length, '0'); }
  function controlViewModel(input) {
    const clock = input && input.clock || {}, time = input && input.displayTime || {};
    const date = typeof time.isoDate === 'string' && /^\d{4,}-\d{2}-\d{2}$/.test(time.isoDate)
      ? time.isoDate
      : `${pad(time.year, 4)}-${pad(time.month, 2)}-${pad(time.day, 2)}`;
    return Object.freeze({
      dateTimeValue: `${date}T${pad(time.hour, 2)}:${pad(time.minute, 2)}`,
      timeZone: time.timeZone || clock.timeZone || '', playLabel: clock.playing ? '暂停' : '播放',
      playing: !!clock.playing, speed: clock.daysPerSecond
    });
  }
  function field(object, path) { return path.reduce((value, key) => value && value[key], object); }
  function normalizeAngle(value) { return ((Number(value) % 360) + 360) % 360; }
  function fallbackViewModel(state, code) {
    const input = state || {}, sun = input.sun || {}, earth = input.earth || {}, moon = input.moon || {};
    const sunAngleDeg = normalizeAngle(sun.longitudeDeg);
    const earthAngleDeg = Number.isFinite(earth.trueLongitudeDeg) ? normalizeAngle(earth.trueLongitudeDeg) : normalizeAngle(sunAngleDeg + 180);
    const moonRelativeAngleDeg = Number.isFinite(moon.elongationDeg) ? normalizeAngle(moon.elongationDeg) : normalizeAngle(moon.longitudeDeg - sunAngleDeg);
    return Object.freeze({
      code: code || 'WEBGL_UNAVAILABLE',
      reason: '此设备无法显示 3D 场景，下面仍可学习日期、节气与月相。',
      showTimeline: true,
      showCards: true,
      eclipticDiagram: Object.freeze({
        sunAngleDeg,
        earthAngleDeg,
        moonRelativeAngleDeg,
        moonLatitudeDeg: Number.isFinite(moon.latitudeDeg) ? moon.latitudeDeg : 0,
        phaseName: moon.phaseName || '月相'
      })
    });
  }
  function svgNode(documentRef, name, attrs, text) {
    const node = documentRef.createElementNS ? documentRef.createElementNS('http://www.w3.org/2000/svg', name) : documentRef.createElement(name);
    Object.keys(attrs || {}).forEach(function (key) { node.setAttribute(key, attrs[key]); });
    if (text != null) node.textContent = text;
    return node;
  }
  function diagramPoint(angleDeg, radius) {
    const rad = (normalizeAngle(angleDeg) - 90) * Math.PI / 180;
    return { x: 160 + radius * Math.cos(rad), y: 110 + radius * Math.sin(rad) };
  }
  function renderFallback(container, model, options) {
    if (!container || !model) return null;
    const documentRef = options && options.document || container.ownerDocument;
    if (!documentRef) return null;
    while (container.firstChild) container.removeChild(container.firstChild);
    const diagram = model.eclipticDiagram, label = `二维日地月示意：太阳黄经 ${finite(diagram.sunAngleDeg, 1)}°，月球相对太阳 ${finite(diagram.moonRelativeAngleDeg, 1)}°。`;
    const svg = svgNode(documentRef, 'svg', { viewBox: '0 0 320 220', role: 'img', 'aria-label': label, class: 'fallback-diagram' });
    svg.appendChild(svgNode(documentRef, 'title', { id: 'fallbackDiagramTitle' }, '日地月二维学习示意'));
    svg.appendChild(svgNode(documentRef, 'desc', { id: 'fallbackDiagramDescription' }, label + ' 实线是地球轨道，虚线是春分点 0° 射线，弧线标出太阳黄经。'));
    const earth = diagramPoint(diagram.earthAngleDeg, 68), moon = diagramPoint(diagram.earthAngleDeg + 180 + diagram.moonRelativeAngleDeg, 25);
    svg.appendChild(svgNode(documentRef, 'line', { x1: 160, y1: 110, x2: 160, y2: 28, class: 'fallback-zero-ray' }));
    svg.appendChild(svgNode(documentRef, 'text', { x: 166, y: 32, class: 'fallback-label' }, '春分点 0°'));
    svg.appendChild(svgNode(documentRef, 'circle', { cx: 160, cy: 110, r: 68, class: 'fallback-orbit' }));
    const sunPoint = diagramPoint(diagram.sunAngleDeg, 68);
    svg.appendChild(svgNode(documentRef, 'path', { d: `M 160 42 A 68 68 0 ${diagram.sunAngleDeg > 180 ? 1 : 0} 1 ${sunPoint.x.toFixed(1)} ${sunPoint.y.toFixed(1)}`, class: 'fallback-longitude-arc' }));
    svg.appendChild(svgNode(documentRef, 'circle', { cx: 160, cy: 110, r: 13, class: 'fallback-sun' }));
    svg.appendChild(svgNode(documentRef, 'text', { x: 143, y: 115, class: 'fallback-label' }, '太阳'));
    svg.appendChild(svgNode(documentRef, 'circle', { cx: earth.x.toFixed(1), cy: earth.y.toFixed(1), r: 8, class: 'fallback-earth' }));
    svg.appendChild(svgNode(documentRef, 'text', { x: (earth.x + 10).toFixed(1), y: (earth.y + 4).toFixed(1), class: 'fallback-label' }, '地球'));
    svg.appendChild(svgNode(documentRef, 'line', { x1: earth.x.toFixed(1), y1: earth.y.toFixed(1), x2: (earth.x + (moon.x - 160)).toFixed(1), y2: (earth.y + (moon.y - 110)).toFixed(1), class: 'fallback-moon-line' }));
    svg.appendChild(svgNode(documentRef, 'circle', { cx: (earth.x + (moon.x - 160)).toFixed(1), cy: (earth.y + (moon.y - 110)).toFixed(1), r: 4, class: 'fallback-moon' }));
    svg.appendChild(svgNode(documentRef, 'text', { x: 12, y: 202, class: 'fallback-label' }, `太阳黄经 ${finite(diagram.sunAngleDeg, 1)}°；${diagram.phaseName}`));
    container.appendChild(svg);
    return svg;
  }
  function finite(value, digits) { return Number.isFinite(value) ? Number(value).toFixed(digits == null ? 1 : digits) : '—'; }
  function durationText(milliseconds) {
    if (!Number.isFinite(milliseconds)) return '—';
    const days = Math.floor(Math.max(0, milliseconds) / 86400000), hours = Math.floor(Math.max(0, milliseconds % 86400000) / 3600000);
    return days ? `${days}天${hours}小时` : `${hours}小时`;
  }
  function zonedTime(instantUtc, timeZone) {
    if (!Number.isFinite(instantUtc)) return '—';
    try { return new Intl.DateTimeFormat('zh-CN', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date(instantUtc)); }
    catch (_) { return '—'; }
  }
  function currentMomentCardView(state, browserTimeZone) {
    const instantUtc = state && state.instantUtc, selected = field(state, ['displayTime', 'timeZone']) || state && state.timeZone || 'Asia/Shanghai';
    const local = browserTimeZone || (typeof Intl !== 'undefined' && Intl.DateTimeFormat ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC');
    return Object.freeze({ title: '当前时刻', rows: Object.freeze([
      ['UTC', zonedTime(instantUtc, 'UTC')], ['上海', zonedTime(instantUtc, 'Asia/Shanghai')], ['浏览器本地（' + local + '）', zonedTime(instantUtc, local)], ['选择时区（' + selected + '）', zonedTime(instantUtc, selected)]
    ]), explanation: '四个读数使用同一个瞬间，只是用不同地点的时区表示。' });
  }
  function solarSeasonCardView(state) {
    const sun = state && state.sun || {}, terms = state && state.solarTerms || sun.solarTerms || {};
    return Object.freeze({ title: '太阳与季节', rows: Object.freeze([
      ['太阳黄经', finite(sun.longitudeDeg) + '°'], ['太阳赤纬', finite(sun.declinationDeg) + '°'], ['日地距离', Number.isFinite(sun.distanceAu) ? finite(sun.distanceAu, 4) + ' AU' : '—'], ['当前节气', field(terms, ['current', 'name']) || '—'], ['下一节气', field(terms, ['next', 'name']) || '—'], ['距下一节气', durationText(terms.millisecondsRemaining != null ? terms.millisecondsRemaining : terms.millisecondsUntilNext)]
    ]), explanation: '黄经每前进约 15°，就跨入一个节气；赤纬影响南北半球的季节和昼长。' });
  }
  function calendarMoonCardView(state) {
    const gregorian = state && state.gregorian || {}, lunar = state && state.lunar || {}, moon = state && state.moon || {}, phase = moon.phaseName || field(lunar, ['currentPhase', 'name']) || '—';
    return Object.freeze({ title: '公历、农历与月相', rows: Object.freeze([
      ['公历', [gregorian.year, gregorian.month, gregorian.day].every(Number.isFinite) ? `${gregorian.year}年${gregorian.month}月${gregorian.day}日` : '—'], ['农历', lunar.supported === false ? '当前日期不在农历支持范围' : `${lunar.isLeapMonth ? '闰' : ''}${lunar.monthName || lunar.month || '—'}月${lunar.dayName || lunar.day || ''}`], ['月相', phase], ['下一主相', field(lunar, ['nextPhase', 'name']) || '—'], ['距下一主相', durationText(lunar.millisecondsUntilNextPhase)]
    ]), explanation: '农历月以朔（月相接近新月）为起点；月相反映日、地、月三者的相对位置。' });
  }
  function ganzhiCardView(ganzhi) {
    const value = ganzhi || {}, springFestival = field(value, ['springFestival', 'name']) || '—', liChun = field(value, ['liChun', 'name']) || '—';
    const unsupported = !field(value, ['springFestival', 'name']) || !field(value, ['liChun', 'name']) || field(value, ['support', 'ganzhi']) || /支持范围|未计算干支年/.test(value.explanation || '');
    return Object.freeze({ title: '两种干支年', rows: Object.freeze([['春节换年', springFestival], ['立春换年', liChun]]), explanation: unsupported ? '当地年份不在 1900–2100 支持范围，未计算干支年。' : value.differs ? '春节换年与立春换年采用不同的年界，所以这段时间会显示不同名称；它们服务于不同的历法语境。' : '春节换年与立春换年在当前时刻给出相同名称；两种年界的定义仍然不同。' });
  }
  function observerCardView(state) {
    const observer = state && state.observer || {}, location = observer.location || state && state.location || {}, sun = state && state.sun || {};
    const stateName = ({ day: '白天', twilight: '晨昏蒙影', night: '夜晚' })[observer.hemisphereState] || '—';
    return Object.freeze({ title: '观察地点', rows: Object.freeze([
      ['地点', location.name || '自定义地点'], ['坐标', `${finite(location.latitudeDeg)}°，${finite(location.longitudeDeg)}°`], ['太阳高度', finite(observer.altitudeDeg) + '°'], ['太阳方位', finite(observer.azimuthDeg) + '°（北=0°，东=90°）'], ['昼长 / 夜长', `${finite(observer.daylightHours)}小时 / ${finite(observer.nightHours)}小时`], ['当前天空', stateName], ['太阳直射点', `${finite(field(observer, ['subsolarPoint', 'latitudeDeg']) != null ? field(observer, ['subsolarPoint', 'latitudeDeg']) : sun.declinationDeg)}°，${finite(field(observer, ['subsolarPoint', 'longitudeDeg']))}°`]
    ]), explanation: '高度角表示太阳离地平线的角度；方位角从正北开始顺时针量。昼长主要由纬度和太阳赤纬决定。' });
  }
  function whyCardView(state) {
    const input = state || {}, evidence = [], terms = input.solarTerms || input.sun && input.sun.solarTerms || {}, moon = input.moon || {}, observer = input.observer || {}, ganzhi = input.ganzhi || {};
    if (ganzhi.differs) evidence.push('春节换年与立春换年正在给出不同的干支年，因为两者使用不同年界。');
    const untilTerm = terms.millisecondsRemaining != null ? terms.millisecondsRemaining : terms.millisecondsUntilNext;
    if (Number.isFinite(untilTerm) && untilTerm <= 7 * 86400000) evidence.push(`下一节气${terms.next && terms.next.name ? '“' + terms.next.name + '”' : ''}将在${durationText(untilTerm)}后到来，太阳黄经正接近下一个 15° 刻度。`);
    if (moon.phaseName || moon.waxing != null) evidence.push(`月相${moon.phaseName || '正在变化'}${moon.waxing === true ? '，目前月面亮部在增加' : moon.waxing === false ? '，目前月面亮部在减少' : ''}。`);
    if (observer.daylightTrend === 'increasing') evidence.push('当地白昼渐长，说明太阳每日经过天空的时间正在增加。');
    if (observer.daylightTrend === 'decreasing') evidence.push('当地白昼渐短，说明太阳每日经过天空的时间正在减少。');
    if (!evidence.length) evidence.push('改变时刻后，对照太阳黄经、月相和当地太阳高度，可以看到同一几何关系在不同读数中的表现。');
    return Object.freeze({ title: '为什么会这样？', body: evidence.slice(0, 2).join(' ') });
  }
  function yearLookupView(year, Calendar) {
    const parsed = Number(year);
    if (!Number.isInteger(parsed) || parsed < YEAR_MIN || parsed > YEAR_MAX) return Object.freeze({ valid: false, year: parsed, ganzhi: null, message: `请输入 ${YEAR_MIN}–${YEAR_MAX} 的整数年份。` });
    const result = Calendar && typeof Calendar.ganzhiForYear === 'function' ? Calendar.ganzhiForYear(parsed) : (() => { const stems = '甲乙丙丁戊己庚辛壬癸', branches = '子丑寅卯辰巳午未申酉戌亥', index = ((parsed - 1984) % 60 + 60) % 60; return { index, name: stems[index % 10] + branches[index % 12] }; })();
    return Object.freeze({ valid: true, year: parsed, ganzhi: result.name, index: result.index, message: `${parsed}年：${result.name}（六十甲子第${result.index + 1}位）` });
  }
  function phaseKind(state) {
    const phase = field(state, ['moon', 'phaseName']) || field(state, ['calendar', 'moonPhase', 'name']) || '';
    if (/新月|朔/.test(phase)) return 'new-moon';
    if (/满月|望/.test(phase)) return 'full-moon';
    return '';
  }
  function boundaryChanges(previous, next) {
    if (!previous || !next) return [];
    const changes = [];
    const oldTerm = field(previous, ['solarTerms', 'current', 'name']) || field(previous, ['sun', 'solarTerms', 'current', 'name']);
    const nextTerm = field(next, ['solarTerms', 'current', 'name']) || field(next, ['sun', 'solarTerms', 'current', 'name']);
    if (oldTerm !== nextTerm) changes.push('solar-term');
    const oldPhase = phaseKind(previous), newPhase = phaseKind(next);
    if (newPhase && newPhase !== oldPhase) changes.push(newPhase);
    const oldLunar = previous.lunar, newLunar = next.lunar;
    if (newLunar && newLunar.month === 1 && newLunar.day === 1 && (!oldLunar || oldLunar.month !== 1 || oldLunar.day !== 1)) changes.push('spring-festival');
    if (field(previous, ['ganzhi', 'liChun', 'name']) !== field(next, ['ganzhi', 'liChun', 'name'])) changes.push('li-chun');
    return changes;
  }
  function clampRatio(value) { return Math.max(0, Math.min(1, value)); }
  function lunarSegmentView(month) {
    const item = month || {}, label = item.label || '农历月份', leap = !!item.isLeapMonth;
    return Object.freeze({ label, ariaLabel: '农历' + (leap && label.indexOf('闰') < 0 ? '闰' : '') + label, pattern: leap ? 'diagonal' : null });
  }
  function timelineViewModel(annual, instantUtc, displayTime) {
    if (!annual || !Number.isFinite(annual.startUtc) || !Number.isFinite(annual.endUtc) || annual.endUtc <= annual.startUtc) return null;
    const ratio = clampRatio((instantUtc - annual.startUtc) / (annual.endUtc - annual.startUtc));
    const months = (annual.gregorian || []).map(function (item, index) { return Object.assign({ label: (item.month || index + 1) + '月' }, item); });
    const lunar = (annual.lunarMonths || []).map(function (item) { return Object.assign({}, item, lunarSegmentView(item)); });
    return Object.freeze({ annual, pointerRatio: ratio, pointerInstantUtc: instantUtc, dateLabel: formatTimelineDate(displayTime), rows: Object.freeze([
      Object.freeze({ kind: 'gregorian', label: '公历', items: Object.freeze(months) }),
      Object.freeze({ kind: 'solar-terms', label: '节气', items: Object.freeze((annual.solarTerms || []).slice()) }),
      Object.freeze({ kind: 'lunar', label: '农历', items: Object.freeze(lunar) })
    ]) });
  }
  function formatTimelineDate(display) {
    if (!display || !Number.isFinite(display.year)) return '当前时刻';
    return display.year + '年' + pad(display.month, 2) + '月' + pad(display.day, 2) + '日';
  }
  function timelineScrubController(options) {
    const config = options || {}, clock = config.clock || {}, annual = config.annual || {};
    function keydown(event) {
      const key = event && event.key, prevent = event && event.preventDefault;
      if (key === 'ArrowLeft' || key === 'ArrowDown') { if (prevent) prevent.call(event); if (clock.stepDays) clock.stepDays(-1); }
      else if (key === 'ArrowRight' || key === 'ArrowUp') { if (prevent) prevent.call(event); if (clock.stepDays) clock.stepDays(1); }
      else if (key === 'PageDown') { if (prevent) prevent.call(event); if (clock.stepDays) clock.stepDays(-7); }
      else if (key === 'PageUp') { if (prevent) prevent.call(event); if (clock.stepDays) clock.stepDays(7); }
      else if (key === 'Home') { if (prevent) prevent.call(event); if (clock.setInstant) clock.setInstant(annual.startUtc); }
      else if (key === 'End') { if (prevent) prevent.call(event); if (clock.setInstant) clock.setInstant(annual.endUtc - 1); }
    }
    return Object.freeze({ keydown });
  }
  function svgNode(documentRef, name, attributes, text) {
    const node = documentRef.createElementNS('http://www.w3.org/2000/svg', name);
    Object.keys(attributes || {}).forEach(function (key) { node.setAttribute(key, String(attributes[key])); });
    if (text != null) node.textContent = text;
    return node;
  }
  function renderTimeline(container, model, options) {
    if (!container || !model || !container.ownerDocument && !(options && options.document)) return null;
    const config = options || {}, documentRef = container.ownerDocument || config.document;
    if (!documentRef.createElementNS || !documentRef.createElement) return null;
    while (container.firstChild) container.removeChild(container.firstChild);
    const toolbar = documentRef.createElement('div'); toolbar.className = 'timeline-toolbar';
    const tip = documentRef.createElement('output'); tip.id = 'annualTimelineTooltip'; tip.className = 'timeline-tooltip'; tip.textContent = '将指针悬停或聚焦节气名称查看时刻。';
    toolbar.appendChild(tip);
    const zoomGroup = documentRef.createElement('div'); zoomGroup.className = 'timeline-zoom'; zoomGroup.setAttribute('aria-label', '时间轴缩放');
    toolbar.appendChild(zoomGroup); container.appendChild(toolbar);
    const svg = svgNode(documentRef, 'svg', { viewBox: '0 0 1000 245', role: 'group', 'aria-labelledby': 'annualTimelineSvgTitle annualTimelineSvgDesc', 'data-timeline-svg': 'true' });
    svg.appendChild(svgNode(documentRef, 'title', { id: 'annualTimelineSvgTitle' }, '公历、二十四节气和农历统一年度时间轴'));
    svg.appendChild(svgNode(documentRef, 'desc', { id: 'annualTimelineSvgDesc' }, '各行使用同一真实 UTC 时间比例。节气名称可聚焦以查看时刻。'));
    const defs = svgNode(documentRef, 'defs'); const pattern = svgNode(documentRef, 'pattern', { id: 'lunarLeapDiagonal', width: 8, height: 8, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' });
    pattern.appendChild(svgNode(documentRef, 'rect', { width: 8, height: 8, fill: '#4c1d95' })); pattern.appendChild(svgNode(documentRef, 'line', { x1: 0, y1: 0, x2: 0, y2: 8, stroke: '#f8fafc', 'stroke-width': 2, opacity: .52 })); defs.appendChild(pattern); svg.appendChild(defs);
    const left = 70, width = 900, rowY = [55, 125, 195];
    model.rows.forEach(function (row, rowIndex) {
      svg.appendChild(svgNode(documentRef, 'text', { x: 8, y: rowY[rowIndex] + 5, class: 'timeline-row-label' }, row.label));
      svg.appendChild(svgNode(documentRef, 'line', { x1: left, y1: rowY[rowIndex], x2: left + width, y2: rowY[rowIndex], class: 'timeline-axis' }));
      row.items.forEach(function (item, index) {
        const start = left + width * clampRatio(item.startRatio), end = left + width * clampRatio(item.endRatio == null ? item.startRatio : item.endRatio);
        if (row.kind === 'solar-terms') {
          const button = svgNode(documentRef, 'text', { x: start, y: rowY[rowIndex] - (index % 2 ? 14 : -25), class: 'timeline-term', tabindex: 0, role: 'button', 'aria-label': item.name + '，年度位置 ' + Math.round(item.startRatio * 100) + '%', 'aria-describedby': 'annualTimelineTooltip' }, item.name);
          const message = item.name + '：' + new Date(item.instantUtc).toLocaleString('zh-CN', { timeZone: config.timeZone || undefined, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
          function show() { tip.textContent = message; }
          function activate(event) { if (event && (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar')) { if (event.preventDefault) event.preventDefault(); show(); } }
          button.addEventListener('pointerenter', show); button.addEventListener('mouseenter', show); button.addEventListener('focus', show); button.addEventListener('keydown', activate); svg.appendChild(svgNode(documentRef, 'circle', { cx: start, cy: rowY[rowIndex], r: 4, class: 'timeline-term-marker' })); svg.appendChild(button);
        } else {
          const segment = svgNode(documentRef, 'rect', { x: start, y: rowY[rowIndex] - 15, width: Math.max(1, end - start), height: 30, class: row.kind === 'lunar' ? 'timeline-lunar-segment' : 'timeline-gregorian-segment', fill: item.pattern ? 'url(#lunarLeapDiagonal)' : '' });
          segment.setAttribute('aria-label', item.ariaLabel || item.label); svg.appendChild(segment);
          if (end - start > 25 || item.pattern) svg.appendChild(svgNode(documentRef, 'text', { x: start + 3, y: rowY[rowIndex] + 5, class: 'timeline-segment-label' }, item.label));
          if (row.kind === 'lunar') {
            const newX = start, fullRatio = Number.isFinite(item.fullMoonEstimateUtc) ? clampRatio((item.fullMoonEstimateUtc - model.annual.startUtc) / (model.annual.endUtc - model.annual.startUtc)) : clampRatio((item.startRatio + item.endRatio) / 2), fullX = left + width * fullRatio;
            svg.appendChild(svgNode(documentRef, 'circle', { cx: newX, cy: rowY[rowIndex] + 22, r: 4, class: 'timeline-new-moon', 'aria-label': '朔', role: 'img' }));
            svg.appendChild(svgNode(documentRef, 'circle', { cx: fullX, cy: rowY[rowIndex] + 22, r: 4, class: 'timeline-full-moon', 'aria-label': item.fullMoonLabel || '望附近', role: 'img' }));
          }
        }
      });
    });
    const pointer = svgNode(documentRef, 'line', { x1: left + width * model.pointerRatio, x2: left + width * model.pointerRatio, y1: 25, y2: 220, class: 'timeline-pointer', 'data-timeline-pointer': 'true' });
    const pointerLabel = svgNode(documentRef, 'text', { x: left + width * model.pointerRatio + 5, y: 20, class: 'timeline-pointer-label', 'data-timeline-pointer-label': 'true' }, model.dateLabel); svg.appendChild(pointer); svg.appendChild(pointerLabel); container.appendChild(svg);
    const scrub = documentRef.createElement('input'); scrub.type = 'range'; scrub.className = 'timeline-scrubber'; scrub.min = String(model.annual.startUtc); scrub.max = String(model.annual.endUtc - 1); scrub.value = String(Math.max(model.annual.startUtc, Math.min(model.annual.endUtc - 1, model.pointerInstantUtc))); scrub.setAttribute('aria-label', '按日期浏览本地年份：方向键前后一天，Page 键前后七天，Home 和 End 到年份边界');
    const controller = timelineScrubController({ clock: config.clock, annual: model.annual }); scrub.addEventListener('keydown', controller.keydown); scrub.addEventListener('input', function () { if (config.clock && config.clock.setInstant) config.clock.setInstant(Number(scrub.value)); }); container.appendChild(scrub);
    [1, 2, 4].forEach(function (zoom) { const button = documentRef.createElement('button'); button.type = 'button'; button.textContent = zoom + '×'; button.setAttribute('aria-pressed', String(zoom === 1)); button.addEventListener('click', function () { svg.style.width = (900 * zoom) + 'px'; svg.style.minWidth = (900 * zoom) + 'px'; Array.prototype.forEach.call(zoomGroup.children, function (node) { node.setAttribute('aria-pressed', String(node === button)); }); const x = width * model.pointerRatio * zoom; if (container.scrollLeft != null) container.scrollLeft = Math.max(0, x - (container.clientWidth || 300) / 2); }); zoomGroup.appendChild(button); });
    return { svg, pointer, pointerLabel, scrub, model };
  }
  function updateTimelinePointer(rendered, model) {
    if (!rendered || !model) return;
    const x = 70 + 900 * model.pointerRatio;
    rendered.pointer.setAttribute('x1', x); rendered.pointer.setAttribute('x2', x); rendered.pointerLabel.setAttribute('x', x + 5); rendered.pointerLabel.textContent = model.dateLabel;
    rendered.scrub.value = String(Math.max(model.annual.startUtc, Math.min(model.annual.endUtc - 1, model.pointerInstantUtc)));
  }
  function appendCardRows(container, card, documentRef) {
    if (!container || !documentRef || !documentRef.createElement) return;
    while (container.firstChild) container.removeChild(container.firstChild);
    const list = documentRef.createElement('dl'); list.className = 'knowledge-card-values';
    (card.rows || []).forEach(function (row) {
      const term = documentRef.createElement('dt'), definition = documentRef.createElement('dd');
      term.textContent = row[0]; term.title = '天文读数的简短说明见本卡下方。'; definition.textContent = row[1];
      list.appendChild(term); list.appendChild(definition);
    });
    container.appendChild(list);
    const explanation = documentRef.createElement('p'); explanation.className = 'knowledge-card-explanation'; explanation.textContent = card.explanation || card.body || ''; container.appendChild(explanation);
  }
  function renderSixtyYearRing(container, documentRef, Calendar) {
    if (!container || !documentRef || !documentRef.createElementNS) return;
    while (container.firstChild) container.removeChild(container.firstChild);
    const svg = svgNode(documentRef, 'svg', { viewBox: '0 0 240 240', role: 'img', 'aria-label': '六十甲子环，文字与序号双重标识' });
    svg.appendChild(svgNode(documentRef, 'circle', { cx: 120, cy: 120, r: 92, fill: 'none', stroke: 'currentColor' }));
    for (let index = 0; index < 60; index += 1) {
      const angle = -Math.PI / 2 + index * Math.PI * 2 / 60, year = 1984 + index, name = yearLookupView(year, Calendar).ganzhi;
      const x = 120 + Math.cos(angle) * 105, y = 120 + Math.sin(angle) * 105;
      svg.appendChild(svgNode(documentRef, 'text', { x, y, 'text-anchor': 'middle', 'font-size': 7, 'aria-label': `${index + 1} ${name}` }, `${index + 1}${name}`));
    }
    container.appendChild(svg);
  }
  function create(options) {
    const config = options || {}, root = config.root, clock = config.clock, Calendar = config.Calendar, Observer = config.Observer || {}, now = config.now || Date.now;
    if (!root || !root.getElementById || !clock || !Calendar || typeof Calendar.zonedLocalDateTimeToUtc !== 'function') throw new TypeError('root, clock, and Calendar are required');
    const timers = config.timers || { setTimeout: setTimeout, clearTimeout: clearTimeout };
    const onRenderRequested = typeof config.onRenderRequested === 'function' ? config.onRenderRequested : function () {};
    const onSelectedScene = typeof config.onSelectedScene === 'function' ? config.onSelectedScene : function () {};
    const onLayerChange = typeof config.onLayerChange === 'function' ? config.onLayerChange : function () {};
    const onAdvancedLayer = typeof config.onAdvancedLayer === 'function' ? config.onAdvancedLayer : function () { return false; };
    const onRetry3d = typeof config.onRetry3d === 'function' ? config.onRetry3d : function () {};
    const onError = typeof config.onError === 'function' ? config.onError : function () {};
    const onRecovered = typeof config.onRecovered === 'function' ? config.onRecovered : function () {};
    const StarCatalog = config.StarCatalog || {};
    const listeners = [], nodes = {};
    let previous = null, highlightTimer = null, disposed = false, lastStatus = null, timelineKey = null, timelineAnnual = null, renderedTimeline = null, advancedInitialized = false, catalogReader = null, activeFallbackCode = null, activeFallbackRetry = false;
    function get(id) { return nodes[id] || (nodes[id] = root.getElementById(id)); }
    function listen(id, type, fn) { const target = get(id); if (target && target.addEventListener) { target.addEventListener(type, fn); listeners.push([target, type, fn]); } }
    function status(message) { if (message === lastStatus) return; lastStatus = message; const target = get('appStatus'); if (target) target.textContent = message || ''; }
    function parseLocal(value) {
      const match = /^(\d{4,})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value || '');
      return match ? { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]), hour: Number(match[4]), minute: Number(match[5]), second: 0 } : null;
    }
    function applyDateTime() {
      const fields = parseLocal(get('dateTimeInput') && get('dateTimeInput').value), result = Calendar.zonedLocalDateTimeToUtc(fields || {}, clock.getState().timeZone);
      if (!result || !Number.isFinite(result.instantUtc)) { status(result && result.warning && result.warning.message || '本地日期或时间无效。'); return; }
      clock.setInstant(result.instantUtc);
      if (result.warning) status(result.warning.message); else status('');
    }
    function presetLocation(value) {
      const name = PRESET_KEYS[value];
      return (Observer.PRESET_LOCATIONS || []).find((item) => item.name === name) || null;
    }
    function updateLocationInputs(location) {
      const latitude = get('latitudeInput'), longitude = get('longitudeInput'); if (!latitude || !longitude) return;
      const custom = get('locationSelect') && get('locationSelect').value === 'custom'; latitude.disabled = !custom; longitude.disabled = !custom;
      if (!custom && location) { latitude.value = String(location.latitudeDeg); longitude.value = String(location.longitudeDeg); }
    }
    function applyCustomLocation() {
      const latitude = Number(get('latitudeInput') && get('latitudeInput').value), longitude = Number(get('longitudeInput') && get('longitudeInput').value);
      if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) { status('纬度必须是 -90° 到 90° 的有限数值。'); return; }
      if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) { status('经度必须是 -180° 到 180° 的有限数值。'); return; }
      clock.setLocation({ name: '自定义地点', latitudeDeg: latitude, longitudeDeg: longitude }); status('');
    }
    function advancedStatus(message) { const output = get('advancedCatalogStatus'); if (output) output.textContent = message || ''; }
    function advancedSummary(result) {
      const target = get('advancedCatalogSummary'); if (!target) return;
      while (target.firstChild) target.removeChild(target.firstChild);
      const text = root.createElement('p'); text.textContent = `已接受 ${result.acceptedRows} 条，跳过 ${result.skippedRows} 条。`;
      target.appendChild(text);
      if (result.stars.length) {
        const list = root.createElement('ul');
        result.stars.slice(0, 8).forEach(function (star) { const item = root.createElement('li'); item.textContent = `${star.name}：RA ${star.raDeg.toFixed(3)}°，Dec ${star.decDeg.toFixed(3)}°`; list.appendChild(item); });
        target.appendChild(list);
      }
    }
    function initializeAdvanced() {
      if (advancedInitialized) return;
      advancedInitialized = true;
      if (!onAdvancedLayer('initialize', true)) advancedStatus('三维场景不可用；仍可在本地读取、验证和查看 CSV 摘要。');
    }
    function toggleAdvanced(id) { initializeAdvanced(); onAdvancedLayer(id, !!(get(id) && get(id).checked)); onRenderRequested(); }
    function readCatalogFile() {
      const input = get('advancedCatalogInput'), file = input && input.files && input.files[0];
      if (!file || !StarCatalog.validateFile || !StarCatalog.parseCsv) return;
      try { StarCatalog.validateFile(file); }
      catch (error) { advancedStatus(error.message); return; }
      const Reader = config.FileReader || (typeof FileReader !== 'undefined' ? FileReader : null);
      if (!Reader) { advancedStatus('当前浏览器无法读取本地文件；未上传或发送任何数据。'); return; }
      if (catalogReader && typeof catalogReader.abort === 'function') catalogReader.abort();
      const reader = new Reader(); catalogReader = reader; advancedStatus('正在只在本地读取 CSV…');
      reader.onerror = function () { if (disposed || catalogReader !== reader) return; advancedStatus('本地 CSV 读取失败；文件没有离开此设备。'); catalogReader = null; };
      reader.onabort = function () { if (!disposed && catalogReader === reader) catalogReader = null; };
      reader.onload = function () {
        if (disposed || catalogReader !== reader) return;
        try {
          const unit = get('advancedRaUnit') && get('advancedRaUnit').value;
          const result = StarCatalog.parseCsv(String(reader.result || ''), { raUnit: unit });
          if (result.fatalErrors.length) { advancedStatus(result.fatalErrors.join(' ')); return; }
          advancedSummary(result); onRecovered('ADVANCED_CSV_FAILED'); advancedStatus(`本地导入完成：${result.acceptedRows} 条可用，${result.skippedRows} 条已跳过。`);
          if (!onAdvancedLayer('starCatalog', result.stars)) advancedStatus(`本地导入完成：${result.acceptedRows} 条可用，${result.skippedRows} 条已跳过。三维场景不可用，显示摘要。`);
          onRenderRequested();
        } catch (_) { advancedStatus('CSV 解析失败；仍可继续使用主要学习内容。'); onError('ADVANCED_CSV_FAILED'); }
        finally { if (catalogReader === reader) catalogReader = null; }
      };
      reader.readAsText(file, 'utf-8');
    }
    function setFallback(worldState, code, retryAvailable) {
      const container = get('fallbackDiagram'), sceneGrid = get('sceneGrid') || get('astronomyCanvas') && get('astronomyCanvas').parentElement;
      const retry = get('retry3dButton'), canvas = get('astronomyCanvas'), labels = get('labelLayer');
      if (sceneGrid && sceneGrid.classList) sceneGrid.classList.add('scene-fallback-active');
      if (root.body && root.body.classList) root.body.classList.add('fallback-active');
      if (canvas && canvas.style) canvas.style.display = 'none';
      if (labels && labels.style) labels.style.display = 'none';
      if (container) renderFallback(container, fallbackViewModel(worldState, code), { document: root });
      activeFallbackCode = code; activeFallbackRetry = !!retryAvailable;
      if (retry) { retry.disabled = !retryAvailable; retry.hidden = !retryAvailable; }
      const tabs = get('sceneTabs'); if (tabs) tabs.hidden = true;
      ['showOrbit', 'showLabels', 'showObserver', 'showDayNight', 'advancedMilkyWay', 'advancedMansions', 'resetBtn', 'snapBtn', 'heliocentricSceneBtn', 'geocentricSceneBtn'].forEach(function (id) { const node = get(id); if (node) node.disabled = true; });
    }
    function clearFallback() {
      const container = get('fallbackDiagram'), sceneGrid = get('sceneGrid') || get('astronomyCanvas') && get('astronomyCanvas').parentElement;
      const retry = get('retry3dButton'), canvas = get('astronomyCanvas'), labels = get('labelLayer');
      if (sceneGrid && sceneGrid.classList) sceneGrid.classList.remove('scene-fallback-active');
      if (root.body && root.body.classList) root.body.classList.remove('fallback-active');
      if (canvas && canvas.style) canvas.style.display = '';
      if (labels && labels.style) labels.style.display = '';
      if (container) while (container.firstChild) container.removeChild(container.firstChild);
      activeFallbackCode = null; activeFallbackRetry = false;
      if (retry) retry.hidden = true;
      const tabs = get('sceneTabs'); if (tabs) tabs.hidden = false;
      ['showOrbit', 'showLabels', 'showObserver', 'showDayNight', 'advancedMilkyWay', 'advancedMansions', 'resetBtn', 'snapBtn', 'heliocentricSceneBtn', 'geocentricSceneBtn'].forEach(function (id) { const node = get(id); if (node) node.disabled = false; });
    }
    function bind() {
      listen('dateTimeInput', 'change', applyDateTime); listen('previousDayButton', 'click', () => clock.stepDays(-1)); listen('nextDayButton', 'click', () => clock.stepDays(1)); listen('todayButton', 'click', () => clock.setInstant(now()));
      listen('playPauseButton', 'click', () => clock.getState().playing ? clock.pause() : clock.play());
      listen('speedSelect', 'change', () => clock.setDaysPerSecond(Number(get('speedSelect').value)));
      listen('timeZoneSelect', 'change', () => { const value = get('timeZoneSelect').value; const zone = value === 'local' ? Intl.DateTimeFormat().resolvedOptions().timeZone : value; clock.setTimeZone(zone); });
      listen('locationSelect', 'change', () => { const value = get('locationSelect').value; updateLocationInputs(clock.getState().location); if (value === 'custom') return; const location = presetLocation(value); if (location) clock.setLocation(location); });
      listen('latitudeInput', 'change', applyCustomLocation); listen('longitudeInput', 'change', applyCustomLocation);
      LAYER_IDS.forEach((id) => listen(id, 'change', () => onLayerChange(id, !!get(id).checked)));
      listen('advancedAstronomy', 'toggle', function () { if (get('advancedAstronomy').open) initializeAdvanced(); });
      listen('advancedMilkyWay', 'change', function () { toggleAdvanced('advancedMilkyWay'); });
      listen('advancedMansions', 'change', function () { toggleAdvanced('advancedMansions'); });
      listen('advancedCatalogInput', 'change', readCatalogFile);
      listen('retry3dButton', 'click', onRetry3d);
      listen('heliocentricSceneBtn', 'click', () => onSelectedScene('heliocentric')); listen('geocentricSceneBtn', 'click', () => onSelectedScene('geocentric'));
      listen('yearLookupInput', 'change', function () { renderYearLookup(); });
      listen('sixtyYearRingToggle', 'click', function () {
        const container = get('sixtyYearRing'); if (!container) return;
        const expanded = get('sixtyYearRingToggle').getAttribute && get('sixtyYearRingToggle').getAttribute('aria-expanded') === 'true';
        if (expanded) { while (container.firstChild) container.removeChild(container.firstChild); if (get('sixtyYearRingToggle').setAttribute) get('sixtyYearRingToggle').setAttribute('aria-expanded', 'false'); }
        else { renderSixtyYearRing(container, root, Calendar); if (get('sixtyYearRingToggle').setAttribute) get('sixtyYearRingToggle').setAttribute('aria-expanded', 'true'); }
      });
      if (root.addEventListener) { const keydown = (event) => { const target = event.target || {}; if (event.code === 'Space' && !target.isContentEditable && !/^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(target.tagName || '')) { if (event.preventDefault) event.preventDefault(); clock.getState().playing ? clock.pause() : clock.play(); } }; root.addEventListener('keydown', keydown); listeners.push([root, 'keydown', keydown]); }
    }
    function renderYearLookup() {
      const input = get('yearLookupInput'), output = get('yearLookupResult'); if (!input || !output) return;
      const view = yearLookupView(input.value, Calendar); output.textContent = view.message;
      if (input.setAttribute) input.setAttribute('aria-invalid', String(!view.valid));
    }
    function renderKnowledgeCards(worldState) {
      const documentRef = root;
      appendCardRows(get('currentMomentCardBody'), currentMomentCardView(worldState), documentRef);
      appendCardRows(get('solarSeasonCardBody'), solarSeasonCardView(worldState), documentRef);
      appendCardRows(get('calendarMoonCardBody'), calendarMoonCardView(worldState), documentRef);
      appendCardRows(get('ganzhiCardValues'), ganzhiCardView(worldState && worldState.ganzhi), documentRef);
      appendCardRows(get('observerCardBody'), observerCardView(worldState), documentRef);
      appendCardRows(get('whyCardBody'), whyCardView(worldState), documentRef);
    }
    function annualFromState(worldState, clockState, year, timeZone) {
      if (!worldState) return null;
      if (typeof config.getAnnualTimeline === 'function') return config.getAnnualTimeline(year, timeZone);
      return field(worldState, ['calendar', 'annualTimeline']) || worldState.annualTimeline || null;
    }
    function updateTimeline(clockState, worldState) {
      const container = get('timelineScroll'), display = worldState && worldState.displayTime || {};
      const notice = get('timelineNotice');
      if (!container) return;
      const key = String(display.year) + '|' + String(display.timeZone || worldState.timeZone || clockState.timeZone);
      if (timelineKey !== key) {
        timelineKey = key; timelineAnnual = null; renderedTimeline = null;
        try { timelineAnnual = annualFromState(worldState, clockState, display.year, display.timeZone || worldState.timeZone || clockState.timeZone); }
        catch (_) { if (notice) notice.textContent = '本年度时间轴数据暂不可用；日期与当前历法读数仍可学习。'; onError('TIMELINE_RENDER_FAILED'); return; }
      }
      if (!timelineAnnual) { if (notice) notice.textContent = '本年度时间轴数据暂不可用；日期与当前历法读数仍可学习。'; return; }
      try {
        const model = timelineViewModel(timelineAnnual, worldState.instantUtc, display);
        if (!model) { if (notice) notice.textContent = '该时区或年份不在教学时间轴的可用范围。'; return; }
        if (notice) notice.textContent = '';
        if (!renderedTimeline) { renderedTimeline = renderTimeline(container, model, { clock, document: root, timeZone: key.split('|')[1] }); }
        else updateTimelinePointer(renderedTimeline, model);
        onRecovered('TIMELINE_RENDER_FAILED');
      } catch (_) { if (notice) notice.textContent = '本年度时间轴数据暂不可用；日期与当前历法读数仍可学习。'; onError('TIMELINE_RENDER_FAILED'); }
    }
    function update(clockState, worldState) {
      if (disposed) return; const model = controlViewModel({ clock: clockState, displayTime: worldState && worldState.displayTime });
      const dateTime = get('dateTimeInput'), play = get('playPauseButton'), speed = get('speedSelect'), resolved = get('resolvedTimeZone');
      if (dateTime) dateTime.value = model.dateTimeValue; if (play) { play.textContent = model.playLabel; if (play.setAttribute) play.setAttribute('aria-pressed', String(model.playing)); } if (speed) speed.value = String(model.speed); if (resolved) resolved.textContent = '当前：' + model.timeZone;
      updateLocationInputs(clockState.location);
      updateTimeline(clockState, worldState);
      renderKnowledgeCards(worldState);
      if (activeFallbackCode) setFallback(worldState, activeFallbackCode, activeFallbackRetry);
      const changes = boundaryChanges(previous, worldState); previous = worldState;
      if (changes.length && clockState.playing) { const target = get('timeControls'); if (target && target.classList) target.classList.add('boundary-highlight'); if (highlightTimer) timers.clearTimeout(highlightTimer); highlightTimer = timers.setTimeout(() => { if (target && target.classList) target.classList.remove('boundary-highlight'); highlightTimer = null; }, 650); }
      onRenderRequested();
    }
    bind();
    return Object.freeze({ update, setFallback, clearFallback, dispose: function () { if (disposed) return; disposed = true; const reader = catalogReader; catalogReader = null; if (reader && typeof reader.abort === 'function') reader.abort(); if (highlightTimer) timers.clearTimeout(highlightTimer); listeners.splice(0).forEach((item) => item[0].removeEventListener(item[1], item[2])); } });
  }
  return Object.freeze({ controlViewModel, boundaryChanges, timelineViewModel, lunarSegmentView, timelineScrubController, renderTimeline, fallbackViewModel, renderFallback, currentMomentCardView, solarSeasonCardView, calendarMoonCardView, ganzhiCardView, observerCardView, whyCardView, yearLookupView, create });
});
