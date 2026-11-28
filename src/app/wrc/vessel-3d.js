/**
 * Canvas step A6: a 3-D preview of the vessel (roadmap stage A, empirical track). View only.
 *
 * Loaded only when "3-D preview" is opened (a dynamic import), so the first load does not grow. It draws the
 * same inputs as the sketch: the shell (wall and ends), every attachment at its station and angle, and pads,
 * the selected attachment in the accent colour. Like the sketch it reads the cases and never changes them.
 *
 * World axes, in mm: x along the shell from the end the stations are measured from; z up. An angle around
 * (degrees clockwise from the top, looking from that end) points along dir(θ) = (0, −sin θ, cos θ), so 90° is
 * −y, the side the sketch's side view and the preview's first view are seen from. Attachments' heights are
 * not inputs: they are drawn as in the sketch (stubHeight).
 *
 * Rendering is software-3d.js, ported from Pdf-Hub (MIT).
 */
import { sketchGeometry, stubHeight } from './vessel-sketch.js';
import { roundSig, unitSystem } from './wrc-units.js';
import { DEFAULT_CAMERA, facesEye, renderScene } from './software-3d.js';

const TAU = 2 * Math.PI;
const DEG = Math.PI / 180;
const AROUND = 48; // segments round the shell
const ROUND = 32; // segments round an attachment

/** Unit vector out from the shell axis at an angle around (degrees). */
export function dirAt(angleDeg) {
  const a = angleDeg * DEG;
  return { x: 0, y: -Math.sin(a), z: Math.cos(a) };
}
/** Unit vector around the shell (the way the angle grows). */
function tangentAt(angleDeg) {
  const a = angleDeg * DEG;
  return { x: 0, y: -Math.cos(a), z: -Math.sin(a) };
}

/** Collects vertices (each with its normal) and triangles; `done()` adds the bounds. */
function meshBuilder(id) {
  const vertices = [];
  const normals = [];
  const indices = [];
  return {
    v(p, n) {
      vertices.push(p.x, p.y, p.z);
      const l = Math.hypot(n.x, n.y, n.z) || 1;
      normals.push(n.x / l, n.y / l, n.z / l);
      return vertices.length / 3 - 1;
    },
    tri(a, b, c) { indices.push(a, b, c); },
    quad(a, b, c, d) { indices.push(a, b, c, a, c, d); },
    done() {
      const b = { minX: Infinity, minY: Infinity, minZ: Infinity, maxX: -Infinity, maxY: -Infinity, maxZ: -Infinity };
      for (let i = 0; i < vertices.length; i += 3) {
        b.minX = Math.min(b.minX, vertices[i]); b.maxX = Math.max(b.maxX, vertices[i]);
        b.minY = Math.min(b.minY, vertices[i + 1]); b.maxY = Math.max(b.maxY, vertices[i + 1]);
        b.minZ = Math.min(b.minZ, vertices[i + 2]); b.maxZ = Math.max(b.maxZ, vertices[i + 2]);
      }
      return { id, vertices, normals, indices, bounds: b };
    },
  };
}

const add = (...vs) => vs.reduce((s, v) => ({ x: s.x + v.x, y: s.y + v.y, z: s.z + v.z }), { x: 0, y: 0, z: 0 });
const mul = (v, k) => ({ x: v.x * k, y: v.y * k, z: v.z * k });
const X = Object.freeze({ x: 1, y: 0, z: 0 });

/** The shell: outside and inside surfaces from 0 to `length`, and the two end rings showing the wall. */
export function shellMesh(g, length) {
  const m = meshBuilder('shell');
  const R = g.OD / 2;
  const Ri = R - g.tn;
  // Short pieces along, so the far-to-near sort does not let a long face hide an attachment.
  const along = Math.min(24, Math.max(4, Math.ceil(length / (0.75 * R))));
  const ring = (r, x, inward) => Array.from({ length: AROUND }, (_, i) => {
    const d = dirAt((360 * i) / AROUND);
    return m.v({ x, y: r * d.y, z: r * d.z }, inward ? mul(d, -1) : d);
  });
  for (const [r, inward] of [[R, false], [Ri, true]]) {
    let prev = ring(r, 0, inward);
    for (let j = 1; j <= along; j += 1) {
      const next = ring(r, (length * j) / along, inward);
      for (let i = 0; i < AROUND; i += 1) m.quad(prev[i], prev[(i + 1) % AROUND], next[(i + 1) % AROUND], next[i]);
      prev = next;
    }
  }
  for (const [x, nx] of [[0, -1], [length, 1]]) {
    const n = { x: nx, y: 0, z: 0 };
    const outer = Array.from({ length: AROUND }, (_, i) => { const d = dirAt((360 * i) / AROUND); return m.v({ x, y: R * d.y, z: R * d.z }, n); });
    const inner = Array.from({ length: AROUND }, (_, i) => { const d = dirAt((360 * i) / AROUND); return m.v({ x, y: Ri * d.y, z: Ri * d.z }, n); });
    for (let i = 0; i < AROUND; i += 1) m.quad(outer[i], outer[(i + 1) % AROUND], inner[(i + 1) % AROUND], inner[i]);
  }
  return m.done();
}

