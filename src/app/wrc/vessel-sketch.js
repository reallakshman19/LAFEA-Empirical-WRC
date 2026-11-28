/**
 * Canvas step A1: a dimensioned sketch of the WRC calculator's inputs (roadmap stage A).
 *
 * Two SVG views, drawn from the inputs alone:
 * - side view: the shell along its axis, its length between ends, the attachment at its station, a pad;
 * - end section: the shell wall and corrosion allowance, the attachment on top, a pad.
 * Everything is drawn to scale except the attachment's height, which is not an input. The sketch reads
 * the case and never changes it, so the WRC 537 results are not touched.
 *
 * Lengths are stored in mm and shown in the case's units (wrc-units.js).
 *
 * The dimension lines (extension lines, arrowheads, a label that reads upright) are adapted from
 * Pdf-Hub, MIT licence: github.com/reallakshman19/Pdf-Hub, frontend/src/components/annotations/
 * DimensionNode.tsx at commit 74fcb94.
 */
import { hasPad, isRectangular, isTrunnion } from './wrc-calc.js';
import { roundSig, unitSystem } from './wrc-units.js';

/** Colours: the app's dark theme on screen, black on white in the printed report. */
const PALETTES = Object.freeze({
  screen: Object.freeze({
    line: 'var(--ui-text-soft, #c9d6ea)', hidden: 'var(--ui-muted, #8ea2c0)', fill: 'var(--ui-control-line, #2b4a78)',
    att: 'var(--ui-accent, #4c8dff)', pad: 'var(--ui-warn, #c99a2e)', dim: 'var(--ui-warn-text, #e0b955)',
    text: 'var(--ui-text, #dbe5f4)', badge: 'var(--ui-panel, #07101f)',
  }),
  print: Object.freeze({
    line: '#222', hidden: '#777', fill: '#cfd8e6', att: '#2f5fb3', pad: '#b07d10', dim: '#9a1c1c', text: '#111', badge: '#fff',
  }),
});

const FONT = 11; // px
const LEVEL = 18; // px between stacked dimension lines
const ARROW = 7; // px, arrowhead length

const num = (v) => (v === '' || v === null || v === undefined ? NaN : Number(v));
const pos = (v) => Number.isFinite(v) && v > 0;
const r2 = (v) => Math.round(v * 100) / 100;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** The sketch's own reading of the inputs (mm). Values that are blank or invalid are NaN. */
export function sketchGeometry(input) {
  const rect = isRectangular(input);
  const OD = num(input.shellOutsideDiameter);
  const tn = num(input.shellThickness);
  const ca = num(input.corrosionAllowance ?? 0);
  const L = num(input.cylinderLength);
  const x = num(input.attachmentStation);
  const along = rect ? num(input.attachmentLength) : num(input.attachmentOutsideDiameter);
  const around = rect ? num(input.attachmentWidth) : along;
  const pad = hasPad(input);
  const padAlong = pad ? (rect ? num(input.padLength) : num(input.padOutsideDiameter)) : NaN;
  const padAround = pad ? (rect ? num(input.padWidth) : padAlong) : NaN;
  const padT = pad ? num(input.padThickness) : NaN;
  return {
    kind: rect ? 'RECTANGULAR' : isTrunnion(input) ? 'TRUNNION' : 'ROUND',
    solid: isTrunnion(input) && input.trunnionConstruction !== 'HOLLOW',
    OD, tn, ca: pos(ca) ? ca : 0, L, x, along, around,
    pad: pad && pos(padAlong) && pos(padAround) && pos(padT), padAlong, padAround, padT,
    shellOk: pos(OD) && pos(tn) && tn < OD / 2,
    attachmentOk: pos(along) && pos(around),
    lengthOk: pos(L),
    stationOk: pos(L) && Number.isFinite(x) && x >= 0,
  };
}

/**
 * Both views as HTML: a figure with two SVGs and a caption. `theme` 'screen' (the app) or 'print' (the
 * report). With no usable shell it returns a short message instead.
 */
