/**
 * WRC 537 calculator panel: plain inputs → live results, report, save/open.
 */
import './wrc.css';
import {
  DEFAULT_CASE, EXAMPLE_CASES, FORCE_UNITS, MOMENT_UNITS, WRC_BETA_RANGE, WRC_COORDINATES,
  WRC_GAMMA_GRID, WRC_TIER, WRC_TIER_TEXT, calculateWrc537, fmt,
} from './wrc-calc.js';
import { buildWrcReportHtml } from './wrc-report.js';

const STORAGE_KEY = 'lafea-emp-app/wrc-case';
const CASE_SCHEMA = 'lafea-emp-app/wrc537-case/v1';

const FIELDS = [
  { group: 'Shell (cylinder)', key: 'shellOutsideDiameter', label: 'Outside diameter', unit: 'mm' },
  { group: 'Shell (cylinder)', key: 'shellThickness', label: 'Nominal thickness', unit: 'mm' },
  { group: 'Shell (cylinder)', key: 'corrosionAllowance', label: 'Corrosion allowance', unit: 'mm' },
  { group: 'Attachment', key: 'attachmentOutsideDiameter', label: 'Outside diameter at shell', unit: 'mm' },
  { group: 'Cylinder length (WRC 537 §4.5.2)', key: 'cylinderLength', label: 'Length between heads or stiffeners', unit: 'mm', optional: true },
  { group: 'Cylinder length (WRC 537 §4.5.2)', key: 'attachmentStation', label: 'Attachment position from one end', unit: 'mm', optional: true },
];

const LOADS = [
  { key: 'P', label: 'P', hint: 'radial force' },
  { key: 'Vc', label: 'Vc', hint: 'circumferential shear' },
  { key: 'Vl', label: 'Vl', hint: 'longitudinal shear' },
  { key: 'Mc', label: 'Mc', hint: 'circumferential moment' },
  { key: 'Ml', label: 'Ml', hint: 'longitudinal moment' },
  { key: 'Mt', label: 'Mt', hint: 'torsion' },
];

