/* Shared two-viewport WebGL host.  Classic-script UMD for file:// and Node. */
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.AstroEducation = root.AstroEducation || {};
  root.AstroEducation.SceneHost = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  const SCENE_IDS = Object.freeze(['heliocentric', 'geocentric']);
  const LAYOUTS = Object.freeze(['desktop', 'tablet', 'mobile']);

  function safeDimension(value) {
    return Number.isFinite(value) && value > 0 ? value : 0;
  }

  function selectedId(selectedScene) {
    return SCENE_IDS.indexOf(selectedScene) >= 0 ? selectedScene : SCENE_IDS[0];
  }

  function computeViewports(width, height, layoutMode, selectedScene) {
    const safeWidth = safeDimension(width);
    const safeHeight = safeDimension(height);
    const layout = LAYOUTS.indexOf(layoutMode) >= 0 ? layoutMode : 'desktop';
    const selected = selectedId(selectedScene);

    if (layout === 'tablet') {
      const halfHeight = safeHeight / 2;
      return [
        { id: 'heliocentric', x: 0, y: 0, width: safeWidth, height: halfHeight, visible: true },
        { id: 'geocentric', x: 0, y: halfHeight, width: safeWidth, height: halfHeight, visible: true }
      ];
    }
    if (layout === 'mobile') {
      return SCENE_IDS.map(function(id) {
        return { id: id, x: 0, y: 0, width: safeWidth, height: safeHeight, visible: id === selected };
      });
    }
    const halfWidth = safeWidth / 2;
    return [
      { id: 'heliocentric', x: 0, y: 0, width: halfWidth, height: safeHeight, visible: true },
      { id: 'geocentric', x: halfWidth, y: 0, width: halfWidth, height: safeHeight, visible: true }
    ];
  }

  function cappedPixelRatio(devicePixelRatio, mobile) {
    const ratio = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
    return Math.min(ratio, mobile ? 1.25 : 1.75);
  }

  // DOM rectangles use a top-left origin. WebGL scissors use bottom-left pixels.
  function containerRectToScissor(containerRect, canvasRect, drawingBufferSize) {
    const canvasWidth = safeDimension(drawingBufferSize && drawingBufferSize.width);
    const canvasHeight = safeDimension(drawingBufferSize && drawingBufferSize.height);
    const cssWidth = safeDimension(canvasRect && canvasRect.width);
    const cssHeight = safeDimension(canvasRect && canvasRect.height);
    if (!canvasWidth || !canvasHeight || !cssWidth || !cssHeight || !containerRect) {
      return { x: 0, y: 0, width: 0, height: 0 };
    }
    const scaleX = canvasWidth / cssWidth;
    const scaleY = canvasHeight / cssHeight;
    const left = (containerRect.left - canvasRect.left) * scaleX;
    const top = (containerRect.top - canvasRect.top) * scaleY;
    const width = containerRect.width * scaleX;
    const height = containerRect.height * scaleY;
    const x = clamp(Math.round(left), 0, canvasWidth);
    const y = clamp(Math.round(canvasHeight - top - height), 0, canvasHeight);
    return {
      x: x,
      y: y,
      width: clamp(Math.round(width), 0, canvasWidth - x),
      height: clamp(Math.round(height), 0, canvasHeight - y)
    };
  }

  function clamp(value, low, high) {
    return Math.max(low, Math.min(high, value));
  }

  function createForTest(options) {
    const viewports = Array.isArray(options && options.viewports) ? options.viewports.slice() : [];
    const scenes = (options && options.scenes) || {};
    let disposed = false;
    return {
      available: true,
      renderFrame: function(worldState) {
        if (disposed) return;
        viewports.filter(function(viewport) { return viewport.visible; }).forEach(function(viewport) {
          const scene = scenes[viewport.id];
          if (scene && typeof scene.render === 'function') scene.render(worldState, viewport);
        });
      },
      setLayoutMode: function() {},
      setSelectedScene: function() {},
      pause: function() {},
      resume: function() {},
      rebuild: function() {},
      dispose: function() { disposed = true; }
    };
  }

  function create(options) {
    const config = options || {};
    const THREE = config.THREE;
    const canvas = config.canvas;
    if (!canvas || !THREE || typeof THREE.WebGLRenderer !== 'function') return unavailable();

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false });
      renderer.setScissorTest(true);
    } catch (error) {
      if (typeof config.onError === 'function') config.onError(error);
      return unavailable();
    }

    const hostWindow = config.window || (typeof window !== 'undefined' ? window : null);
    const containers = config.containers || {};
    const scenes = config.scenes || {};
    let layoutMode = LAYOUTS.indexOf(config.layoutMode) >= 0 ? config.layoutMode : 'desktop';
    let currentSelected = selectedId(config.selectedScene);
    let paused = false;
    let disposed = false;
    let frameRequest = null;
    let lastState = null;
    let resizeObserver = null;
    const listeners = [];

    SCENE_IDS.forEach(function(id) {
      const scene = scenes[id];
      const interaction = scene && (scene.interactionElement || (containers[id] && containers[id].querySelector && containers[id].querySelector('.scene-interaction')));
      if (scene && interaction && typeof scene.createControls === 'function') {
        scene.controls = scene.createControls(interaction);
      }
    });

    function addListener(target, eventName, handler) {
      if (!target || typeof target.addEventListener !== 'function') return;
      target.addEventListener(eventName, handler);
      listeners.push([target, eventName, handler]);
    }

    function getLayout() {
      const rect = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : null;
      return computeViewports(rect && rect.width, rect && rect.height, layoutMode, currentSelected);
    }

    function resize() {
      if (disposed) return;
      const rect = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : null;
      const width = safeDimension(rect && rect.width);
      const height = safeDimension(rect && rect.height);
      if (!width || !height) return;
      const mobile = layoutMode === 'mobile';
      renderer.setPixelRatio(cappedPixelRatio(hostWindow && hostWindow.devicePixelRatio, mobile));
      renderer.setSize(width, height, false);
      applyLayout(getLayout());
    }

    function applyLayout(viewports) {
      viewports.forEach(function(viewport) {
        const container = containers[viewport.id];
        if (container && container.style) {
          container.style.display = viewport.visible ? '' : 'none';
        }
      });
    }

    function measuredViewport(id) {
      const container = containers[id];
      const canvasRect = canvas.getBoundingClientRect && canvas.getBoundingClientRect();
      if (!container || !canvasRect || !container.getBoundingClientRect) return null;
      const rect = container.getBoundingClientRect();
      const scissor = containerRectToScissor(rect, canvasRect, { width: canvas.width, height: canvas.height });
      return { rect: rect, scissor: scissor };
    }

    function renderFrame(worldState) {
      if (disposed || paused) return;
      lastState = worldState || lastState;
      getLayout().filter(function(viewport) { return viewport.visible; }).forEach(function(viewport) {
        const scene = scenes[viewport.id];
        const measured = measuredViewport(viewport.id);
        if (!scene || !measured || !measured.scissor.width || !measured.scissor.height) return;
        const scissor = measured.scissor;
        renderer.setViewport(scissor.x, scissor.y, scissor.width, scissor.height);
        renderer.setScissor(scissor.x, scissor.y, scissor.width, scissor.height);
        if (scene.camera) {
          scene.camera.aspect = measured.rect.width / measured.rect.height;
          if (typeof scene.camera.updateProjectionMatrix === 'function') scene.camera.updateProjectionMatrix();
        }
        if (typeof scene.update === 'function' && lastState) scene.update(lastState);
        if (scene.controls && typeof scene.controls.update === 'function') scene.controls.update();
        if (typeof scene.render === 'function') scene.render(renderer, lastState, viewport);
        else if (scene.scene && scene.camera) renderer.render(scene.scene, scene.camera);
      });
    }

    function requestNextFrame() {
      if (disposed || paused || !hostWindow || typeof hostWindow.requestAnimationFrame !== 'function') return;
      frameRequest = hostWindow.requestAnimationFrame(function() {
        frameRequest = null;
        renderFrame(lastState);
        requestNextFrame();
      });
    }

    function pause() {
      paused = true;
      if (frameRequest !== null && hostWindow && typeof hostWindow.cancelAnimationFrame === 'function') hostWindow.cancelAnimationFrame(frameRequest);
      frameRequest = null;
    }

    function resume() {
      if (disposed) return;
      paused = false;
      requestNextFrame();
    }

    function rebuild() {
      if (disposed) return;
      SCENE_IDS.forEach(function(id) {
        if (scenes[id] && typeof scenes[id].rebuild === 'function') scenes[id].rebuild();
      });
      resize();
    }

    function dispose() {
      if (disposed) return;
      disposed = true;
      pause();
      if (resizeObserver && typeof resizeObserver.disconnect === 'function') resizeObserver.disconnect();
      listeners.splice(0).forEach(function(listener) { listener[0].removeEventListener(listener[1], listener[2]); });
      SCENE_IDS.forEach(function(id) {
        const scene = scenes[id];
        if (scene && scene.controls && typeof scene.controls.dispose === 'function') scene.controls.dispose();
        if (scene && typeof scene.dispose === 'function') scene.dispose();
      });
      if (renderer && typeof renderer.dispose === 'function') renderer.dispose();
    }

    function contextLost(event) {
      if (event && typeof event.preventDefault === 'function') event.preventDefault();
      pause();
      if (typeof config.onContextChange === 'function') config.onContextChange({ type: 'lost' });
    }

    function contextRestored() {
      rebuild();
      if (typeof config.onContextChange === 'function') config.onContextChange({ type: 'restored' });
      resume();
    }

    addListener(hostWindow, 'resize', resize);
    addListener(canvas, 'webglcontextlost', contextLost);
    addListener(canvas, 'webglcontextrestored', contextRestored);
    const Observer = config.ResizeObserver || (hostWindow && hostWindow.ResizeObserver);
    if (typeof Observer === 'function') {
      resizeObserver = new Observer(resize);
      resizeObserver.observe(canvas);
      SCENE_IDS.forEach(function(id) { if (containers[id]) resizeObserver.observe(containers[id]); });
    }
    resize();

    return {
      available: true,
      renderer: renderer,
      setLayoutMode: function(nextLayout) {
        layoutMode = LAYOUTS.indexOf(nextLayout) >= 0 ? nextLayout : layoutMode;
        resize();
      },
      setSelectedScene: function(nextSelected) {
        currentSelected = selectedId(nextSelected);
        resize();
      },
      renderFrame: renderFrame,
      pause: pause,
      resume: resume,
      rebuild: rebuild,
      dispose: dispose
    };
  }

  function unavailable() { return { available: false, reason: 'WEBGL_UNAVAILABLE' }; }

  return Object.freeze({
    computeViewports: computeViewports,
    cappedPixelRatio: cappedPixelRatio,
    containerRectToScissor: containerRectToScissor,
    create: create,
    createForTest: createForTest
  });
});
