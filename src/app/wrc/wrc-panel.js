/**
 * WRC 537 calculator panel: plain inputs → live results, report, save/open.
 */
import './wrc.css';
import {
  DEFAULT_CASE, EXAMPLE_CASES, FORCE_UNITS, MOMENT_UNITS, WRC_BETA_RANGE, WRC_COORDINATES,
  WRC_ATTACHMENT_TYPES, WRC_TRUNNION_CONSTRUCTION, WRC_BENDING_CLASS, WRC_FE_MODE, WRC_GAMMA_GRID, WRC_TIER, WRC_TIER_TEXT, calculateWrc537Cases,
  classifyGamma, deriveWrcGeometry, fmt, hasPad, isRectangular, isTrunnion, wrcFeReference,
} from './wrc-calc.js';
import { buildWrcReportHtml } from './wrc-report.js';
import {
  FE_CONTOUR_CAPTION, FE_LUG_METHOD_NOTE, FE_METHOD_NOTE, buildFeContourHtml, feEdgePeakText, feOnlyReasonText, insideAttachment, triangleAt,
} from './fe-contour.js';

const STORAGE_KEY = 'lafea-emp-app/wrc-case';
const CASE_SCHEMA = 'lafea-emp-app/wrc537-case/v1';
const MAX_CASES = 20;

const FIELDS = [
  { group: 'Shell (cylinder)', key: 'shellOutsideDiameter', label: 'Outside diameter', unit: 'mm' },
  { group: 'Shell (cylinder)', key: 'shellThickness', label: 'Nominal thickness', unit: 'mm' },
  { group: 'Shell (cylinder)', key: 'corrosionAllowance', label: 'Corrosion allowance', unit: 'mm' },
  { group: 'Attachment', key: 'attachmentType', label: 'Type', select: WRC_ATTACHMENT_TYPES },
  { group: 'Attachment', key: 'trunnionConstruction', label: 'Trunnion construction', select: WRC_TRUNNION_CONSTRUCTION, only: 'TRUNNION' },
  { group: 'Attachment', key: 'attachmentOutsideDiameter', label: 'Outside diameter at shell', unit: 'mm', only: 'ROUND TRUNNION' },
  { group: 'Attachment', key: 'attachmentLength', label: 'Length along the shell (2·c2)', unit: 'mm', only: 'RECTANGULAR' },
  { group: 'Attachment', key: 'attachmentWidth', label: 'Width around the shell (2·c1)', unit: 'mm', only: 'RECTANGULAR' },
  { group: 'Reinforcing pad (optional)', key: 'padOutsideDiameter', label: 'Pad outside diameter', unit: 'mm', optional: true, only: 'ROUND TRUNNION' },
  { group: 'Reinforcing pad (optional)', key: 'padLength', label: 'Pad length along the shell', unit: 'mm', optional: true, only: 'RECTANGULAR' },
  { group: 'Reinforcing pad (optional)', key: 'padWidth', label: 'Pad width around the shell', unit: 'mm', optional: true, only: 'RECTANGULAR' },
  { group: 'Reinforcing pad (optional)', key: 'padThickness', label: 'Pad thickness', unit: 'mm', optional: true },
  { group: 'Cylinder length (WRC 537 §4.5.2)', key: 'cylinderLength', label: 'Length between heads or stiffeners', unit: 'mm', optional: true },
  { group: 'Cylinder length (WRC 537 §4.5.2)', key: 'attachmentStation', label: 'Attachment position from one end', unit: 'mm', optional: true },
  { group: 'Pressure and stress concentration', key: 'designPressure', label: 'Design pressure (internal +)', unit: 'MPa', signed: true },
  { group: 'Pressure and stress concentration', key: 'Kn', label: 'Kn, membrane factor', unit: '' },
  { group: 'Pressure and stress concentration', key: 'Kb', label: 'Kb, bending factor', unit: '' },
  { group: 'Allowables (optional)', key: 'allowableS', label: 'Allowable stress S', unit: 'MPa', optional: true },
  { group: 'Allowables (optional)', key: 'allowableSps', label: 'SPS (blank = 3S)', unit: 'MPa', optional: true },
];

const LOADS = [
  { key: 'P', label: 'P', hint: 'radial force' },
  { key: 'Vc', label: 'Vc', hint: 'circumferential shear' },
  { key: 'Vl', label: 'Vl', hint: 'longitudinal shear' },
  { key: 'Mc', label: 'Mc', hint: 'circumferential moment' },
  { key: 'Ml', label: 'Ml', hint: 'longitudinal moment' },
  { key: 'Mt', label: 'Mt', hint: 'torsion' },
];