export function buildVesselSketchHtml(input, { theme = 'screen' } = {}) {
  const g = sketchGeometry(input);
  const u = unitSystem(input);
  if (!g.shellOk) {
    return `<p class="vsketch__empty" data-role="vessel-sketch-empty">Enter the shell's outside diameter and thickness to see the sketch.</p>`;
  }
  const p = PALETTES[theme] ?? PALETTES.screen;
  // A drawing label, not a result: 6 significant figures in SI (what was typed), 4 in US (78.74 in).
  const fmt = (mm) => `${Number(roundSig(mm / u.mmPer, u.id === 'SI' ? 6 : 4))}`;
  const len = (mm) => `${fmt(mm)} ${u.length}`;
  const notes = [];
  if (!g.attachmentOk) notes.push(`Enter the ${g.kind === 'RECTANGULAR' ? "attachment's length and width" : "attachment's outside diameter"} to draw it.`);
  if (!g.lengthOk) notes.push('No cylinder length given: the shell ends are not drawn to scale.');
  else if (!g.stationOk) notes.push('No attachment position given: it is drawn at mid-length.');
  const ctx = { g, p, len, fmt };
  return `<figure class="vsketch" data-role="vessel-sketch">
  <div class="vsketch__views">${sideView(ctx)}${endView(ctx)}</div>
  <figcaption class="vsketch__caption">Sketch of the inputs, to scale except the attachment's height, which is not an input.${notes.length ? ` ${notes.map(esc).join(' ')}` : ''}</figcaption>
</figure>`;
}

/** One sentence that says what the sketch shows, for screen readers. */
function describe(ctx, view) {
  const { g, len } = ctx;
  const noun = { ROUND: 'nozzle', TRUNNION: 'trunnion', RECTANGULAR: 'rectangular attachment' }[g.kind];
  const size = !g.attachmentOk ? 'of no size yet'
    : g.kind === 'RECTANGULAR' ? `${len(g.along)} along by ${len(g.around)} around` : `of outside diameter ${len(g.along)}`;
  const where = g.stationOk ? `, ${len(g.x)} from one end of a ${len(g.L)} cylinder` : '';
  const pad = g.pad ? `, with a ${len(g.padT)} pad` : '';
  return `${view}: shell of outside diameter ${len(g.OD)} and thickness ${len(g.tn)}${g.ca ? ` (corrosion allowance ${len(g.ca)})` : ''}; ${noun} ${size}${where}${pad}.`;
}

/** The attachment's drawn height (not an input): enough to read, small next to the shell. */
function stubHeight(g) {
  if (!g.attachmentOk) return 0;
  const base = g.kind === 'RECTANGULAR' ? 0.5 * g.along : 0.6 * g.along;
  return Math.min(Math.max(base, 0.12 * g.OD), 0.45 * g.OD);
}

