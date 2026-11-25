/**
 * Printable, self-contained HTML calculation report for a WRC 537 run.
 * Accepts a load-case batch (calculateWrc537Cases) or a single result (calculateWrc537).
 */
import { WRC_BENDING_CLASS, WRC_TIER_TEXT, fmt } from './wrc-calc.js';

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));
const LOAD_KEYS = ['P', 'Vc', 'Vl', 'Mc', 'Ml', 'Mt'];
const passText = (item) => `<span class="${item.pass ? 'pass' : 'fail'}">${fmt(item.ratio, 3)} ${item.pass ? 'pass' : 'FAIL'}</span>`;

export function buildWrcReportHtml(run, { generatedAt = new Date(), appVersion = '' } = {}) {
  const batch = run.cases ? run : { cases: [{ name: 'Case 1', result: run }], governing: null, codeCheck: null };
  const first = batch.cases[0].result;
  const ref = batch.cases.find((c) => c.result.ok)?.result ?? first; // geometry and curves are the same for every case
  const i = first.input;
  const g = first.geometry;
  const multi = batch.cases.length > 1;
  const S = Number(i.allowableS) > 0;

  const ordinateRows = ref.ok
    ? ['circ', 'long'].flatMap((family) => Object.entries(ref.provenance[family]).map(([key, p]) => `
        <tr><td>${family === 'circ' ? 'Circumferential' : 'Longitudinal'}</td><td>${esc(key)}</td>
        <td>${esc(p.figure)}</td><td class="n">${fmt(Math.abs(p.y), 5)}</td><td>${p.interpolationUsed ? 'interpolated' : 'tabulated row'}</td></tr>`)).join('')
    : '';

  const caseSections = batch.cases.map((c, index) => {
    const r = c.result;
    const head = `<h3>${multi ? `Case ${index + 1}: ` : ''}${esc(c.name)}</h3>`;
    if (!r.ok) {
      return `${head}<p><b>Not calculated.</b></p><ul>${r.reasons.map((x) => `<li>${esc(x.text)}${x.fix ? ` <i>${esc(x.fix)}</i>` : ''}</li>`).join('')}</ul>`;
    }
    const cc = r.codeCheck;
    return `${head}
<table>
<tr><th>Point</th><th class="n">σ<sub>φ</sub> circumferential</th><th class="n">σ<sub>x</sub> longitudinal</th><th class="n">τ shear</th><th class="n">P<sub>L</sub> membrane SI</th><th class="n">Total SI</th></tr>
${r.rows.map((row) => `<tr${row.location === r.governing.location ? ' class="gov"' : ''}><td>${row.location}</td><td class="n">${fmt(row.circumferential, 3)}</td><td class="n">${fmt(row.longitudinal, 3)}</td><td class="n">${fmt(row.shear, 3)}</td><td class="n">${fmt(row.membraneIntensity, 3)}</td><td class="n">${fmt(row.stressIntensity, 3)}</td></tr>`).join('')}
</table>
<p><b>Governing: ${r.governing.location}, stress intensity ${fmt(r.governing.stressIntensity, 3)} MPa.</b> This is the maximum over the eight WRC points only, not a guaranteed shell maximum.</p>
${cc ? `<table><tr><th>Category</th><th>Point</th><th class="n">Stress</th><th class="n">Limit</th><th>Basis</th><th class="n">Ratio</th></tr>
${cc.items.map((x) => `<tr><td>${esc(x.label)}</td><td>${esc(x.location)}</td><td class="n">${fmt(x.value, 3)}</td><td class="n">${fmt(x.limit, 2)}</td><td>${esc(x.limitText)}</td><td class="n">${passText(x)}</td></tr>`).join('')}
</table><p>Code check for this case: <b class="${cc.pass ? 'pass' : 'fail'}">${cc.pass ? 'PASS' : 'FAIL'}</b>.</p>` : ''}`;
  }).join('\n');

  const warnings = [...new Set(batch.cases.flatMap((c) => c.result.warnings ?? []))];

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>WRC 537 local stress: ${esc(i.title || 'calculation')}</title>
<style>
  :root{color-scheme:light} html{background:#fff}
  body{font:12px/1.45 system-ui,-apple-system,'Segoe UI',sans-serif;color:#111;background:#fff;margin:24px;max-width:900px}
  h1{font-size:18px;margin:0 0 4px} h2{font-size:14px;margin:18px 0 6px;border-bottom:1px solid #999;padding-bottom:2px} h3{font-size:13px;margin:14px 0 4px}
  table{border-collapse:collapse;width:100%;margin:4px 0} th,td{border:1px solid #bbb;padding:3px 6px;text-align:left}
  th{background:#eee} th.n,td.n{text-align:right;font-variant-numeric:tabular-nums}
  .tier{padding:6px 8px;border:1px solid #888;background:#f4f4f4;margin:8px 0}
  .gov{font-weight:700;background:#fff3c4} .muted{color:#555} ul{margin:4px 0 4px 18px;padding:0}
  .pass{color:#13703f;font-weight:600} .fail{color:#b3261e;font-weight:700}
  .sign{display:flex;gap:40px;margin-top:28px} .sign div{flex:1;border-top:1px solid #333;padding-top:4px}
  @media print{body{margin:10mm} h3{break-after:avoid} table{break-inside:avoid}}
</style></head><body>
<h1>WRC 537 local stress: ${esc(i.title || 'Attachment on cylindrical shell')}</h1>
<div class="muted">Generated ${esc(generatedAt.toISOString().replace('T', ' ').slice(0, 19))} UTC · LAFEA + Empirical/WRC ${esc(appVersion)}</div>
<div class="tier"><b>Method:</b> WRC Bulletin 537 (2013), cylindrical shell, round attachment, Table 5. ${esc(WRC_TIER_TEXT[ref.tier])}</div>

<h2>1. Geometry and design data</h2>
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
<tr><td>Design pressure (internal +)</td><td>p</td><td class="n">${fmt(Number(i.designPressure) || 0, 3)}</td><td>MPa</td></tr>
${ref.ok ? `<tr><td>Pressure membrane stress, hoop p·R<sub>m</sub>/T / longitudinal p·R<sub>m</sub>/2T</td><td>σ<sub>p</sub></td><td class="n">${fmt(ref.pressureStress.circumferential, 3)} / ${fmt(ref.pressureStress.longitudinal, 3)}</td><td>MPa</td></tr>` : ''}
<tr><td>Stress concentration factors, membrane / bending</td><td>K<sub>n</sub> / K<sub>b</sub></td><td class="n">${fmt(Number(i.Kn ?? 1), 3)} / ${fmt(Number(i.Kb ?? 1), 3)}</td><td>—</td></tr>
${S ? `<tr><td>Allowable stress / secondary limit</td><td>S / S<sub>PS</sub></td><td class="n">${fmt(Number(i.allowableS), 2)} / ${Number(i.allowableSps) > 0 ? fmt(Number(i.allowableSps), 2) : `${fmt(3 * Number(i.allowableS), 2)} (3S)`}</td><td>MPa</td></tr>
<tr><td colspan="4">Load bending stress classified as: ${esc(WRC_BENDING_CLASS[i.bendingClass] ?? WRC_BENDING_CLASS.Q)}</td></tr>` : ''}
</table>

<h2>2. Load cases at the attachment (WRC 537 axes)</h2>
<table>
<tr><th>Case</th>${LOAD_KEYS.map((k) => `<th class="n">${k} (${esc(['P', 'Vc', 'Vl'].includes(k) ? i.forceUnit : i.momentUnit)})</th>`).join('')}</tr>
${batch.cases.map((c) => `<tr><td>${esc(c.name)}</td>${LOAD_KEYS.map((k) => `<td class="n">${esc(c.result.input.loads?.[k] ?? 0)}</td>`).join('')}</tr>`).join('')}
</table>
<div class="muted">Signs follow the WRC 537 Figure 2 convention. This is the same convention CAESAR II uses for WRC input, confirmed against a CAESAR II benchmark.</div>

${multi ? `<h2>3. Envelope of load cases</h2>
<table><tr><th>Case</th><th class="n">Governing SI (MPa)</th><th>Point</th>${S ? '<th class="n">Worst ratio</th>' : ''}</tr>
${batch.cases.map((c) => `<tr${batch.governing && batch.governing.name === c.name ? ' class="gov"' : ''}><td>${esc(c.name)}</td><td class="n">${c.result.ok ? fmt(c.result.governing.stressIntensity, 3) : 'not calculated'}</td><td>${c.result.ok ? c.result.governing.location : '—'}</td>${S ? `<td class="n">${c.result.codeCheck ? passText(c.result.codeCheck.worst) : '—'}</td>` : ''}</tr>`).join('')}
</table>
${batch.governing ? `<p><b>Envelope: ${esc(batch.governing.name)}, ${fmt(batch.governing.stressIntensity, 3)} MPa at ${batch.governing.location}.</b>${batch.codeCheck ? ` Code check: <b class="${batch.codeCheck.pass ? 'pass' : 'fail'}">${batch.codeCheck.pass ? 'all cases pass' : 'FAIL'}</b> (worst case: ${esc(batch.codeCheck.worstCase)}).` : ''}</p>` : ''}` : ''}

<h2>${multi ? '4' : '3'}. Stresses at the eight WRC points (MPa)</h2>
<div class="muted">u = outside surface, l = inside surface. A, B on the longitudinal axis; C, D on the circumferential axis. P<sub>L</sub> membrane SI uses the membrane terms only (pressure, WRC membrane and shear).</div>
${caseSections}

${ref.ok ? `<h2>${multi ? '5' : '4'}. WRC curve values used</h2>
<div class="muted">Original curves, γ = ${fmt(g.gamma, 3)}, β = ${fmt(g.beta, 4)}. The M<sub>L</sub> bending curves are 1B/2B (eight-point axis values).${ref.tier === 'INTERPOLATED' ? ` Interpolated between γ = ${ref.gammaClass.lower} and ${ref.gammaClass.upper} (${ref.coordinate === 'LINEAR_GAMMA' ? 'linear in γ' : 'log γ'}).` : ''}</div>
<table><tr><th>Family</th><th>Term</th><th>Figure</th><th class="n">|ordinate|</th><th>Source</th></tr>${ordinateRows}</table>` : ''}

${warnings.length ? `<h2>Notes</h2><ul>${warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}

<h2>Limitations</h2>
<ul>
<li>Host cylindrical shell stress at the attachment juncture only. Stresses in the attachment or nozzle are not calculated.</li>
<li>Pressure adds the thin-shell membrane stress only. The extra pressure stress at the edge of the opening is not included.</li>
<li>${S ? 'The code check is a screening check with user-entered allowables and the ASME VIII-2 Part 5 stress categories. It is not a full code assessment (no fatigue, ratcheting or nozzle reinforcement check).' : 'No code acceptance check has been made, because no allowable stress was entered.'}</li>
<li>Interpolated γ and the assumed β limit for γ above 5 are engineering judgement, not WRC rules.</li>
</ul>
<div class="sign"><div>Prepared by / date</div><div>Checked by / date</div></div>
</body></html>`;
}