const SHORT_LOCATION = Object.freeze({ ATTACHMENT: '', JUNCTION: 'shell + pad', PAD_EDGE: 'pad edge' });

export function mountWrcCalculator(host) {
  const doc = host.ownerDocument;
  let state = loadSaved() ?? normalizeCase(DEFAULT_CASE);
  let batch = null;
  let result = null;
  let fe = null; // { key, status: 'running' | 'done' | 'error', reference, result, error }

  host.classList.add('wrc');
  host.innerHTML = `
    <div class="wrc__bar">
      <label class="wrc__title">Case <input data-k="title" type="text" maxlength="120"></label>
      <select data-act="example" aria-label="Load an example">
        <option value="">Examples…</option>
        <option value="DEFAULT">Blank nozzle-on-cylinder (starting point)</option>
        <option value="GAMMA5_ORACLE">Check case: γ = 5, hand calc</option>
        <option value="CAESAR_GAMMA48">Check case: CAESAR II, γ = 48</option>
        <option value="PAD_36IN">36-inch nozzle with reinforcing pad</option>
        <option value="TRUNNION_10IN">Trunnion, 10-inch on a 24-inch pipe</option>
        <option value="LUG_200X100">Lug, 200 × 100 mm footprint</option>
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
          <legend>Load cases at the attachment (WRC 537 axes)</legend>
          <div class="wrc__cases" data-slot="caseTabs"></div>
          <label class="wrc__row wrc__row--name"><span>Case name</span><input data-casename type="text" maxlength="60"></label>
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
          <legend>Code check classification</legend>
          <label class="wrc__row"><span>Load bending stress</span>
            <select data-k="bendingClass">${Object.entries(WRC_BENDING_CLASS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
          <p class="wrc__help">Enter S to check Pm ≤ S, PL ≤ 1.5S and PL+Pb+Q ≤ SPS (ASME VIII-2 Part 5 categories). ASME VIII-2 Table 5.6 classes the shell bending from nozzle loads as Q; choose Pb to be conservative for sustained loads. Leave S blank for stresses only.</p>
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
        <div data-slot="envelope"></div>
        <div data-slot="status"></div>
        <div data-slot="table"></div>
        <div data-slot="check"></div>
        <section class="wrc__fe" data-slot="fe">
          <h3 class="wrc__h">Shell FE cross-check <small>(LAFEA shell solver)</small></h3>
          <p class="wrc__help">Solves this geometry with a thin-shell FE model: a rigid attachment (round, or a stiff plate the size of a rectangular footprint) on a cylinder with clamped ends, about 10 000 DOF. It uses all six of this case's loads (P, Vc, Vl, Mc, Ml, Mt), but not pressure or Kn/Kb. It compares stress intensity at the 8 WRC points and draws the FE stress around the attachment. It takes about 1–2 minutes and runs in the background.</p>
          <p class="wrc__help" data-slot="feScope"></p>
          <button type="button" data-act="runFe">Run shell FE cross-check</button>
          <div data-slot="feResult" aria-live="polite"></div>
        </section>
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
    <fieldset class="wrc__group"><legend>${group}</legend>${fields.map((f) => (f.select ? `
      <label class="wrc__row"${f.only ? ` data-only="${f.only}"` : ''}><span>${f.label}</span>
        <select data-k="${f.key}">${Object.entries(f.select).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>` : `
      <label class="wrc__row"${f.only ? ` data-only="${f.only}"` : ''}><span>${f.label}${f.optional ? ' <small>(optional)</small>' : ''}</span>
        <input data-k="${f.key}" type="number" step="any"${f.signed ? '' : ' min="0"'} inputmode="decimal"><em>${f.unit}</em></label>`)).join('')}
    </fieldset>`).join('');

  const $ = (sel) => host.querySelector(sel);
  const form = $('.wrc__inputs');

  function writeForm() {
    for (const el of host.querySelectorAll('[data-k]')) el.value = state[el.dataset.k] ?? '';
    writeCase();
  }
  function activeCase() { return state.loadCases[state.activeCase]; }
  function writeCase() {
    for (const el of host.querySelectorAll('[data-load]')) el.value = activeCase().loads?.[el.dataset.load] ?? 0;
    $('[data-casename]').value = activeCase().name;
    renderCaseTabs();
  }
  function renderCaseTabs() {
    $('[data-slot="caseTabs"]').innerHTML = `${state.loadCases.map((c, i) => `
      <button type="button" data-case="${i}" class="${i === state.activeCase ? 'is-active' : ''}" aria-pressed="${i === state.activeCase}">${escapeHtml(c.name)}</button>`).join('')}
      <button type="button" data-act="addCase" title="Copy this case as a new one"${state.loadCases.length >= MAX_CASES ? ' disabled' : ''}>+ Add case</button>
      ${state.loadCases.length > 1 ? '<button type="button" data-act="deleteCase" title="Delete this case">Delete case</button>' : ''}`;
  }
  function selectCase(index) {
    state.activeCase = Math.max(0, Math.min(state.loadCases.length - 1, index));
    writeCase();
    render();
  }
  function readForm() {
    const next = { ...state, loadCases: state.loadCases.map((c) => ({ ...c, loads: { ...c.loads } })) };
    for (const el of host.querySelectorAll('[data-k]')) {
      next[el.dataset.k] = el.type === 'number' ? (el.value === '' ? '' : Number(el.value)) : el.value;
    }
    const current = next.loadCases[next.activeCase];
    for (const el of host.querySelectorAll('[data-load]')) current.loads[el.dataset.load] = el.value === '' ? 0 : Number(el.value);
    current.name = $('[data-casename]').value || `Case ${next.activeCase + 1}`;
    return next;
  }

  function render() {
    batch = calculateWrc537Cases(state);
    result = batch.cases[state.activeCase].result; // calculateWrcAttachment: one location, or two with a pad
    let type = 'ROUND';
    if (isRectangular(state)) type = 'RECTANGULAR';
    else if (isTrunnion(state)) type = 'TRUNNION';
    for (const row of host.querySelectorAll('[data-only]')) row.hidden = !row.dataset.only.split(' ').includes(type);
    for (const l of LOADS) {
      host.querySelector(`[data-unit="${l.key}"]`).textContent = ['P', 'Vc', 'Vl'].includes(l.key) ? state.forceUnit : state.momentUnit;
    }
    const chipSets = result.locations.length
      ? result.locations.map((l) => ({ id: l.id, label: result.padded ? l.label : '', g: l.result.geometry }))
      : [{ id: 'ATTACHMENT', label: '', g: deriveWrcGeometry(state) }];
    $('[data-slot="derived"]').innerHTML = chipSets.map(({ id, label, g }) => {
      const tier = Number.isFinite(g.gamma) ? classifyGamma(g.gamma).tier : WRC_TIER.BLOCKED;
      const gammaTone = Number.isFinite(g.gamma) ? ({ SOURCE_QUALIFIED: 'ok', TABULATED_ROW: 'ok', INTERPOLATED: 'warn' }[tier] ?? 'bad') : '';
      const betaOk = g.beta >= WRC_BETA_RANGE.minimum && g.beta <= WRC_BETA_RANGE.maximum;
      return `<div class="wrc__derived-set" data-location="${id}">
        ${label ? `<span class="wrc__derived-label">${escapeHtml(label)}</span>` : ''}
        ${chip(id === 'JUNCTION' ? 'T, shell + pad' : 'T (corroded)', `${fmt(g.T, 2)} mm`)}
        ${chip('Rm', `${fmt(g.Rm, 1)} mm`)}
        ${chip('γ = Rm/T', fmt(g.gamma, 2), gammaTone, `Allowed ${WRC_GAMMA_GRID[0]}–${WRC_GAMMA_GRID.at(-1)}`)}
        ${g.rectangular ? `${chip('β1 = c1/Rm', fmt(g.beta1, 3))}${chip('β2 = c2/Rm', fmt(g.beta2, 3))}
        ${chip('β1/β2', fmt(g.ratio, 3), Number.isFinite(g.ratio) ? (g.ratio >= 0.25 - 1e-12 && g.ratio <= 4 + 1e-12 ? 'ok' : 'bad') : '', 'Allowed 0.25–4 (WRC 537 Tables 6–8)')}`
    : chip('β = 0.875·r0/Rm', fmt(g.beta, 3), Number.isFinite(g.beta) ? (betaOk ? 'ok' : 'bad') : '', 'Allowed 0.05–0.5')}</div>`;
    }).join('');

    renderEnvelope();
    renderCheck();
    renderFe();
    const tierClass = { SOURCE_QUALIFIED: 'ok', TABULATED_ROW: 'ok', INTERPOLATED: 'warn', BLOCKED: 'bad' }[result.tier];
    if (result.ok) {
      const gov = result.governing;
      $('[data-slot="status"]').innerHTML = `
        <div class="wrc__tier wrc__tier--${tierClass}">${WRC_TIER_TEXT[result.tier]}</div>
        <div class="wrc__gov"><span>Governing stress intensity</span>
          <strong>${fmt(gov.stressIntensity, 2)} <small>MPa</small></strong>
          <span>at point <b>${gov.location}</b>${result.padded ? `, ${escapeHtml(gov.label.toLowerCase())}` : ''}. This is the maximum over the 8 WRC points${result.padded ? ' at each location' : ''} only.</span></div>
        ${result.locations.filter((l) => l.result.factorSpread).map((l) => spreadHtml(l, result.padded)).join('')}`;
      $('[data-slot="table"]').innerHTML = result.locations.map((l) => {
        const r = l.result;
        const isGovLocation = l.id === gov.locationId;
        return `${result.padded ? `<h3 class="wrc__h" data-location="${l.id}">${escapeHtml(l.label)} <small>${fmt(r.governing.stressIntensity, 2)} MPa at ${r.governing.location}</small></h3>` : ''}
        <table class="wrc__table wrc__points" data-location="${l.id}"><thead><tr><th>Point</th><th>σφ circ.</th><th>σx long.</th><th>τ shear</th><th>Stress intensity</th></tr></thead>
        <tbody>${r.rows.map((row) => `<tr${isGovLocation && row.location === gov.location ? ' class="is-gov"' : ''}>
          <td>${row.location}</td><td>${fmt(row.circumferential, 2)}</td><td>${fmt(row.longitudinal, 2)}</td><td>${fmt(row.shear, 2)}</td><td><b>${fmt(row.stressIntensity, 2)}</b></td></tr>`).join('')}
        </tbody><caption>MPa (N/mm²). u = outside surface, l = inside surface. A, B on the longitudinal axis; C, D on the circumferential axis.${result.padded ? ` T = ${fmt(r.geometry.T, 2)} mm, attachment ${r.geometry.rectangular ? `${fmt(2 * r.geometry.c2, 1)} along × ${fmt(2 * r.geometry.c1, 1)} around` : `diameter ${fmt(2 * r.geometry.r0, 1)}`} mm.` : ''}</caption></table>${r.rectangular ? rectTermsTable(r, l.id) : ''}`;
      }).join('');
    } else {
      $('[data-slot="status"]').innerHTML = `
        <div class="wrc__tier wrc__tier--bad">Not calculated</div>
        <ul class="wrc__reasons">${result.reasons.map((r) => `<li>${escapeHtml(r.text)}${r.fix ? `<br><span>→ ${escapeHtml(r.fix)}</span>` : ''}</li>`).join('')}</ul>`;
      $('[data-slot="table"]').innerHTML = '';
    }
    $('[data-slot="notes"]').innerHTML = `
      ${result.warnings.length ? `<ul class="wrc__notes">${result.warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join('')}</ul>` : ''}
      <p class="wrc__help">Only stress in the shell at the attachment${hasPad(state) ? ' and at the pad edge' : ''} is calculated, not in the ${attachmentNoun(state)}${hasPad(state) ? ', pad or its welds' : ' or its weld'}. Pressure adds the thin-shell membrane stress only.</p>`;
    save(state);
  }

  function renderEnvelope() {
    const slot = $('[data-slot="envelope"]');
    if (batch.cases.length < 2) { slot.innerHTML = ''; return; }
    const hasCheck = batch.cases.some((c) => c.result.codeCheck);
    slot.innerHTML = `
      <table class="wrc__table wrc__envelope"><thead><tr><th>Load case</th><th>Governing SI</th><th>Point</th><th>PL</th>${hasCheck ? '<th>Worst ratio</th>' : ''}</tr></thead>
      <tbody>${batch.cases.map((c, i) => {
        const r = c.result;
        const pl = r.ok ? Math.max(...r.locations.flatMap((l) => l.result.rows.map((row) => row.membraneIntensity))) : NaN;
        const gov = r.ok && batch.governing && batch.governing.name === c.name && r.governing.stressIntensity === batch.governing.stressIntensity;
        return `<tr data-case="${i}" class="${i === state.activeCase ? 'is-active' : ''}${gov ? ' is-gov' : ''}">
          <td>${escapeHtml(c.name)}</td>
          <td>${r.ok ? `<b>${fmt(r.governing.stressIntensity, 2)}</b>` : '<span class="wrc__bad">not calculated</span>'}</td>
          <td>${r.ok ? `${r.governing.location}${r.padded ? ` <small>${SHORT_LOCATION[r.governing.locationId]}</small>` : ''}` : '—'}</td><td>${fmt(pl, 2)}</td>
          ${hasCheck ? `<td>${r.codeCheck ? ratioCell(r.codeCheck.worst) : '—'}</td>` : ''}</tr>`;
      }).join('')}</tbody>
      <caption>All load cases, MPa. Click a case to see its detail. ${batch.governing ? `Envelope: ${escapeHtml(batch.governing.name)}, ${fmt(batch.governing.stressIntensity, 2)} MPa at ${batch.governing.location}${batch.governing.locationId === 'ATTACHMENT' ? '' : ` ${SHORT_LOCATION[batch.governing.locationId]}`}.` : ''}${batch.codeCheck ? ` Code check: <b class="${batch.codeCheck.pass ? 'wrc__ok' : 'wrc__bad'}">${batch.codeCheck.pass ? 'all cases pass' : 'fails'}</b> (worst: ${escapeHtml(batch.codeCheck.worstCase)}).` : ''}</caption></table>`;
  }

  /**
   * The WRC result the FE model stands for: the active case without pressure or Kn/Kb, at the pad edge
   * when there is a pad (see wrcFeReference). `feMode` says whether FE is compared with it, or runs
   * alone for a lug WRC 537 refuses.
   */
  function feReference() {
    return wrcFeReference({ ...state, loads: { ...state.loadCases[state.activeCase].loads } });
  }
  function feKey() {
    const c = state.loadCases[state.activeCase];
    return JSON.stringify([state.shellOutsideDiameter, state.shellThickness, state.corrosionAllowance, state.attachmentType, state.attachmentOutsideDiameter,
      state.attachmentLength, state.attachmentWidth, state.padOutsideDiameter, state.padLength, state.padWidth, state.padThickness,
      state.cylinderLength, state.attachmentStation, state.forceUnit, state.momentUnit, state.coordinate,
      ...LOADS.map((l) => c.loads[l.key])]);
  }
  function runFe() {
    const reference = feReference();
    if (reference.feMode === WRC_FE_MODE.BLOCKED) { fe = { key: feKey(), status: 'error', error: 'The WRC calculation for this case is blocked, so there is nothing to compare.' }; renderFe(); return; }
    if (!LOADS.some((l) => reference.loadsBase[l.key])) {
      fe = { key: feKey(), status: 'error', error: 'This case has no loads, so there is nothing to compare.' }; renderFe(); return;
    }
    let worker;
    try {
      worker = new Worker(new URL('../lafea/nozzle-worker.js', import.meta.url), { type: 'module' });
    } catch (error) {
      fe = { key: feKey(), status: 'error', error: `Could not start the background solver: ${error.message}` }; renderFe(); return;
    }
    const key = feKey();
    const started = Date.now();
    fe = { key, status: 'running', reference, started };
    renderFe();
    const tick = setInterval(() => { if (fe?.status === 'running') renderFe(); }, 1000);
    worker.onmessage = (event) => {
      clearInterval(tick);
      worker.terminate();
      fe = event.data.ok
        ? { key, status: 'done', reference, result: event.data.result }
        : { key, status: 'error', error: feErrorText(event.data.error) };
      renderFe();
    };
    worker.onerror = (event) => {
      clearInterval(tick);
      worker.terminate();
      fe = { key, status: 'error', error: event.message || 'The background solver failed.' };
      renderFe();
    };
    worker.postMessage({ wrcResult: JSON.parse(JSON.stringify(reference)), options: { plugFactor: 4 } });
  }
  function renderFe() {
    const slot = $('[data-slot="feResult"]');
    const button = $('[data-act="runFe"]');
    button.disabled = fe?.status === 'running';
    const now = feReference();
    const scope = [];
    if (isRectangular(state)) {
      scope.push('For a rectangular attachment the FE model is a stiff plate the size of the footprint, carrying the loads. '
        + 'Its corners concentrate stress, so the highest value next to a corner is shown separately; it depends on the mesh.');
    }
    if (now.feMode === WRC_FE_MODE.FE_ONLY) {
      scope.push(`WRC 537 has no result for this ${attachmentNoun(state)} (${feOnlyReasonText(now.reasons)}), so the FE model gives the only stresses here. `
        + 'For a plate welded straight to the shell, enter the weld footprint as the width: plate thickness plus both weld legs.');
    }
    if (hasPad(state)) scope.push('With a pad, the FE model checks the pad edge: the pad is the rigid attachment on the bare shell. The check at the attachment (shell + pad) is not cross-checked.');
    $('[data-slot="feScope"]').textContent = scope.join(' ');
    if (!fe) { slot.innerHTML = ''; return; }
    const stale = fe.key !== feKey();
    if (fe.status === 'running') {
      slot.innerHTML = `<p class="wrc__help">Solving… ${Math.round((Date.now() - fe.started) / 1000)} s</p>`;
      return;
    }
    if (fe.status === 'error') { slot.innerHTML = `<p class="wrc__bad">${escapeHtml(fe.error)}</p>`; return; }
    const r = fe.result;
    const ref = fe.reference;
    const caseName = escapeHtml(state.loadCases[state.activeCase].name);
    const meshText = `Mesh ${r.mesh.nodeCount} nodes, ${r.mesh.dofs} DOF, solved in ${fmt(r.milliseconds / 1000, 0)} s.${r.lengthAssumed ? ` No cylinder length was given, so L = ${fmt(r.geometry.length, 0)} mm (8·Rm) was assumed.` : ''}`;
    const padText = ref.feLocation?.id === 'PAD_EDGE' ? ' Compared at the pad edge (shell only).' : '';
    let table;
    if (ref.feMode === WRC_FE_MODE.FE_ONLY) {
      table = `<table class="wrc__table wrc__fetable wrc__fetable--only"><thead><tr><th>Point</th><th>σφ circ.</th><th>σx long.</th><th>τ shear</th><th>Shell FE SI</th></tr></thead>
      <tbody>${r.rows.map((row) => `<tr${row.location === r.feGoverning.location ? ' class="is-gov"' : ''}><td>${row.location}</td><td>${fmt(row.feCircumferential, 2)}</td><td>${fmt(row.feLongitudinal, 2)}</td><td>${fmt(row.feShear, 2)}</td><td><b>${fmt(row.fe, 2)}</b></td></tr>`).join('')}</tbody>
      <caption>MPa, all six loads of case "${caseName}", without pressure or Kn/Kb. FE only: WRC 537 has no result for this ${attachmentNoun(state)}.${padText} Highest of the 8 points: FE ${fmt(r.feGoverning.fe, 2)} at ${r.feGoverning.location}. ${meshText}</caption></table>`;
    } else {
      const wrcGov = ref.governing;
      const ratio = r.feGoverning.fe / wrcGov.stressIntensity;
      table = `<table class="wrc__table wrc__fetable"><thead><tr><th>Point</th><th>WRC 537 SI</th><th>Shell FE SI</th><th>FE / WRC</th></tr></thead>
      <tbody>${r.rows.map((row, i) => {
        const w = ref.rows[i].stressIntensity;
        return `<tr${row.location === r.feGoverning.location ? ' class="is-gov"' : ''}><td>${row.location}</td><td>${fmt(w, 2)}</td><td><b>${fmt(row.fe, 2)}</b></td><td>${w > 0.05 * wrcGov.stressIntensity ? fmt(row.fe / w, 2) : '—'}</td></tr>`;
      }).join('')}</tbody>
      <caption>MPa, all six loads of case "${caseName}", without pressure or Kn/Kb.${padText} Governing: WRC ${fmt(wrcGov.stressIntensity, 2)} at ${wrcGov.location}, FE ${fmt(r.feGoverning.fe, 2)} at ${r.feGoverning.location} (FE / WRC = ${fmt(ratio, 2)}).
      ${meshText}</caption></table>`;
    }
    const peak = r.edgePeak ? `<p class="wrc__fepeak">${escapeHtml(feEdgePeakText(r, ref.feMode === WRC_FE_MODE.COMPARE ? ref.governing.stressIntensity : null))}</p>` : '';
    slot.innerHTML = `
      ${stale ? '<p class="wrc__notes">Inputs have changed since this run. Run it again to compare the current case.</p>' : ''}
      ${table}
      ${peak}
      ${r.field ? buildFeContourHtml(r.field, { caption: FE_CONTOUR_CAPTION }) : ''}
      <p class="wrc__help">${r.rectangular ? FE_LUG_METHOD_NOTE : FE_METHOD_NOTE}</p>`;
    const contour = slot.querySelector('.fe-contour');
    if (contour && r.field) attachContourHover(contour, r.field);
  }

  function attachContourHover(contour, field) {
    const readout = contour.querySelector('[data-role="fe-contour-readout"]');
    const idle = 'Point at a plot to read the stress intensity there.';
    readout.textContent = idle;
    for (const svg of contour.querySelectorAll('svg[data-surface]')) {
      const surface = svg.dataset.surface;
      svg.addEventListener('mousemove', (event) => {
        const matrix = svg.getScreenCTM();
        if (!matrix) return;
        const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
        const s = point.x;
        const x = -point.y;
        const hit = triangleAt(field, s, x);
        if (hit) {
          readout.textContent = `${surface === 'u' ? 'Outside' : 'Inside'} surface: ${hit[surface].toFixed(2)} MPa at s = ${Math.round(s)} mm, x = ${Math.round(x)} mm (element average).`;
        } else {
          readout.textContent = insideAttachment(field, s, x) ? 'Inside the attachment: not part of the shell result.' : idle;
        }
      });
      svg.addEventListener('mouseleave', () => { readout.textContent = idle; });
    }
  }

  function renderCheck() {
    const slot = $('[data-slot="check"]');
    const cc = result.ok ? result.codeCheck : null;
    if (!cc) { slot.innerHTML = ''; return; }
    const first = result.locations[0].result.codeCheck;
    const rows = result.locations.flatMap((l) => l.result.codeCheck.items.map((i) => `<tr${result.padded ? ` data-location="${l.id}"` : ''}><td>${escapeHtml(i.label)}</td>${result.padded ? `<td>${SHORT_LOCATION[l.id]}</td>` : ''}<td>${i.location}</td><td>${fmt(i.value, 2)}</td><td>${fmt(i.limit, 1)} <small>(${i.limitText})</small></td><td>${ratioCell(i)}</td></tr>`));
    slot.innerHTML = `
      <h3 class="wrc__h">Code check: <span class="${cc.pass ? 'wrc__ok' : 'wrc__bad'}">${cc.pass ? 'PASS' : 'FAIL'}</span></h3>
      <table class="wrc__table wrc__check"><thead><tr><th>Category</th>${result.padded ? '<th>Location</th>' : ''}<th>Point</th><th>Stress</th><th>Limit</th><th>Ratio</th></tr></thead>
      <tbody>${rows.join('')}</tbody>
      <caption>MPa. S = ${fmt(first.S, 1)}, SPS = ${fmt(first.Sps, 1)}. Stress intensity (Tresca). PL is the membrane part: pressure, WRC membrane and shear.${result.padded ? ' Pm uses the wall at each location.' : ''} A screening check with your allowables, not a full code assessment.</caption></table>`;
  }

  function setCase(next) {
    state = normalizeCase(next);
    writeForm();
    render();
  }

  form.addEventListener('input', (event) => {
    state = readForm();
    if (event.target.matches('[data-casename]')) renderCaseTabs();
    render();
  });
  form.addEventListener('change', () => { state = readForm(); render(); });
  form.addEventListener('submit', (event) => event.preventDefault());

  host.addEventListener('click', (event) => {
    const caseEl = event.target.closest('[data-case]');
    if (caseEl) { selectCase(Number(caseEl.dataset.case)); return; }
    const act = event.target.closest('[data-act]')?.dataset.act;
    if (act === 'runFe') { runFe(); return; }
    if (act === 'addCase' && state.loadCases.length < MAX_CASES) {
      state.loadCases.push({ name: `Case ${state.loadCases.length + 1}`, loads: { ...activeCase().loads } });
      selectCase(state.loadCases.length - 1);
    }
    if (act === 'deleteCase' && state.loadCases.length > 1) {
      state.loadCases.splice(state.activeCase, 1);
      selectCase(Math.min(state.activeCase, state.loadCases.length - 1));
    }
    if (act === 'save') downloadFile(`${slug(state.title)}.wrc.json`, JSON.stringify({ schema: CASE_SCHEMA, case: state }, null, 2), 'application/json');
    if (act === 'open') $('[data-act="file"]').click();
    if (act === 'print') printReport(batch);
    if (act === 'download') downloadFile(`${slug(state.title)}-wrc537-report.html`, reportHtml(batch), 'text/html');
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
      setCase(loaded);
    } catch (error) {
      globalThis.alert?.(`Could not open the case: ${error.message}`);
    }
  });

  writeForm();
  render();

  function reportHtml(r) {
    // Include the FE cross-check only when it was run on the current inputs.
    const currentFe = fe?.status === 'done' && fe.key === feKey()
      ? { caseName: activeCase().name, reference: fe.reference, result: fe.result }
      : null;
    return buildWrcReportHtml(r, { appVersion: typeof __BUILD_TIME__ === 'string' ? `build ${__BUILD_TIME__}` : '', fe: currentFe });
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
    getBatch: () => batch,
    getFe: () => fe,
    setCase,
    destroy() { host.replaceChildren(); host.classList.remove('wrc'); },
  };
}