function sideView(ctx) {
  const { g, p, len } = ctx;
  const W = 520;
  const stub = stubHeight(g);
  const padT = g.pad ? g.padT : 0;
  const Ld = g.lengthOk ? g.L : Math.max(3 * g.OD, 2 * (g.pad ? g.padAlong : g.along || 0) + g.OD);
  const xAt = g.stationOk ? g.x : Ld / 2;
  const s = Math.min((W - 100) / Ld, 190 / (g.OD + stub + padT));
  const levels = (g.attachmentOk ? 1 : 0) + (g.pad ? 1 : 0) + (g.stationOk ? 1 : 0);
  const x0 = 24;
  const xEnd = x0 + Ld * s;
  const yTopAtt = 14 + levels * LEVEL + 6;
  const y0 = yTopAtt + (stub + padT) * s; // shell top
  const y1 = y0 + g.OD * s; // shell bottom
  const H = y1 + 42;
  const cx = x0 + xAt * s;
  const out = [];

  // Shell, the wall's inner lines hidden, and the ends (dashed when the length is not given).
  out.push(`<rect x="${r2(x0)}" y="${r2(y0)}" width="${r2(Ld * s)}" height="${r2(g.OD * s)}" fill="${p.fill}" fill-opacity="0.25" stroke="none"/>`);
  out.push(line(x0, y0, xEnd, y0, p.line, 1.4), line(x0, y1, xEnd, y1, p.line, 1.4));
  out.push(line(x0, y0 + g.tn * s, xEnd, y0 + g.tn * s, p.hidden, 1, '5 3'), line(x0, y1 - g.tn * s, xEnd, y1 - g.tn * s, p.hidden, 1, '5 3'));
  const endDash = g.lengthOk ? null : '3 3';
  out.push(line(x0, y0, x0, y1, p.line, g.lengthOk ? 2.2 : 1.2, endDash), line(xEnd, y0, xEnd, y1, p.line, g.lengthOk ? 2.2 : 1.2, endDash));
  // Centre line of the shell.
  out.push(line(x0 - 10, (y0 + y1) / 2, xEnd + 10, (y0 + y1) / 2, p.hidden, 0.8, '14 3 2 3'));

  let level = 0;
  const levelY = () => yTopAtt - 6 - (++level) * LEVEL + LEVEL / 2;
  if (g.attachmentOk) {
    const half = (g.along / 2) * s;
    const top = y0 - (padT + stub) * s;
    if (g.pad) {
      const hp = (g.padAlong / 2) * s;
      out.push(`<rect x="${r2(cx - hp)}" y="${r2(y0 - padT * s)}" width="${r2(2 * hp)}" height="${r2(Math.max(padT * s, 1.5))}" fill="${p.pad}" fill-opacity="0.55" stroke="${p.pad}" stroke-width="1"/>`);
    }
    out.push(`<rect x="${r2(cx - half)}" y="${r2(top)}" width="${r2(2 * half)}" height="${r2(stub * s)}" fill="${p.att}" fill-opacity="${g.solid ? 0.6 : 0.25}" stroke="${p.att}" stroke-width="1.4"/>`);
    out.push(line(cx, top - 4, cx, y1 + 6, p.hidden, 0.8, '14 3 2 3'));
    const yA = levelY();
    out.push(dimension(cx - half, yA, cx + half, yA, g.kind === 'RECTANGULAR' ? len(g.along) : `Ø${len(g.along)}`, p, { from: top }));
    if (g.pad) {
      const hp = (g.padAlong / 2) * s;
      const yP = levelY();
      out.push(dimension(cx - hp, yP, cx + hp, yP, `pad ${g.kind === 'RECTANGULAR' ? '' : 'Ø'}${len(g.padAlong)}`, p, { from: y0 - padT * s }));
    }
  }
  if (g.stationOk) {
    const yS = levelY();
    out.push(dimension(x0, yS, cx, yS, len(g.x), p, { from: y0, fromEnd: g.attachmentOk ? y0 - (padT + stub) * s : y0 }));
  }
  if (g.lengthOk) out.push(dimension(x0, y1 + 24, xEnd, y1 + 24, len(g.L), p, { from: y1 }));
  out.push(dimension(xEnd + 30, y0, xEnd + 30, y1, `Ø${len(g.OD)}`, p, { fromX: xEnd }));
  return svg('Side view', W, H, out, describe(ctx, 'Side view'), 'side');
}

