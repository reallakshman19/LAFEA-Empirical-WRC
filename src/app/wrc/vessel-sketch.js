/**
 * Canvas steps A1 and A2: a dimensioned sketch of the vessel (roadmap stage A, empirical track).
 *
 * Two SVG views, drawn from the inputs alone:
 * - side view: the shell along its axis, its length between ends, every attachment at its station, pads;
 * - end section: the shell wall and corrosion allowance, every attachment at its angle around, pads.
 * The selected attachment is drawn in the accent colour with its dimensions; the others are drawn muted
 * with their names. Everything is to scale except the attachments' height, which is not an input. The
 * sketch reads the cases and never changes them, so the WRC 537 results are not touched.
 *
 * Angles: degrees clockwise from the top, looking from the end the stations are measured from. The end
 * section is drawn as seen from that end; the side view is seen from the 90° side, so an attachment at 90°
 * faces you and one at 270° is behind the shell (dashed).
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
const DEG = Math.PI / 180;

const num = (v) => (v === '' || v === null || v === undefined ? NaN : Number(v));
const pos = (v) => Number.isFinite(v) && v > 0;
const r2 = (v) => Math.round(v * 100) / 100;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const angleOf = (v) => {
  const a = num(v);
  return Number.isFinite(a) ? ((a % 360) + 360) % 360 : 0;
};

/** The sketch's own reading of a case (mm, degrees). Values that are blank or invalid are NaN. */
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
    name: String(input.attachmentName ?? '').trim(),
    angle: angleOf(input.attachmentAngle),
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
 * Both views as HTML: a figure with two SVGs and a caption. `input` is the selected attachment's case;
 * `others` the other attachments' cases on the same shell. `theme` 'screen' (the app) or 'print' (the
 * report). With no usable shell it returns a short message instead.
 */
export function buildVesselSketchHtml(input, { theme = 'screen', others = [] } = {}) {
  const g = sketchGeometry(input);
  const u = unitSystem(input);
  if (!g.shellOk) {
    return `<p class="vsketch__empty" data-role="vessel-sketch-empty">Enter the shell's outside diameter and thickness to see the sketch.</p>`;
  }
  const p = PALETTES[theme] ?? PALETTES.screen;
  // A drawing label, not a result: 6 significant figures in SI (what was typed), 4 in US (78.74 in).
  const fmt = (mm) => `${Number(roundSig(mm / u.mmPer, u.id === 'SI' ? 6 : 4))}`;
  const len = (mm) => `${fmt(mm)} ${u.length}`;
  const rest = others.map(sketchGeometry).filter((o) => o.attachmentOk);
  const notes = [];
  if (!g.attachmentOk) notes.push(`Enter the ${g.kind === 'RECTANGULAR' ? "attachment's length and width" : "attachment's outside diameter"} to draw it.`);
  if (!g.lengthOk) notes.push('No cylinder length given: the shell ends are not drawn to scale.');
  else if (!g.stationOk) notes.push('No attachment position given: it is drawn at mid-length.');
  const ctx = { g, rest, count: 1 + others.length, p, len, fmt };
  return `<figure class="vsketch" data-role="vessel-sketch">
  <div class="vsketch__views">${sideView(ctx)}${endView(ctx)}</div>
  <figcaption class="vsketch__caption">Sketch of the inputs, to scale except the ${ctx.count > 1 ? 'attachments\' height, which is' : 'attachment\'s height, which is'} not an input.${ctx.count > 1 ? ` The selected attachment${g.name ? `, ${esc(g.name)},` : ''} is highlighted and dimensioned.` : ''}${notes.length ? ` ${notes.map(esc).join(' ')}` : ''}</figcaption>
</figure>`;
}

