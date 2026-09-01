;(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) {
    root.AstroEducation = root.AstroEducation || {};
    root.AstroEducation.HeliocentricScene = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const DISPLAY = Object.freeze({
    earthOrbitRadius: 42,
    sunRadius: 3.2,
    earthRadius: 1.35,
    moonRadius: 0.48,
    moonOrbitRadius: 4.8
  });
  const MEAN_LUNAR_DISTANCE_KM = 384400;
  const LEGEND = '大小与距离采用不同增强比例';
  const REQUIRED_STATE_ERROR = 'worldState must provide earth, sun, moon, and observer state';

  function finiteVector(vector) {
    return vector && Number.isFinite(vector.x) && Number.isFinite(vector.y) && Number.isFinite(vector.z);
  }

  function validState(worldState) {
    return worldState && worldState.earth && worldState.sun && worldState.moon && worldState.observer &&
      finiteVector(worldState.earth.positionAu) && finiteVector(worldState.earth.axisUnit) &&
      finiteVector(worldState.sun.vectorAu) && finiteVector(worldState.moon.positionKm) &&
      worldState.moon.orbit && Number.isFinite(worldState.moon.orbit.inclinationDeg);
  }

  function frozenVector(vector, scale) {
    const x = vector.x * scale;
    const y = vector.y * scale;
    const z = vector.z * scale;
    return Object.freeze({ x: x, y: y, z: z, length: Math.hypot(x, y, z) });
  }

  function toVisualModel(worldState) {
    if (!validState(worldState)) throw new TypeError(REQUIRED_STATE_ERROR);
    const earthScale = DISPLAY.earthOrbitRadius;
    const moonScale = DISPLAY.moonOrbitRadius / MEAN_LUNAR_DISTANCE_KM;
    return Object.freeze({
      display: DISPLAY,
      legend: LEGEND,
      earth: Object.freeze({
        position: frozenVector(worldState.earth.positionAu, earthScale),
        axisUnit: Object.freeze({ x: worldState.earth.axisUnit.x, y: worldState.earth.axisUnit.y, z: worldState.earth.axisUnit.z }),
        perihelionLongitudeDeg: worldState.earth.perihelionLongitudeDeg,
        trueLongitudeDeg: worldState.earth.trueLongitudeDeg
      }),
      sun: Object.freeze({ direction: frozenVector(worldState.sun.vectorAu, 1) }),
      moon: Object.freeze({
        relativePosition: frozenVector(worldState.moon.positionKm, moonScale),
        illumination: worldState.moon.illumination,
        orbitInclinationDeg: worldState.moon.orbit.inclinationDeg,
        ascendingNodeLongitudeDeg: worldState.moon.ascendingNodeLongitudeDeg,
        descendingNodeLongitudeDeg: worldState.moon.descendingNodeLongitudeDeg,
        perigeeDistanceKm: worldState.moon.perigeeDistanceKm,
        apogeeDistanceKm: worldState.moon.apogeeDistanceKm
      }),
      observer: Object.freeze({
        subsolarPoint: worldState.observer.subsolarPoint ? Object.freeze({
          latitudeDeg: worldState.observer.subsolarPoint.latitudeDeg,
          longitudeDeg: worldState.observer.subsolarPoint.longitudeDeg
        }) : null
      })
    });
  }

  function create(config) {
    const options = config || {};
    const THREE = options.THREE;
    if (!THREE || typeof THREE.Scene !== 'function' || typeof THREE.Vector3 !== 'function') {
      throw new TypeError('THREE must provide Scene and Vector3');
    }
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
    camera.position.set(0, 38, 68);
    if (typeof camera.lookAt === 'function') camera.lookAt(0, 0, 0);
    const controls = createControls(THREE, camera, options.interactionElement);
    const labels = createLabels(options.labelLayer);
    const resources = [];
    const root = new THREE.Group();
    scene.add(root);

    const sun = mesh(THREE, new THREE.SphereGeometry(DISPLAY.sunRadius, 32, 20), material(THREE, 'MeshBasicMaterial', { color: 0xffd34e }), resources);
    root.add(sun);
    const light = new THREE.PointLight(0xfff1c2, 2.3, 0);
    root.add(light);
    const glowTexture = glowTextureFor(THREE, resources);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture, color: 0xffb342, transparent: true, opacity: 0.42, blending: THREE.AdditiveBlending }));
    if (glow.scale && typeof glow.scale.set === 'function') glow.scale.set(13, 13, 1);
    resources.push(glow.material);
    root.add(glow);

    const earthOrbit = line(THREE, ellipsePoints(THREE, DISPLAY.earthOrbitRadius, DISPLAY.earthOrbitRadius * 0.9833, 0, 96), 0x3b82f6, resources);
    root.add(earthOrbit);
    const perihelion = marker(THREE, DISPLAY.earthOrbitRadius * 0.9833, 0, 0x60a5fa, resources);
    const aphelion = marker(THREE, -DISPLAY.earthOrbitRadius * 0.9833, 0, 0x93c5fd, resources);
    root.add(perihelion, aphelion);

    const earthGroup = new THREE.Group();
    const earthFrame = new THREE.Group();
    const earthSurface = mesh(THREE, new THREE.SphereGeometry(DISPLAY.earthRadius, 24, 16), material(THREE, 'MeshPhongMaterial', { color: 0x3478d4, shininess: 12 }), resources);
    const earthGrid = mesh(THREE, new THREE.SphereGeometry(DISPLAY.earthRadius * 1.012, 16, 10), material(THREE, 'MeshBasicMaterial', { color: 0xa5d8ff, wireframe: true, transparent: true, opacity: 0.45 }), resources);
    earthFrame.add(earthSurface, earthGrid);
    const axialLine = line(THREE, [new THREE.Vector3(0, -3, 0), new THREE.Vector3(0, 3, 0)], 0xe2e8f0, resources);
    earthFrame.add(axialLine);
    const northArrow = marker(THREE, 0, 3, 0xf8fafc, resources);
    earthFrame.add(northArrow);
    const observerMarker = marker(THREE, DISPLAY.earthRadius * 0.9, 0, 0xfb923c, resources);
    earthFrame.add(observerMarker);
    earthGroup.add(earthFrame);
    root.add(earthGroup);

    const moonOrbitGroup = new THREE.Group();
    const moonOrbit = line(THREE, ellipsePoints(THREE, DISPLAY.moonOrbitRadius, DISPLAY.moonOrbitRadius * 0.9451, 5.145, 72), 0xc4b5fd, resources);
    moonOrbitGroup.add(moonOrbit);
    const nodeLine = line(THREE, [new THREE.Vector3(-DISPLAY.moonOrbitRadius, 0, 0), new THREE.Vector3(DISPLAY.moonOrbitRadius, 0, 0)], 0xf472b6, resources);
    moonOrbitGroup.add(nodeLine);
    const ascendingNode = marker(THREE, DISPLAY.moonOrbitRadius, 0, 0x4ade80, resources);
    const descendingNode = marker(THREE, -DISPLAY.moonOrbitRadius, 0, 0xf87171, resources);
    moonOrbitGroup.add(ascendingNode, descendingNode);
    const perigee = marker(THREE, DISPLAY.moonOrbitRadius * 0.9451, 0, 0xa78bfa, resources);
    const apogee = marker(THREE, -DISPLAY.moonOrbitRadius * 0.9451, 0, 0x8b5cf6, resources);
    moonOrbitGroup.add(perigee, apogee);
    earthGroup.add(moonOrbitGroup);
    const moon = mesh(THREE, new THREE.SphereGeometry(DISPLAY.moonRadius, 20, 14), material(THREE, 'MeshPhongMaterial', { color: 0xcbd5e1, shininess: 2 }), resources);
    earthGroup.add(moon);
    const seasonalAxis = line(THREE, [new THREE.Vector3(0, -11, 0), new THREE.Vector3(0, 11, 4.77)], 0xfacc15, resources);
    root.add(seasonalAxis);

    const up = new THREE.Vector3(0, 1, 0);
    const axisVector = new THREE.Vector3();
    const moonVector = new THREE.Vector3();
    const sunVector = new THREE.Vector3();
    let disposed = false;
    let labelsVisible = true;
    let lastNodeLongitude = NaN;

    function update(worldState) {
      if (disposed) return;
      const model = toVisualModel(worldState);
      earthGroup.position.set(model.earth.position.x, model.earth.position.y, model.earth.position.z);
      axisVector.set(model.earth.axisUnit.x, model.earth.axisUnit.y, model.earth.axisUnit.z).normalize();
      if (earthFrame.quaternion && typeof earthFrame.quaternion.setFromUnitVectors === 'function') earthFrame.quaternion.setFromUnitVectors(up, axisVector);
      moonVector.set(model.moon.relativePosition.x, model.moon.relativePosition.y, model.moon.relativePosition.z);
      moon.position.copy(moonVector);
      sunVector.set(-model.earth.position.x, -model.earth.position.y, -model.earth.position.z).normalize();
      moon.userData.terminatorDirection = sunVector;
      moon.material.userData = moon.material.userData || {};
      moon.material.userData.illumination = model.moon.illumination;
      if (model.moon.ascendingNodeLongitudeDeg !== lastNodeLongitude) {
        moonOrbitGroup.rotation.y = degToRad(model.moon.ascendingNodeLongitudeDeg || 0);
        lastNodeLongitude = model.moon.ascendingNodeLongitudeDeg;
      }
    }

    function setLabelsVisible(visible) {
      labelsVisible = Boolean(visible);
      labels.forEach(function (label) { label.style.display = labelsVisible ? '' : 'none'; });
    }

    function dispose() {
      if (disposed) return;
      disposed = true;
      if (controls && typeof controls.dispose === 'function') controls.dispose();
      resources.forEach(disposeResource);
      labels.forEach(function (label) { if (label.parentNode && typeof label.parentNode.removeChild === 'function') label.parentNode.removeChild(label); });
    }

    scene.userData = { earthGroup: earthGroup, earthFrame: earthFrame, moon: moon, sun: sun };
    return Object.freeze({ scene: scene, camera: camera, controls: controls, update: update, setLabelsVisible: setLabelsVisible, dispose: dispose });
  }

  function createControls(THREE, camera, interactionElement) {
    if (typeof THREE.OrbitControls !== 'function') return null;
    const controls = new THREE.OrbitControls(camera, interactionElement);
    controls.enableDamping = true;
    return controls;
  }

  function createLabels(layer) {
    const labels = [];
    ['太阳中心视角', '地球轨道', '升交点 / 降交点', LEGEND].forEach(function (text) {
      const label = typeof document !== 'undefined' && document.createElement ? document.createElement('span') : { style: {} };
      label.textContent = text;
      label.className = 'scene-label';
      if (!label.style) label.style = {};
      if (layer && typeof layer.appendChild === 'function') layer.appendChild(label);
      labels.push(label);
    });
    return labels;
  }

  function glowTextureFor(THREE, resources) {
    let canvas = null;
    if (typeof document !== 'undefined' && document.createElement) {
      canvas = document.createElement('canvas');
      canvas.width = canvas.height = 64;
      const context = canvas.getContext && canvas.getContext('2d');
      if (context) {
        const gradient = context.createRadialGradient(32, 32, 1, 32, 32, 32);
        gradient.addColorStop(0, 'rgba(255,255,220,0.95)');
        gradient.addColorStop(0.35, 'rgba(255,190,70,0.45)');
        gradient.addColorStop(1, 'rgba(255,170,30,0)');
        context.fillStyle = gradient;
        context.fillRect(0, 0, 64, 64);
      }
    }
    const texture = new THREE.CanvasTexture(canvas || {});
    resources.push(texture);
    return texture;
  }

  function material(THREE, name, options) {
    return new THREE[name](options);
  }

  function mesh(THREE, geometry, surface, resources) {
    resources.push(geometry, surface);
    return new THREE.Mesh(geometry, surface);
  }

  function line(THREE, points, color, resources) {
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const surface = new THREE.LineBasicMaterial({ color: color, transparent: true, opacity: 0.78 });
    resources.push(geometry, surface);
    return new THREE.Line(geometry, surface);
  }

  function marker(THREE, x, y, color, resources) {
    const object = mesh(THREE, new THREE.SphereGeometry(0.2, 10, 8), material(THREE, 'MeshBasicMaterial', { color: color }), resources);
    object.position.set(x, y, 0);
    return object;
  }

  function ellipsePoints(THREE, radiusX, radiusZ, inclinationDeg, segments) {
    const points = [];
    const inclination = degToRad(inclinationDeg);
    for (let index = 0; index <= segments; index += 1) {
      const angle = index / segments * Math.PI * 2;
      const x = Math.cos(angle) * radiusX;
      const z = Math.sin(angle) * radiusZ;
      points.push(new THREE.Vector3(x, z * Math.sin(inclination), z * Math.cos(inclination)));
    }
    return points;
  }

  function disposeResource(resource) {
    if (resource && typeof resource.dispose === 'function') resource.dispose();
  }

  function degToRad(degrees) { return degrees * Math.PI / 180; }

  return Object.freeze({ DISPLAY: DISPLAY, toVisualModel: toVisualModel, create: create });
});
