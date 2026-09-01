;(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) { root.AstroEducation = root.AstroEducation || {}; root.AstroEducation.HeliocentricScene = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const DISPLAY = Object.freeze({ earthOrbitRadius: 42, sunRadius: 3.2, earthRadius: 1.35, moonRadius: 0.48, moonOrbitRadius: 4.8 });
  const MEAN_LUNAR_DISTANCE_KM = 384400;
  const EARTH_ECCENTRICITY = 0.0167;
  const LEGEND = '大小与距离采用不同增强比例';
  const REQUIRED_STATE_ERROR = 'worldState must provide earth, sun, moon, and observer state';
  const ORBIT_CHANGE_THRESHOLD_DEG = 0.01;
  function finiteVector(v) { return v && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z); }
  function validState(s) { return s && s.earth && s.sun && s.moon && s.observer && finiteVector(s.earth.positionAu) && finiteVector(s.earth.axisUnit) && Number.isFinite(s.earth.rotationAngleDeg) && finiteVector(s.sun.vectorAu) && finiteVector(s.moon.positionKm) && s.moon.orbit && Number.isFinite(s.moon.orbit.inclinationDeg) && Number.isFinite(s.moon.orbit.eccentricity) && Number.isFinite(s.moon.ascendingNodeLongitudeDeg) && Number.isFinite(s.moon.argumentOfPerigeeDeg) && s.observer.location && Number.isFinite(s.observer.location.latitudeDeg) && Number.isFinite(s.observer.location.longitudeDeg); }
  function frozenVector(v, scale) { const x = v.x * scale, y = v.y * scale, z = v.z * scale; return Object.freeze({ x, y, z, length: Math.hypot(x, y, z) }); }
  function toVisualModel(s) {
    if (!validState(s)) throw new TypeError(REQUIRED_STATE_ERROR);
    const moonScale = DISPLAY.moonOrbitRadius / MEAN_LUNAR_DISTANCE_KM;
    return Object.freeze({
      display: DISPLAY, legend: LEGEND,
      earth: Object.freeze({ position: frozenVector(s.earth.positionAu, DISPLAY.earthOrbitRadius), axisUnit: Object.freeze({ x: s.earth.axisUnit.x, y: s.earth.axisUnit.y, z: s.earth.axisUnit.z }), rotationAngleDeg: s.earth.rotationAngleDeg, perihelionLongitudeDeg: s.earth.perihelionLongitudeDeg, trueLongitudeDeg: s.earth.trueLongitudeDeg }),
      sun: Object.freeze({ direction: frozenVector(s.sun.vectorAu, 1) }),
      moon: Object.freeze({ relativePosition: frozenVector(s.moon.positionKm, moonScale), illumination: s.moon.illumination, orbitInclinationDeg: s.moon.orbit.inclinationDeg, orbitEccentricity: s.moon.orbit.eccentricity, ascendingNodeLongitudeDeg: s.moon.ascendingNodeLongitudeDeg, descendingNodeLongitudeDeg: s.moon.descendingNodeLongitudeDeg, argumentOfPerigeeDeg: s.moon.argumentOfPerigeeDeg, perigeeDistanceKm: s.moon.perigeeDistanceKm, apogeeDistanceKm: s.moon.apogeeDistanceKm }),
      observer: Object.freeze({ location: Object.freeze({ latitudeDeg: s.observer.location.latitudeDeg, longitudeDeg: s.observer.location.longitudeDeg }), subsolarPoint: s.observer.subsolarPoint ? Object.freeze({ latitudeDeg: s.observer.subsolarPoint.latitudeDeg, longitudeDeg: s.observer.subsolarPoint.longitudeDeg }) : null })
    });
  }
  function create(config) {
    const options = config || {}, THREE = options.THREE;
    if (!THREE || typeof THREE.Scene !== 'function' || typeof THREE.Vector3 !== 'function') throw new TypeError('THREE must provide Scene and Vector3');
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200), resources = [], labels = createLabels(options.labelLayer), root = new THREE.Group();
    camera.position.set(0, 38, 68); if (camera.lookAt) camera.lookAt(0, 0, 0);
    const controls = typeof THREE.OrbitControls === 'function' ? new THREE.OrbitControls(camera, options.interactionElement) : null;
    scene.add(root);
    root.add(mesh(THREE, new THREE.SphereGeometry(DISPLAY.sunRadius, 32, 20), new THREE.MeshBasicMaterial({ color: 0xffd34e }), resources));
    root.add(new THREE.PointLight(0xfff1c2, 2.3, 0));
    const texture = new THREE.CanvasTexture(createGlowCanvas()); resources.push(texture); const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, color: 0xffb342, transparent: true, opacity: 0.42, blending: THREE.AdditiveBlending })); resources.push(glow.material); if (glow.scale && glow.scale.set) glow.scale.set(13, 13, 1); root.add(glow);
    const earthOrbitGroup = new THREE.Group(); earthOrbitGroup.add(staticLine(THREE, focusedEarthEllipse(THREE), 0x3b82f6, resources)); earthOrbitGroup.add(marker(THREE, orbitRadius(DISPLAY.earthOrbitRadius, EARTH_ECCENTRICITY, 0), 0, 0x60a5fa, resources), marker(THREE, -orbitRadius(DISPLAY.earthOrbitRadius, EARTH_ECCENTRICITY, Math.PI), 0, 0x93c5fd, resources)); root.add(earthOrbitGroup);
    const earthGroup = new THREE.Group(), earthAxisGroup = new THREE.Group(), earthSpinGroup = new THREE.Group();
    earthSpinGroup.add(mesh(THREE, new THREE.SphereGeometry(DISPLAY.earthRadius, 24, 16), new THREE.MeshPhongMaterial({ color: 0x3478d4, shininess: 12 }), resources), mesh(THREE, new THREE.SphereGeometry(DISPLAY.earthRadius * 1.012, 16, 10), new THREE.MeshBasicMaterial({ color: 0xa5d8ff, wireframe: true, transparent: true, opacity: 0.45 }), resources));
    const observerMarker = marker(THREE, DISPLAY.earthRadius, 0, 0xfb923c, resources); earthSpinGroup.add(observerMarker); earthAxisGroup.add(earthSpinGroup, staticLine(THREE, [new THREE.Vector3(0, -3, 0), new THREE.Vector3(0, 3, 0)], 0xe2e8f0, resources), marker(THREE, 0, 3, 0xf8fafc, resources)); earthGroup.add(earthAxisGroup); root.add(earthGroup);
    const moonOrbitGeometry = dynamicGeometry(THREE, 97, resources), moonOrbit = dynamicLine(THREE, moonOrbitGeometry, 0xc4b5fd, resources), nodeLine = staticLine(THREE, [new THREE.Vector3(), new THREE.Vector3()], 0xf472b6, resources), ascendingNode = marker(THREE, 0, 0, 0x4ade80, resources), descendingNode = marker(THREE, 0, 0, 0xf87171, resources), perigee = marker(THREE, 0, 0, 0xa78bfa, resources), apogee = marker(THREE, 0, 0, 0x8b5cf6, resources);
    earthGroup.add(moonOrbit, nodeLine, ascendingNode, descendingNode, perigee, apogee);
    const moonMaterial = new THREE.ShaderMaterial({ uniforms: { lightDirection: { value: new THREE.Vector3(1, 0, 0) }, illumination: { value: 0 } }, vertexShader: 'varying vec3 worldNormal; void main(){worldNormal=normalize(mat3(modelMatrix)*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}', fragmentShader: 'uniform vec3 lightDirection; varying vec3 worldNormal; void main(){float day=max(dot(normalize(worldNormal),normalize(lightDirection)),0.0);gl_FragColor=vec4(vec3(0.78)*mix(0.08,1.0,day),1.0);}' }); resources.push(moonMaterial);
    const moon = mesh(THREE, new THREE.SphereGeometry(DISPLAY.moonRadius, 20, 14), moonMaterial, resources, false); earthGroup.add(moon); root.add(staticLine(THREE, [new THREE.Vector3(0, -11, 0), new THREE.Vector3(0, 11, 4.77)], 0xfacc15, resources));
    const up = new THREE.Vector3(0, 1, 0), axis = new THREE.Vector3(), sunDirection = new THREE.Vector3(), moonVector = new THREE.Vector3(), observerVector = new THREE.Vector3(), nodeA = new THREE.Vector3(), nodeD = new THREE.Vector3(), peri = new THREE.Vector3(), apo = new THREE.Vector3();
    let lastState = null, lastNode = NaN, lastInclination = NaN, lastArgument = NaN, lastEccentricity = NaN, disposed = false;
    function update(s) {
      if (disposed || s === lastState) return;
      if (!validState(s)) throw new TypeError(REQUIRED_STATE_ERROR);
      lastState = s;
      earthGroup.position.set(s.earth.positionAu.x * DISPLAY.earthOrbitRadius, s.earth.positionAu.y * DISPLAY.earthOrbitRadius, s.earth.positionAu.z * DISPLAY.earthOrbitRadius);
      axis.set(s.earth.axisUnit.x, s.earth.axisUnit.y, s.earth.axisUnit.z).normalize(); if (earthAxisGroup.quaternion && earthAxisGroup.quaternion.setFromUnitVectors) earthAxisGroup.quaternion.setFromUnitVectors(up, axis);
      earthSpinGroup.rotation.y = -radians(s.earth.rotationAngleDeg); setSurfacePoint(observerVector, s.observer.location.latitudeDeg, s.observer.location.longitudeDeg, DISPLAY.earthRadius * 1.035); observerMarker.position.copy(observerVector);
      moonVector.set(s.moon.positionKm.x, s.moon.positionKm.y, s.moon.positionKm.z).multiplyScalar(DISPLAY.moonOrbitRadius / MEAN_LUNAR_DISTANCE_KM); moon.position.copy(moonVector);
      sunDirection.set(s.sun.vectorAu.x, s.sun.vectorAu.y, s.sun.vectorAu.z).normalize(); moonMaterial.uniforms.lightDirection.value.copy(sunDirection); moonMaterial.uniforms.illumination.value = Number.isFinite(s.moon.illumination) ? s.moon.illumination : 0;
      earthOrbitGroup.rotation.y = -radians(s.earth.perihelionLongitudeDeg || 0);
      if (orbitChanged(lastNode, lastInclination, lastArgument, lastEccentricity, s.moon)) { writeMoonOrbit(moonOrbitGeometry, s.moon, nodeA, nodeD, peri, apo); setLineEndpoints(nodeLine.geometry, nodeA, nodeD); ascendingNode.position.copy(nodeA); descendingNode.position.copy(nodeD); perigee.position.copy(peri); apogee.position.copy(apo); updateOrbitLabels(labels, s.moon, nodeA, nodeD, peri, apo); lastNode = s.moon.ascendingNodeLongitudeDeg; lastInclination = s.moon.orbit.inclinationDeg; lastArgument = s.moon.argumentOfPerigeeDeg; lastEccentricity = s.moon.orbit.eccentricity; }
    }
    function resetView() { camera.position.set(0, 38, 68); if (controls && controls.target && controls.target.set) controls.target.set(0, 0, 0); if (controls && controls.update) controls.update(); }
    function dispose() { if (disposed) return; disposed = true; if (controls && controls.dispose) controls.dispose(); resources.forEach(disposeResource); labels.forEach(removeLabel); }
    scene.userData = { earthGroup, earthOrbitGroup, earthAxisGroup, earthSpinGroup, observerMarker, moon, moonOrbit, labels };
    return Object.freeze({ scene, camera, controls, update, resetView, setLabelsVisible: function (visible) { labels.forEach(function (l) { l.style.display = visible ? '' : 'none'; }); }, dispose });
  }
  function createLabels(layer) { return ['太阳中心视角', '升交点', '降交点', '近地点', '远地点', LEGEND].map(function (text) { const e = typeof document !== 'undefined' && document.createElement ? document.createElement('span') : { style: {} }; e.textContent = text; e.className = 'scene-label'; e.style = e.style || {}; if (layer && layer.appendChild) layer.appendChild(e); return e; }); }
  function createGlowCanvas() {
    const canvas = typeof document !== 'undefined' && document.createElement ? document.createElement('canvas') : (typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(64, 64) : {});
    canvas.width = 64; canvas.height = 64;
    const context = canvas.getContext && canvas.getContext('2d');
    if (context && context.createRadialGradient) { const gradient = context.createRadialGradient(32, 32, 1, 32, 32, 32); gradient.addColorStop(0, 'rgba(255,255,220,0.95)'); gradient.addColorStop(0.35, 'rgba(255,190,70,0.45)'); gradient.addColorStop(1, 'rgba(255,170,30,0)'); context.fillStyle = gradient; context.fillRect(0, 0, 64, 64); }
    return canvas;
  }
  function updateOrbitLabels(labels, moon, a, d, p, o) { [['升交点', moon.ascendingNodeLongitudeDeg, a], ['降交点', moon.descendingNodeLongitudeDeg, d], ['近地点', moon.perigeeDistanceKm, p], ['远地点', moon.apogeeDistanceKm, o]].forEach(function (entry, i) { const l = labels[i + 1], point = entry[2]; l.textContent = `${entry[0]} ${Math.round(entry[1] || 0)}${i < 2 ? '°' : ' km'}`; l.dataset = Object.assign(l.dataset || {}, { x: String(point.x), y: String(point.y), z: String(point.z) }); }); }
  function orbitChanged(node, inclination, argument, eccentricity, m) { return !Number.isFinite(node) || Math.abs(node - m.ascendingNodeLongitudeDeg) >= ORBIT_CHANGE_THRESHOLD_DEG || Math.abs(inclination - m.orbit.inclinationDeg) >= ORBIT_CHANGE_THRESHOLD_DEG || Math.abs(argument - m.argumentOfPerigeeDeg) >= ORBIT_CHANGE_THRESHOLD_DEG || Math.abs(eccentricity - m.orbit.eccentricity) >= 1e-5; }
  function setSurfacePoint(out, lat, lon, radius) { lat = radians(lat); lon = radians(lon); out.set(radius * Math.cos(lat) * Math.cos(lon), radius * Math.sin(lat), radius * Math.cos(lat) * Math.sin(lon)); }
  function writeMoonOrbit(g, moon, a, d, p, o) { const attribute = g.getAttribute ? g.getAttribute('position') : g.attributes.position, values = attribute.array; for (let n = 0; n <= 96; n += 1) writeOrbitPoint(values, n * 3, n / 96 * Math.PI * 2, moon); attribute.needsUpdate = true; orbitPoint(a, -radians(moon.argumentOfPerigeeDeg), moon); orbitPoint(d, Math.PI - radians(moon.argumentOfPerigeeDeg), moon); orbitPoint(p, 0, moon); orbitPoint(o, Math.PI, moon); }
  function orbitPoint(out, anomaly, moon) { const n = radians(moon.ascendingNodeLongitudeDeg), i = radians(moon.orbit.inclinationDeg), u = radians(moon.argumentOfPerigeeDeg) + anomaly, e = moon.orbit.eccentricity, r = DISPLAY.moonOrbitRadius * (1 - e * e) / (1 + e * Math.cos(anomaly)); out.set(r * (Math.cos(n) * Math.cos(u) - Math.sin(n) * Math.sin(u) * Math.cos(i)), r * Math.sin(u) * Math.sin(i), r * (Math.sin(n) * Math.cos(u) + Math.cos(n) * Math.sin(u) * Math.cos(i))); }
  function writeOrbitPoint(values, offset, anomaly, moon) { const node = radians(moon.ascendingNodeLongitudeDeg), inclination = radians(moon.orbit.inclinationDeg), latitudeArgument = radians(moon.argumentOfPerigeeDeg) + anomaly, eccentricity = moon.orbit.eccentricity, radius = DISPLAY.moonOrbitRadius * (1 - eccentricity * eccentricity) / (1 + eccentricity * Math.cos(anomaly)); values[offset] = radius * (Math.cos(node) * Math.cos(latitudeArgument) - Math.sin(node) * Math.sin(latitudeArgument) * Math.cos(inclination)); values[offset + 1] = radius * Math.sin(latitudeArgument) * Math.sin(inclination); values[offset + 2] = radius * (Math.sin(node) * Math.cos(latitudeArgument) + Math.cos(node) * Math.sin(latitudeArgument) * Math.cos(inclination)); }
  function setLineEndpoints(g, a, b) { const p = g.getAttribute ? g.getAttribute('position') : g.attributes.position, v = p.array; v[0] = a.x; v[1] = a.y; v[2] = a.z; v[3] = b.x; v[4] = b.y; v[5] = b.z; p.needsUpdate = true; }
  function focusedEarthEllipse(THREE) { const points = []; for (let n = 0; n <= 96; n += 1) { const a = n / 96 * Math.PI * 2, r = orbitRadius(DISPLAY.earthOrbitRadius, EARTH_ECCENTRICITY, a); points.push(new THREE.Vector3(r * Math.cos(a), 0, r * Math.sin(a))); } return points; }
  function orbitRadius(a, e, v) { return a * (1 - e * e) / (1 + e * Math.cos(v)); }
  function dynamicGeometry(THREE, count, resources) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3)); resources.push(g); return g; }
  function dynamicLine(THREE, g, color, resources) { const m = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.78 }); resources.push(m); return new THREE.Line(g, m); }
  function staticLine(THREE, points, color, resources) { const g = new THREE.BufferGeometry().setFromPoints(points), m = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.78 }); resources.push(g, m); return new THREE.Line(g, m); }
  function marker(THREE, x, y, color, resources) { const o = mesh(THREE, new THREE.SphereGeometry(0.2, 10, 8), new THREE.MeshBasicMaterial({ color }), resources); o.position.set(x, y, 0); return o; }
  function mesh(THREE, g, m, resources, retainMaterial) { resources.push(g); if (retainMaterial !== false) resources.push(m); return new THREE.Mesh(g, m); }
  function disposeResource(r) { if (r && r.dispose) r.dispose(); }
  function removeLabel(l) { if (l.parentNode && l.parentNode.removeChild) l.parentNode.removeChild(l); }
  function radians(value) { return value * Math.PI / 180; }
  function worldLightDot(normal, light) { const normalLength = Math.hypot(normal.x, normal.y, normal.z) || 1, lightLength = Math.hypot(light.x, light.y, light.z) || 1; return (normal.x * light.x + normal.y * light.y + normal.z * light.z) / (normalLength * lightLength); }
  return Object.freeze({ DISPLAY, toVisualModel, create, worldLightDot });
});