function endView(ctx) {
  const { g, p, len } = ctx;
  const W = 320;
  const stub = stubHeight(g);
  const padT = g.pad ? g.padT : 0;
  const s = Math.min((W - 120) / g.OD, 220 / (g.OD + stub + padT));
  const levels = (g.attachmentOk ? 1 : 0) + (g.pad ? 1 : 0);
  const R = (g.OD / 2) * s;
  const Ri = (g.OD / 2 - g.tn) * s;
  const cx = 20 + R; // room on the right for the thickness labels
  const top = 14 + levels * LEVEL + 6;
  const cy = top + (stub + padT) * s + R;
  const H = cy + R + 44;
  const out = [];

  out.push(`<path d="${circlePath(cx, cy, R)} ${circlePath(cx, cy, Ri)}" fill="${p.fill}" fill-opacity="0.55" fill-rule="evenodd" stroke="${p.line}" stroke-width="1.4"/>`);
  if (g.ca > 0) {
    out.push(`<circle cx="${r2(cx)}" cy="${r2(cy)}" r="${r2((g.OD / 2 - g.tn + g.ca) * s)}" fill="none" stroke="${p.hidden}" stroke-width="1" stroke-dasharray="4 3"/>`);
  }
  out.push(line(cx - R - 10, cy, cx + R + 10, cy, p.hidden, 0.8, '14 3 2 3'), line(cx, cy - R - (stub + padT) * s - 4, cx, cy + R + 10, p.hidden, 0.8, '14 3 2 3'));

  let level = 0;
  const levelY = () => top - 6 - (++level) * LEVEL + LEVEL / 2;
  if (g.attachmentOk) {
    const Rp = R + padT * s;
    if (g.pad) out.push(`<path d="${padBand(cx, cy, R, Rp, (g.padAround / 2) / (g.OD / 2))}" fill="${p.pad}" fill-opacity="0.55" stroke="${p.pad}" stroke-width="1"/>`);
    const hw = Math.min((g.around / 2) * s, Rp);
    const yTop = cy - Rp - stub * s;
    const yEdge = cy - Math.sqrt(Math.max(0, Rp * Rp - hw * hw));
    out.push(`<path d="M ${r2(cx - hw)} ${r2(yTop)} L ${r2(cx - hw)} ${r2(yEdge)} A ${r2(Rp)} ${r2(Rp)} 0 0 1 ${r2(cx + hw)} ${r2(yEdge)} L ${r2(cx + hw)} ${r2(yTop)} Z" fill="${p.att}" fill-opacity="${g.solid ? 0.6 : 0.25}" stroke="${p.att}" stroke-width="1.4"/>`);
    const yA = levelY();
    out.push(dimension(cx - hw, yA, cx + hw, yA, g.kind === 'RECTANGULAR' ? len(g.around) : `Ø${len(g.around)}`, p, { from: yTop }));
    if (g.pad) {
      const half = (g.padAround / 2) / (g.OD / 2);
      const hx = Rp * Math.sin(Math.min(half, Math.PI / 2));
      const yP = levelY();
      out.push(dimension(cx - hx, yP, cx + hx, yP, `pad ${len(g.padAround)} around`, p, { from: cy - Rp * Math.cos(Math.min(half, Math.PI / 2)) }));
    }
  }
  out.push(dimension(cx - R, cy + R + 24, cx + R, cy + R + 24, `Ø${len(g.OD)}`, p, { from: cy }));
  const tx = cx + R + 8;
  out.push(text(tx, cy - 4, `t ${len(g.tn)}`, p, 'start'));
  if (g.ca > 0) out.push(text(tx, cy + FONT + 2, `CA ${len(g.ca)}`, p, 'start'));
  return svg('End section', W, H, out, describe(ctx, 'End section'), 'end');
}

function svg(title, W, H, body, label, view) {
  return `<svg class="vsketch__view" data-view="${view}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${r2(H)}" width="${W}" height="${r2(H)}" role="img" aria-label="${esc(label)}">
  <title>${esc(title)}</title>
  ${body.join('\n  ')}
  <text x="4" y="${r2(H - 4)}" font-size="${FONT}" fill="currentColor" opacity="0.7">${esc(title)}</text>
</svg>`;
}

