/**
 * Canvas step A3: the shell unrolled, for moving attachments on the drawing (roadmap stage A, empirical track).
 *
 * The outside of the cylinder is cut along the top (0°) and laid flat: position along the shell runs left to
 * right from the end the stations are measured from, and the angle around runs top to bottom from 0° (top)
 * through 90°, 180° (bottom) and 270° back to 360°, the same cut line. Footprints are drawn at their true
 * size on the outside surface (along × arc length around). A footprint that crosses the cut shows at both
 * edges. When a long thin shell would make the strip too narrow to work on, the around direction is
 * stretched, and the caption says by how much.
 *
 * The view only draws. Moving an attachment changes its position along and angle around, the same two
 * inputs as in the form; the WRC 537 core is not touched. Snapping is in canvas-snap.js.
 *
 * Lengths are in mm, shown in the case's units (wrc-units.js); angles in degrees.
 */
import { sketchGeometry } from './vessel-sketch.js';
import { roundSig, unitSystem } from './wrc-units.js';

export const ANGLE_STEP = 15; // degrees: the grid around the shell and one arrow-key step
const W_MAX = 640;
const H_MAX = 300; // px, the strip's height at most…
const H_MIN = 150; // …and at least (stretched around when to scale it would be thinner)
const M = Object.freeze({ left: 40, right: 16, top: 24, bottom: 22 });
const GRID_STEPS = Object.freeze({
  SI: [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000, 10000], // mm
  US: [0.125, 0.25, 0.5, 1, 2, 3, 6, 12, 24, 48, 120, 240, 480], // in
});
const MAX_CELLS = 40;

const r2 = (v) => Math.round(v * 100) / 100;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** The grid along the shell: the smallest round step, in the case's units, giving at most 40 cells over `span` mm. */
export function gridAlong(span, u) {
  const steps = GRID_STEPS[u.id] ?? GRID_STEPS.SI;
  const shown = span / u.mmPer;
  const step = steps.find((st) => shown / st <= MAX_CELLS) ?? steps[steps.length - 1];
  return step * u.mmPer;
}

/** How long the drawn shell is: its length, or with none given, enough for every attachment (as the side view). */
function drawnSpan(gs) {
  const g = gs[0];
  if (g.lengthOk) return g.L;
  const reach = Math.max(0, ...gs.filter((a) => a.attachmentOk && a.stationOk).map((a) => a.x + (a.pad ? a.padAlong : a.along) / 2));
  return Math.max(3 * g.OD, 2 * ((g.pad ? g.padAlong : g.along) || 0) + g.OD, reach);
}

/**
 * Scale and placement of the unrolled view for the vessel's attachment cases (all on one shell). `span`
 * fixes the drawn length (held while dragging, so the drawing does not rescale under the pointer).
 */
export function unrolledLayout(cases, { span } = {}) {
  const gs = cases.map(sketchGeometry);
  const g = gs[0];
  const u = unitSystem(cases[0] ?? {});
  if (!g?.shellOk) return { ok: false, u };
  const C = Math.PI * g.OD; // the outside circumference
  const Ld = span ?? drawnSpan(gs);
  const s = Math.min((W_MAX - M.left - M.right) / Ld, H_MAX / C); // px per mm along
  const sA = Math.max(s, H_MIN / C); // px per mm around
  const plotW = Ld * s;
  const plotH = C * sA;
  return {
    ok: true, u, OD: g.OD, C, span: Ld, lengthOk: g.lengthOk, s, sA, sy: plotH / 360, stretch: sA / s,
    x0: M.left, y0: M.top, plotW, plotH, W: M.left + plotW + M.right, H: M.top + plotH + M.bottom,
    grid: { x: gridAlong(Ld, u), y: ANGLE_STEP },
  };
}

/** Drawing coordinates (px in the SVG's viewBox) to the shell: x mm along, y degrees around (not wrapped). */
export function toModel(layout, px, py) {
  return { x: (px - layout.x0) / layout.s, y: (py - layout.y0) / layout.sy };
}
/** The shell to drawing coordinates. */
export function toScreen(layout, x, y) {
  return { px: layout.x0 + x * layout.s, py: layout.y0 + y * layout.sy };
}
/** Where an attachment sits on the unrolled shell: its station (mid-length when none is given) and angle. */
export function positionOf(layout, c) {
  const g = sketchGeometry(c);
  return { x: g.stationOk ? g.x : layout.span / 2, y: g.angle, placed: g.stationOk };
}

/** A length as the view labels it: 6 significant figures in SI, 4 in US, with its unit. */
export function lengthLabel(mm, u) {
  return `${Number(roundSig(mm / u.mmPer, u.id === 'SI' ? 6 : 4))} ${u.length}`;
}
const angleLabel = (a) => `${Number(roundSig(a, 6))}°`;

