/* Position scene labels in CSS pixels and keep their measured boxes apart. */
;(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.AstroEducation = root.AstroEducation || {};
  root.AstroEducation.SceneLabelLayout = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  function rectFor(element) {
    return element && element.getBoundingClientRect ? element.getBoundingClientRect() : { left: 0, top: 0, width: 1, height: 1 };
  }
  function overlaps(a, b) {
    const gap = 5;
    return a.x < b.x + b.width + gap && a.x + a.width + gap > b.x && a.y < b.y + b.height + gap && a.y + a.height + gap > b.y;
  }
  function clamp(value, low, high) { return Math.max(low, Math.min(high, value)); }

  function position(records, camera, projected, options) {
    const view = rectFor(options.interactionElement), layer = rectFor(options.labelLayer);
    const originX = view.left - layer.left, originY = view.top - layer.top;
    const padding = view.width > 16 && view.height > 16 ? 8 : 0;
    const occupied = [];
    if (options.titleElement) {
      const title = rectFor(options.titleElement);
      occupied.push({ x: title.left - layer.left, y: title.top - layer.top, width: title.width, height: title.height });
    }
    const entries = records.map(function(record) {
      const element = record.element || record;
      element.style.visibility = 'hidden';
      element.style.maxWidth = Math.max(0, view.width - padding * 2) + 'px';
      return { record: record, element: element };
    });
    // Measure after applying widths, then lay out the most useful labels first.
    entries.forEach(function(entry) { entry.width = entry.element.offsetWidth || 0; entry.height = entry.element.offsetHeight || 0; });
    entries.sort(function(a, b) { return priority(b.record) - priority(a.record); });
    entries.forEach(function(entry) {
      const record = entry.record, element = entry.element, width = entry.width, height = entry.height;
      if (element.style.display === 'none') return;
      let x, y, inView = true;
      if (record.hudSlot) {
        x = originX + view.width * record.hudSlot.x;
        y = originY + view.height * record.hudSlot.y;
      } else {
        projected.copy(record.anchor);
        if (record.anchorParent) record.anchorParent.localToWorld(projected);
        projected.project(camera);
        x = originX + (projected.x + 1) * 0.5 * view.width - width / 2;
        y = originY + (1 - projected.y) * 0.5 * view.height - height / 2 + (record.offsetY || 0);
        inView = Math.abs(projected.x) <= 1 && Math.abs(projected.y) <= 1 && Math.abs(projected.z) <= 1;
      }
      element.style.left = x.toFixed(2) + 'px';
      element.style.top = y.toFixed(2) + 'px';
      if (!inView || !Number.isFinite(x + y) || view.width <= 0 || view.height <= 0) return;
      const shifts = [[0, 0]];
      if (!record.keepAnchor) {
        for (let row = 1; row <= 5; row++) shifts.push([0, row * (height + 6)], [0, -row * (height + 6)]);
        shifts.push([width / 2 + 12, 0], [-width / 2 - 12, 0]);
      }
      for (const shift of shifts) {
        const box = { x: clamp(x + shift[0], originX + padding, originX + view.width - width - padding), y: clamp(y + shift[1], originY + padding, originY + view.height - height - padding), width: width, height: height };
        if (width > view.width - padding * 2 || height > view.height - padding * 2 || occupied.some(function(other) { return overlaps(box, other); })) continue;
        element.style.left = box.x.toFixed(2) + 'px';
        element.style.top = box.y.toFixed(2) + 'px';
        element.style.visibility = 'visible';
        occupied.push(box);
        break;
      }
    });
  }
  function priority(record) { return record.priority == null ? (record.hudSlot ? 3 : 2) : record.priority; }
  return Object.freeze({ position: position });
});
