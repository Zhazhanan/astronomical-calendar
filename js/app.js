/* Page application: one calendar state drives optional synchronized 3D views. */
;(function (root, factory) { const api = factory(); if (typeof module === 'object' && module.exports) module.exports = api; if (root) { root.AstroEducation = root.AstroEducation || {}; root.AstroEducation.App = api; } })(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function start(options) {
    const config = options || {}, root = config.root || globalThis, education = config.AstroEducation || root.AstroEducation || {}, documentRef = config.document || root.document, windowRef = config.window || root.window || root;
    if (!documentRef || !documentRef.getElementById || !education.TimeController || !education.WorldState) return fail(documentRef, '教学数据不可用：缺少 TimeController 或 WorldState');
    const timeController = config.timeController || education.TimeController.create({ instantUtc: Date.now(), timeZone: 'Asia/Shanghai', location: { name: '北京', latitudeDeg: 39.9042, longitudeDeg: 116.4074 } });
    let host = null, scenes = null, currentState = null, lastGoodState = null, educationPanel = null, requestId = null, stopped = false, hiddenWasPlaying = false, contextWasPlaying = false, contextLost = false, previousFrameTime = null, redrawRequested = false, fallbackCode = null, faultSequence = 0;
    const faults = {};
    const advancedLayers = { initialized: false, advancedMilkyWay: false, advancedMansions: false, starCatalog: null };
    const listeners = [], controlListeners = [], raf = windowRef.requestAnimationFrame && windowRef.requestAnimationFrame.bind(windowRef), caf = windowRef.cancelAnimationFrame && windowRef.cancelAnimationFrame.bind(windowRef);
    const reducedMotion = !!(windowRef.matchMedia && windowRef.matchMedia('(prefers-reduced-motion: reduce)').matches);
    function listen(target, name, fn) { if (target && target.addEventListener) { target.addEventListener(name, fn); listeners.push([target, name, fn]); } }
    function listenControl(target, name, fn) { if (target && target.addEventListener) { target.addEventListener(name, fn); controlListeners.push([target, name, fn]); } }
    function clearControlListeners() { controlListeners.splice(0).forEach(function (listener) { listener[0].removeEventListener(listener[1], listener[2]); }); }
    function faultPriority(code) { return code === 'COMPUTATION_FAILED' ? 4 : /WEBGL|THREE/.test(code) ? 3 : code === 'TIMELINE_RENDER_FAILED' ? 2 : 1; }
    function displayFaults() { const active = Object.keys(faults).map(function (code) { return faults[code]; }).sort(function (a, b) { return faultPriority(b.code) - faultPriority(a.code) || b.sequence - a.sequence; })[0]; const value = active ? `${active.code}：${active.message}` : ''; if (value === fallbackCode) return; fallbackCode = value; setStatus(documentRef, value); }
    function report(code, message) { if (!code) { if (Object.keys(faults).length) displayFaults(); else { fallbackCode = message || ''; setStatus(documentRef, message || ''); } return; } faults[code] = { code, message, sequence: ++faultSequence }; displayFaults(); }
    function recover(code) { if (!faults[code]) return; delete faults[code]; displayFaults(); }
    function setFallback(code, retryAvailable) { if (educationPanel && educationPanel.setFallback && currentState) educationPanel.setFallback(currentState, code, retryAvailable); report(code, '此设备无法显示 3D 场景，下面仍可学习日期、节气与月相。'); }
    function clearFallback() { if (educationPanel && educationPanel.clearFallback) educationPanel.clearFallback(); ['WEBGL_UNAVAILABLE', 'WEBGL_CONTEXT_LOST', 'THREE_RENDER_FAILED'].forEach(recover); }
    function releaseUnownedScenes() { const staleScenes = scenes; scenes = null; if (!staleScenes) return; Object.keys(staleScenes).forEach(function (id) { if (staleScenes[id] && staleScenes[id].dispose) staleScenes[id].dispose(); }); }
    function releaseHost() { const staleHost = host; host = null; scenes = null; if (staleHost && staleHost.dispose) staleHost.dispose(); }
    function renderThree() { if (!host || !currentState) return; try { host.renderFrame(currentState); } catch (_) { releaseHost(); setFallback('THREE_RENDER_FAILED', true); } }
    function applyControllerState(state) {
      try { currentState = education.WorldState.create({ instantUtc: state.instantUtc, timeZone: state.timeZone, location: state.location }); lastGoodState = currentState; recover('COMPUTATION_FAILED'); }
      catch (_) { if (timeController.getState().playing) timeController.pause(); currentState = lastGoodState; report('COMPUTATION_FAILED', '教学数据暂时不可用；保留上一份学习信息。'); return; }
      updateHud(documentRef, currentState);
      if (educationPanel) { try { educationPanel.update(state, currentState); } catch (_) { report('TIMELINE_RENDER_FAILED', '时间轴暂时不可用；卡片和时间控件仍可使用。'); } }
      if (host) renderThree();
      requestRedraw();
    }
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
    educationPanel = config.educationPanel || (education.EducationPanel && education.EducationPanel.create ? education.EducationPanel.create({ root: documentRef, clock: timeController, Calendar: education.Calendar, Observer: education.Observer, StarCatalog: education.StarCatalog, FileReader: config.FileReader, getAnnualTimeline: typeof education.WorldState.annualTimeline === 'function' ? function (year, timeZone) { return education.WorldState.annualTimeline(year, timeZone); } : null, onRenderRequested: requestRedraw, onSelectedScene: function (id) { if (host) { host.setSelectedScene(id); updateSceneButtons(documentRef, id); requestRedraw(); } }, onLayerChange: function (id, visible) { if (!scenes) return; Object.keys(scenes).forEach(function (sceneId) { const scene = scenes[sceneId]; if (scene && typeof scene.setLayerVisibility === 'function') scene.setLayerVisibility(id, visible); }); requestRedraw(); }, onAdvancedLayer: applyAdvancedLayer, onRetry3d: function () { retry3d(); }, onError: function (code) { report(code, code === 'ADVANCED_CSV_FAILED' ? '本地 CSV 暂时不可用；主要学习内容仍可使用。' : '时间轴暂时不可用；卡片和时间控件仍可使用。'); }, onRecovered: recover }) : null);
    const unsubscribe = timeController.subscribe(applyControllerState);
    applyControllerState(timeController.getState());
    const canvas = documentRef.getElementById('astronomyCanvas'), heliocentricViewport = documentRef.getElementById('heliocentricViewport'), geocentricViewport = documentRef.getElementById('geocentricViewport');
    const THREE = config.THREE || root.THREE;
    if (!THREE || !education.SceneHost || !education.HeliocentricScene || !education.GeocentricScene || !canvas || !heliocentricViewport || !geocentricViewport) { setFallback('WEBGL_UNAVAILABLE', false); bindResponsive(); bindButtons(); return handle(); }
    const canCreateScenes = typeof education.HeliocentricScene.create === 'function' && typeof education.GeocentricScene.create === 'function';
    const createScenes = function () { return { heliocentric: education.HeliocentricScene.create({ THREE, interactionElement: interactionOf(heliocentricViewport), labelLayer: documentRef.getElementById('labelLayer'), reducedMotion }), geocentric: education.GeocentricScene.create({ THREE, interactionElement: interactionOf(geocentricViewport), labelLayer: documentRef.getElementById('labelLayer'), reducedMotion, solarTermNames: solarTermNames(education) }) }; };
    function disposeScenes() { releaseUnownedScenes(); }
    function hostOptions() { return { THREE, canvas, sceneGrid: canvas.parentElement, containers: { heliocentric: heliocentricViewport, geocentric: geocentricViewport }, scenes, layoutMode: modeForMedia(windowRef), selectedScene: 'heliocentric', window: windowRef, rebuildScenes: canCreateScenes ? function () { scenes = createScenes(); return scenes; } : null, onScenesRebuilt: function () { bindControls(); restoreAdvancedLayers(); }, onError: function () { if (host) releaseHost(); setFallback('THREE_RENDER_FAILED', true); }, onContextChange: onContextChange }; }
    function createHostAndScenes(fresh) {
      if (!scenes) scenes = config.scenes || createScenes();
      else if (fresh && canCreateScenes) scenes = createScenes();
      host = !fresh && config.host ? config.host : education.SceneHost.create(hostOptions());
      return !!(host && host.available);
    }
    function onContextChange(event) { if (event.type === 'lost') { contextLost = true; contextWasPlaying = timeController.getState().playing; if (contextWasPlaying) timeController.pause(); setFallback('WEBGL_CONTEXT_LOST', false); } else { contextLost = false; if (contextWasPlaying && documentRef.hidden) hiddenWasPlaying = true; else if (contextWasPlaying && !reducedMotion) timeController.play(); contextWasPlaying = false; if (host && host.available) { clearFallback(); report('', 'WebGL 场景已恢复。'); } else retry3d(); requestRedraw(); } }
    createHostAndScenes(false);
    if (!host || !host.available) { host = null; disposeScenes(); setFallback('WEBGL_UNAVAILABLE', true); bindResponsive(); bindButtons(); return handle(); }
    // Host is the only scene update owner: renderFrame updates each viewport exactly once.
    clearFallback(); renderThree();
    if (host && scenes) bindControls(); bindResponsive(); bindButtons(); if (host) setStatus(documentRef, reducedMotion ? '已遵从系统的减少动态效果设置。' : '');
    return handle();
    function retry3d() {
      if (stopped || contextLost || host || !THREE || !education.SceneHost) return false;
      try { createHostAndScenes(true); }
      catch (_) { host = null; releaseUnownedScenes(); setFallback('THREE_RENDER_FAILED', true); return false; }
      if (!host || !host.available) { host = null; releaseUnownedScenes(); setFallback('WEBGL_UNAVAILABLE', true); return false; }
      clearFallback(); bindControls(); restoreAdvancedLayers(); renderThree(); requestRedraw(); return true;
    }
    function handle() { listen(documentRef, 'visibilitychange', onVisibility); return Object.freeze({ available: !!host, retry3d: retry3d, stop: stop }); }
    function bindControls() { clearControlListeners(); Object.keys(scenes).forEach(function (id) { const controls = scenes[id].controls; listenControl(controls, 'change', requestRedraw); listenControl(controls, 'start', requestRedraw); listenControl(controls, 'end', requestRedraw); }); }
    function bindResponsive() { const queries = ['(max-width: 600px)', '(max-width: 1024px)']; queries.forEach(function (name) { const query = windowRef.matchMedia && windowRef.matchMedia(name); const change = function () { if (host) host.setLayoutMode(modeForMedia(windowRef)); requestRedraw(); }; listen(query, 'change', change); }); }
    function bindButtons() { listen(documentRef.getElementById('resetBtn'), 'click', function () { if (!scenes) return; Object.keys(scenes).forEach(function (id) { if (scenes[id].resetView) scenes[id].resetView(); }); requestRedraw(); }); listen(documentRef.getElementById('snapBtn'), 'click', function () { if (host) exportSnapshot(documentRef, canvas, host, currentState); }); if (!educationPanel) ['heliocentric', 'geocentric'].forEach(function (id) { listen(documentRef.getElementById(id + 'SceneBtn'), 'click', function () { if (host) { host.setSelectedScene(id); updateSceneButtons(documentRef, id); requestRedraw(); } }); }); }
    function requestRedraw() { redrawRequested = true; schedule(); }
    function schedule() { const playing = timeController.getState().playing; if (!requestId && raf && !stopped && !documentRef.hidden && (redrawRequested || (playing && !reducedMotion))) requestId = raf(frame); }
    function frame(now) { requestId = null; const delta = previousFrameTime == null ? 0 : Math.max(0, now - previousFrameTime); previousFrameTime = now; redrawRequested = false; if (timeController.getState().playing && !reducedMotion) timeController.tick(delta); else if (host) renderThree(); schedule(); }
    function onVisibility() { if (documentRef.hidden) { hiddenWasPlaying = timeController.getState().playing || contextWasPlaying || hiddenWasPlaying; if (timeController.getState().playing) timeController.pause(); previousFrameTime = null; if (requestId && caf) caf(requestId); requestId = null; } else { previousFrameTime = null; if (hiddenWasPlaying && !reducedMotion && !contextLost) timeController.play(); if (!contextLost) hiddenWasPlaying = false; requestRedraw(); } }
    function stop() { if (stopped) return; stopped = true; if (requestId && caf) caf(requestId); unsubscribe(); if (educationPanel && educationPanel.dispose) educationPanel.dispose(); clearControlListeners(); listeners.forEach(function (l) { l[0].removeEventListener(l[1], l[2]); }); if (host) releaseHost(); else disposeScenes(); }
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