/** One sentence that says what the sketch shows, for screen readers. */
function describe(ctx, view) {
  const { g, len, count } = ctx;
  const noun = { ROUND: 'nozzle', TRUNNION: 'trunnion', RECTANGULAR: 'rectangular attachment' }[g.kind];
  const size = !g.attachmentOk ? 'of no size yet'
    : g.kind === 'RECTANGULAR' ? `${len(g.along)} along by ${len(g.around)} around` : `of outside diameter ${len(g.along)}`;
  const where = g.stationOk ? `, ${len(g.x)} from one end of a ${len(g.L)} cylinder` : '';
  const angle = g.angle ? `, ${Number(roundSig(g.angle, 6))}° around` : '';
  const pad = g.pad ? `, with a ${len(g.padT)} pad` : '';
  const many = count > 1 ? ` ${count} attachments on this shell; selected${g.name ? ` ${g.name}` : ''}:` : '';
  return `${view}: shell of outside diameter ${len(g.OD)} and thickness ${len(g.tn)}${g.ca ? ` (corrosion allowance ${len(g.ca)})` : ''};${many} ${noun} ${size}${where}${angle}${pad}.`;
}

/** An attachment's drawn height (not an input): enough to read, small next to the shell. */
function stubHeight(g, OD) {
  if (!g.attachmentOk) return 0;
  const base = g.kind === 'RECTANGULAR' ? 0.5 * g.along : 0.6 * g.along;
  return Math.min(Math.max(base, 0.12 * OD), 0.45 * OD);
}
/** Where an attachment shows in the side view: sticking up, down, or as a footprint on the face. */
function sideFacing(angle) {
  const c = Math.cos(angle * DEG);
  if (c >= 0.7) return 'up';
  if (c <= -0.7) return 'down';
  return Math.sin(angle * DEG) > 0 ? 'front' : 'back';
}

