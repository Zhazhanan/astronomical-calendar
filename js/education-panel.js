;(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) { root.AstroEducation = root.AstroEducation || {}; root.AstroEducation.EducationPanel = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const PRESET_KEYS = Object.freeze({ beijing: '北京', shanghai: '上海', guangzhou: '广州' });
  const LAYER_IDS = Object.freeze(['showOrbit', 'showLabels', 'showObserver', 'showDayNight']);
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
    const tip = documentRef.createElement('output'); tip.className = 'timeline-tooltip'; tip.setAttribute('aria-live', 'polite'); tip.textContent = '将指针悬停或聚焦节气名称查看时刻。';
    toolbar.appendChild(tip);
    const zoomGroup = documentRef.createElement('div'); zoomGroup.className = 'timeline-zoom'; zoomGroup.setAttribute('aria-label', '时间轴缩放');
    toolbar.appendChild(zoomGroup); container.appendChild(toolbar);
    const svg = svgNode(documentRef, 'svg', { viewBox: '0 0 1000 245', role: 'img', 'aria-label': '公历、二十四节气和农历统一年度时间轴', 'data-timeline-svg': 'true' });
    const defs = svgNode(documentRef, 'defs'); const pattern = svgNode(documentRef, 'pattern', { id: 'lunarLeapDiagonal', width: 8, height: 8, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' });
    pattern.appendChild(svgNode(documentRef, 'rect', { width: 8, height: 8, fill: '#4c1d95' })); pattern.appendChild(svgNode(documentRef, 'line', { x1: 0, y1: 0, x2: 0, y2: 8, stroke: '#f8fafc', 'stroke-width': 2, opacity: .52 })); defs.appendChild(pattern); svg.appendChild(defs);
    const left = 70, width = 900, rowY = [55, 125, 195];
    model.rows.forEach(function (row, rowIndex) {
      svg.appendChild(svgNode(documentRef, 'text', { x: 8, y: rowY[rowIndex] + 5, class: 'timeline-row-label' }, row.label));
      svg.appendChild(svgNode(documentRef, 'line', { x1: left, y1: rowY[rowIndex], x2: left + width, y2: rowY[rowIndex], class: 'timeline-axis' }));
      row.items.forEach(function (item, index) {
        const start = left + width * clampRatio(item.startRatio), end = left + width * clampRatio(item.endRatio == null ? item.startRatio : item.endRatio);
        if (row.kind === 'solar-terms') {
          const button = svgNode(documentRef, 'text', { x: start, y: rowY[rowIndex] - (index % 2 ? 14 : -25), class: 'timeline-term', tabindex: 0, role: 'button', 'aria-label': item.name + '，年度位置 ' + Math.round(item.startRatio * 100) + '%' }, item.name);
          const message = item.name + '：' + new Date(item.instantUtc).toLocaleString('zh-CN', { timeZone: config.timeZone || undefined, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
          function show() { tip.textContent = message; }
          button.addEventListener('pointerenter', show); button.addEventListener('focus', show); svg.appendChild(svgNode(documentRef, 'circle', { cx: start, cy: rowY[rowIndex], r: 4, class: 'timeline-term-marker' })); svg.appendChild(button);
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
  function create(options) {
    const config = options || {}, root = config.root, clock = config.clock, Calendar = config.Calendar, Observer = config.Observer || {}, now = config.now || Date.now;
    if (!root || !root.getElementById || !clock || !Calendar || typeof Calendar.zonedLocalDateTimeToUtc !== 'function') throw new TypeError('root, clock, and Calendar are required');
    const timers = config.timers || { setTimeout: setTimeout, clearTimeout: clearTimeout };
    const onRenderRequested = typeof config.onRenderRequested === 'function' ? config.onRenderRequested : function () {};
    const onSelectedScene = typeof config.onSelectedScene === 'function' ? config.onSelectedScene : function () {};
    const onLayerChange = typeof config.onLayerChange === 'function' ? config.onLayerChange : function () {};
    const listeners = [], nodes = {};
    let previous = null, highlightTimer = null, disposed = false, lastStatus = null, timelineKey = null, timelineAnnual = null, renderedTimeline = null;
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
    function bind() {
      listen('dateTimeInput', 'change', applyDateTime); listen('previousDayButton', 'click', () => clock.stepDays(-1)); listen('nextDayButton', 'click', () => clock.stepDays(1)); listen('todayButton', 'click', () => clock.setInstant(now()));
      listen('playPauseButton', 'click', () => clock.getState().playing ? clock.pause() : clock.play());
      listen('speedSelect', 'change', () => clock.setDaysPerSecond(Number(get('speedSelect').value)));
      listen('timeZoneSelect', 'change', () => { const value = get('timeZoneSelect').value; const zone = value === 'local' ? Intl.DateTimeFormat().resolvedOptions().timeZone : value; clock.setTimeZone(zone); });
      listen('locationSelect', 'change', () => { const value = get('locationSelect').value; updateLocationInputs(clock.getState().location); if (value === 'custom') return; const location = presetLocation(value); if (location) clock.setLocation(location); });
      listen('latitudeInput', 'change', applyCustomLocation); listen('longitudeInput', 'change', applyCustomLocation);
      LAYER_IDS.forEach((id) => listen(id, 'change', () => onLayerChange(id, !!get(id).checked)));
      listen('heliocentricSceneBtn', 'click', () => onSelectedScene('heliocentric')); listen('geocentricSceneBtn', 'click', () => onSelectedScene('geocentric'));
      if (root.addEventListener) { const keydown = (event) => { const target = event.target || {}; if (event.code === 'Space' && !target.isContentEditable && !/^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(target.tagName || '')) { if (event.preventDefault) event.preventDefault(); clock.getState().playing ? clock.pause() : clock.play(); } }; root.addEventListener('keydown', keydown); listeners.push([root, 'keydown', keydown]); }
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
        catch (error) { if (notice) notice.textContent = '本年度时间轴数据暂不可用；日期与当前历法读数仍可学习。'; return; }
      }
      if (!timelineAnnual) { if (notice) notice.textContent = '本年度时间轴数据暂不可用；日期与当前历法读数仍可学习。'; return; }
      const model = timelineViewModel(timelineAnnual, worldState.instantUtc, display);
      if (!model) { if (notice) notice.textContent = '该时区或年份不在教学时间轴的可用范围。'; return; }
      if (notice) notice.textContent = '';
      if (!renderedTimeline) { renderedTimeline = renderTimeline(container, model, { clock, document: root, timeZone: key.split('|')[1] }); }
      else updateTimelinePointer(renderedTimeline, model);
    }
    function update(clockState, worldState) {
      if (disposed) return; const model = controlViewModel({ clock: clockState, displayTime: worldState && worldState.displayTime });
      const dateTime = get('dateTimeInput'), play = get('playPauseButton'), speed = get('speedSelect'), resolved = get('resolvedTimeZone');
      if (dateTime) dateTime.value = model.dateTimeValue; if (play) { play.textContent = model.playLabel; if (play.setAttribute) play.setAttribute('aria-pressed', String(model.playing)); } if (speed) speed.value = String(model.speed); if (resolved) resolved.textContent = '当前：' + model.timeZone;
      updateLocationInputs(clockState.location);
      updateTimeline(clockState, worldState);
      const changes = boundaryChanges(previous, worldState); previous = worldState;
      if (changes.length && clockState.playing) { const target = get('timeControls'); if (target && target.classList) target.classList.add('boundary-highlight'); if (highlightTimer) timers.clearTimeout(highlightTimer); highlightTimer = timers.setTimeout(() => { if (target && target.classList) target.classList.remove('boundary-highlight'); highlightTimer = null; }, 650); }
      onRenderRequested();
    }
    bind();
    return Object.freeze({ update, dispose: function () { if (disposed) return; disposed = true; if (highlightTimer) timers.clearTimeout(highlightTimer); listeners.splice(0).forEach((item) => item[0].removeEventListener(item[1], item[2])); } });
  }
  return Object.freeze({ controlViewModel, boundaryChanges, timelineViewModel, lunarSegmentView, timelineScrubController, renderTimeline, create });
});