export function mountWrcCalculator(host) {
  const doc = host.ownerDocument;
  let state = loadSaved() ?? cloneCase(DEFAULT_CASE);
  let result = null;

  host.classList.add('wrc');
  host.innerHTML = `
    <div class="wrc__bar">
      <label class="wrc__title">Case <input data-k="title" type="text" maxlength="120"></label>
      <select data-act="example" aria-label="Load an example">
        <option value="">Examples…</option>
        <option value="DEFAULT">Blank nozzle-on-cylinder (starting point)</option>
        <option value="GAMMA5_ORACLE">Check case: γ = 5, hand calc</option>
        <option value="CAESAR_GAMMA48">Check case: CAESAR II, γ = 48</option>
      </select>
      <span class="wrc__spacer"></span>
      <button type="button" data-act="open">Open case…</button>
      <button type="button" data-act="save">Save case</button>
      <button type="button" data-act="print">Print report</button>
      <button type="button" data-act="download">Download report</button>
      <input type="file" accept=".json,application/json" data-act="file" hidden>
    </div>
    <div class="wrc__body">
      <form class="wrc__inputs" autocomplete="off" novalidate>
        <div data-slot="fields"></div>
        <fieldset class="wrc__group">
          <legend>Loads at the attachment (WRC 537 axes)</legend>
          <div class="wrc__units">
            <label>Force <select data-k="forceUnit">${Object.keys(FORCE_UNITS).map((u) => `<option>${u}</option>`).join('')}</select></label>
            <label>Moment <select data-k="momentUnit">${Object.keys(MOMENT_UNITS).map((u) => `<option>${u}</option>`).join('')}</select></label>
          </div>
          <div class="wrc__loads">${LOADS.map((l) => `
            <label><span><b>${l.label}</b> <small>${l.hint}</small></span>
              <input data-load="${l.key}" type="number" step="any" inputmode="decimal"><em data-unit="${l.key}"></em></label>`).join('')}
          </div>
          <p class="wrc__help">Signs follow WRC 537 Figure 2. This is the same convention CAESAR II uses for its WRC input, confirmed against a CAESAR II benchmark. Enter 0 for any load you don't have.</p>
        </fieldset>
        <fieldset class="wrc__group">
          <legend>Between tabulated γ rows</legend>
          <label class="wrc__row"><span>Interpolation</span>
            <select data-k="coordinate">${Object.entries(WRC_COORDINATES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
          <p class="wrc__help">WRC 537 tabulates γ = ${WRC_GAMMA_GRID.join(', ')}. Any other γ is interpolated between the two nearest rows.</p>
        </fieldset>
      </form>
      <section class="wrc__results" aria-live="polite">
        <div class="wrc__derived" data-slot="derived"></div>
        <div data-slot="status"></div>
        <div data-slot="table"></div>
        <div data-slot="notes"></div>
      </section>
    </div>`;

  // Build geometry fields grouped
  const groups = new Map();
  for (const f of FIELDS) {
    if (!groups.has(f.group)) groups.set(f.group, []);
    groups.get(f.group).push(f);
  }
  host.querySelector('[data-slot="fields"]').innerHTML = [...groups].map(([group, fields]) => `
    <fieldset class="wrc__group"><legend>${group}</legend>${fields.map((f) => `
      <label class="wrc__row"><span>${f.label}${f.optional ? ' <small>(optional)</small>' : ''}</span>
        <input data-k="${f.key}" type="number" step="any" min="0" inputmode="decimal"><em>${f.unit}</em></label>`).join('')}
    </fieldset>`).join('');

  const $ = (sel) => host.querySelector(sel);
  const form = $('.wrc__inputs');

  function writeForm() {
    for (const el of host.querySelectorAll('[data-k]')) el.value = state[el.dataset.k] ?? '';
    for (const el of host.querySelectorAll('[data-load]')) el.value = state.loads?.[el.dataset.load] ?? 0;
  }
  function readForm() {
    const next = { ...state, loads: { ...state.loads } };
    for (const el of host.querySelectorAll('[data-k]')) {
      next[el.dataset.k] = el.type === 'number' ? (el.value === '' ? '' : Number(el.value)) : el.value;
    }
    for (const el of host.querySelectorAll('[data-load]')) next.loads[el.dataset.load] = el.value === '' ? 0 : Number(el.value);
    return next;
  }

  function render() {
    result = calculateWrc537(state);
    const g = result.geometry;
    for (const l of LOADS) {
      host.querySelector(`[data-unit="${l.key}"]`).textContent = ['P', 'Vc', 'Vl'].includes(l.key) ? state.forceUnit : state.momentUnit;
    }
    const gammaOk = result.gammaClass?.tier && result.gammaClass.tier !== WRC_TIER.BLOCKED;
    const betaOk = g.beta >= WRC_BETA_RANGE.minimum && g.beta <= WRC_BETA_RANGE.maximum;
    $('[data-slot="derived"]').innerHTML = `
      ${chip('T (corroded)', `${fmt(g.T, 2)} mm`)}
      ${chip('Rm', `${fmt(g.Rm, 1)} mm`)}
      ${chip('γ = Rm/T', fmt(g.gamma, 2), Number.isFinite(g.gamma) ? (gammaOk ? (result.gammaClass.tier === WRC_TIER.SOURCE_QUALIFIED || result.gammaClass.tier === WRC_TIER.TABULATED_ROW ? 'ok' : 'warn') : 'bad') : '', `Allowed ${WRC_GAMMA_GRID[0]}–${WRC_GAMMA_GRID.at(-1)}`)}
      ${chip('β = 0.875·r0/Rm', fmt(g.beta, 3), Number.isFinite(g.beta) ? (betaOk ? 'ok' : 'bad') : '', 'Allowed 0.05–0.5')}`;

    const tierClass = { SOURCE_QUALIFIED: 'ok', TABULATED_ROW: 'ok', INTERPOLATED: 'warn', BLOCKED: 'bad' }[result.tier];
    if (result.ok) {
      $('[data-slot="status"]').innerHTML = `
        <div class="wrc__tier wrc__tier--${tierClass}">${WRC_TIER_TEXT[result.tier]}</div>
        <div class="wrc__gov"><span>Governing stress intensity</span>
          <strong>${fmt(result.governing.stressIntensity, 2)} <small>MPa</small></strong>
          <span>at point <b>${result.governing.location}</b>. This is the maximum over the 8 WRC points only.</span></div>`;
      $('[data-slot="table"]').innerHTML = `
        <table class="wrc__table"><thead><tr><th>Point</th><th>σφ circ.</th><th>σx long.</th><th>τ shear</th><th>Stress intensity</th></tr></thead>
        <tbody>${result.rows.map((r) => `<tr${r.location === result.governing.location ? ' class="is-gov"' : ''}>
          <td>${r.location}</td><td>${fmt(r.circumferential, 2)}</td><td>${fmt(r.longitudinal, 2)}</td><td>${fmt(r.shear, 2)}</td><td><b>${fmt(r.stressIntensity, 2)}</b></td></tr>`).join('')}
        </tbody><caption>MPa (N/mm²). u = outside surface, l = inside surface. A, B on the longitudinal axis; C, D on the circumferential axis.</caption></table>`;
    } else {
      $('[data-slot="status"]').innerHTML = `
        <div class="wrc__tier wrc__tier--bad">Not calculated</div>
        <ul class="wrc__reasons">${result.reasons.map((r) => `<li>${escapeHtml(r.text)}${r.fix ? `<br><span>→ ${escapeHtml(r.fix)}</span>` : ''}</li>`).join('')}</ul>`;
      $('[data-slot="table"]').innerHTML = '';
    }
    $('[data-slot="notes"]').innerHTML = `
      ${result.warnings.length ? `<ul class="wrc__notes">${result.warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join('')}</ul>` : ''}
      <p class="wrc__help">Only stress in the shell at the attachment is calculated: no attachment or nozzle stress, no pressure stress, and no check against allowables. K<sub>n</sub> = K<sub>b</sub> = 1.</p>`;
    save(state);
  }

  function setCase(next) {
    state = cloneCase(next);
    writeForm();
    render();
  }

  form.addEventListener('input', () => { state = readForm(); render(); });
  form.addEventListener('change', () => { state = readForm(); render(); });
  form.addEventListener('submit', (event) => event.preventDefault());

  host.addEventListener('click', (event) => {
    const act = event.target.closest('[data-act]')?.dataset.act;
    if (act === 'save') downloadFile(`${slug(state.title)}.wrc.json`, JSON.stringify({ schema: CASE_SCHEMA, case: state }, null, 2), 'application/json');
    if (act === 'open') $('[data-act="file"]').click();
    if (act === 'print') printReport(result);
    if (act === 'download') downloadFile(`${slug(state.title)}-wrc537-report.html`, reportHtml(result), 'text/html');
  });
  $('[data-act="example"]').addEventListener('change', (event) => {
    const key = event.target.value;
    event.target.value = '';
    if (key === 'DEFAULT') setCase(DEFAULT_CASE);
    else if (EXAMPLE_CASES[key]) setCase(EXAMPLE_CASES[key]);
  });
  $('[data-act="file"]').addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const loaded = parsed?.schema === CASE_SCHEMA ? parsed.case : null;
      if (!loaded || typeof loaded !== 'object') throw new Error('Not a WRC case file.');
      setCase({ ...cloneCase(DEFAULT_CASE), ...loaded, loads: { ...DEFAULT_CASE.loads, ...loaded.loads } });
    } catch (error) {
      globalThis.alert?.(`Could not open the case: ${error.message}`);
    }
  });

  writeForm();
  render();

  function reportHtml(r) {
    return buildWrcReportHtml(r, { appVersion: typeof __BUILD_TIME__ === 'string' ? `build ${__BUILD_TIME__}` : '' });
  }
  function printReport(r) {
    const win = doc.defaultView.open('', '_blank');
    if (!win) { downloadFile(`${slug(state.title)}-wrc537-report.html`, reportHtml(r), 'text/html'); return; }
    win.document.open();
    win.document.write(reportHtml(r));
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 250);
  }
  function downloadFile(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = doc.createElement('a');
    a.href = url;
    a.download = name;
    doc.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return {
    getState: () => cloneCase(state),
    getResult: () => result,
    setCase,
    destroy() { host.replaceChildren(); host.classList.remove('wrc'); },
  };
}

function chip(label, value, tone = '', title = '') {
  return `<div class="wrc__chip ${tone ? `wrc__chip--${tone}` : ''}" title="${title}"><span>${label}</span><b>${value}</b></div>`;
}
function cloneCase(c) { return JSON.parse(JSON.stringify(c)); }
function slug(text) { return (String(text || 'wrc-case').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'wrc-case').slice(0, 60); }
function escapeHtml(text) { return String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function loadSaved() {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? { ...cloneCase(DEFAULT_CASE), ...parsed, loads: { ...DEFAULT_CASE.loads, ...parsed.loads } } : null;
  } catch { return null; }
}
function save(c) { try { globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(c)); } catch { /* storage optional */ } }
