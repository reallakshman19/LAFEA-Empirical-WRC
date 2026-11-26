/**
 * FE stress-intensity contour around the attachment, as self-contained SVG markup (pure: no DOM).
 * Used by the WRC panel (with a hover readout added there) and by the printable report.
 *
 * Input: the `field` from crossCheckWrc537: { attachmentRadius, halfSize, triangles: [{ v: [s1,x1,s2,x2,s3,x3], u, l }] }
 * in unrolled shell coordinates (s around, x along the axis from the attachment centre), mm, MPa.
 * Output: a figure with one plot per surface (outside u, inside l) on a shared, binned scale.
 *
 * Colour: one sequential blue ramp, light = low, dark = high (8 bands). The figure has its own light
 * surface so the same markup reads correctly in the dark app and in the printed report.
 */
const RAMP = ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#2a78d6', '#1c5cab', '#184f95', '#0d366b'];
const SURFACE = '#fcfcfb';
const TEXT = '#0b0b0b';
const TEXT_2 = '#52514e';
const NEUTRAL = '#c9c8c2';
const PLOT_PX = 230; // drawn size of each plot square
const SURFACES = [
  { key: 'u', title: 'Outside surface (u)' },
  { key: 'l', title: 'Inside surface (l)' },
];

/** Method note shown under the FE comparison in the panel and the report. */
export const FE_METHOD_NOTE = 'FE: CST/DKT thin-shell triangles, with the attachment modelled as a near-rigid plug and stresses extrapolated to the attachment edge. '
  + 'On the CAESAR II check case, FE / WRC (maximum stress intensity, one load at a time) is P 1.28, Vc 1.27, Vl 0.37, Mc 1.40, Ml 0.95 and Mt 1.16. '
  + 'WRC 537 treats Vc and Vl as pure shear. FE also finds bearing stress on the loaded side, and for Vc, shell bending at C and D, so for those two loads FE and WRC differ in kind, not only in size. '
  + 'Treat a large FE / WRC ratio as a reason to look closer, not as a pass or fail.';

/** Caption under the contour plots. */
export const FE_CONTOUR_CAPTION = 'Element-average stress intensity in the shell around the attachment, unrolled flat: s around the shell, x along its axis, both from the attachment centre. '
  + 'A and B are on the longitudinal axis, C and D on the circumferential axis. The 8-point table uses values extrapolated to the attachment edge, so it can be a little higher than the nearest element.';

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));
const num = (value) => (Math.round(value * 10) / 10).toString();

/** Band edges from 0 to a rounded-up maximum over both surfaces. */
export function contourScale(field) {
  const max = Math.max(...field.triangles.map((t) => Math.max(t.u, t.l)), 1e-9);
  const raw = max / RAMP.length;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  // Smallest "nice" step that covers the maximum, so the 8 bands are all used.
  const step = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].map((m) => m * magnitude).find((s) => s >= raw);
  return { step, max, edges: RAMP.map((_, i) => i * step), top: step * RAMP.length };
}

export function bandIndex(value, scale) {
  return Math.max(0, Math.min(RAMP.length - 1, Math.floor(value / scale.step)));
}

/** Peak element value and where it is, for one surface. */
export function contourPeak(field, key) {
  let best = field.triangles[0];
  for (const t of field.triangles) if (t[key] > best[key]) best = t;
  const s = (best.v[0] + best.v[2] + best.v[4]) / 3;
  const x = (best.v[1] + best.v[3] + best.v[5]) / 3;
  return { value: best[key], s, x };
}