function attachmentNoun(c) {
  if (isTrunnion(c)) return 'trunnion';
  if (isRectangular(c)) return 'lug';
  return 'nozzle';
}

/** Plain text for the FE model's own refusals; anything else is shown as it came. */
const FE_ERROR_TEXT = Object.freeze({
  PATCH_OUTSIDE_CYLINDER: 'The FE model needs room around the attachment that does not fit between the cylinder ends. Move the attachment away from the end, or give a longer cylinder.',
  PATCH_WRAPS_CIRCUMFERENCE: 'The attachment is too large around the shell for the FE model.',
});
function feErrorText(message) {
  const key = Object.keys(FE_ERROR_TEXT).find((k) => String(message).includes(k));
  return key ? FE_ERROR_TEXT[key] : message;
}

/** The Table 7/8 interpolation spread of one location (roadmap PL-01), as one line under the governing value. */
function spreadHtml(location, padded) {
  const sp = location.result.factorSpread;
  const skipped = sp.corners.filter((c) => c.skipped).length;
  const where = padded ? ` ${escapeHtml(location.label.toLowerCase())}` : '';
  if (!Number.isFinite(sp.low)) {
    return `<p class="wrc__spread wrc__spread--wide" data-location="${location.id}">Table 7/8 interpolation spread${where}: not available, every corner run was outside the method.</p>`;
  }
  return `<p class="wrc__spread${sp.wide ? ' wrc__spread--wide' : ''}" data-location="${location.id}" title="The lug run again with the printed Table 7/8 rows on each side of the interpolation instead (lower or upper β1/β2 row × lower or upper γ row). Not a proven bound.">
    Table 7/8 interpolation spread${where}: <b>${fmt(sp.low, 2)}–${fmt(sp.high, 2)} MPa</b> with the nearest printed rows instead
    (${fmt(100 * sp.width, 1)}% of ${fmt(location.result.governing.stressIntensity, 2)} MPa${sp.wide ? ', wide: check it by FE or a benchmark' : ''})${skipped ? `; ${skipped} of ${sp.corners.length} corner runs were outside the method` : ''}.</p>`;
}