/** The readout under the view: where the selected attachment is, and (while moving) what it snapped to. */
export function positionText(layout, c, how = null) {
  const g = sketchGeometry(c);
  const name = g.name || 'The attachment';
  if (!layout.ok) return '';
  const p = positionOf(layout, c);
  const along = p.placed ? `${lengthLabel(p.x, layout.u)} along` : 'no position along yet (drawn at mid-length)';
  let snapped = '';
  if (how) {
    const parts = [];
    if (how.how.x === 'align') parts.push(`along lined up with ${how.with.x}`);
    if (how.how.y === 'align') parts.push(`around lined up with ${how.with.y}`);
    if (how.how.x === 'held') parts.push('along held');
    if (how.how.y === 'held') parts.push('around held');
    if (!parts.length && (how.how.x === 'grid' || how.how.y === 'grid')) parts.push('on the grid');
    if (parts.length) snapped = ` · ${parts.join(', ')}`;
  }
  return `${name}: ${along}, ${angleLabel(g.angle)} around${snapped}.`;
}

/**
 * The view as HTML: an SVG and a readout. `cases` are every attachment's case (one shell), `active` the
 * selected one's index. `layout` (from unrolledLayout) may be passed to hold the scale; `how` is the last
 * snap while moving (snapMove's result), drawn as guide lines.
 */
export function buildUnrolledHtml(cases, active, { layout = unrolledLayout(cases), how = null } = {}) {
  if (!layout.ok) {
    return '<p class="vsketch__empty" data-role="unrolled-empty">Enter the shell\'s outside diameter and thickness to lay out the attachments.</p>';
  }
  const L = layout;
  const { x0, y0, plotW, plotH, u } = L;
  const out = [];
  out.push(`<defs><clipPath id="vunroll-clip"><rect x="${r2(x0)}" y="${r2(y0)}" width="${r2(plotW)}" height="${r2(plotH)}"/></clipPath></defs>`);
  out.push(`<rect class="vunroll__surface" x="${r2(x0)}" y="${r2(y0)}" width="${r2(plotW)}" height="${r2(plotH)}"/>`);

  // Grid: every step along (when at least 5 px apart), every 15° around; labels where they fit.
  const gx = L.grid.x * L.s;
  if (gx >= 5) {
    for (let k = 1; k * L.grid.x < L.span - 1e-6; k += 1) {
      const x = x0 + k * gx;
      out.push(`<line class="vunroll__grid" x1="${r2(x)}" y1="${r2(y0)}" x2="${r2(x)}" y2="${r2(y0 + plotH)}"/>`);
    }
  }
  const every = [1, 2, 5, 10, 20, 50].find((m) => m * gx >= 56) ?? 100;
  for (let k = 0; k * L.grid.x <= L.span + 1e-6; k += every) {
    const x = x0 + k * gx;
    out.push(`<text class="vunroll__tick" x="${r2(x)}" y="${r2(y0 - 6)}" text-anchor="middle">${esc(`${Number(roundSig((k * L.grid.x) / u.mmPer, 6))}`)}</text>`);
  }
  for (let a = 0; a <= 360; a += ANGLE_STEP) {
    const y = y0 + a * L.sy;
    const major = a % 90 === 0;
    out.push(`<line class="vunroll__grid${major ? ' vunroll__grid--major' : ''}" x1="${r2(x0)}" y1="${r2(y)}" x2="${r2(x0 + plotW)}" y2="${r2(y)}"/>`);
    if (major) out.push(`<text class="vunroll__tick" x="${r2(x0 - 5)}" y="${r2(y + 4)}" text-anchor="end">${a}°</text>`);
  }
  // The shell's ends: solid at a given length, dashed without one.
  const endClass = L.lengthOk ? 'vunroll__end' : 'vunroll__end vunroll__end--open';
  out.push(`<line class="${endClass}" x1="${r2(x0)}" y1="${r2(y0)}" x2="${r2(x0)}" y2="${r2(y0 + plotH)}"/>`);
  out.push(`<line class="${endClass}" x1="${r2(x0 + plotW)}" y1="${r2(y0)}" x2="${r2(x0 + plotW)}" y2="${r2(y0 + plotH)}"/>`);

  // The selected attachment's guide lines across the strip: highlighted where it lines up with another.
  const sel = cases[active];
  if (sel && sketchGeometry(sel).attachmentOk) {
    const p = positionOf(L, sel);
    const { px, py } = toScreen(L, p.x, p.y);
    out.push(`<line class="vunroll__guide${how?.how.x === 'align' ? ' is-aligned' : ''}" data-guide="along" x1="${r2(px)}" y1="${r2(y0)}" x2="${r2(px)}" y2="${r2(y0 + plotH)}"/>`);
    out.push(`<line class="vunroll__guide${how?.how.y === 'align' ? ' is-aligned' : ''}" data-guide="around" x1="${r2(x0)}" y1="${r2(py)}" x2="${r2(x0 + plotW)}" y2="${r2(py)}"/>`);
  }

  // Attachments in their order, so Tab goes N1, N2, … (where two overlap, the panel grabs the selected one).
  cases.forEach((c, i) => out.push(attachmentHtml(L, c, i, i === active)));

  const n = cases.length;
  const label = `Unrolled shell: position along runs left to right from the first end, angle around runs top to bottom from 0° at the top to 360°. ${n} attachment${n > 1 ? 's' : ''}. Focus one and use the arrow keys to move it.`;
  const stretch = L.stretch > 1.05 ? ` Around the shell is stretched ×${Number(roundSig(L.stretch, 2))} to fit; along is to scale.` : ' To scale.';
  return `<svg class="vunroll__svg" data-view="unrolled" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${r2(L.W)} ${r2(L.H)}" width="${r2(L.W)}" height="${r2(L.H)}" role="group" aria-label="${esc(label)}">
  <title>Unrolled shell</title>
  ${out.join('\n  ')}
  <text class="vunroll__tick" x="${r2(x0)}" y="${r2(L.H - 5)}">Along (${u.length}) →</text>
</svg>
<p class="vunroll__readout" data-role="unrolled-readout">${esc(sel ? positionText(L, sel, how) : '')}</p>
<p class="vunroll__caption">Grid ${esc(lengthLabel(L.grid.x, u))} along × ${ANGLE_STEP}° around.${stretch}</p>`;
}

