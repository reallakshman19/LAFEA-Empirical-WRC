/**
 * Printable, self-contained HTML calculation report for a WRC 537 result.
 */
import { WRC_TIER_TEXT, fmt } from './wrc-calc.js';

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

export function buildWrcReportHtml(result, { generatedAt = new Date(), appVersion = '' } = {}) {
  const i = result.input;
  const g = result.geometry;
  const lb = result.loadsBase;
  const rows = result.ok ? result.rows : [];
  const ordinateRows = result.ok
    ? ['circ', 'long'].flatMap((family) => Object.entries(result.provenance[family]).map(([key, p]) => `
        <tr><td>${family === 'circ' ? 'Circumferential' : 'Longitudinal'}</td><td>${esc(key)}</td>
        <td>${esc(p.figure)}</td><td class="n">${fmt(Math.abs(p.y), 5)}</td><td>${p.interpolationUsed ? 'interpolated' : 'tabulated row'}</td></tr>`)).join('')
    : '';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>WRC 537 local stress: ${esc(i.title || 'calculation')}</title>
<style>
  :root{color-scheme:light} html{background:#fff}
  body{font:12px/1.45 system-ui,-apple-system,'Segoe UI',sans-serif;color:#111;background:#fff;margin:24px;max-width:900px}
  h1{font-size:18px;margin:0 0 4px} h2{font-size:14px;margin:18px 0 6px;border-bottom:1px solid #999;padding-bottom:2px}
  table{border-collapse:collapse;width:100%;margin:4px 0} th,td{border:1px solid #bbb;padding:3px 6px;text-align:left}
  th{background:#eee} th.n,td.n{text-align:right;font-variant-numeric:tabular-nums}
  .tier{padding:6px 8px;border:1px solid #888;background:#f4f4f4;margin:8px 0}
  .gov{font-weight:700;background:#fff3c4} .muted{color:#555} ul{margin:4px 0 4px 18px;padding:0}
  .sign{display:flex;gap:40px;margin-top:28px} .sign div{flex:1;border-top:1px solid #333;padding-top:4px}
  @media print{body{margin:10mm}}
</style></head><body>
<h1>WRC 537 local stress: ${esc(i.title || 'Attachment on cylindrical shell')}</h1>
<div class="muted">Generated ${esc(generatedAt.toISOString().replace('T', ' ').slice(0, 19))} UTC · LAFEA + Empirical/WRC ${esc(appVersion)}</div>
<div class="tier"><b>Method:</b> WRC Bulletin 537 (2013), cylindrical shell, round attachment, Table 5. ${esc(WRC_TIER_TEXT[result.tier])}</div>

<h2>1. Geometry</h2>
<table>
<tr><th>Item</th><th>Symbol</th><th class="n">Value</th><th>Unit</th></tr>
<tr><td>Shell outside diameter</td><td>D<sub>o</sub></td><td class="n">${fmt(g.OD, 2)}</td><td>mm</td></tr>
<tr><td>Shell nominal thickness</td><td>t<sub>n</sub></td><td class="n">${fmt(g.tn, 2)}</td><td>mm</td></tr>
<tr><td>Corrosion allowance</td><td>CA</td><td class="n">${fmt(g.ca, 2)}</td><td>mm</td></tr>
<tr><td>Thickness used (t<sub>n</sub> − CA)</td><td>T</td><td class="n">${fmt(g.T, 3)}</td><td>mm</td></tr>
<tr><td>Mean radius (D<sub>o</sub> − T)/2</td><td>R<sub>m</sub></td><td class="n">${fmt(g.Rm, 3)}</td><td>mm</td></tr>
<tr><td>Attachment outside radius</td><td>r<sub>0</sub></td><td class="n">${fmt(g.r0, 3)}</td><td>mm</td></tr>
<tr><td>γ = R<sub>m</sub>/T</td><td>γ</td><td class="n">${fmt(g.gamma, 3)}</td><td>—</td></tr>
<tr><td>β = 0.875·r<sub>0</sub>/R<sub>m</sub></td><td>β</td><td class="n">${fmt(g.beta, 4)}</td><td>—</td></tr>
<tr><td>Cylinder length / attachment position / nearest end</td><td>L / x / e</td><td class="n">${fmt(g.L, 0)} / ${fmt(g.x, 0)} / ${fmt(g.endDistance, 0)}</td><td>mm</td></tr>
</table>

<h2>2. Loads at the attachment (WRC 537 axes)</h2>
<table>
<tr><th>Load</th><th class="n">Input</th><th>Unit</th><th class="n">Used (N, N·mm)</th></tr>
${['P', 'Vc', 'Vl', 'Mc', 'Ml', 'Mt'].map((k) => `<tr><td>${k}</td><td class="n">${esc(i.loads?.[k])}</td><td>${esc(['P', 'Vc', 'Vl'].includes(k) ? i.forceUnit : i.momentUnit)}</td><td class="n">${fmt(lb[k], 1)}</td></tr>`).join('')}
</table>
<div class="muted">Signs follow the WRC 537 Figure 2 convention. This is the same convention CAESAR II uses for WRC input, confirmed against a CAESAR II benchmark. K<sub>n</sub> = K<sub>b</sub> = 1. Pressure stress is not included.</div>

${result.ok ? `
<h2>3. Stresses at the eight WRC points (MPa)</h2>
<table>
<tr><th>Point</th><th class="n">σ<sub>φ</sub> circumferential</th><th class="n">σ<sub>x</sub> longitudinal</th><th class="n">τ shear</th><th class="n">Stress intensity</th></tr>
${rows.map((r) => `<tr${r.location === result.governing.location ? ' class="gov"' : ''}><td>${r.location}</td><td class="n">${fmt(r.circumferential, 3)}</td><td class="n">${fmt(r.longitudinal, 3)}</td><td class="n">${fmt(r.shear, 3)}</td><td class="n">${fmt(r.stressIntensity, 3)}</td></tr>`).join('')}
</table>
<p><b>Governing: ${result.governing.location}, stress intensity ${fmt(result.governing.stressIntensity, 3)} MPa</b>. This is the maximum over the eight WRC points only, not a guaranteed shell maximum.</p>

<h2>4. WRC curve values used</h2>
<div class="muted">Original curves, γ = ${fmt(g.gamma, 3)}, β = ${fmt(g.beta, 4)}. The M<sub>L</sub> bending curves are 1B/2B (eight-point axis values).${result.tier === 'INTERPOLATED' ? ` Interpolated between γ = ${result.gammaClass.lower} and ${result.gammaClass.upper} (${result.coordinate === 'LINEAR_GAMMA' ? 'linear in γ' : 'log γ'}).` : ''}</div>
<table><tr><th>Family</th><th>Term</th><th>Figure</th><th class="n">|ordinate|</th><th>Source</th></tr>${ordinateRows}</table>
` : `
<h2>3. Not calculated</h2>
<ul>${result.reasons.map((r) => `<li>${esc(r.text)}${r.fix ? ` <i>${esc(r.fix)}</i>` : ''}</li>`).join('')}</ul>`}

${result.warnings?.length ? `<h2>Notes</h2><ul>${result.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}

<h2>Limitations</h2>
<ul>
<li>Host cylindrical shell stress at the attachment juncture only. Stresses in the attachment or nozzle are not calculated.</li>
<li>Results are stresses only. No code acceptance check (P<sub>L</sub>, P<sub>L</sub>+P<sub>b</sub>, Q) has been made, so a separate assessment against the allowables is still needed.</li>
<li>Interpolated γ and the assumed β limit for γ above 5 are engineering judgement, not WRC rules.</li>
</ul>
<div class="sign"><div>Prepared by / date</div><div>Checked by / date</div></div>
</body></html>`;
}