const TERM_LABEL = Object.freeze({
  Pmem_AB: 'P membrane, A/B', Pmem_CD: 'P membrane, C/D', Pbend_AB: 'P bending, A/B', Pbend_CD: 'P bending, C/D',
  Mcmem: 'Mc membrane', Mcbend: 'Mc bending', Mlmem: 'ML membrane', Mlbend: 'ML bending',
});
/** The equivalent β of each term of a rectangular attachment (WRC 537 §4.2.2), loads that are not zero only. */
function rectTermsTable(r, locationId) {
  const rows = ['circ', 'long'].flatMap((family) => Object.entries(r.provenance[family])
    .filter(([, p]) => !p.unused)
    .map(([key, p]) => `<tr><td>${family === 'circ' ? 'σφ' : 'σx'}: ${TERM_LABEL[key]}</td><td>${escapeHtml(p.figure)}</td><td>${fmt(p.beta, 4)}</td><td>${p.tableFactor ? `${p.tableFactor.kind} ${fmt(p.tableFactor.value, 3)}` : '—'}${p.factorApproximate ? ' <small>(approx.)</small>' : ''}</td><td>${escapeHtml(p.basis)}</td></tr>`));
  if (!rows.length) return '';
  return `<table class="wrc__table wrc__terms" data-location="${locationId}"><thead><tr><th>Term</th><th>Curve</th><th>β used</th><th>Table factor</th><th>Basis</th></tr></thead>
    <tbody>${rows.join('')}</tbody><caption>Rectangular attachment: β1 = ${fmt(r.rectangular.beta1, 4)}, β2 = ${fmt(r.rectangular.beta2, 4)}, β1/β2 = ${fmt(r.rectangular.ratio, 3)}. Each term is read on its curve at its own β, and that β is used in its stress formula.</caption></table>`;
}