function sideView(ctx) {
  const { g, rest, p, len } = ctx;
  const W = 520;
  const OD = g.OD;
  const all = [g, ...rest].filter((a) => a.attachmentOk);
  const height = (a) => stubHeight(a, OD) + (a.pad ? a.padT : 0);
  const topExtra = Math.max(0, ...all.filter((a) => sideFacing(a.angle) === 'up').map(height));
  const bottomExtra = Math.max(0, ...all.filter((a) => sideFacing(a.angle) === 'down').map(height));
  const reach = Math.max(0, ...all.map((a) => (a.stationOk ? a.x : 0) + (a.pad ? a.padAlong : a.along) / 2));
  const Ld = g.lengthOk ? g.L : Math.max(3 * OD, 2 * (g.pad ? g.padAlong : g.along || 0) + OD, reach);
  const s = Math.min((W - 100) / Ld, 190 / (OD + topExtra + bottomExtra));
  const levels = (g.attachmentOk ? 1 : 0) + (g.pad && g.attachmentOk ? 1 : 0) + (g.stationOk ? 1 : 0);
  const x0 = 24;
  const xEnd = x0 + Ld * s;
  const yDims = 14 + levels * LEVEL + 6; // below the stacked dimensions
  const y0 = yDims + topExtra * s; // shell top
  const y1 = y0 + OD * s; // shell bottom
  const yL = y1 + bottomExtra * s + 24;
  const H = yL + 18;
  const yc = (y0 + y1) / 2;
  const stationOf = (a) => (a.stationOk ? a.x : Ld / 2);
  const out = [];

  // Shell, the wall's inner lines hidden, and the ends (dashed when the length is not given).
  out.push(`<rect x="${r2(x0)}" y="${r2(y0)}" width="${r2(Ld * s)}" height="${r2(OD * s)}" fill="${p.fill}" fill-opacity="0.25" stroke="none"/>`);
  out.push(line(x0, y0, xEnd, y0, p.line, 1.4), line(x0, y1, xEnd, y1, p.line, 1.4));
  out.push(line(x0, y0 + g.tn * s, xEnd, y0 + g.tn * s, p.hidden, 1, '5 3'), line(x0, y1 - g.tn * s, xEnd, y1 - g.tn * s, p.hidden, 1, '5 3'));
  const endDash = g.lengthOk ? null : '3 3';
  out.push(line(x0, y0, x0, y1, p.line, g.lengthOk ? 2.2 : 1.2, endDash), line(xEnd, y0, xEnd, y1, p.line, g.lengthOk ? 2.2 : 1.2, endDash));
  out.push(line(x0 - 10, yc, xEnd + 10, yc, p.hidden, 0.8, '14 3 2 3'));

  /** One attachment in the side view; returns the y its dimensions' extension lines start from. */
  const drawAttachment = (a, selected) => {
    const cx = x0 + stationOf(a) * s;
    const half = (a.along / 2) * s;
    const stub = stubHeight(a, OD);
    const padT = a.pad ? a.padT : 0;
    const colour = selected ? p.att : p.hidden;
    const attr = `stroke="${colour}" stroke-width="${selected ? 1.4 : 1}"`;
    const fillAttr = `fill="${colour}" fill-opacity="${a.solid ? 0.6 : (selected ? 0.25 : 0.15)}"`;
    const facing = sideFacing(a.angle);
    const label = (x, y, anchor) => (a.name ? `<text x="${r2(x)}" y="${r2(y)}" font-size="10" fill="${selected ? p.att : p.hidden}" text-anchor="${anchor}" data-name="${esc(a.name)}">${esc(a.name)}</text>` : '');
    if (facing === 'up' || facing === 'down') {
      const dir = facing === 'up' ? -1 : 1;
      const base = facing === 'up' ? y0 : y1;
      if (a.pad) {
        const hp = (a.padAlong / 2) * s;
        const yPad = facing === 'up' ? base - padT * s : base;
        out.push(`<rect x="${r2(cx - hp)}" y="${r2(yPad)}" width="${r2(2 * hp)}" height="${r2(Math.max(padT * s, 1.5))}" fill="${p.pad}" fill-opacity="${selected ? 0.55 : 0.3}" stroke="${p.pad}" stroke-width="1"/>`);
      }
      const yNear = base + dir * padT * s;
      const yFar = yNear + dir * stub * s;
      out.push(`<rect x="${r2(cx - half)}" y="${r2(Math.min(yNear, yFar))}" width="${r2(2 * half)}" height="${r2(stub * s)}" ${fillAttr} ${attr}/>`);
      if (selected) out.push(line(cx, Math.min(yFar, y0) - 4, cx, Math.max(yFar, y1) + 6, p.hidden, 0.8, '14 3 2 3'));
      out.push(label(cx + half + 3, facing === 'up' ? yFar + 10 : yFar - 3, 'start'));
      return facing === 'up' ? yFar : y0;
    }
    // On the face: the footprint, foreshortened around the shell; behind the shell it is dashed.
    const sn = Math.abs(Math.sin(a.angle * DEG));
    const yAt = yc - (OD / 2) * Math.cos(a.angle * DEG) * s;
    const dash = facing === 'back' ? ' stroke-dasharray="4 3"' : '';
    const shape = (along, around, fill) => {
      const rx = (along / 2) * s;
      const ry = Math.max((around / 2) * sn * s, 1.5);
      return a.kind === 'RECTANGULAR'
        ? `<rect x="${r2(cx - rx)}" y="${r2(yAt - ry)}" width="${r2(2 * rx)}" height="${r2(2 * ry)}" ${fill}${dash}/>`
        : `<ellipse cx="${r2(cx)}" cy="${r2(yAt)}" rx="${r2(rx)}" ry="${r2(ry)}" ${fill}${dash}/>`;
    };
    if (a.pad) out.push(shape(a.padAlong, a.padAround, `fill="${p.pad}" fill-opacity="${facing === 'back' ? 0 : 0.3}" stroke="${p.pad}" stroke-width="1"`));
    out.push(shape(a.along, a.around, `${facing === 'back' ? 'fill="none"' : fillAttr} ${attr}`));
    out.push(label(cx, yAt + 4, 'middle'));
    return y0;
  };
  for (const a of rest) drawAttachment(a, false);
  let level = 0;
  const levelY = () => yDims - 6 - (++level) * LEVEL + LEVEL / 2;
  if (g.attachmentOk) {
    const from = drawAttachment(g, true);
    const cx = x0 + stationOf(g) * s;
    const half = (g.along / 2) * s;
    const yA = levelY();
    out.push(dimension(cx - half, yA, cx + half, yA, g.kind === 'RECTANGULAR' ? len(g.along) : `Ø${len(g.along)}`, p, { from }));
    if (g.pad) {
      const hp = (g.padAlong / 2) * s;
      const yP = levelY();
      out.push(dimension(cx - hp, yP, cx + hp, yP, `pad ${g.kind === 'RECTANGULAR' ? '' : 'Ø'}${len(g.padAlong)}`, p, { from: sideFacing(g.angle) === 'up' ? y0 - g.padT * s : y0 }));
    }
    if (g.stationOk) {
      const yS = levelY();
      out.push(dimension(x0, yS, cx, yS, len(g.x), p, { from: y0, fromEnd: from }));
    }
  } else if (g.stationOk) {
    const yS = levelY();
    out.push(dimension(x0, yS, x0 + g.x * s, yS, len(g.x), p, { from: y0 }));
  }
  if (g.lengthOk) out.push(dimension(x0, yL, xEnd, yL, len(g.L), p, { from: y1 + bottomExtra * s }));
  out.push(dimension(xEnd + 30, y0, xEnd + 30, y1, `Ø${len(OD)}`, p, { fromX: xEnd }));
  return svg('Side view', W, H, out, describe(ctx, 'Side view'), 'side');
}