/**
 * A pad: a curved plate of thickness padT on the outside of the shell, centred at station x and angle θ.
 * Round pads are a disc (on the surface), rectangular ones a rectangle; both with their edge.
 */
export function padMesh(g, R, x, id) {
  const m = meshBuilder(id);
  const top = R + g.padT;
  // A point on the surface `along` mm from the centre and `arc` mm round it, at radius r.
  const at = (along, arc, r) => {
    const d = dirAt(g.angle + (arc / R) / DEG);
    return { p: { x: x + along, y: r * d.y, z: r * d.z }, d };
  };
  let outline;
  if (g.kind === 'RECTANGULAR') {
    const A = g.padAlong / 2; const B = g.padAround / 2; const n = 8;
    const grid = [];
    for (let i = 0; i <= n; i += 1) {
      grid.push([]);
      for (let j = 0; j <= n; j += 1) {
        const q = at(-A + (2 * A * i) / n, -B + (2 * B * j) / n, top);
        grid[i].push(m.v(q.p, q.d));
      }
    }
    for (let i = 0; i < n; i += 1) for (let j = 0; j < n; j += 1) m.quad(grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]);
    outline = [];
    for (let k = 0; k < n; k += 1) outline.push([-A + (2 * A * k) / n, -B]);
    for (let k = 0; k < n; k += 1) outline.push([A, -B + (2 * B * k) / n]);
    for (let k = 0; k < n; k += 1) outline.push([A - (2 * A * k) / n, B]);
    for (let k = 0; k < n; k += 1) outline.push([-A, B - (2 * B * k) / n]);
  } else {
    const rp = g.padAlong / 2; const rings = 4;
    const centre = at(0, 0, top);
    const c = m.v(centre.p, centre.d);
    let prev = null;
    for (let k = 1; k <= rings; k += 1) {
      const rho = (rp * k) / rings;
      const ringIdx = Array.from({ length: ROUND }, (_, i) => {
        const phi = (TAU * i) / ROUND;
        const q = at(rho * Math.cos(phi), rho * Math.sin(phi), top);
        return m.v(q.p, q.d);
      });
      for (let i = 0; i < ROUND; i += 1) {
        if (prev) m.quad(prev[i], prev[(i + 1) % ROUND], ringIdx[(i + 1) % ROUND], ringIdx[i]);
        else m.tri(c, ringIdx[i], ringIdx[(i + 1) % ROUND]);
      }
      prev = ringIdx;
    }
    outline = Array.from({ length: ROUND }, (_, i) => [rp * Math.cos((TAU * i) / ROUND), rp * Math.sin((TAU * i) / ROUND)]);
  }
  // The edge: from the shell up to the pad's top, all round.
  const edge = outline.map(([along, arc]) => {
    const lo = at(along, arc, R); const hi = at(along, arc, top);
    const out = add(mul(X, along), mul(tangentAt(g.angle), arc));
    return [m.v(lo.p, out), m.v(hi.p, out)];
  });
  for (let i = 0; i < edge.length; i += 1) {
    const [a, b] = edge[i]; const [c, d] = edge[(i + 1) % edge.length];
    m.quad(a, c, d, b);
  }
  return m.done();
}

/**
 * An attachment: a round tube (a nozzle, open; a solid trunnion, capped) or a rectangular block (a lug),
 * standing on the shell or its pad, from where it meets that surface to `height` above it.
 */