function chip(label, value, tone = '', title = '') {
  return `<div class="wrc__chip ${tone ? `wrc__chip--${tone}` : ''}" title="${title}"><span>${label}</span><b>${value}</b></div>`;
}
function cloneCase(c) { return JSON.parse(JSON.stringify(c)); }
function ratioCell(item) {
  return `<span class="${item.pass ? 'wrc__ok' : 'wrc__bad'}">${fmt(item.ratio, 2)} ${item.pass ? 'pass' : 'FAIL'}</span>`;
}
/** Fill defaults and turn an old single-load case (`loads`) into the load-case list. */
function normalizeCase(c) {
  const src = cloneCase(c ?? {});
  const merged = { ...cloneCase(DEFAULT_CASE), ...src };
  let cases = Array.isArray(src.loadCases) ? src.loadCases.filter((x) => x && typeof x === 'object') : [];
  if (!cases.length) cases = [{ name: 'Case 1', loads: { ...DEFAULT_CASE.loads, ...(src.loads ?? {}) } }];
  merged.loadCases = cases.slice(0, MAX_CASES).map((x, i) => ({
    name: String(x.name || `Case ${i + 1}`).slice(0, 60),
    loads: Object.fromEntries(Object.keys(DEFAULT_CASE.loads).map((k) => [k, Number(x.loads?.[k] ?? 0) || 0])),
  }));
  merged.activeCase = Number.isInteger(src.activeCase) && src.activeCase >= 0 && src.activeCase < merged.loadCases.length ? src.activeCase : 0;
  delete merged.loads;
  return merged;
}
function slug(text) { return (String(text || 'wrc-case').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'wrc-case').slice(0, 60); }
function escapeHtml(text) { return String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function loadSaved() {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? normalizeCase(parsed) : null;
  } catch { return null; }
}
function save(c) { try { globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(c)); } catch { /* storage optional */ } }
