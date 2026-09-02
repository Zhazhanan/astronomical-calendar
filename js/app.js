/* Page application: one calendar state drives optional synchronized 3D views. */
;(function (root, factory) { const api = factory(); if (typeof module === 'object' && module.exports) module.exports = api; if (root) { root.AstroEducation = root.AstroEducation || {}; root.AstroEducation.App = api; } })(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function start(options) {
    const config = options || {}, root = config.root || globalThis, education = config.AstroEducation || root.AstroEducation || {}, documentRef = config.document || root.document, windowRef = config.window || root.window || root;
    if (!documentRef || !documentRef.getElementById || !education.TimeController || !education.WorldState) return fail(documentRef, '教学数据不可用：缺少 TimeController 或 WorldState');
    const timeController = config.timeController || education.TimeController.create({ instantUtc: Date.now(), timeZone: 'Asia/Shanghai', location: { name: '北京', latitudeDeg: 39.9042, longitudeDeg: 116.4074 } });
    let host = null, scenes = null, currentState = null, educationPanel = null, requestId = null, stopped = false, hiddenWasPlaying = false, contextWasPlaying = false, contextLost = false, previousFrameTime = null, redrawRequested = false;
    const advancedLayers = { initialized: false, advancedMilkyWay: false, advancedMansions: false, starCatalog: null };
    const listeners = [], controlListeners = [], raf = windowRef.requestAnimationFrame && windowRef.requestAnimationFrame.bind(windowRef), caf = windowRef.cancelAnimationFrame && windowRef.cancelAnimationFrame.bind(windowRef);
    const reducedMotion = !!(windowRef.matchMedia && windowRef.matchMedia('(prefers-reduced-motion: reduce)').matches);
    function listen(target, name, fn) { if (target && target.addEventListener) { target.addEventListener(name, fn); listeners.push([target, name, fn]); } }
    function listenControl(target, name, fn) { if (target && target.addEventListener) { target.addEventListener(name, fn); controlListeners.push([target, name, fn]); } }
    function clearControlListeners() { controlListeners.splice(0).forEach(function (listener) { listener[0].removeEventListener(listener[1], listener[2]); }); }
    function applyControllerState(state) { currentState = education.WorldState.create({ instantUtc: state.instantUtc, timeZone: state.timeZone, location: state.location }); updateHud(documentRef, currentState); if (educationPanel) educationPanel.update(state, currentState); if (host) host.renderFrame(currentState); requestRedraw(); }
    function applyAdvancedLayer(id, value) {
      if (id === 'initialize') advancedLayers.initialized = true;
      else if (id === 'advancedMilkyWay' || id === 'advancedMansions' || id === 'starCatalog') advancedLayers[id] = value;
      let applied = false; if (!scenes) return false;
      Object.keys(scenes).forEach(function (sceneId) {
        const scene = scenes[sceneId]; if (!scene) return;
        if (id === 'initialize' && typeof scene.initializeAdvancedLayers === 'function') { scene.initializeAdvancedLayers(); applied = true; }
        if (id !== 'initialize' && typeof scene.setAdvancedLayer === 'function') { scene.setAdvancedLayer(id, value, currentState); applied = true; }
      });
      requestRedraw(); return applied;
    }
    function restoreAdvancedLayers() {
      if (!advancedLayers.initialized) return;
      applyAdvancedLayer('initialize', true);
      applyAdvancedLayer('advancedMilkyWay', advancedLayers.advancedMilkyWay);
      applyAdvancedLayer('advancedMansions', advancedLayers.advancedMansions);
      if (advancedLayers.starCatalog) applyAdvancedLayer('starCatalog', advancedLayers.starCatalog);
    }
    educationPanel = config.educationPanel || (education.EducationPanel && education.EducationPanel.create ? education.EducationPanel.create({ root: documentRef, clock: timeController, Calendar: education.Calendar, Observer: education.Observer, StarCatalog: education.StarCatalog, FileReader: config.FileReader, getAnnualTimeline: typeof education.WorldState.annualTimeline === 'function' ? function (year, timeZone) { return education.WorldState.annualTimeline(year, timeZone); } : null, onRenderRequested: requestRedraw, onSelectedScene: function (id) { if (host) { host.setSelectedScene(id); updateSceneButtons(documentRef, id); requestRedraw(); } }, onLayerChange: function (id, visible) { if (!scenes) return; Object.keys(scenes).forEach(function (sceneId) { const scene = scenes[sceneId]; if (scene && typeof scene.setLayerVisibility === 'function') scene.setLayerVisibility(id, visible); }); requestRedraw(); }, onAdvancedLayer: applyAdvancedLayer }) : null);
    const unsubscribe = timeController.subscribe(applyControllerState);
    applyControllerState(timeController.getState());
    const canvas = documentRef.getElementById('astronomyCanvas'), heliocentricViewport = documentRef.getElementById('heliocentricViewport'), geocentricViewport = documentRef.getElementById('geocentricViewport');
    const THREE = config.THREE || root.THREE;
    if (!THREE || !education.SceneHost || !education.HeliocentricScene || !education.GeocentricScene || !canvas || !heliocentricViewport || !geocentricViewport) { setStatus(documentRef, 'WEBGL_UNAVAILABLE：三维场景不可用，日期和历法信息仍可使用。'); return handle(); }
    const createScenes = function () { return { heliocentric: education.HeliocentricScene.create({ THREE, interactionElement: interactionOf(heliocentricViewport), labelLayer: documentRef.getElementById('labelLayer'), reducedMotion }), geocentric: education.GeocentricScene.create({ THREE, interactionElement: interactionOf(geocentricViewport), labelLayer: documentRef.getElementById('labelLayer'), reducedMotion, solarTermNames: solarTermNames(education) }) }; };
    scenes = config.scenes || createScenes();
    host = config.host || education.SceneHost.create({ THREE, canvas, sceneGrid: canvas.parentElement, containers: { heliocentric: heliocentricViewport, geocentric: geocentricViewport }, scenes, layoutMode: modeForMedia(windowRef), selectedScene: 'heliocentric', window: windowRef, rebuildScenes: config.scenes ? null : function () { scenes = createScenes(); return scenes; }, onScenesRebuilt: function () { bindControls(); restoreAdvancedLayers(); }, onError: function () { setStatus(documentRef, 'WEBGL_UNAVAILABLE：三维场景不可用，日期和历法信息仍可使用。'); }, onContextChange: function (event) { if (event.type === 'lost') { contextLost = true; contextWasPlaying = timeController.getState().playing; if (contextWasPlaying) timeController.pause(); setStatus(documentRef, 'WEBGL_CONTEXT_LOST：三维场景已暂停，日期和历法信息仍可使用。'); } else { contextLost = false; if (contextWasPlaying && documentRef.hidden) hiddenWasPlaying = true; else if (contextWasPlaying && !reducedMotion) timeController.play(); contextWasPlaying = false; setStatus(documentRef, 'WebGL 场景已恢复。'); requestRedraw(); } } });
    if (!host || !host.available) { host = null; setStatus(documentRef, 'WEBGL_UNAVAILABLE：三维场景不可用，日期和历法信息仍可使用。'); return handle(); }
    // Host is the only scene update owner: renderFrame updates each viewport exactly once.
    host.renderFrame(currentState);
    bindControls(); bindResponsive(); bindButtons(); setStatus(documentRef, reducedMotion ? '已遵从系统的减少动态效果设置。' : '');
    return handle();
    function handle() { listen(documentRef, 'visibilitychange', onVisibility); return Object.freeze({ available: !!host, stop: stop }); }
    function bindControls() { clearControlListeners(); Object.keys(scenes).forEach(function (id) { const controls = scenes[id].controls; listenControl(controls, 'change', requestRedraw); listenControl(controls, 'start', requestRedraw); listenControl(controls, 'end', requestRedraw); }); }
    function bindResponsive() { const queries = ['(max-width: 600px)', '(max-width: 1024px)']; queries.forEach(function (name) { const query = windowRef.matchMedia && windowRef.matchMedia(name); const change = function () { host.setLayoutMode(modeForMedia(windowRef)); requestRedraw(); }; listen(query, 'change', change); }); }
    function bindButtons() { listen(documentRef.getElementById('resetBtn'), 'click', function () { Object.keys(scenes).forEach(function (id) { if (scenes[id].resetView) scenes[id].resetView(); }); requestRedraw(); }); listen(documentRef.getElementById('snapBtn'), 'click', function () { exportSnapshot(documentRef, canvas, host, currentState); }); if (!educationPanel) ['heliocentric', 'geocentric'].forEach(function (id) { listen(documentRef.getElementById(id + 'SceneBtn'), 'click', function () { host.setSelectedScene(id); updateSceneButtons(documentRef, id); requestRedraw(); }); }); }
    function requestRedraw() { redrawRequested = true; schedule(); }
    function schedule() { const playing = timeController.getState().playing; if (!requestId && raf && !stopped && !documentRef.hidden && (redrawRequested || (playing && !reducedMotion))) requestId = raf(frame); }
    function frame(now) { requestId = null; const delta = previousFrameTime == null ? 0 : Math.max(0, now - previousFrameTime); previousFrameTime = now; redrawRequested = false; if (timeController.getState().playing && !reducedMotion) timeController.tick(delta); else if (host) host.renderFrame(currentState); schedule(); }
    function onVisibility() { if (documentRef.hidden) { hiddenWasPlaying = timeController.getState().playing || contextWasPlaying || hiddenWasPlaying; if (timeController.getState().playing) timeController.pause(); previousFrameTime = null; if (requestId && caf) caf(requestId); requestId = null; } else { previousFrameTime = null; if (hiddenWasPlaying && !reducedMotion && !contextLost) timeController.play(); if (!contextLost) hiddenWasPlaying = false; requestRedraw(); } }
    function stop() { if (stopped) return; stopped = true; if (requestId && caf) caf(requestId); unsubscribe(); if (educationPanel && educationPanel.dispose) educationPanel.dispose(); clearControlListeners(); listeners.forEach(function (l) { l[0].removeEventListener(l[1], l[2]); }); if (host) host.dispose(); }
  }
  function modeForMedia(windowRef) { if (!windowRef || !windowRef.matchMedia) return 'desktop'; if (windowRef.matchMedia('(max-width: 600px)').matches) return 'mobile'; if (windowRef.matchMedia('(max-width: 1024px)').matches) return 'tablet'; return 'desktop'; }
  function interactionOf(viewport) { return viewport && viewport.querySelector ? viewport.querySelector('.scene-interaction') : null; }
  function updateSceneButtons(d, selected) { ['heliocentric', 'geocentric'].forEach(function (id) { const node = d.getElementById(id + 'SceneBtn'); if (node && node.setAttribute) node.setAttribute('aria-pressed', String(id === selected)); }); }
  function solarTermNames(education) { const terms = education.Astronomy && education.Astronomy.SOLAR_TERMS; return Array.isArray(terms) ? terms.map(function (term) { return term.name; }) : []; }
  function updateHud(d, state) { const display = state.displayTime || {}, date = [display.year, display.month, display.day].map(function (v) { return String(v || '—').padStart(2, '0'); }).join('-') + ' ' + [display.hour, display.minute, display.second].map(function (v) { return String(v || '—').padStart(2, '0'); }).join(':'); text(d, 'localTime', '本地时间: ' + date + ' (' + (display.timeZone || '') + ')'); text(d, 'utcTime', 'UTC: ' + new Date(state.instantUtc).toISOString().replace('T', ' ').slice(0, 19) + 'Z'); text(d, 'solarLon', '太阳黄经 (λ): ' + state.sun.longitudeDeg.toFixed(2) + '°'); text(d, 'solarAngleValue', '地球—太阳黄经角: ' + state.sun.longitudeDeg.toFixed(2) + '°'); const terms = state.solarTerms || {}; text(d, 'currentJieqi', '当前节气: ' + ((terms.current && terms.current.name) || '—')); text(d, 'toNextJieqi', '距下节气: ' + ((terms.next && terms.next.name) || '—')); }
  function text(d, id, value) { const node = d.getElementById(id); if (node) node.textContent = value; }
  function setStatus(d, value) { if (d && d.getElementById) text(d, 'appStatus', value); }
  function fail(d, message) { setStatus(d, message); return Object.freeze({ available: false, stop: function () {} }); }
  function exportSnapshot(d, canvas, host, state) { if (!canvas || !canvas.toDataURL) return; host.renderFrame(state); const link = d.createElement('a'); link.href = canvas.toDataURL('image/png'); link.download = 'tianwen_3d_snapshot.png'; if (link.click) link.click(); }
  return Object.freeze({ start });
});
