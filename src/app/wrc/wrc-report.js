/**
 * Printable, self-contained HTML calculation report for a WRC 537 run.
 * Accepts a load-case batch (calculateWrc537Cases), one attachment result (calculateWrcAttachment)
 * or a single-location result (calculateWrc537). With a reinforcing pad, every case is reported
 * at both shell locations: at the attachment (shell + pad) and at the pad edge.
 */
import {
  WRC_BENDING_CLASS, WRC_LOCATION_TEXT, WRC_PAD_METHOD_TEXT, WRC_TIER_TEXT, WRC_TRUNNION_CONSTRUCTION, deriveWrcGeometry, fmt, isTrunnion,
} from './wrc-calc.js';
import { FE_CONTOUR_CAPTION, FE_METHOD_NOTE, buildFeContourHtml } from './fe-contour.js';

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));
const LOAD_KEYS = ['P', 'Vc', 'Vl', 'Mc', 'Ml', 'Mt'];
const passText = (item) => `<span class="${item.pass ? 'pass' : 'fail'}">${fmt(item.ratio, 3)} ${item.pass ? 'pass' : 'FAIL'}</span>`;

/** Wrap a single-location calculateWrc537 result in the calculateWrcAttachment shape. */
function asAttachment(result) {
  if (result.locations) return result;
  return {
    input: result.input,
    padded: false,
    pad: null,
    locations: [{ id: 'ATTACHMENT', label: WRC_LOCATION_TEXT.ATTACHMENT, result }],
    ok: result.ok,
    tier: result.tier,
    reasons: result.reasons,
    warnings: result.warnings,
    governing: result.ok ? { locationId: 'ATTACHMENT', label: WRC_LOCATION_TEXT.ATTACHMENT, ...result.governing } : null,
    codeCheck: result.codeCheck ? { pass: result.codeCheck.pass, worst: result.codeCheck.worst } : null,
  };
}

/**
 * `fe` (optional): a shell-FE cross-check run on the current inputs,
 * { caseName, reference: WRC result without pressure or Kn/Kb, result: crossCheckWrc537 output }.
 */
function feSection(fe, number) {
  const r = fe.result;
  const ref = fe.reference;
  const wrcGov = ref.governing;
  return `<h2>${number}. Shell FE cross-check (LAFEA shell solver)</h2>
<div class="muted">Case "${esc(fe.caseName)}": all six loads, without pressure or K<sub>n</sub>/K<sub>b</sub>.${ref.feLocation?.id === 'PAD_EDGE' ? ' Compared at the pad edge: the pad is the rigid attachment on the bare shell; the check at the attachment (shell + pad) is not cross-checked.' : ''} Mesh ${r.mesh.nodeCount} nodes, ${r.mesh.dofs} DOF.${r.lengthAssumed ? ` No cylinder length was given, so L = ${fmt(r.geometry.length, 0)} mm (8·R<sub>m</sub>) was assumed.` : ''}</div>
<table>
<tr><th>Point</th><th class="n">WRC 537 SI</th><th class="n">Shell FE SI</th><th class="n">FE / WRC</th><th class="n">FE σ<sub>φ</sub></th><th class="n">FE σ<sub>x</sub></th><th class="n">FE τ</th></tr>
${r.rows.map((row, index) => {
    const w = ref.rows[index].stressIntensity;
    return `<tr${row.location === r.feGoverning.location ? ' class="gov"' : ''}><td>${row.location}</td><td class="n">${fmt(w, 3)}</td><td class="n">${fmt(row.fe, 3)}</td><td class="n">${w > 0.05 * wrcGov.stressIntensity ? fmt(row.fe / w, 2) : '—'}</td><td class="n">${fmt(row.feCircumferential, 3)}</td><td class="n">${fmt(row.feLongitudinal, 3)}</td><td class="n">${fmt(row.feShear, 3)}</td></tr>`;
  }).join('')}
</table>
<p><b>Governing: WRC ${fmt(wrcGov.stressIntensity, 3)} MPa at ${wrcGov.location}; FE ${fmt(r.feGoverning.fe, 3)} MPa at ${r.feGoverning.location} (FE / WRC = ${fmt(r.feGoverning.fe / wrcGov.stressIntensity, 2)}).</b></p>
${r.field ? `<div class="contour">${buildFeContourHtml(r.field, { caption: esc(FE_CONTOUR_CAPTION) })}</div>` : ''}
<p class="muted">${esc(FE_METHOD_NOTE)}</p>`;
}

