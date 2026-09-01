/* Page application: synchronizes the two teaching scenes from one WorldState. */
;(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) { root.AstroEducation = root.AstroEducation || {}; root.AstroEducation.App = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const REQUIRED = Object.freeze(['TimeController', 'WorldState', 'SceneHost', 'HeliocentricScene', 'GeocentricScene']);

  function start(options) {
    const config = options || {};
    const root = config.root || (typeof globalThis !== 'undefined' ? globalThis : {});
    const education = config.AstroEducation || root.AstroEducation || {};
    const documentRef = config.document || root.document;
    const windowRef = config.window || root.window || root;
    const missing = REQUIRED.filter(function (name) { return !education[name]; });
    if (missing.length || !documentRef || !documentRef.getElementById) return fail(documentRef, '教学场景暂不可用：缺少 ' + (missing.join('、') || '页面环境'));

    const canvas = documentRef.getElementById('astronomyCanvas');
    const heliocentricViewport = documentRef.getElementById('heliocentricViewport');
    const geocentricViewport = documentRef.getElementById('geocentricViewport');
    const labelLayer = documentRef.getElementById('labelLayer');
    if (!canvas || !heliocentricViewport || !geocentricViewport) return fail(documentRef, '教学场景暂不可用：页面容器不完整');
    const THREE = config.THREE || root.THREE;
    if (!THREE) return fail(documentRef, '教学场景暂不可用：WebGL 模块未加载');

    const reducedMotion = !!(windowRef.matchMedia && windowRef.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const timeController = config.timeController || education.TimeController.create({
      instantUtc: Date.now(), timeZone: 'Asia/Shanghai',
      location: { name: '北京', latitudeDeg: 39.9042, longitudeDeg: 116.4074 }
    });
    const scenes = config.scenes || {
      heliocentric: education.HeliocentricScene.create({ THREE: THREE, interactionElement: interactionOf(heliocentricViewport), labelLayer: labelLayer, reducedMotion: reducedMotion }),
      geocentric: education.GeocentricScene.create({ THREE: THREE, interactionElement: interactionOf(geocentricViewport), labelLayer: labelLayer, reducedMotion: reducedMotion, solarTermNames: solarTermNames(education) })
    };
    const layoutMode = education.SceneHost.layoutModeForWidth((windowRef.innerWidth || 0));
    const host = config.host || education.SceneHost.create({
      THREE: THREE, canvas: canvas, sceneGrid: canvas.parentElement,
      containers: { heliocentric: heliocentricViewport, geocentric: geocentricViewport }, scenes: scenes,
      layoutMode: layoutMode, selectedScene: 'heliocentric', window: windowRef,
      onError: function () { setStatus(documentRef, 'WebGL 初始化失败；仍可使用日期和历法信息。'); },
      onContextChange: function (event) { setStatus(documentRef, event.type === 'lost' ? 'WebGL 上下文已暂停。' : 'WebGL 场景已恢复。'); }
    });
    if (!host || !host.available) return fail(documentRef, '此设备无法使用 WebGL；仍可使用日期和历法信息。');

    let currentState = null, requestId = null, stopped = false, hiddenWasPlaying = false, previousFrameTime = null, redrawRequested = false;
    const listeners = [], raf = windowRef.requestAnimationFrame && windowRef.requestAnimationFrame.bind(windowRef), caf = windowRef.cancelAnimationFrame && windowRef.cancelAnimationFrame.bind(windowRef);
    function listen(target, name, fn) { if (target && target.addEventListener) { target.addEventListener(name, fn); listeners.push([target, name, fn]); } }
    function makeWorldState(controllerState) {
      return education.WorldState.create({ instantUtc: controllerState.instantUtc, timeZone: controllerState.timeZone, location: controllerState.location });
    }
    function applyControllerState(controllerState) {
      currentState = makeWorldState(controllerState); // exactly once for this clock value
      scenes.heliocentric.update(currentState);
      scenes.geocentric.update(currentState);
      updateHud(documentRef, currentState);
      host.renderFrame(currentState);
      requestRedraw();
    }
    function needsFrames() {
      const state = timeController.getState();
      return !stopped && !documentRef.hidden && (state.playing || redrawRequested || controlsNeedFrames(scenes, reducedMotion));
    }
    function requestRedraw() { redrawRequested = true; schedule(); }
    function schedule() { if (!requestId && raf && needsFrames()) requestId = raf(frame); }
    function frame(now) {
      requestId = null;
      const delta = previousFrameTime == null ? 0 : Math.max(0, now - previousFrameTime);
      previousFrameTime = now;
      redrawRequested = false;
      if (timeController.getState().playing && !reducedMotion) timeController.tick(delta);
      else if (currentState) host.renderFrame(currentState);
      schedule();
    }
    function onVisibility() {
      if (documentRef.hidden) { hiddenWasPlaying = timeController.getState().playing; if (hiddenWasPlaying) timeController.pause(); previousFrameTime = null; if (requestId && caf) caf(requestId); requestId = null; return; }
      previousFrameTime = null;
      if (hiddenWasPlaying) timeController.play();
      hiddenWasPlaying = false; requestRedraw();
    }
    function onControlChange() { requestRedraw(); }
    Object.keys(scenes).forEach(function (id) { const controls = scenes[id].controls; listen(controls, 'change', onControlChange); listen(controls, 'start', onControlChange); listen(controls, 'end', onControlChange); });
    listen(documentRef, 'visibilitychange', onVisibility);
    const reset = documentRef.getElementById('resetBtn');
    listen(reset, 'click', function () { Object.keys(scenes).forEach(function (id) { resetSceneCamera(scenes[id]); }); requestRedraw(); });
    const snapshot = documentRef.getElementById('snapBtn');
    listen(snapshot, 'click', function () { exportSnapshot(documentRef, canvas, host, currentState); });
    const unsubscribe = timeController.subscribe(applyControllerState);
    applyControllerState(timeController.getState());
    setStatus(documentRef, reducedMotion ? '已遵从系统的减少动态效果设置。' : '');
    return Object.freeze({ stop: function () { if (stopped) return; stopped = true; if (requestId && caf) caf(requestId); if (unsubscribe) unsubscribe(); listeners.forEach(function (l) { l[0].removeEventListener(l[1], l[2]); }); host.dispose(); } });
  }
  function interactionOf(viewport) { return viewport && viewport.querySelector ? viewport.querySelector('.scene-interaction') : null; }
  function solarTermNames(education) { const terms = education.Astronomy && education.Astronomy.SOLAR_TERMS; return Array.isArray(terms) ? terms.map(function (term) { return term.name; }) : []; }
  function controlsNeedFrames() { return false; }
  function resetSceneCamera(scene) { if (!scene || !scene.camera || !scene.controls) return; const camera = scene.camera, controls = scene.controls; if (camera.position && camera.position.set) camera.position.set(0, 30, 56); if (controls.target && controls.target.set) controls.target.set(0, 0, 0); if (controls.update) controls.update(); }
  function updateHud(documentRef, state) { const display = state.displayTime || {}; const local = [display.year, display.month, display.day].map(function (v) { return String(v || '—').padStart(2, '0'); }).join('-') + ' ' + [display.hour, display.minute, display.second].map(function (v) { return String(v || '—').padStart(2, '0'); }).join(':'); setText(documentRef, 'localTime', '本地时间: ' + local + ' (' + (display.timeZone || '') + ')'); setText(documentRef, 'utcTime', 'UTC: ' + new Date(state.instantUtc).toISOString().replace('T', ' ').slice(0, 19) + 'Z'); setText(documentRef, 'solarLon', '太阳黄经 (λ): ' + state.sun.longitudeDeg.toFixed(2) + '°'); setText(documentRef, 'solarAngleValue', '地球—太阳黄经角: ' + state.sun.longitudeDeg.toFixed(2) + '°'); const terms = state.solarTerms || {}; setText(documentRef, 'currentJieqi', '当前节气: ' + ((terms.current && terms.current.name) || '—')); setText(documentRef, 'toNextJieqi', '距下节气: ' + ((terms.next && terms.next.name) || '—')); setText(documentRef, 'sunCoords', '太阳赤经/赤纬: 教学视图见黄道场景'); }
  function setText(documentRef, id, text) { const node = documentRef.getElementById(id); if (node) node.textContent = text; }
  function setStatus(documentRef, text) { const node = documentRef && documentRef.getElementById && documentRef.getElementById('appStatus'); if (node) node.textContent = text; }
  function fail(documentRef, message) { setStatus(documentRef, message); return Object.freeze({ available: false, stop: function () {} }); }
  function exportSnapshot(documentRef, canvas, host, state) { if (!canvas || !canvas.toDataURL) return; host.renderFrame(state); const link = documentRef.createElement('a'); link.href = canvas.toDataURL('image/png'); link.download = 'tianwen_snapshot.png'; if (link.click) link.click(); }
  return Object.freeze({ start: start });
});