export function attachmentMesh(g, R, x, height, id) {
  const m = meshBuilder(id);
  const n = dirAt(g.angle);
  const w = tangentAt(g.angle);
  const seat = R + (g.pad ? g.padT : 0); // the surface it stands on
  const tip = seat + height;
  // Distance out along n where a point `b` mm round meets the seat: on a cylinder of radius `seat`.
  const base = (b) => Math.sqrt(Math.max(0, seat * seat - b * b));
  const point = (a, b, s) => add(mul(X, x + a), mul(n, s), mul(w, b));
  if (g.kind === 'RECTANGULAR') {
    const A = g.along / 2; const B = Math.min(g.around / 2, seat * 0.999); const k = 6;
    const bs = Array.from({ length: k + 1 }, (_, j) => -B + (2 * B * j) / k);
    for (const sa of [-1, 1]) { // the two ends along the shell
      const nrm = mul(X, sa);
      const col = bs.map((b) => [m.v(point(sa * A, b, base(b)), nrm), m.v(point(sa * A, b, tip), nrm)]);
      for (let j = 0; j < k; j += 1) m.quad(col[j][0], col[j + 1][0], col[j + 1][1], col[j][1]);
    }
    for (const sb of [-1, 1]) { // the two sides round the shell
      const nrm = mul(w, sb);
      const b = sb * B;
      m.quad(m.v(point(-A, b, base(b)), nrm), m.v(point(A, b, base(b)), nrm), m.v(point(A, b, tip), nrm), m.v(point(-A, b, tip), nrm));
    }
    m.quad(m.v(point(-A, -B, tip), n), m.v(point(A, -B, tip), n), m.v(point(A, B, tip), n), m.v(point(-A, B, tip), n));
    return m.done();
  }
  const r = Math.min(g.along / 2, seat * 0.999);
  const side = Array.from({ length: ROUND }, (_, i) => {
    const phi = (TAU * i) / ROUND;
    const a = r * Math.cos(phi); const b = r * Math.sin(phi);
    const out = add(mul(X, Math.cos(phi)), mul(w, Math.sin(phi)));
    return [m.v(point(a, b, base(b)), out), m.v(point(a, b, tip), out)];
  });
  for (let i = 0; i < ROUND; i += 1) m.quad(side[i][0], side[(i + 1) % ROUND][0], side[(i + 1) % ROUND][1], side[i][1]);
  if (g.solid) {
    const c = m.v(point(0, 0, tip), n);
    // The cap's own rim vertices, with the cap's normal (the side's carry the side's).
    const rim = side.map((_, i) => { const phi = (TAU * i) / ROUND; return m.v(point(r * Math.cos(phi), r * Math.sin(phi), tip), n); });
    for (let i = 0; i < ROUND; i += 1) m.tri(c, rim[i], rim[(i + 1) % ROUND]);
  }
  return m.done();
}

/** Colours on the app's dark panel. */
export const COLOURS = Object.freeze({
  background: '#0b1526', shell: '#6f8fbf', attachment: '#9aa9bf', selected: '#4c8dff', pad: '#c99a2e',
});

/**
 * Everything to draw for the vessel's attachment cases: { items, labels, length, ok }. `labels` are the
 * attachments' names at their tips, for drawing on top. Without a usable shell, ok is false.
 */
export function vesselScene(cases, active) {
  const gs = cases.map(sketchGeometry);
  const g0 = gs[0];
  if (!g0?.shellOk) return { ok: false, items: [], labels: [] };
  const R = g0.OD / 2;
  const reach = Math.max(0, ...gs.filter((g) => g.attachmentOk && g.stationOk).map((g) => g.x + (g.pad ? g.padAlong : g.along) / 2));
  const length = g0.lengthOk ? g0.L : Math.max(3 * g0.OD, reach);
  // The shell is the convex body; each attachment and pad is a part, on the side of it its anchor faces.
  const items = [{ mesh: shellMesh(g0, length), color: COLOURS.shell, body: true }];
  const labels = [];
  gs.forEach((g, i) => {
    if (!g.attachmentOk) return;
    const x = g.stationOk ? g.x : length / 2;
    const h = stubHeight(g, g0.OD);
    const selected = i === active;
    const n = dirAt(g.angle);
    const anchor = { p: add(mul(X, x), mul(n, R)), n };
    if (g.pad) items.push({ mesh: padMesh(g, R, x, `pad-${i}`), color: COLOURS.pad, anchor, under: true });
    items.push({ mesh: attachmentMesh(g, R, x, h, `att-${i}`), color: selected ? COLOURS.selected : COLOURS.attachment, selected, anchor });
    const tip = add(mul(X, x), mul(dirAt(g.angle), R + (g.pad ? g.padT : 0) + h * 1.15));
    labels.push({ name: g.name, at: tip, selected, anchor });
  });
  return { ok: true, items, labels, length, R };
}

/** One sentence for screen readers: what the preview shows and from where. */
export function describeScene(cases, active, camera) {
  const g0 = sketchGeometry(cases[0] ?? {});
  if (!g0.shellOk) return '3-D preview: enter the shell\'s outside diameter and thickness to see it.';
  const u = unitSystem(cases[0]);
  const len = (mm) => `${Number(roundSig(mm / u.mmPer, u.id === 'SI' ? 6 : 4))} ${u.length}`;
  const names = cases.map((c) => sketchGeometry(c).name).filter(Boolean);
  const sel = sketchGeometry(cases[active] ?? {}).name;
  return `3-D preview: shell of outside diameter ${len(g0.OD)}${g0.lengthOk ? `, ${len(g0.L)} long` : ''}, with ${cases.length} attachment${cases.length > 1 ? 's' : ''}${names.length ? ` (${names.join(', ')})` : ''}${sel ? `; ${sel} selected` : ''}. Turned ${Math.round(camera.azimuthDeg)}°, tilted ${Math.round(camera.elevationDeg)}°.`;
}

