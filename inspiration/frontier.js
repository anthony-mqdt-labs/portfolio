/* Pure geometry is shared with the static fallback generator and numerical checks.
   The browser renderer uses precomputed coordinates; no dependencies or WebGL. */
(() => {
  'use strict';
  const RINGS = 128, SIDES = 48, COUNT = RINGS * SIDES, TAU = Math.PI * 2;
  function makeShape(name) {
    const positions = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      const ring = Math.floor(i / SIDES), side = i % SIDES;
      const u = ring / RINGS * TAU, v = side / SIDES * TAU;
      let x, y, z;
      if (name === 'knot') {
        // Trefoil centreline, with a tube in a perpendicular tangent frame.
        const c = Math.cos(3 * u), s = Math.sin(3 * u);
        const cx = (2 + c) * Math.cos(2 * u);
        const cy = (2 + c) * Math.sin(2 * u);
        const cz = s;
        const tx = -3 * s * Math.cos(2 * u) - 2 * (2 + c) * Math.sin(2 * u);
        const ty = -3 * s * Math.sin(2 * u) + 2 * (2 + c) * Math.cos(2 * u);
        const tz = 3 * c;
        const length = Math.hypot(tx, ty, tz), normalLength = Math.hypot(tx, ty);
        const nx = -ty / normalLength, ny = tx / normalLength;
        const bx = -tz * ny / length, by = tz * nx / length;
        const bz = (tx * ny - ty * nx) / length;
        const radius = .42;
        x = cx + radius * (nx * Math.cos(v) + bx * Math.sin(v));
        y = cy + radius * (ny * Math.cos(v) + by * Math.sin(v));
        z = cz + radius * bz * Math.sin(v);
      } else if (name === 'sphere') {
        const latitude = Math.acos(1 - 2 * (ring + .5) / RINGS);
        const r = 2.55 + .08 * Math.sin(u * 9 + v * 5);
        x = r * Math.sin(latitude) * Math.cos(v);
        y = r * Math.cos(latitude);
        z = r * Math.sin(latitude) * Math.sin(v);
      } else if (name === 'wave') {
        x = (ring / (RINGS - 1) - .5) * 6.0;
        z = (side / (SIDES - 1) - .5) * 5.0;
        y = .65 * Math.sin(x * 1.6 + z * .7) + .35 * Math.cos(z * 2 - x);
      } else {
        throw new Error('Unknown point-field shape: ' + name);
      }
      positions[i * 3] = x; positions[i * 3 + 1] = y; positions[i * 3 + 2] = z;
    }
    return positions;
  }
  function project(positions, width, height, angleX, angleY, angleZ, output) {
    const projected = output || new Float32Array(COUNT * 3);
    const cx = Math.cos(angleX), sx = Math.sin(angleX);
    const cy = Math.cos(angleY), sy = Math.sin(angleY);
    const cz = Math.cos(angleZ), sz = Math.sin(angleZ);
    const scale = Math.min(width, height) * 1.07;
    for (let i = 0; i < COUNT; i++) {
      const offset = i * 3;
      const x = positions[offset], y = positions[offset + 1], z = positions[offset + 2];
      const rx = x * cy + z * sy, rz = -x * sy + z * cy;
      const ry = y * cx - rz * sx, depth = y * sx + rz * cx;
      const xx = rx * cz - ry * sz, yy = rx * sz + ry * cz;
      const perspective = scale / (8 - depth);
      projected[offset] = width * .52 + xx * perspective;
      projected[offset + 1] = height * .5 + yy * perspective;
      projected[offset + 2] = depth;
    }
    return projected;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { makeShape, project, COUNT, RINGS, SIDES };
    return;
  }

  const canvas = document.getElementById('field');
  const container = document.getElementById('sculpture');
  const motion = document.getElementById('motion');
  const buttons = Array.from(document.querySelectorAll('[data-shape]'));
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const status = document.getElementById('field-status');
  let ctx = null;
  try { ctx = canvas.getContext('2d', { alpha: true }); } catch (_) { /* Static field remains. */ }
  if (ctx) {
    const shapes = { knot: makeShape('knot'), sphere: makeShape('sphere'), wave: makeShape('wave') };
    const current = new Float32Array(shapes.knot);
    const from = new Float32Array(current);
    const projected = new Float32Array(current.length);
    let target = shapes.knot, morph = 1, width = 1, height = 1;
    let angle = 0, lastFrame = 0, frameId = 0, onScreen = true;
    let paused = false, pointerX = 0, pointerY = 0, smoothX = 0, smoothY = 0;
    const colors = Array.from({length: 12}, (_, i) => {
      const t = i / 11;
      return `rgba(${Math.round(120 + t * 99)},${Math.round(178 + t * 77)},${Math.round(60 + t * 72)},${(.2 + t * .66).toFixed(3)})`;
    });
    function draw() {
      project(current, width, height, -.53 + smoothY * .23, .28 + angle + smoothX * .35, -.37, projected);
      ctx.clearRect(0, 0, width, height);
      // Connected circumference lines expose the geometry; the points add depth.
      ctx.lineWidth = .55;
      for (let ring = 0; ring < RINGS; ring += 3) {
        const start = ring * SIDES;
        const depth = projected[start * 3 + 2];
        ctx.strokeStyle = `rgba(171,234,89,${(.035 + (depth + 4) / 8 * .095).toFixed(3)})`;
        ctx.beginPath();
        for (let side = 0; side < SIDES; side++) {
          const o = (start + side) * 3;
          if (side === 0) ctx.moveTo(projected[o], projected[o + 1]);
          else ctx.lineTo(projected[o], projected[o + 1]);
        }
        if (target !== shapes.wave) ctx.closePath();
        ctx.stroke();
      }
      // Draw back-to-front depth buckets without allocating or sorting per frame.
      for (let bucket = 0; bucket < colors.length; bucket++) {
        ctx.fillStyle = colors[bucket];
        const step = width < 450 ? 2 : 1;
        for (let i = 0; i < COUNT; i += step) {
          const o = i * 3, depth = projected[o + 2];
          const pointBucket = Math.max(0, Math.min(11, Math.floor((depth + 4) / 8 * 12)));
          if (pointBucket !== bucket) continue;
          const size = .65 + (depth + 4) / 8 * 1.0;
          ctx.fillRect(projected[o], projected[o + 1], size, size);
        }
      }
    }
    function resize() {
      const rect = container.getBoundingClientRect();
      width = Math.max(1, rect.width); height = Math.max(1, rect.height);
      const dpr = Math.min(devicePixelRatio || 1, 1.75);
      canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw();
    }
    function shouldRun() { return onScreen && !document.hidden && !paused && !reduceMotion.matches; }
    function advance(dt) {
      angle += dt * .105;
      const damping = 1 - Math.exp(-dt * 5);
      smoothX += (pointerX - smoothX) * damping;
      smoothY += (pointerY - smoothY) * damping;
      if (morph < 1) {
        morph = Math.min(1, morph + dt / 1.45);
        const ease = morph * morph * morph * (morph * (morph * 6 - 15) + 10);
        for (let i = 0; i < current.length; i++) current[i] = from[i] + (target[i] - from[i]) * ease;
      }
    }
    function tick(timestamp) {
      frameId = 0;
      if (!shouldRun()) return;
      // Deliberately capped at 30 fps; never catch up after a hidden tab.
      if (!lastFrame || timestamp - lastFrame >= 1000 / 30 - 1) {
        const dt = lastFrame ? Math.min((timestamp - lastFrame) / 1000, .07) : 0;
        lastFrame = timestamp; advance(dt); draw();
      }
      frameId = requestAnimationFrame(tick);
    }
    function sync() {
      if (frameId) cancelAnimationFrame(frameId);
      frameId = 0; lastFrame = 0;
      motion.disabled = reduceMotion.matches;
      motion.setAttribute('aria-pressed', String(paused || reduceMotion.matches));
      motion.setAttribute('aria-label', reduceMotion.matches ? 'Animation disabled by reduced-motion preference' : paused ? 'Resume animation' : 'Pause animation');
      motion.innerHTML = '<span aria-hidden="true">' + (paused || reduceMotion.matches ? '▷' : 'Ⅱ') + '</span>';
      if (reduceMotion.matches) { current.set(target); morph = 1; smoothX = 0; smoothY = 0; }
      draw();
      if (shouldRun()) frameId = requestAnimationFrame(tick);
    }
    buttons.forEach(button => button.addEventListener('click', () => {
      const name = button.dataset.shape;
      from.set(current); target = shapes[name]; morph = 0;
      if (paused || reduceMotion.matches) { current.set(target); morph = 1; }
      buttons.forEach(other => other.setAttribute('aria-pressed', String(other === button)));
      status.textContent = name[0].toUpperCase() + name.slice(1) + ' selected.';
      draw();
    }));
    motion.addEventListener('click', () => { paused = !paused; sync(); });
    // Fine pointers tilt the object. Touch scrolling remains entirely native.
    container.addEventListener('pointermove', event => {
      if (event.pointerType === 'touch' || reduceMotion.matches || paused) return;
      const rect = container.getBoundingClientRect();
      pointerX = (event.clientX - rect.left) / rect.width * 2 - 1;
      pointerY = (event.clientY - rect.top) / rect.height * 2 - 1;
    }, {passive:true});
    container.addEventListener('pointerleave', () => { pointerX = 0; pointerY = 0; });
    document.addEventListener('visibilitychange', sync);
    reduceMotion.addEventListener('change', sync);
    if ('ResizeObserver' in window) new ResizeObserver(resize).observe(container);
    else window.addEventListener('resize', resize);
    if ('IntersectionObserver' in window) new IntersectionObserver(entries => {
      onScreen = entries[0].isIntersecting; sync();
    }, {threshold:0}).observe(container);
    resize();
    container.classList.add('ready');
    canvas.setAttribute('role','img');
    container.querySelector('.field-fallback').alt = '';
    document.querySelector('.field-ui').hidden = false;
    sync();
  }

  const copyButton = document.getElementById('copy-email');
  const copyStatus = document.getElementById('copy-status');
  if (navigator.clipboard && window.isSecureContext) {
    copyButton.hidden = false;
    copyButton.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText('critics.trends5v@icloud.com');
        copyStatus.textContent = 'Email address copied.';
      } catch (_) {
        copyStatus.textContent = 'critics.trends5v@icloud.com';
      }
    });
  }
})();