function line(x1, y1, x2, y2, stroke, width = 1, dash = null) {
  return `<line x1="${r2(x1)}" y1="${r2(y1)}" x2="${r2(x2)}" y2="${r2(y2)}" stroke="${stroke}" stroke-width="${width}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;
}

function text(x, y, s, p, anchor = 'middle') {
  return `<text x="${r2(x)}" y="${r2(y)}" font-size="${FONT}" fill="${p.text}" text-anchor="${anchor}">${esc(s)}</text>`;
}

function circlePath(cx, cy, r) {
  return `M ${r2(cx - r)} ${r2(cy)} A ${r2(r)} ${r2(r)} 0 1 0 ${r2(cx + r)} ${r2(cy)} A ${r2(r)} ${r2(r)} 0 1 0 ${r2(cx - r)} ${r2(cy)} Z`;
}

/** A pad on the outside of the shell in the end section: half-angle `half` (radians) about the top. */
function padBand(cx, cy, Ri, Ro, half) {
  const a = Math.min(half, Math.PI - 1e-6);
  const large = 2 * a > Math.PI ? 1 : 0;
  const pt = (r, sign) => `${r2(cx + sign * r * Math.sin(a))} ${r2(cy - r * Math.cos(a))}`;
  return `M ${pt(Ri, -1)} A ${r2(Ri)} ${r2(Ri)} 0 ${large} 1 ${pt(Ri, 1)} L ${pt(Ro, 1)} A ${r2(Ro)} ${r2(Ro)} 0 ${large} 0 ${pt(Ro, -1)} Z`;
}

/**
 * A dimension from (x1, y1) to (x2, y2), horizontal or vertical: extension lines back to the part
 * (`from` is the y they start at for a horizontal one, `fromX` the x for a vertical one; `fromEnd`
 * overrides `from` at the second point), arrowheads at both ends and the label in a badge at the middle,
 * upright. Adapted from Pdf-Hub's DimensionNode (see the file header).
 */
function dimension(x1, y1, x2, y2, label, p, { from, fromEnd, fromX } = {}) {
  const parts = [];
  const vertical = Math.abs(x2 - x1) < 1e-9;
  if (vertical && fromX !== undefined) {
    parts.push(line(fromX + 3, y1, x1 + 4, y1, p.dim, 0.8), line(fromX + 3, y2, x2 + 4, y2, p.dim, 0.8));
  } else if (from !== undefined) {
    const sign = Math.sign(y1 - from) || -1;
    parts.push(line(x1, from + sign * 3, x1, y1 + sign * 4, p.dim, 0.8), line(x2, (fromEnd ?? from) + sign * 3, x2, y2 + sign * 4, p.dim, 0.8));
  }
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const length = Math.hypot(x2 - x1, y2 - y1);
  parts.push(line(x1, y1, x2, y2, p.dim, 1));
  if (length > 2 * ARROW + 2) {
    const head = (x, y, dir) => {
      const a = angle + (dir > 0 ? 0 : Math.PI);
      return `<polygon points="${r2(x)},${r2(y)} ${r2(x + Math.cos(a + 0.45) * ARROW)},${r2(y + Math.sin(a + 0.45) * ARROW)} ${r2(x + Math.cos(a - 0.45) * ARROW)},${r2(y + Math.sin(a - 0.45) * ARROW)}" fill="${p.dim}"/>`;
    };
    parts.push(head(x1, y1, 1), head(x2, y2, -1));
  }
  // The label reads left to right, or bottom to top on a vertical dimension. When it is wider than a
  // horizontal dimension, it sits just past the right-hand end instead of over the arrows.
  let deg = (angle * 180) / Math.PI;
  if (deg > 90 || deg <= -90) deg += 180;
  if (vertical) deg = -90;
  const w = label.length * FONT * 0.58 + 8;
  const outside = !vertical && w > length - 4;
  const mx = outside ? Math.max(x1, x2) + w / 2 + 4 : (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  parts.push(`<g transform="translate(${r2(mx)} ${r2(my)}) rotate(${r2(deg)})" data-dim="${esc(label)}">
    <rect x="${r2(-w / 2)}" y="${-(FONT / 2 + 3)}" width="${r2(w)}" height="${FONT + 6}" rx="3" fill="${p.badge}" stroke="${p.dim}" stroke-width="0.8"/>
    <text x="0" y="${r2(FONT / 2 - 1.5)}" font-size="${FONT}" fill="${p.dim}" text-anchor="middle">${esc(label)}</text></g>`);
  return parts.join('');
}