function locationTable(r, isGov) {
  return `<table>
<tr><th>Point</th><th class="n">σ<sub>φ</sub> circumferential</th><th class="n">σ<sub>x</sub> longitudinal</th><th class="n">τ shear</th><th class="n">P<sub>L</sub> membrane SI</th><th class="n">Total SI</th></tr>
${r.rows.map((row) => `<tr${isGov && row.location === r.governing.location ? ' class="gov"' : ''}><td>${row.location}</td><td class="n">${fmt(row.circumferential, 3)}</td><td class="n">${fmt(row.longitudinal, 3)}</td><td class="n">${fmt(row.shear, 3)}</td><td class="n">${fmt(row.membraneIntensity, 3)}</td><td class="n">${fmt(row.stressIntensity, 3)}</td></tr>`).join('')}
</table>`;
}

/** The Table 7/8 interpolation spread of a rectangular attachment, when a factor was interpolated. */
function spreadLine(r) {
  const sp = r.factorSpread;
  if (!sp) return '';
  if (!Number.isFinite(sp.low)) return '<p class="muted">Table 7/8 interpolation spread: not available, every corner run was outside the method.</p>';
  const corners = sp.corners.map((c) => `β1/β2 ${c.pick.ratio === 'lo' ? 'lower' : 'upper'} row, γ ${c.pick.gamma === 'lo' ? 'lower' : 'upper'} row: ${c.skipped ? `skipped (${esc(c.skipped)})` : `${fmt(c.stressIntensity, 3)} MPa at ${c.location}`}`).join('; ');
  return `<p${sp.wide ? ' class="fail"' : ' class="muted"'}>Table 7/8 interpolation spread: governing stress ${fmt(sp.low, 3)}–${fmt(sp.high, 3)} MPa with the nearest printed rows instead of the interpolated factors (${fmt(100 * sp.width, 1)}% of ${fmt(r.governing.stressIntensity, 3)} MPa${sp.wide ? '; wide, check it by FE or a benchmark' : ''}). Corner runs: ${corners}. The corners show how much the judgement matters; they are not a proven bound.</p>`;
}

function checkTable(locations, padded) {
  const rows = locations.flatMap((l) => l.result.codeCheck.items.map((x) => `<tr><td>${esc(x.label)}</td>${padded ? `<td>${esc(l.label)}</td>` : ''}<td>${esc(x.location)}</td><td class="n">${fmt(x.value, 3)}</td><td class="n">${fmt(x.limit, 2)}</td><td>${esc(x.limitText)}</td><td class="n">${passText(x)}</td></tr>`));
  return `<table><tr><th>Category</th>${padded ? '<th>Location</th>' : ''}<th>Point</th><th class="n">Stress</th><th class="n">Limit</th><th>Basis</th><th class="n">Ratio</th></tr>
${rows.join('')}
</table>`;
}