function plotSvg(field, surface, scale, unitsLabel) {
  const a = field.halfSize;
  const r0 = field.attachmentRadius;
  const k = (2 * a) / PLOT_PX; // mm per px
  const pad = { left: 46 * k, right: 10 * k, top: 8 * k, bottom: 30 * k };
  const vb = [-a - pad.left, -a - pad.top, 2 * a + pad.left + pad.right, 2 * a + pad.top + pad.bottom];
  const paths = RAMP.map(() => []);
  for (const t of field.triangles) {
    const [s1, x1, s2, x2, s3, x3] = t.v;
    // SVG y points down, so draw −x: B (+x) is at the top, A (−x) at the bottom.
    paths[bandIndex(t[surface.key], scale)].push(`M${num(s1)} ${num(-x1)}L${num(s2)} ${num(-x2)}L${num(s3)} ${num(-x3)}Z`);
  }
  const bands = paths.map((d, i) => (d.length
    ? `<path d="${d.join('')}" fill="${RAMP[i]}" stroke="${RAMP[i]}" stroke-width="${num(0.6 * k)}" stroke-linejoin="round"/>`
    : '')).join('');
  const font = `font-family="system-ui,-apple-system,'Segoe UI',sans-serif"`;
  const fs = 10 * k;
  const dot = 4 * k; // 8 px marker
  const points = [
    { label: 'A', s: 0, x: -r0, dx: 0, dy: 1 },
    { label: 'B', s: 0, x: r0, dx: 0, dy: -1 },
    { label: 'C', s: -r0, x: 0, dx: -1, dy: 0 },
    { label: 'D', s: r0, x: 0, dx: 1, dy: 0 },
  ].map((p) => {
    const cx = p.s;
    const cy = -p.x;
    const tx = cx + p.dx * 11 * k;
    const ty = cy + p.dy * 11 * k + 3.5 * k;
    return `<circle cx="${num(cx)}" cy="${num(cy)}" r="${num(dot)}" fill="${SURFACE}" stroke="${TEXT}" stroke-width="${num(1.5 * k)}"/>`
      + `<text x="${num(tx)}" y="${num(ty)}" font-size="${num(fs)}" font-weight="600" text-anchor="middle" fill="${TEXT}" ${font} paint-order="stroke" stroke="${SURFACE}" stroke-width="${num(3 * k)}">${p.label}</text>`;
  }).join('');
  const peak = contourPeak(field, surface.key);
  const ticks = [-a, 0, a].map((v) => `
    <text x="${num(v)}" y="${num(a + 13 * k)}" font-size="${num(fs)}" text-anchor="middle" fill="${TEXT_2}" ${font}>${Math.round(v)}</text>
    <text x="${num(-a - 5 * k)}" y="${num(-v + 3.5 * k)}" font-size="${num(fs)}" text-anchor="end" fill="${TEXT_2}" ${font}>${Math.round(v)}</text>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" class="fe-contour__plot" data-surface="${surface.key}" viewBox="${vb.map(num).join(' ')}" width="${Math.round(vb[2] / k)}" height="${Math.round(vb[3] / k)}" role="img"
    aria-label="${esc(`${surface.title}: FE stress intensity around the attachment. Peak element value ${peak.value.toFixed(2)} ${unitsLabel} at s = ${Math.round(peak.s)} mm, x = ${Math.round(peak.x)} mm.`)}">
    <rect x="${num(-a)}" y="${num(-a)}" width="${num(2 * a)}" height="${num(2 * a)}" fill="${SURFACE}"/>
    <g>${bands}</g>
    <circle cx="0" cy="0" r="${num(r0)}" fill="${NEUTRAL}" stroke="${SURFACE}" stroke-width="${num(1.5 * k)}"/>
    <text x="0" y="${num(3.5 * k)}" font-size="${num(fs)}" text-anchor="middle" fill="${TEXT_2}" ${font}>attachment</text>
    ${points}
    <rect x="${num(-a)}" y="${num(-a)}" width="${num(2 * a)}" height="${num(2 * a)}" fill="none" stroke="${TEXT_2}" stroke-width="${num(0.75 * k)}"/>
    ${ticks}
    <text x="0" y="${num(a + 26 * k)}" font-size="${num(fs)}" text-anchor="middle" fill="${TEXT_2}" ${font}>s, around the shell (mm) →</text>
    <text transform="translate(${num(-a - 36 * k)} 0) rotate(-90)" font-size="${num(fs)}" text-anchor="middle" fill="${TEXT_2}" ${font}>x, along the axis (mm) →</text>
  </svg>`;
}

/** The ring element under (s, x), or null: for the panel's hover readout. */
export function triangleAt(field, s, x) {
  for (const t of field.triangles) {
    const [s1, x1, s2, x2, s3, x3] = t.v;
    const d = (x2 - x3) * (s1 - s3) + (s3 - s2) * (x1 - x3);
    if (Math.abs(d) < 1e-12) continue;
    const b1 = ((x2 - x3) * (s - s3) + (s3 - s2) * (x - x3)) / d;
    const b2 = ((x3 - x1) * (s - s3) + (s1 - s3) * (x - x3)) / d;
    if (b1 >= -1e-9 && b2 >= -1e-9 && 1 - b1 - b2 >= -1e-9) return t;
  }
  return null;
}

/**
 * The whole figure: titles, both plots and a shared legend, as an HTML fragment with inline styles
 * (so it works unchanged inside the report). `unitsLabel` is the stress unit text.
 */
export function buildFeContourHtml(field, { unitsLabel = 'MPa', caption = '' } = {}) {
  if (!field?.triangles?.length) return '';
  const scale = contourScale(field);
  const legend = RAMP.map((colour, i) => `
    <span style="display:inline-flex;align-items:center;gap:3px;margin-right:6px;white-space:nowrap">
      <span style="display:inline-block;width:14px;height:10px;border-radius:2px;background:${colour};border:1px solid ${i === 0 ? '#b7b6b0' : colour}"></span>
      ${num(scale.edges[i])}–${num(scale.edges[i] + scale.step)}</span>`).join('');
  const plots = SURFACES.map((surface) => {
    const peak = contourPeak(field, surface.key);
    return `<figure style="margin:0">
      <figcaption style="font-weight:600;color:${TEXT};margin:0 0 2px">${surface.title}</figcaption>
      <div style="color:${TEXT_2};font-size:11px;margin:0 0 4px">Peak ${peak.value.toFixed(2)} ${esc(unitsLabel)}</div>
      ${plotSvg(field, surface, scale, unitsLabel)}
    </figure>`;
  }).join('');
  return `<div class="fe-contour" style="background:${SURFACE};color:${TEXT};border:1px solid #d9d8d2;border-radius:6px;padding:10px 12px;font:12px/1.4 system-ui,-apple-system,'Segoe UI',sans-serif;max-width:660px">
    <div style="display:flex;flex-wrap:wrap;gap:16px;align-items:flex-start">${plots}</div>
    <div style="margin-top:6px;color:${TEXT_2}"><span style="color:${TEXT};font-weight:600;margin-right:8px">Stress intensity (${esc(unitsLabel)})</span>${legend}</div>
    <div data-role="fe-contour-readout" style="margin-top:4px;color:${TEXT_2};min-height:1.4em" aria-live="polite"></div>
    ${caption ? `<div style="margin-top:2px;color:${TEXT_2}">${caption}</div>` : ''}
  </div>`;
}