/**
 * The preview in `container`: a canvas, turned by dragging or with the arrow keys, zoomed with + and − (or
 * the buttons), reset with Home or "Reset view". `update(cases, active)` redraws it for the vessel.
 */
export function createVesselPreview(container) {
  container.innerHTML = `
    <div class="v3d__bar">
      <button type="button" data-v3d="zoomIn" aria-label="Zoom in">+</button>
      <button type="button" data-v3d="zoomOut" aria-label="Zoom out">−</button>
      <button type="button" data-v3d="reset">Reset view</button>
      <span class="v3d__hint">Drag to turn it, or focus it and use the arrow keys; + and − zoom.</span>
    </div>
    <canvas class="v3d__canvas" tabindex="0" role="img" data-role="vessel-3d"></canvas>`;
  const canvas = container.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  let camera = { ...DEFAULT_CAMERA };
  let cases = [];
  let active = 0;
  let drag = null;
  let last = null;

  function draw() {
    const width = Math.max(240, Math.min(720, container.clientWidth || 640));
    const height = Math.round(Math.min(380, Math.max(220, width * 0.55)));
    const dpr = globalThis.devicePixelRatio || 1;
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    }
    canvas.setAttribute('aria-label', describeScene(cases, active, camera));
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const scene = vesselScene(cases, active);
    if (!scene.ok) {
      ctx.fillStyle = COLOURS.background;
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = COLOURS.attachment;
      ctx.font = '13px system-ui, sans-serif';
      ctx.fillText('Enter the shell\'s outside diameter and thickness to see it.', 12, 24);
      last = null;
      return;
    }
    const out = renderScene(ctx, scene.items, camera, { width, height, background: COLOURS.background });
    ctx.font = '12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    for (const l of scene.labels) {
      if (!l.name) continue;
      const p = out.project(l.at.x, l.at.y, l.at.z);
      // An attachment on the far side is hidden by the shell: its name is shown faintly.
      ctx.globalAlpha = facesEye(out.project.eye, l.anchor.p, l.anchor.n) ? 1 : 0.4;
      ctx.fillStyle = l.selected ? COLOURS.selected : '#c9d6ea';
      ctx.fillText(l.name, p.sx, p.sy);
    }
    ctx.globalAlpha = 1;
    // Which end is which: the stations are measured from "end 1".
    const e = out.project(0, 0, scene.R * 1.25);
    ctx.fillStyle = '#8ea2c0';
    ctx.fillText('end 1', e.sx, e.sy);
    last = { triangles: out.triangles };
  }

  const turn = (dAz, dEl) => {
    camera = { ...camera, azimuthDeg: (((camera.azimuthDeg + dAz) % 360) + 360) % 360, elevationDeg: Math.max(-85, Math.min(85, camera.elevationDeg + dEl)) };
    draw();
  };
  const zoomBy = (f) => { camera = { ...camera, zoom: Math.max(0.4, Math.min(4, camera.zoom * f)) }; draw(); };
  const reset = () => { camera = { ...DEFAULT_CAMERA }; draw(); };

  canvas.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
    try { canvas.setPointerCapture(event.pointerId); } catch { /* already up */ }
    canvas.focus({ preventScroll: true });
    event.preventDefault();
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    const dx = event.clientX - drag.x; const dy = event.clientY - drag.y;
    drag.x = event.clientX; drag.y = event.clientY;
    turn(-dx * 0.5, dy * 0.4);
  });
  const end = (event) => { if (drag && event.pointerId === drag.id) drag = null; };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('keydown', (event) => {
    const step = event.shiftKey ? 5 : 15;
    const keys = {
      ArrowLeft: () => turn(step, 0), ArrowRight: () => turn(-step, 0), ArrowUp: () => turn(0, step), ArrowDown: () => turn(0, -step),
      '+': () => zoomBy(1.25), '=': () => zoomBy(1.25), '-': () => zoomBy(0.8), Home: reset, 0: reset,
    };
    const fn = keys[event.key];
    if (!fn) return;
    event.preventDefault();
    fn();
  });
  container.addEventListener('click', (event) => {
    const act = event.target.closest?.('[data-v3d]')?.dataset.v3d;
    if (act === 'zoomIn') zoomBy(1.25);
    else if (act === 'zoomOut') zoomBy(0.8);
    else if (act === 'reset') reset();
  });
  const resize = globalThis.ResizeObserver ? new ResizeObserver(() => draw()) : null;
  resize?.observe(container);

  return {
    update(nextCases, nextActive) { cases = nextCases; active = nextActive; draw(); },
    camera: () => ({ ...camera }),
    stats: () => last,
    destroy() { resize?.disconnect(); container.innerHTML = ''; },
  };
}