export function buildWrcReportHtml(run, { generatedAt = new Date(), appVersion = '', fe = null } = {}) {
  const batch = run.cases
    ? { ...run, cases: run.cases.map((c) => ({ ...c, result: asAttachment(c.result) })) }
    : { cases: [{ name: 'Case 1', result: asAttachment(run) }], governing: null, codeCheck: null };
  const first = batch.cases[0].result;
  const ref = batch.cases.find((c) => c.result.ok)?.result ?? first; // geometry and curves are the same for every case
  const i = first.input;
  const g0 = deriveWrcGeometry(i); // the shell and attachment as entered
  const padded = first.padded;
  const trunnion = isTrunnion(i);
  const multi = batch.cases.length > 1;
  const S = Number(i.allowableS) > 0;

  const caseSections = batch.cases.map((c, index) => {
    const r = c.result;
    const head = `<h3>${multi ? `Case ${index + 1}: ` : ''}${esc(c.name)}</h3>`;
    if (!r.ok) {
      return `${head}<p><b>Not calculated.</b></p><ul>${r.reasons.map((x) => `<li>${esc(x.text)}${x.fix ? ` <i>${esc(x.fix)}</i>` : ''}</li>`).join('')}</ul>`;
    }
    const tables = r.locations.map((l) => `${padded ? `<h4>${esc(l.label)}: ${fmt(l.result.governing.stressIntensity, 3)} MPa at ${l.result.governing.location}</h4>` : ''}
${locationTable(l.result, l.id === r.governing.locationId)}${spreadLine(l.result)}`).join('\n');
    const cc = r.codeCheck;
    return `${head}
${tables}
<p><b>Governing: ${r.governing.location}${padded ? `, ${esc(r.governing.label.toLowerCase())}` : ''}, stress intensity ${fmt(r.governing.stressIntensity, 3)} MPa.</b> This is the maximum over the eight WRC points${padded ? ' at each location' : ''} only, not a guaranteed shell maximum.</p>
${cc ? `${checkTable(r.locations, padded)}<p>Code check for this case: <b class="${cc.pass ? 'pass' : 'fail'}">${cc.pass ? 'PASS' : 'FAIL'}</b>.</p>` : ''}`;
  }).join('\n');

  const warnings = [...new Set(batch.cases.flatMap((c) => c.result.warnings ?? []))];

  const locationGeometry = ref.locations.map((l) => {
    const g = l.result.geometry;
    const label = padded ? `<tr><th colspan="4">${esc(l.label)}</th></tr>` : '';
    return `${label}
<tr><td>Thickness used (${l.id === 'JUNCTION' ? 't<sub>n</sub> − CA + t<sub>pad</sub>' : 't<sub>n</sub> − CA'})</td><td>T</td><td class="n">${fmt(g.T, 3)}</td><td>mm</td></tr>
<tr><td>Mean radius of that wall</td><td>R<sub>m</sub></td><td class="n">${fmt(g.Rm, 3)}</td><td>mm</td></tr>
${g.rectangular ? `<tr><td>${l.id === 'PAD_EDGE' ? 'Pad (the attachment here): half-width around / half-length along' : 'Attachment half-width around / half-length along the shell'}</td><td>c<sub>1</sub> / c<sub>2</sub></td><td class="n">${fmt(g.c1, 3)} / ${fmt(g.c2, 3)}</td><td>mm</td></tr>
<tr><td>γ = R<sub>m</sub>/T</td><td>γ</td><td class="n">${fmt(g.gamma, 3)}</td><td>—</td></tr>
<tr><td>β<sub>1</sub> = c<sub>1</sub>/R<sub>m</sub>, β<sub>2</sub> = c<sub>2</sub>/R<sub>m</sub>, β<sub>1</sub>/β<sub>2</sub> (eq. 28)</td><td>β<sub>1</sub> / β<sub>2</sub></td><td class="n">${fmt(g.beta1, 4)} / ${fmt(g.beta2, 4)} / ${fmt(g.ratio, 3)}</td><td>—</td></tr>`
    : `<tr><td>${l.id === 'PAD_EDGE' ? 'Pad outside radius (the attachment here)' : 'Attachment outside radius'}</td><td>r<sub>0</sub></td><td class="n">${fmt(g.r0, 3)}</td><td>mm</td></tr>
<tr><td>γ = R<sub>m</sub>/T</td><td>γ</td><td class="n">${fmt(g.gamma, 3)}</td><td>—</td></tr>
<tr><td>β = 0.875·r<sub>0</sub>/R<sub>m</sub></td><td>β</td><td class="n">${fmt(g.beta, 4)}</td><td>—</td></tr>`}
${l.result.ok ? `<tr><td>Pressure membrane stress, hoop p·R<sub>m</sub>/T / longitudinal p·R<sub>m</sub>/2T</td><td>σ<sub>p</sub></td><td class="n">${fmt(l.result.pressureStress.circumferential, 3)} / ${fmt(l.result.pressureStress.longitudinal, 3)}</td><td>MPa</td></tr>` : ''}`;
  }).join('');

  const curveSections = ref.ok ? ref.locations.map((l) => {
    const r = l.result;
    const g = r.geometry;
    const rows = ['circ', 'long'].flatMap((family) => Object.entries(r.provenance[family]).map(([key, p]) => `
        <tr><td>${family === 'circ' ? 'Circumferential' : 'Longitudinal'}</td><td>${esc(key)}</td>
        <td>${esc(p.figure)}</td>${g.rectangular ? `<td class="n">${p.unused ? '—' : fmt(p.beta, 4)}</td><td class="n">${p.unused || !p.tableFactor ? '—' : `${p.tableFactor.kind} ${fmt(p.tableFactor.value, 3)}${p.factorApproximate ? ' (approx.)' : ''}`}</td>` : ''}<td class="n">${p.unused ? 'not used (load 0)' : fmt(Math.abs(p.y), 5)}</td><td>${p.unused ? '—' : `${p.interpolationUsed ? 'interpolated' : 'tabulated row'}${g.rectangular ? `; ${esc(p.basis)}` : ''}`}</td></tr>`)).join('');
    return `${padded ? `<h3>${esc(l.label)}</h3>` : ''}
<div class="muted">Original curves, γ = ${fmt(g.gamma, 3)}, ${g.rectangular ? 'β for each term from WRC 537 §4.2.2 (shown)' : `β = ${fmt(g.beta, 4)}`}. The M<sub>L</sub> bending curves are 1B/2B (eight-point axis values).${r.tier === 'INTERPOLATED' ? ` Interpolated between γ = ${r.gammaClass.lower} and ${r.gammaClass.upper} (${r.coordinate === 'LINEAR_GAMMA' ? 'linear in γ' : 'log γ'}).` : ''}</div>
<table><tr><th>Family</th><th>Term</th><th>Figure</th>${g.rectangular ? '<th class="n">β used</th><th class="n">Table factor</th>' : ''}<th class="n">|ordinate|</th><th>Source</th></tr>${rows}</table>`;
  }).join('\n') : '';

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>WRC 537 local stress: ${esc(i.title || 'calculation')}</title>
<style>
  :root{color-scheme:light} html{background:#fff}
  body{font:12px/1.45 system-ui,-apple-system,'Segoe UI',sans-serif;color:#111;background:#fff;margin:24px;max-width:900px}
  h1{font-size:18px;margin:0 0 4px} h2{font-size:14px;margin:18px 0 6px;border-bottom:1px solid #999;padding-bottom:2px} h3{font-size:13px;margin:14px 0 4px} h4{font-size:12px;margin:10px 0 2px}
  table{border-collapse:collapse;width:100%;margin:4px 0} th,td{border:1px solid #bbb;padding:3px 6px;text-align:left}
  th{background:#eee} th.n,td.n{text-align:right;font-variant-numeric:tabular-nums}
  .tier{padding:6px 8px;border:1px solid #888;background:#f4f4f4;margin:8px 0}
  .gov{font-weight:700;background:#fff3c4} .muted{color:#555} ul{margin:4px 0 4px 18px;padding:0}
  .pass{color:#13703f;font-weight:600} .fail{color:#b3261e;font-weight:700}
  .sign{display:flex;gap:40px;margin-top:28px} .sign div{flex:1;border-top:1px solid #333;padding-top:4px}
  .contour{margin:8px 0;break-inside:avoid} .contour svg{max-width:100%;height:auto}
  @media print{body{margin:10mm} h3,h4{break-after:avoid} table{break-inside:avoid}}
</style></head><body>
<h1>WRC 537 local stress: ${esc(i.title || 'Attachment on cylindrical shell')}</h1>
<div class="muted">Generated ${esc(generatedAt.toISOString().replace('T', ' ').slice(0, 19))} UTC · LAFEA + Empirical/WRC ${esc(appVersion)}</div>
<div class="tier"><b>Method:</b> WRC Bulletin 537 (2013), cylindrical shell, ${g0.rectangular ? 'rectangular attachment (§4.2.2, equations 28–30 and 50–51, Tables 6–8) on the Table 5 curves' : `round attachment${trunnion ? ' (trunnion)' : ''}, Table 5`}. ${esc(WRC_TIER_TEXT[ref.tier])}${padded ? `<br>${esc(WRC_PAD_METHOD_TEXT)}` : ''}</div>

<h2>1. Geometry and design data</h2>
<table>
<tr><th>Item</th><th>Symbol</th><th class="n">Value</th><th>Unit</th></tr>
<tr><td>Shell outside diameter</td><td>D<sub>o</sub></td><td class="n">${fmt(g0.OD, 2)}</td><td>mm</td></tr>
<tr><td>Shell nominal thickness</td><td>t<sub>n</sub></td><td class="n">${fmt(g0.tn, 2)}</td><td>mm</td></tr>
<tr><td>Corrosion allowance</td><td>CA</td><td class="n">${fmt(g0.ca, 2)}</td><td>mm</td></tr>
${g0.rectangular
    ? `<tr><td>Attachment footprint, length along / width around the shell</td><td>2c<sub>2</sub> / 2c<sub>1</sub></td><td class="n">${fmt(2 * g0.c2, 2)} / ${fmt(2 * g0.c1, 2)}</td><td>mm</td></tr>`
    : `<tr><td>${trunnion ? `Trunnion outside diameter (${esc((WRC_TRUNNION_CONSTRUCTION[i.trunnionConstruction] ?? WRC_TRUNNION_CONSTRUCTION.SOLID).toLowerCase())})` : 'Attachment outside diameter'}</td><td>d</td><td class="n">${fmt(2 * g0.r0, 2)}</td><td>mm</td></tr>`}
${padded && first.pad && !first.pad.rectangular ? `<tr><td>Reinforcing pad outside diameter / thickness / width</td><td>d<sub>pad</sub> / t<sub>pad</sub> / w</td><td class="n">${fmt(first.pad.outsideDiameter, 2)} / ${fmt(first.pad.thickness, 2)} / ${fmt(first.pad.width, 2)}</td><td>mm</td></tr>` : ''}
${padded && first.pad?.rectangular ? `<tr><td>Reinforcing pad length along / width around / thickness</td><td>—</td><td class="n">${fmt(first.pad.length, 2)} / ${fmt(first.pad.width, 2)} / ${fmt(first.pad.thickness, 2)}</td><td>mm</td></tr>` : ''}
${locationGeometry}
<tr><td>Cylinder length / attachment position / nearest end</td><td>L / x / e</td><td class="n">${fmt(g0.L, 0)} / ${fmt(g0.x, 0)} / ${fmt(g0.endDistance, 0)}</td><td>mm</td></tr>
<tr><td>Design pressure (internal +)</td><td>p</td><td class="n">${fmt(Number(i.designPressure) || 0, 3)}</td><td>MPa</td></tr>
<tr><td>Stress concentration factors, membrane / bending</td><td>K<sub>n</sub> / K<sub>b</sub></td><td class="n">${fmt(Number(i.Kn ?? 1), 3)} / ${fmt(Number(i.Kb ?? 1), 3)}</td><td>—</td></tr>
${S ? `<tr><td>Allowable stress / secondary limit</td><td>S / S<sub>PS</sub></td><td class="n">${fmt(Number(i.allowableS), 2)} / ${Number(i.allowableSps) > 0 ? fmt(Number(i.allowableSps), 2) : `${fmt(3 * Number(i.allowableS), 2)} (3S)`}</td><td>MPa</td></tr>
<tr><td colspan="4">Load bending stress classified as: ${esc(WRC_BENDING_CLASS[i.bendingClass] ?? WRC_BENDING_CLASS.Q)}</td></tr>` : ''}
</table>

<h2>2. Load cases at the attachment (WRC 537 axes)</h2>
<table>
<tr><th>Case</th>${LOAD_KEYS.map((k) => `<th class="n">${k} (${esc(['P', 'Vc', 'Vl'].includes(k) ? i.forceUnit : i.momentUnit)})</th>`).join('')}</tr>
${batch.cases.map((c) => `<tr><td>${esc(c.name)}</td>${LOAD_KEYS.map((k) => `<td class="n">${esc(c.result.input.loads?.[k] ?? 0)}</td>`).join('')}</tr>`).join('')}
</table>
<div class="muted">Signs follow the WRC 537 Figure 2 convention. This is the same convention CAESAR II uses for WRC input, confirmed against a CAESAR II benchmark.${padded ? ' The same loads are applied at both locations.' : ''}</div>

${multi ? `<h2>3. Envelope of load cases</h2>
<table><tr><th>Case</th><th class="n">Governing SI (MPa)</th><th>Point</th>${padded ? '<th>Location</th>' : ''}${S ? '<th class="n">Worst ratio</th>' : ''}</tr>
${batch.cases.map((c) => `<tr${batch.governing && batch.governing.name === c.name ? ' class="gov"' : ''}><td>${esc(c.name)}</td><td class="n">${c.result.ok ? fmt(c.result.governing.stressIntensity, 3) : 'not calculated'}</td><td>${c.result.ok ? c.result.governing.location : '—'}</td>${padded ? `<td>${c.result.ok ? esc(c.result.governing.label) : '—'}</td>` : ''}${S ? `<td class="n">${c.result.codeCheck ? passText(c.result.codeCheck.worst) : '—'}</td>` : ''}</tr>`).join('')}
</table>
${batch.governing ? `<p><b>Envelope: ${esc(batch.governing.name)}, ${fmt(batch.governing.stressIntensity, 3)} MPa at ${batch.governing.location}${padded ? `, ${esc(String(batch.governing.label).toLowerCase())}` : ''}.</b>${batch.codeCheck ? ` Code check: <b class="${batch.codeCheck.pass ? 'pass' : 'fail'}">${batch.codeCheck.pass ? 'all cases pass' : 'FAIL'}</b> (worst case: ${esc(batch.codeCheck.worstCase)}).` : ''}</p>` : ''}` : ''}

<h2>${multi ? '4' : '3'}. Stresses at the eight WRC points (MPa)</h2>
<div class="muted">u = outside surface, l = inside surface. A, B on the longitudinal axis; C, D on the circumferential axis. P<sub>L</sub> membrane SI uses the membrane terms only (pressure, WRC membrane and shear).</div>
${caseSections}

${ref.ok ? `<h2>${multi ? '5' : '4'}. WRC curve values used</h2>
${curveSections}` : ''}

${fe?.result ? feSection(fe, ref.ok ? (multi ? '6' : '5') : (multi ? '5' : '4')) : ''}

${warnings.length ? `<h2>Notes</h2><ul>${warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}

<h2>Limitations</h2>
<ul>
<li>Host cylindrical shell stress at the attachment juncture${padded ? ' and at the pad edge' : ''} only. Stresses in the ${trunnion ? 'trunnion' : 'attachment, nozzle'}${padded ? ', pad or pad welds' : ' or its weld'} are not calculated.</li>
${padded ? '<li>The pad is checked with the two-location method (shell + pad at the attachment, shell alone at the pad edge). WRC 537 has no pad rule; this is common practice, and it assumes the pad is fully welded and acts with the shell.</li>' : ''}
${g0.rectangular ? '<li>Rectangular attachment: WRC 537 gives no method for torsion M<sub>T</sub> (§4.3.4), so torsion is not accepted. Tables 6–8 hold approximately for 0.25 ≤ β<sub>1</sub>/β<sub>2</sub> ≤ 4; factors between the printed rows are interpolated (engineering judgement). Stresses in the lug, its welds or its pad are not calculated.</li>' : ''}
<li>Pressure adds the thin-shell membrane stress only. ${trunnion ? 'A trunnion does not open the shell; the local stress from it restraining the shell\'s pressure growth is not included.' : 'The extra pressure stress at the edge of the opening is not included.'}</li>
${trunnion ? '<li>Trunnion: WRC 537 §4.2.2 has no solid/hollow selector for cylindrical shells, so the shell stress depends only on the outside diameter. The attachment is treated as rigid at the shell.</li>' : ''}
<li>${S ? 'The code check is a screening check with user-entered allowables and the ASME VIII-2 Part 5 stress categories. It is not a full code assessment (no fatigue, ratcheting or nozzle reinforcement check).' : 'No code acceptance check has been made, because no allowable stress was entered.'}</li>
<li>Interpolated γ and the assumed β limit for γ above 5 are engineering judgement, not WRC rules.</li>
</ul>
<div class="sign"><div>Prepared by / date</div><div>Checked by / date</div></div>
</body></html>`;
}
