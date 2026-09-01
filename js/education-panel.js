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
  function create(options) {
    const config = options || {}, root = config.root, clock = config.clock, Calendar = config.Calendar, Observer = config.Observer || {}, now = config.now || Date.now;
    if (!root || !root.getElementById || !clock || !Calendar || typeof Calendar.zonedLocalDateTimeToUtc !== 'function') throw new TypeError('root, clock, and Calendar are required');
    const timers = config.timers || { setTimeout: setTimeout, clearTimeout: clearTimeout };
    const onRenderRequested = typeof config.onRenderRequested === 'function' ? config.onRenderRequested : function () {};
    const onSelectedScene = typeof config.onSelectedScene === 'function' ? config.onSelectedScene : function () {};
    const onLayerChange = typeof config.onLayerChange === 'function' ? config.onLayerChange : function () {};
    const listeners = [], nodes = {};
    let previous = null, highlightTimer = null, disposed = false, lastStatus = null;
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
    function update(clockState, worldState) {
      if (disposed) return; const model = controlViewModel({ clock: clockState, displayTime: worldState && worldState.displayTime });
      const dateTime = get('dateTimeInput'), play = get('playPauseButton'), speed = get('speedSelect'), resolved = get('resolvedTimeZone');
      if (dateTime) dateTime.value = model.dateTimeValue; if (play) { play.textContent = model.playLabel; if (play.setAttribute) play.setAttribute('aria-pressed', String(model.playing)); } if (speed) speed.value = String(model.speed); if (resolved) resolved.textContent = '当前：' + model.timeZone;
      updateLocationInputs(clockState.location);
      const changes = boundaryChanges(previous, worldState); previous = worldState;
      if (changes.length && clockState.playing) { const target = get('timeControls'); if (target && target.classList) target.classList.add('boundary-highlight'); if (highlightTimer) timers.clearTimeout(highlightTimer); highlightTimer = timers.setTimeout(() => { if (target && target.classList) target.classList.remove('boundary-highlight'); highlightTimer = null; }, 650); }
      onRenderRequested();
    }
    bind();
    return Object.freeze({ update, dispose: function () { if (disposed) return; disposed = true; if (highlightTimer) timers.clearTimeout(highlightTimer); listeners.splice(0).forEach((item) => item[0].removeEventListener(item[1], item[2])); } });
  }
  return Object.freeze({ controlViewModel, boundaryChanges, create });
});
