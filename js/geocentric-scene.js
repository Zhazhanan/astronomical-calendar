;(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) { root.AstroEducation = root.AstroEducation || {}; root.AstroEducation.GeocentricScene = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const DISPLAY = Object.freeze({ sphereRadius: 24, earthRadius: 2.1, sunRadius: 1.15, moonRadius: 0.75, obliquityDeg: 23.43928, solarArcSegments: 64, longitudeThresholdDeg: 0.05 });
  const REQUIRED_STATE_ERROR = 'worldState must provide sun longitude/vector and moon longitude/latitude state';
  const DEGREE = Math.PI / 180;

  function normalDegrees(value) { return ((value % 360) + 360) % 360; }
  function finite(value) { return Number.isFinite(value); }
  function validState(state) {
    return state && state.sun && state.moon && finite(state.sun.longitudeDeg) && state.sun.vectorAu &&
      finite(state.sun.vectorAu.x) && finite(state.sun.vectorAu.y) && finite(state.sun.vectorAu.z) &&
      finite(state.moon.longitudeDeg) && finite(state.moon.latitudeDeg) && finite(state.moon.nodeDistanceDeg) && finite(state.moon.illumination);
  }
  function termsFor(state) { return (state.sun && state.sun.solarTerms) || state.solarTerms || {}; }
  function frozenMoon(moon) { return Object.freeze({ longitudeDeg: moon.longitudeDeg, latitudeDeg: moon.latitudeDeg, nodeDistanceDeg: moon.nodeDistanceDeg, illumination: moon.illumination, eclipseSeason: moon.eclipseSeasonHint || null }); }
  function toVisualModel(state) {
    if (!validState(state)) throw new TypeError(REQUIRED_STATE_ERROR);
    const terms = termsFor(state);
    return Object.freeze({
      springZeroDeg: 0,
      solarLongitudeDeg: normalDegrees(state.sun.longitudeDeg),
      solarTermName: terms.current && terms.current.name || '—',
      nextSolarTermName: terms.next && terms.next.name || '—',
      angleArc: Object.freeze({ startDeg: 0, endDeg: normalDegrees(state.sun.longitudeDeg) }),
      sun: Object.freeze({ vectorAu: Object.freeze({ x: state.sun.vectorAu.x, y: state.sun.vectorAu.y, z: state.sun.vectorAu.z }) }),
      moon: frozenMoon(state.moon)
    });
  }
  function lonLatToVector(longitudeDeg, latitudeDeg, radius) {
    const longitude = normalDegrees(longitudeDeg) * DEGREE;
    const latitude = latitudeDeg * DEGREE;
    const horizontal = radius * Math.cos(latitude);
    return { x: horizontal * Math.cos(longitude), y: radius * Math.sin(latitude), z: horizontal * Math.sin(longitude) };
  }
  function create(options) {
    const config = options || {}, THREE = config.THREE;
    if (!THREE || typeof THREE.Scene !== 'function' || typeof THREE.Vector3 !== 'function') throw new TypeError('THREE must provide Scene and Vector3');
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(45, 1, 0.1, 140), root = new THREE.Group(), resources = [], labels = createLabels(config.labelLayer);
    const controls = typeof THREE.OrbitControls === 'function' ? new THREE.OrbitControls(camera, config.interactionElement) : null;
    if (camera.position && camera.position.set) camera.position.set(0, 31, 53);
    if (camera.lookAt) camera.lookAt(0, 0, 0);
    scene.add(root);

    const earth = mesh(THREE, new THREE.SphereGeometry(DISPLAY.earthRadius, 24, 16), new THREE.MeshBasicMaterial({ color: 0x2775c6 }), resources);
    const ecliptic = staticLine(THREE, circlePoints(THREE, DISPLAY.sphereRadius, 96), 0xfacc15, resources);
    const equator = staticLine(THREE, tiltedEquatorPoints(THREE), 0x22d3ee, resources);
    equator.userData.dashed = true;
    const axes = new THREE.Group();
    axes.add(staticLine(THREE, [v(THREE, -5, 0, 0), v(THREE, 5, 0, 0)], 0xf8fafc, resources), staticLine(THREE, [v(THREE, 0, -5, 0), v(THREE, 0, 5, 0)], 0xf8fafc, resources), staticLine(THREE, [v(THREE, 0, 0, -5), v(THREE, 0, 0, 5)], 0xf8fafc, resources));
    const springRay = staticLine(THREE, [v(THREE, 0, 0, 0), v(THREE, DISPLAY.sphereRadius + 3, 0, 0)], 0xf8fafc, resources);
    springRay.userData.springZeroDeg = 0;
    const termTicks = new THREE.Group();
    for (let index = 0; index < 24; index++) {
      const inner = lonLatToVector(index * 15, 0, DISPLAY.sphereRadius - 0.8);
      const outer = lonLatToVector(index * 15, 0, DISPLAY.sphereRadius + 0.8);
      termTicks.add(staticLine(THREE, [v(THREE, inner.x, inner.y, inner.z), v(THREE, outer.x, outer.y, outer.z)], 0xfde68a, resources));
    }
    const solarArc = dynamicLine(THREE, makeArcGeometry(THREE), 0xfde047, resources);
    const sun = mesh(THREE, new THREE.SphereGeometry(DISPLAY.sunRadius, 18, 12), new THREE.MeshBasicMaterial({ color: 0xfbbf24 }), resources);
    const earthSunRay = staticLine(THREE, [v(THREE, 0, 0, 0), v(THREE, 0, 0, 0)], 0xfbbf24, resources);
    const moon = mesh(THREE, new THREE.SphereGeometry(DISPLAY.moonRadius, 18, 12), new THREE.MeshBasicMaterial({ color: 0xcbd5e1 }), resources);
    const moonProjection = staticLine(THREE, [v(THREE, 0, 0, 0), v(THREE, 0, 0, 0)], 0xa78bfa, resources);
    const latitudeArc = dynamicLine(THREE, makeArcGeometry(THREE), 0x8b5cf6, resources);
    const phaseIndicator = mesh(THREE, new THREE.RingGeometry(0.15, 0.48, 18), new THREE.MeshBasicMaterial({ color: 0xe2e8f0 }), resources);
    root.add(earth, ecliptic, equator, axes, springRay, termTicks, solarArc, sun, earthSunRay, moon, moonProjection, latitudeArc, phaseIndicator);
    addStaticLabels(labels, config.labelLayer, config.solarTermNames || []);

    const sunPosition = new THREE.Vector3(), moonPosition = new THREE.Vector3(), projectionPosition = new THREE.Vector3();
    let lastState = null, lastLongitude = NaN, disposed = false;
    function update(state) {
      if (disposed || state === lastState) return;
      if (!validState(state)) throw new TypeError(REQUIRED_STATE_ERROR);
      lastState = state;
      const longitude = normalDegrees(state.sun.longitudeDeg);
      setVectorFromLonLat(sunPosition, longitude, 0, DISPLAY.sphereRadius);
      sun.position.copy(sunPosition);
      setLineEndpoint(earthSunRay.geometry, sunPosition);
      if (!finite(lastLongitude) || Math.abs(longitude - lastLongitude) + 1e-9 >= DISPLAY.longitudeThresholdDeg) {
        writeLongitudeArc(solarArc.geometry, longitude, 0, DISPLAY.sphereRadius * 0.55);
        lastLongitude = longitude;
      }
      setVectorFromLonLat(moonPosition, state.moon.longitudeDeg, state.moon.latitudeDeg, DISPLAY.sphereRadius);
      setVectorFromLonLat(projectionPosition, state.moon.longitudeDeg, 0, DISPLAY.sphereRadius);
      moon.position.copy(moonPosition);
      phaseIndicator.position.copy(moonPosition);
      if (phaseIndicator.scale && phaseIndicator.scale.set) phaseIndicator.scale.set(0.5 + state.moon.illumination, 0.5 + state.moon.illumination, 1);
      setLineEndpoint(moonProjection.geometry, projectionPosition);
      writeLatitudeArc(latitudeArc.geometry, state.moon.longitudeDeg, state.moon.latitudeDeg, DISPLAY.sphereRadius * 0.84);
      updateDynamicLabels(labels, state);
    }
    function setLabelsVisible(visible) { labels.forEach(function (label) { if (label.style) label.style.display = visible ? '' : 'none'; }); }
    function dispose() {
      if (disposed) return;
      disposed = true;
      if (controls && typeof controls.dispose === 'function') controls.dispose();
      resources.forEach(disposeResource);
      labels.forEach(function (label) { if (label.parentNode && label.parentNode.removeChild) label.parentNode.removeChild(label); });
    }
    scene.userData = scene.userData || {};
    Object.assign(scene.userData, { root, earth, ecliptic, equator, springRay, termTicks, solarArc, sun, earthSunRay, moon, moonProjection, latitudeArc, phaseIndicator });
    return { scene, camera, controls, interactionElement: config.interactionElement, update, setLabelsVisible, dispose };
  }
  function v(THREE, x, y, z) { return new THREE.Vector3(x, y, z); }
  function mesh(THREE, geometry, material, resources) { resources.push(geometry, material); return new THREE.Mesh(geometry, material); }
  function staticLine(THREE, points, color, resources) { const geometry = new THREE.BufferGeometry().setFromPoints(points), material = new THREE.LineBasicMaterial({ color }); resources.push(geometry, material); return new THREE.Line(geometry, material); }
  function dynamicLine(THREE, geometry, color, resources) { const material = new THREE.LineBasicMaterial({ color }); resources.push(geometry, material); return new THREE.Line(geometry, material); }
  function circlePoints(THREE, radius, segments) { const points = []; for (let index = 0; index <= segments; index++) { const angle = index * 360 / segments; const p = lonLatToVector(angle, 0, radius); points.push(v(THREE, p.x, p.y, p.z)); } return points; }
  function tiltedEquatorPoints(THREE) { const points = circlePoints(THREE, DISPLAY.sphereRadius, 96), cos = Math.cos(DISPLAY.obliquityDeg * DEGREE), sin = Math.sin(DISPLAY.obliquityDeg * DEGREE); points.forEach(function (point) { const y = point.y * cos + point.z * sin, z = point.z * cos - point.y * sin; point.y = y; point.z = z; }); return points; }
  function makeArcGeometry(THREE) { const geometry = new THREE.BufferGeometry(), array = new Float32Array((DISPLAY.solarArcSegments + 1) * 3); geometry.setAttribute('position', new THREE.BufferAttribute(array, 3)); return geometry; }
  function setVectorFromLonLat(target, longitude, latitude, radius) { const point = lonLatToVector(longitude, latitude, radius); target.set(point.x, point.y, point.z); }
  function markAttribute(attribute) { attribute.needsUpdate = true; if (Object.prototype.hasOwnProperty.call(attribute, 'needsUpdateCount')) attribute.needsUpdateCount += 1; }
  function writeLongitudeArc(geometry, longitude, latitude, radius) { const attribute = geometry.getAttribute('position'); for (let index = 0; index <= DISPLAY.solarArcSegments; index++) { const p = lonLatToVector(longitude * index / DISPLAY.solarArcSegments, latitude, radius); attribute.setXYZ(index, p.x, p.y, p.z); } markAttribute(attribute); }
  function writeLatitudeArc(geometry, longitude, latitude, radius) { const attribute = geometry.getAttribute('position'); for (let index = 0; index <= DISPLAY.solarArcSegments; index++) { const p = lonLatToVector(longitude, latitude * index / DISPLAY.solarArcSegments, radius); attribute.setXYZ(index, p.x, p.y, p.z); } markAttribute(attribute); }
  function setLineEndpoint(geometry, endpoint) { const attribute = geometry.getAttribute('position'); attribute.setXYZ(0, 0, 0, 0); attribute.setXYZ(1, endpoint.x, endpoint.y, endpoint.z); markAttribute(attribute); }
  function createLabel(layer, text) { const label = typeof document !== 'undefined' && document.createElement ? document.createElement('span') : { style: {}, textContent: '', className: '' }; label.className = 'scene-label'; label.textContent = text; if (layer && layer.appendChild) layer.appendChild(label); return label; }
  function createLabels(layer) { return [createLabel(layer, '当前节气：—'), createLabel(layer, '下一节气：—'), createLabel(layer, '月球黄纬：—'), createLabel(layer, '距交点：—'), createLabel(layer, '照亮：—'), createLabel(layer, '食季：—')]; }
  function addStaticLabels(labels, layer, names) { labels.push(createLabel(layer, 'λ☉'), createLabel(layer, '春分 0°'), createLabel(layer, '夏至 90°'), createLabel(layer, '秋分 180°'), createLabel(layer, '冬至 270°')); for (let index = 0; index < 24; index++) labels.push(createLabel(layer, names[index] || String(index * 15) + '°')); }
  function updateDynamicLabels(labels, state) { const terms = termsFor(state); const eclipse = state.moon.eclipseSeasonHint; labels[0].textContent = '当前节气：' + (terms.current && terms.current.name || '—'); labels[1].textContent = '下一节气：' + (terms.next && terms.next.name || '—'); labels[2].textContent = '月球黄纬：' + signed(state.moon.latitudeDeg) + '°'; labels[3].textContent = '距交点：' + state.moon.nodeDistanceDeg.toFixed(2) + '°'; labels[4].textContent = '照亮：' + Math.round(state.moon.illumination * 100) + '%'; labels[5].textContent = '食季：' + (eclipse && eclipse.possible ? '可能接近交点' : '未接近交点'); }
  function signed(value) { return (value >= 0 ? '+' : '') + value.toFixed(2); }
  function disposeResource(resource) { if (resource && typeof resource.dispose === 'function') resource.dispose(); }
  return Object.freeze({ DISPLAY, toVisualModel, lonLatToVector, create });
});