function endView(ctx) {
  const { g, rest, p, len } = ctx;
  const W = 320;
  const OD = g.OD;
  const all = [g, ...rest].filter((a) => a.attachmentOk);
  const ext = Math.max(0, ...all.map((a) => stubHeight(a, OD) + (a.pad ? a.padT : 0)));
  const Rtot = OD / 2 + ext;
  const s = Math.min((W - 120) / (2 * Rtot), 240 / (2 * Rtot));
  const dimsOnTop = g.attachmentOk && g.angle === 0;
  const levels = dimsOnTop ? 1 + (g.pad ? 1 : 0) : 0;
  const R = (OD / 2) * s;
  const Ri = (OD / 2 - g.tn) * s;
  const cx = 20 + Rtot * s; // room on the right for the thickness labels
  const top = 14 + levels * LEVEL + 6;
  const cy = top + Rtot * s;
  const yOD = cy + Rtot * s + 20;
  const H = yOD + 24;
  const out = [];

  out.push(`<path d="${circlePath(cx, cy, R)} ${circlePath(cx, cy, Ri)}" fill="${p.fill}" fill-opacity="0.55" fill-rule="evenodd" stroke="${p.line}" stroke-width="1.4"/>`);
  if (g.ca > 0) {
    out.push(`<circle cx="${r2(cx)}" cy="${r2(cy)}" r="${r2((OD / 2 - g.tn + g.ca) * s)}" fill="none" stroke="${p.hidden}" stroke-width="1" stroke-dasharray="4 3"/>`);
  }
  out.push(line(cx - Rtot * s - 6, cy, cx + Rtot * s + 6, cy, p.hidden, 0.8, '14 3 2 3'), line(cx, cy - Rtot * s - 6, cx, cy + Rtot * s + 6, p.hidden, 0.8, '14 3 2 3'));

  /** One attachment, drawn on top of the shell and turned to its angle. */
  const drawAttachment = (a, selected) => {
    const padT = a.pad ? a.padT : 0;
    const Rp = R + padT * s;
    const colour = selected ? p.att : p.hidden;
    const parts = [];
    if (a.pad) parts.push(`<path d="${padBand(cx, cy, R, Rp, (a.padAround / 2) / (OD / 2))}" fill="${p.pad}" fill-opacity="${selected ? 0.55 : 0.3}" stroke="${p.pad}" stroke-width="1"/>`);
    const hw = Math.min((a.around / 2) * s, Rp);
    const yTop = cy - Rp - stubHeight(a, OD) * s;
    const yEdge = cy - Math.sqrt(Math.max(0, Rp * Rp - hw * hw));
    parts.push(`<path d="M ${r2(cx - hw)} ${r2(yTop)} L ${r2(cx - hw)} ${r2(yEdge)} A ${r2(Rp)} ${r2(Rp)} 0 0 1 ${r2(cx + hw)} ${r2(yEdge)} L ${r2(cx + hw)} ${r2(yTop)} Z" fill="${colour}" fill-opacity="${a.solid ? 0.6 : (selected ? 0.25 : 0.15)}" stroke="${colour}" stroke-width="${selected ? 1.4 : 1}"/>`);
    out.push(a.angle ? `<g transform="rotate(${r2(a.angle)} ${r2(cx)} ${r2(cy)})">${parts.join('')}</g>` : parts.join(''));
    if (a.name) {
      const rl = cy - yTop + 9;
      out.push(`<text x="${r2(cx + rl * Math.sin(a.angle * DEG))}" y="${r2(cy - rl * Math.cos(a.angle * DEG) + 4)}" font-size="10" fill="${colour}" text-anchor="middle" data-name="${esc(a.name)}">${esc(a.name)}</text>`);
    }
    return yTop;
  };
  for (const a of rest) drawAttachment(a, false);
  if (g.attachmentOk) {
    const yTop = drawAttachment(g, true);
    if (dimsOnTop) {
      const Rp = R + (g.pad ? g.padT : 0) * s;
      const hw = Math.min((g.around / 2) * s, Rp);
      let level = 0;
      const levelY = () => top - 6 - (++level) * LEVEL + LEVEL / 2;
      const yA = levelY();
      out.push(dimension(cx - hw, yA, cx + hw, yA, g.kind === 'RECTANGULAR' ? len(g.around) : `Ø${len(g.around)}`, p, { from: yTop }));
      if (g.pad) {
        const half = (g.padAround / 2) / (OD / 2);
        const hx = Rp * Math.sin(Math.min(half, Math.PI / 2));
        const yP = levelY();
        out.push(dimension(cx - hx, yP, cx + hx, yP, `pad ${len(g.padAround)} around`, p, { from: cy - Rp * Math.cos(Math.min(half, Math.PI / 2)) }));
      }
    } else {
      out.push(angleDimension(cx, cy, R * 0.55, g.angle, p));
    }
  }
  out.push(dimension(cx - R, yOD, cx + R, yOD, `Ø${len(OD)}`, p, { from: cy }));
  const k = Math.SQRT1_2;
  const tx = cx + R * k + 6;
  const ty = cy + R * k + 10;
  out.push(text(tx, ty, `t ${len(g.tn)}`, p, 'start'));
  if (g.ca > 0) out.push(text(tx, ty + FONT + 2, `CA ${len(g.ca)}`, p, 'start'));
  return svg('End section', W, H, out, describe(ctx, 'End section'), 'end');
}

/** The angle from the top to the selected attachment, as an arc with its value. */
function angleDimension(cx, cy, r, angle, p) {
  const a = angle * DEG;
  const large = angle > 180 ? 1 : 0;
  const x = cx + r * Math.sin(a);
  const y = cy - r * Math.cos(a);
  const mid = a / 2;
  const label = `${Number(roundSig(angle, 6))}°`;
  return `<path d="M ${r2(cx)} ${r2(cy - r)} A ${r2(r)} ${r2(r)} 0 ${large} 1 ${r2(x)} ${r2(y)}" fill="none" stroke="${p.dim}" stroke-width="1"/>
    <g data-dim="${esc(label)}"><text x="${r2(cx + (r - 12) * Math.sin(mid))}" y="${r2(cy - (r - 12) * Math.cos(mid) + 4)}" font-size="${FONT}" fill="${p.dim}" text-anchor="middle">${esc(label)}</text></g>`;
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