/** One attachment: pad and footprint at true size, repeated across the cut at 0°/360°, with its name. */
function attachmentHtml(L, c, index, selected) {
  const g = sketchGeometry(c);
  if (!g.attachmentOk) return '';
  const p = positionOf(L, c);
  const { px, py } = toScreen(L, p.x, p.y);
  const half = (len) => ({ x: (len.along / 2) * L.s, y: (len.around / 2) * L.sA });
  const att = half({ along: g.along, around: g.around });
  const pad = g.pad ? half({ along: g.padAlong, around: g.padAround }) : null;
  const reach = Math.max(att.y, pad?.y ?? 0);
  // Copies one turn up or down when the footprint crosses the cut.
  const offsets = [0];
  if (py - reach < L.y0) offsets.push(L.plotH);
  if (py + reach > L.y0 + L.plotH) offsets.push(-L.plotH);
  const shape = (h, cls, dy) => (g.kind === 'RECTANGULAR'
    ? `<rect class="${cls}" x="${r2(px - h.x)}" y="${r2(py + dy - h.y)}" width="${r2(2 * h.x)}" height="${r2(2 * h.y)}"/>`
    : `<ellipse class="${cls}" cx="${r2(px)}" cy="${r2(py + dy)}" rx="${r2(h.x)}" ry="${r2(h.y)}"/>`);
  const parts = [];
  for (const dy of offsets) {
    if (pad) parts.push(shape(pad, 'vunroll__pad', dy));
    parts.push(shape(att, `vunroll__foot${g.solid ? ' vunroll__foot--solid' : ''}${p.placed ? '' : ' vunroll__foot--unplaced'}`, dy));
  }
  // A grab area at least 24 px across, and a ring shown when the keyboard focus is on it.
  const hx = Math.max(att.x, pad?.x ?? 0, 12);
  const hy = Math.max(reach, 12);
  const ring = `<rect class="vunroll__ring" x="${r2(px - hx - 3)}" y="${r2(py - hy - 3)}" width="${r2(2 * hx + 6)}" height="${r2(2 * hy + 6)}" rx="4"/>`;
  const hit = `<rect class="vunroll__hit" x="${r2(px - hx)}" y="${r2(py - hy)}" width="${r2(2 * hx)}" height="${r2(2 * hy)}"/>`;
  // The name on the right, or on the left near the far end so it stays on the drawing.
  const right = px + hx + 8 + 7 * g.name.length <= L.W;
  const name = g.name ? `<text class="vunroll__name" x="${r2(right ? px + hx + 8 : px - hx - 8)}" y="${r2(py + 4)}" text-anchor="${right ? 'start' : 'end'}" data-name="${esc(g.name)}">${esc(g.name)}</text>` : '';
  const where = p.placed ? `${lengthLabel(p.x, L.u)} along` : 'no position along yet';
  const aria = `${g.name || 'Attachment'}: ${where}, ${angleLabel(g.angle)} around${selected ? ', selected' : ''}. Arrow keys move it to the next grid line; with Shift, a small step.`;
  return `<g class="vunroll__att${selected ? ' is-active' : ''}" data-move="${index}" tabindex="0" role="button" aria-roledescription="movable attachment" aria-label="${esc(aria)}" aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown">
    <g clip-path="url(#vunroll-clip)">${parts.join('')}</g>${hit}${ring}${name}</g>`;
}
