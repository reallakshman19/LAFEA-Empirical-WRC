/**
 * WRC 537 calculator panel: plain inputs → live results, report, save/open.
 */
import './wrc.css';
import {
  DEFAULT_CASE, EXAMPLE_CASES, FORCE_UNITS, MOMENT_UNITS, WRC_BETA_RANGE, WRC_COORDINATES,
  WRC_ATTACHMENT_TYPES, WRC_TRUNNION_CONSTRUCTION, WRC_BENDING_CLASS, WRC_FE_MODE, WRC_GAMMA_GRID, WRC_TIER, WRC_TIER_TEXT,
  classifyGamma, deriveWrcGeometry, fmt, hasPad, isRectangular, isTrunnion, wrcFeReference,
} from './wrc-calc.js';
import { buildWrcReportHtml } from './wrc-report.js';
import { buildVesselSketchHtml } from './vessel-sketch.js';
import {
  EXAMPLE_VESSELS, MAX_ATTACHMENTS, MAX_CASES, addAttachment, caseFor, checkVessel, cleanAngle, normalizeCase, normalizeVessel,
  removeAttachment, vesselFile, vesselFromCase, vesselFromFile, withCase,
} from './vessel-model.js';
import {
  FE_CONTOUR_CAPTION, FE_LUG_METHOD_NOTE, FE_METHOD_NOTE, buildFeContourHtml, feEdgePeakText, feOnlyReasonText, insideAttachment, triangleAt,
} from './fe-contour.js';
import {
  UNIT_SYSTEMS, convertCaseUnits, feFieldIn, fromDisplay, lengthText, roundSig, stressText, toDisplay, unitSystem,
} from './wrc-units.js';

const STORAGE_KEY = 'lafea-emp-app/wrc-case'; // before canvas A2: one case, read once and kept as a fallback
const VESSEL_KEY = 'lafea-emp-app/wrc-vessel';
const HELP_KEY = 'lafea-emp-app/wrc-help';

/**
 * The form. `kind` 'length' is stored in mm and 'stress' (stress or pressure) in MPa, and shown in the
 * case's units (wrc-units.js). `help` is shown under the input and read with it by screen readers.
 */
const FIELDS = [
  { group: 'Shell (cylinder)', key: 'shellOutsideDiameter', label: 'Outside diameter', kind: 'length',
    help: 'Outside diameter of the shell, as built.' },
  { group: 'Shell (cylinder)', key: 'shellThickness', label: 'Nominal thickness', kind: 'length',
    help: 'Wall thickness as built. The corrosion allowance is taken off it.' },
  { group: 'Shell (cylinder)', key: 'corrosionAllowance', label: 'Corrosion allowance', kind: 'length',
    help: 'Taken off the wall before γ and the stresses are worked out. 0 for none.' },
  { group: 'Attachment', key: 'attachmentName', label: 'Name', text: true,
    help: 'Its tag on the drawing and in the table of all attachments, for example N1 or L2.' },
  { group: 'Attachment', key: 'attachmentType', label: 'Type', select: WRC_ATTACHMENT_TYPES,
    help: 'Nozzle: a pipe that opens the shell. Trunnion: a round support that does not. Rectangular: a lug or plate.' },
  { group: 'Attachment', key: 'trunnionConstruction', label: 'Trunnion construction', select: WRC_TRUNNION_CONSTRUCTION, only: 'TRUNNION',
    help: 'Shown in the report. WRC 537 gives a solid bar and a pipe of the same diameter the same shell stress.' },
  { group: 'Attachment', key: 'attachmentOutsideDiameter', label: 'Outside diameter at shell', kind: 'length', only: 'ROUND TRUNNION',
    help: 'Where it meets the shell. WRC 537 needs β = 0.875·r0/Rm from 0.05 to 0.5.' },
  { group: 'Attachment', key: 'attachmentLength', label: 'Length along the shell (2·c2)', kind: 'length', only: 'RECTANGULAR',
    help: 'Footprint length along the cylinder axis.' },
  { group: 'Attachment', key: 'attachmentWidth', label: 'Width around the shell (2·c1)', kind: 'length', only: 'RECTANGULAR',
    help: 'Footprint width around the shell. For a plate welded straight to the shell: plate thickness plus both weld legs.' },
  { group: 'Attachment', key: 'attachmentAngle', label: 'Position around the shell', unit: '°',
    help: 'Degrees clockwise from the top, looking from the end the position along is measured from. Used for the drawing only: the loads are in this attachment\'s own WRC 537 axes.' },
  { group: 'Reinforcing pad (optional)', key: 'padOutsideDiameter', label: 'Pad outside diameter', kind: 'length', optional: true, only: 'ROUND TRUNNION',
    help: 'Blank for no pad. With a pad, the shell is also checked at the pad edge.' },
  { group: 'Reinforcing pad (optional)', key: 'padLength', label: 'Pad length along the shell', kind: 'length', optional: true, only: 'RECTANGULAR',
    help: 'Blank for no pad. With a pad, the shell is also checked at the pad edge.' },
  { group: 'Reinforcing pad (optional)', key: 'padWidth', label: 'Pad width around the shell', kind: 'length', optional: true, only: 'RECTANGULAR',
    help: 'Blank for no pad.' },
  { group: 'Reinforcing pad (optional)', key: 'padThickness', label: 'Pad thickness', kind: 'length', optional: true,
    help: 'Added to the shell wall at the attachment. Blank for no pad.' },
  { group: 'Cylinder length (WRC 537 §4.5.2)', key: 'cylinderLength', label: 'Length between heads or stiffeners', kind: 'length', optional: true,
    help: 'Used to check the attachment is far enough from the ends. Blank skips that check.' },
  { group: 'Cylinder length (WRC 537 §4.5.2)', key: 'attachmentStation', label: 'Attachment position from one end', kind: 'length', optional: true,
    help: 'From one head or stiffener to the centre of the attachment.' },
  { group: 'Pressure and stress concentration', key: 'designPressure', label: 'Design pressure (internal +)', kind: 'stress', signed: true,
    help: 'Adds the thin-shell membrane stress p·Rm/T (hoop) and p·Rm/2T (along). Negative for external pressure.' },
  { group: 'Pressure and stress concentration', key: 'Kn', label: 'Kn, membrane factor',
    help: 'Multiplies the membrane stress from the loads. 1 for none.' },
  { group: 'Pressure and stress concentration', key: 'Kb', label: 'Kb, bending factor',
    help: 'Multiplies the bending stress from the loads. 1 for none.' },
  { group: 'Allowables (optional)', key: 'allowableS', label: 'Allowable stress S', kind: 'stress', optional: true,
    help: 'At design temperature. Blank shows the stresses only, with no code check.' },
  { group: 'Allowables (optional)', key: 'allowableSps', label: 'SPS (blank = 3S)', kind: 'stress', optional: true,
    help: 'Limit for PL + Pb + Q. Blank uses 3S.' },
];
const KIND = Object.fromEntries(FIELDS.filter((f) => f.kind).map((f) => [f.key, f.kind]));

const LOADS = [
  { key: 'P', label: 'P', hint: 'radial force', help: '+ pushes the attachment into the shell, − pulls it out.' },
  { key: 'Vc', label: 'Vc', hint: 'circumferential shear', help: 'Shear force at the shell, around the circumference.' },
  { key: 'Vl', label: 'Vl', hint: 'longitudinal shear', help: 'Shear force at the shell, along the cylinder axis.' },
  { key: 'Mc', label: 'Mc', hint: 'circumferential moment', help: 'Bends the attachment around the circumference: largest at C and D.' },
  { key: 'Ml', label: 'Ml', hint: 'longitudinal moment', help: 'Bends the attachment along the cylinder axis: largest at A and B.' },
  { key: 'Mt', label: 'Mt', hint: 'torsion', help: 'Twists the attachment about its own axis. WRC 537 has no torsion method for a lug; the FE model takes it.' },
];

const SHORT_LOCATION = Object.freeze({ ATTACHMENT: '', JUNCTION: 'shell + pad', PAD_EDGE: 'pad edge' });
const TIER_SHORT = Object.freeze({ SOURCE_QUALIFIED: 'γ = 5 row', TABULATED_ROW: 'tabulated γ row', INTERPOLATED: 'interpolated γ' });

export function mountWrcCalculator(host) {
  const doc = host.ownerDocument;
  // The vessel (canvas A2) holds every attachment; `state` is the active one as the calculator's case, which
  // the form edits. sync() writes it back into the vessel.
  let vessel = loadSavedVessel() ?? vesselFromCase(loadSaved() ?? DEFAULT_CASE);
  let state = caseFor(vessel);
  let check = null;
  let batch = null;
  let result = null;
  let fe = null; // { key, status: 'running' | 'done' | 'error', reference, result, error }

  host.classList.add('wrc');
  host.innerHTML = `
    <h1 class="ui-sr-only">WRC 537 local stress calculator</h1>
    <div class="wrc__bar">
      <label class="wrc__title">Title <input data-k="title" type="text" maxlength="120" aria-describedby="wrc-help-title"></label>
      <span class="ui-sr-only" id="wrc-help-title">The vessel's title. Shown on the report and used for the file names.</span>
      <label class="wrc__sys">Units <select data-k="units" aria-describedby="wrc-help-units">${Object.values(UNIT_SYSTEMS).map((s) => `<option value="${s.id}">${s.label}</option>`).join('')}</select></label>
      <span class="ui-sr-only" id="wrc-help-units">Lengths, pressure and stresses. The loads switch to the matching units, so the case itself does not change.</span>
      <label class="wrc__helptoggle"><input type="checkbox" data-act="helpToggle"> Help text</label>
      <select data-act="example" aria-label="Load an example" aria-describedby="wrc-help-example">
        <option value="">Examples…</option>
        <option value="DEFAULT">Blank nozzle-on-cylinder (starting point)</option>
        <option value="GAMMA5_ORACLE">Check case: γ = 5, hand calc</option>
        <option value="CAESAR_GAMMA48">Check case: CAESAR II, γ = 48</option>
        <option value="PAD_36IN">36-inch nozzle with reinforcing pad</option>
        <option value="TRUNNION_10IN">Trunnion, 10-inch on a 24-inch pipe</option>
        <option value="LUG_200X100">Lug, 200 × 100 mm footprint</option>
        <option value="VESSEL:TWO_NOZZLES_LUG">Vessel: two nozzles and a lug</option>
      </select>
      <span class="ui-sr-only" id="wrc-help-example">Replaces the whole vessel with a worked case. The units you chose are kept.</span>
      <span class="wrc__spacer"></span>
      <button type="button" data-act="open">Open file…</button>
      <button type="button" data-act="save">Save file</button>
      <button type="button" data-act="print">Print report</button>
      <button type="button" data-act="download">Download report</button>
      <input type="file" accept=".json,application/json" data-act="file" hidden>
    </div>
    <section class="wrc__canvas" aria-labelledby="wrc-canvas-heading">
      <h2 class="wrc__canvas-h" id="wrc-canvas-heading">Vessel</h2>
      <div class="wrc__atts" role="group" aria-label="Attachments on this shell" aria-describedby="wrc-help-attachments" data-slot="attachments"></div>
      <p class="wrc__fieldhelp" id="wrc-help-attachments">Pick an attachment to edit it in the form below. The shell, pressure, allowables and method settings are shared by all of them; type, size, pad, position, Kn/Kb and load cases belong to each one.</p>
      <details class="wrc__sketch" open><summary>Sketch</summary><div data-slot="sketch"></div></details>
      <div data-slot="vesselTable"></div>
    </section>
    <div class="wrc__body">
      <div class="wrc__summary" data-role="wrc-summary">
        <span data-slot="summary"></span>
        <button type="button" data-act="toResults">Results ↓</button>
      </div>
      <form class="wrc__inputs" autocomplete="off" novalidate aria-label="Inputs">
        <div data-slot="fields"></div>
        <fieldset class="wrc__group">
          <legend>Load cases at the attachment (WRC 537 axes)</legend>
          <div class="wrc__cases" data-slot="caseTabs"></div>
          <label class="wrc__row wrc__row--name"><span>Case name</span><input data-casename type="text" maxlength="60" aria-describedby="wrc-help-casename"></label>
          <p class="wrc__fieldhelp" id="wrc-help-casename">Shown in the envelope table and the report.</p>
          <div class="wrc__units">
            <label>Force <select data-k="forceUnit" aria-describedby="wrc-help-loadunits"></select></label>
            <label>Moment <select data-k="momentUnit" aria-describedby="wrc-help-loadunits"></select></label>
          </div>
          <p class="wrc__fieldhelp" id="wrc-help-loadunits">The units of the numbers below, for every load case. Changing one does not convert the numbers.</p>
          <div class="wrc__loads">${LOADS.map((l) => `
            <label><span><b>${l.label}</b> <small>${l.hint}</small></span>
              <input data-load="${l.key}" type="number" step="any" inputmode="decimal" aria-describedby="wrc-help-load-${l.key} wrc-help-signs"><em data-unit="${l.key}"></em></label>
            <p class="wrc__fieldhelp" id="wrc-help-load-${l.key}">${l.help}</p>`).join('')}
          </div>
          <p class="wrc__help" id="wrc-help-signs">Signs follow WRC 537 Figure 2. This is the same convention CAESAR II uses for its WRC input, confirmed against a CAESAR II benchmark. Enter 0 for any load you don't have.</p>
        </fieldset>
        <fieldset class="wrc__group">
          <legend>Code check classification</legend>
          <label class="wrc__row"><span>Load bending stress</span>
            <select data-k="bendingClass" aria-describedby="wrc-help-bendingClass">${Object.entries(WRC_BENDING_CLASS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
          <p class="wrc__help" id="wrc-help-bendingClass">Enter S to check Pm ≤ S, PL ≤ 1.5S and PL+Pb+Q ≤ SPS (ASME VIII-2 Part 5 categories). ASME VIII-2 Table 5.6 classes the shell bending from nozzle loads as Q; choose Pb to be conservative for sustained loads. Leave S blank for stresses only.</p>
        </fieldset>
        <fieldset class="wrc__group">
          <legend>Between tabulated γ rows</legend>
          <label class="wrc__row"><span>Interpolation</span>
            <select data-k="coordinate" aria-describedby="wrc-help-coordinate">${Object.entries(WRC_COORDINATES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
          <p class="wrc__help" id="wrc-help-coordinate">WRC 537 tabulates γ = ${WRC_GAMMA_GRID.join(', ')}. Any other γ is interpolated between the two nearest rows.</p>
        </fieldset>
      </form>
      <section class="wrc__results" aria-labelledby="wrc-results-heading">
        <h2 class="ui-sr-only wrc__results-h" id="wrc-results-heading" tabindex="-1">Results</h2>
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
          <div data-slot="feResult"></div>
        </section>
        <div data-slot="notes"></div>
      </section>
    </div>
    <p class="ui-sr-only" role="status" data-role="wrc-live"></p>`;

  // Build geometry fields grouped
  const groups = new Map();
  for (const f of FIELDS) {
    if (!groups.has(f.group)) groups.set(f.group, []);
    groups.get(f.group).push(f);
  }
  // Each field: its row (label, input, unit) and its help line, hidden together when it does not apply.
  const fieldHtml = (f) => {
    const described = `aria-describedby="wrc-help-${f.key}"`;
    let control;
    if (f.select) control = `<select data-k="${f.key}" ${described}>${Object.entries(f.select).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>`;
    else if (f.text) control = `<input data-k="${f.key}" type="text" maxlength="40" ${described}>`;
    else control = `<input data-k="${f.key}" type="number" step="any"${f.signed ? '' : ' min="0"'} inputmode="decimal" ${described}><em${f.kind ? ` data-unit-kind="${f.kind}"` : ''}>${f.unit ?? ''}</em>`;
    return `<div class="wrc__field"${f.only ? ` data-only="${f.only}"` : ''}>
      <label class="wrc__row"><span>${f.label}${f.optional ? ' <small>(optional)</small>' : ''}</span>${control}</label>
      <p class="wrc__fieldhelp" id="wrc-help-${f.key}">${f.help}</p></div>`;
  };
  host.querySelector('[data-slot="fields"]').innerHTML = [...groups].map(([group, fields]) => `
    <fieldset class="wrc__group"><legend>${group}</legend>${fields.map(fieldHtml).join('')}</fieldset>`).join('');

  const $ = (sel) => host.querySelector(sel);
  const form = $('.wrc__inputs');
  // Results are in mm and MPa; these show them in the case's units.
  const U = () => unitSystem(state);
  const L = (mm, digits) => lengthText(mm, digits, U());
  const S = (mpa, digits) => stressText(mpa, digits, U());

  // Help text under every input: on unless turned off, remembered in this browser.
  let showHelp = true;
  try { showHelp = globalThis.localStorage?.getItem(HELP_KEY) !== 'off'; } catch { /* storage optional */ }
  function applyHelp() {
    host.classList.toggle('wrc--nohelp', !showHelp);
    $('[data-act="helpToggle"]').checked = showHelp;
  }
  applyHelp();

  /**
   * Significant figures a box shows: 10 in SI (what was typed), 7 in US (a converted mm value such as
   * 39.37008 in). An untouched box keeps its exact stored value either way (readForm).
   */
  const figures = (u) => (u.id === 'SI' ? 10 : 7);
  /** A stored value (mm or MPa) as the form shows it in the case's units. */
  function shown(key, u) {
    const value = KIND[key] ? toDisplay(KIND[key], state[key], u) : state[key];
    return value === '' || value === null || value === undefined ? '' : (KIND[key] ? roundSig(value, figures(u)) : value);
  }
  /** The force and moment unit lists for the case's system. */
  function writeLoadUnitOptions(u) {
    for (const [key, list] of [['forceUnit', u.force], ['momentUnit', u.moment]]) {
      const select = $(`[data-k="${key}"]`);
      if ([...select.options].map((o) => o.value).join('|') !== list.join('|')) {
        select.innerHTML = list.map((unit) => `<option>${unit}</option>`).join('');
      }
    }
  }
  function writeForm() {
    const u = unitSystem(state);
    writeLoadUnitOptions(u);
    for (const el of host.querySelectorAll('[data-k]')) el.value = shown(el.dataset.k, u);
    writeCase();
  }
  function activeCase() { return state.loadCases[state.activeCase]; }
  /** A stored load as its box shows it (a converted load has more figures than that). */
  const loadShown = (value) => roundSig(Number(value ?? 0), figures(U()));
  function writeCase() {
    for (const el of host.querySelectorAll('[data-load]')) el.value = loadShown(activeCase().loads?.[el.dataset.load]);
    $('[data-casename]').value = activeCase().name;
    renderCaseTabs();
  }
  /** Drawing the case buttons again drops the keyboard focus: note which case button had it… */
  function caseFocus() {
    const el = doc.activeElement;
    if (!el?.matches?.('button[data-case]') || !host.contains(el)) return null;
    return { el, selector: `${el.closest('.wrc__envelope') ? '.wrc__envelope' : '.wrc__cases'} button[data-case="${el.dataset.case}"]` };
  }
  /** …and put it back on the new button for the same case. */
  function restoreCaseFocus(saved) {
    if (saved && !saved.el.isConnected) $(saved.selector)?.focus();
  }
  function renderCaseTabs() {
    const saved = caseFocus();
    drawCaseTabs();
    restoreCaseFocus(saved);
  }
  function drawCaseTabs() {
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
  /** The form as a case: lengths back to mm and stresses to MPa. The system itself changes only in switchUnits. */
  function readForm() {
    const u = unitSystem(state);
    const next = { ...state, loadCases: state.loadCases.map((c) => ({ ...c, loads: { ...c.loads } })) };
    for (const el of host.querySelectorAll('[data-k]')) {
      const key = el.dataset.k;
      if (key === 'units') continue;
      const value = el.type === 'number' ? (el.value === '' ? '' : Number(el.value)) : el.value;
      // An untouched box keeps its exact stored value, so showing it in inches does not move it.
      next[key] = KIND[key] && value !== '' ? (String(value) === String(shown(key, u)) ? state[key] : fromDisplay(KIND[key], value, u)) : value;
    }
    const current = next.loadCases[next.activeCase];
    const stored = state.loadCases[state.activeCase].loads ?? {};
    for (const el of host.querySelectorAll('[data-load]')) {
      const typed = el.value === '' ? 0 : Number(el.value);
      // An untouched box keeps the exact stored load (a converted one has more figures than it shows).
      current.loads[el.dataset.load] = String(typed) === String(loadShown(stored[el.dataset.load])) ? stored[el.dataset.load] : typed;
    }
    current.name = $('[data-casename]').value || `Case ${next.activeCase + 1}`;
    return next;
  }

  function sync() {
    vessel = withCase(vessel, vessel.active, state);
    return vessel;
  }

  function render() {
    const savedFocus = caseFocus();
    check = checkVessel(sync()); // every attachment, each on its own
    batch = check.rows[vessel.active].batch;
    result = batch.cases[state.activeCase].result; // calculateWrcAttachment: one location, or two with a pad
    let type = 'ROUND';
    if (isRectangular(state)) type = 'RECTANGULAR';
    else if (isTrunnion(state)) type = 'TRUNNION';
    for (const row of host.querySelectorAll('[data-only]')) row.hidden = !row.dataset.only.split(' ').includes(type);
    renderCanvas();
    for (const em of host.querySelectorAll('[data-unit-kind]')) em.textContent = em.dataset.unitKind === 'length' ? U().length : U().stress;
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
        ${chip(id === 'JUNCTION' ? 'T, shell + pad' : 'T (corroded)', `${L(g.T, 2)} ${U().length}`)}
        ${chip('Rm', `${L(g.Rm, 1)} ${U().length}`)}
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
          <strong>${S(gov.stressIntensity, 2)} <small>${U().stress}</small></strong>
          <span>at point <b>${gov.location}</b>${result.padded ? `, ${escapeHtml(gov.label.toLowerCase())}` : ''}. This is the maximum over the 8 WRC points${result.padded ? ' at each location' : ''} only.</span></div>
        ${result.locations.filter((l) => l.result.factorSpread).map((l) => spreadHtml(l, result.padded, U())).join('')}`;
      $('[data-slot="table"]').innerHTML = result.locations.map((l) => {
        const r = l.result;
        const isGovLocation = l.id === gov.locationId;
        return `${result.padded ? `<h3 class="wrc__h" data-location="${l.id}">${escapeHtml(l.label)} <small>${S(r.governing.stressIntensity, 2)} ${U().stress} at ${r.governing.location}</small></h3>` : ''}
        <table class="wrc__table wrc__points" data-location="${l.id}"><thead><tr><th>Point</th><th>σφ circ.</th><th>σx long.</th><th>τ shear</th><th>Stress intensity</th></tr></thead>
        <tbody>${r.rows.map((row) => `<tr${isGovLocation && row.location === gov.location ? ' class="is-gov"' : ''}>
          <td>${row.location}</td><td>${S(row.circumferential, 2)}</td><td>${S(row.longitudinal, 2)}</td><td>${S(row.shear, 2)}</td><td><b>${S(row.stressIntensity, 2)}</b></td></tr>`).join('')}
        </tbody><caption>${U().stressLong}. u = outside surface, l = inside surface. A, B on the longitudinal axis; C, D on the circumferential axis.${result.padded ? ` T = ${L(r.geometry.T, 2)} ${U().length}, attachment ${r.geometry.rectangular ? `${L(2 * r.geometry.c2, 1)} along × ${L(2 * r.geometry.c1, 1)} around` : `diameter ${L(2 * r.geometry.r0, 1)}`} ${U().length}.` : ''}</caption></table>${r.rectangular ? rectTermsTable(r, l.id) : ''}`;
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
    renderSummary(result.ok ? tierClass : 'bad');
    restoreCaseFocus(savedFocus);
    saveVessel(vessel);
  }

  /** The other attachments as cases, for the sketch and the report. */
  const otherCases = () => vessel.attachments.map((_, i) => i).filter((i) => i !== vessel.active).map((i) => caseFor(vessel, i));

  /** Canvas A2: the attachment buttons, the sketch of the whole shell and the table of all attachments. */
  function renderCanvas() {
    const focusedAtt = doc.activeElement?.closest?.('[data-attachment]');
    const focusSel = focusedAtt && host.contains(focusedAtt)
      ? `${focusedAtt.closest('.wrc__vessel') ? '.wrc__vessel' : '.wrc__atts'} [data-attachment="${focusedAtt.dataset.attachment}"]` : null;
    const n = vessel.attachments.length;
    $('[data-slot="attachments"]').innerHTML = `${vessel.attachments.map((a, i) => `
      <button type="button" data-attachment="${i}" class="${i === vessel.active ? 'is-active' : ''}" aria-pressed="${i === vessel.active}">${escapeHtml(a.attachmentName)} <small>${escapeHtml(attachmentSize(caseFor(vessel, i)))}</small></button>`).join('')}
      <button type="button" data-act="addAttachment" title="Copy the selected attachment as a new one, a quarter turn further round"${n >= MAX_ATTACHMENTS ? ' disabled' : ''}>+ Add attachment</button>
      ${n > 1 ? '<button type="button" data-act="deleteAttachment" title="Delete the selected attachment">Delete attachment</button>' : ''}`;
    $('[data-slot="sketch"]').innerHTML = buildVesselSketchHtml(state, { others: otherCases(), count: n });
    $('[data-slot="vesselTable"]').innerHTML = n > 1 ? vesselTableHtml() : '';
    if (focusSel && !focusedAtt.isConnected) $(focusSel)?.focus();
  }
  function attachmentSize(c) {
    const u = unitSystem(c);
    // As typed: 6 significant figures in SI, 4 in US (the sketch's labels read the same).
    const len = (mm) => (mm === '' || !Number.isFinite(Number(mm)) ? '?' : `${Number(roundSig(Number(mm) / u.mmPer, u.id === 'SI' ? 6 : 4))}`);
    if (isRectangular(c)) return `${attachmentNoun(c)} ${len(c.attachmentLength)} × ${len(c.attachmentWidth)} ${u.length}`;
    return `${attachmentNoun(c)} Ø${len(c.attachmentOutsideDiameter)} ${u.length}`;
  }
  function vesselTableHtml() {
    const rows = check.rows.map((row) => {
      const c = row.input;
      const gov = row.governing;
      const cc = row.batch.codeCheck;
      const station = c.attachmentStation === '' || c.attachmentStation === null || c.attachmentStation === undefined ? '—' : L(Number(c.attachmentStation), 0);
      const govRow = row.index === check.governingIndex;
      return `<tr data-attachment-row="${row.index}" class="${row.index === vessel.active ? 'is-active' : ''}${govRow ? ' is-gov' : ''}">
        <td><button type="button" class="wrc__linkbtn" data-attachment="${row.index}"${row.index === vessel.active ? ' aria-current="true"' : ''}>${escapeHtml(row.name)}</button></td>
        <td>${escapeHtml(attachmentSize(c))}</td><td>${station}</td><td>${fmt(cleanAngle(c.attachmentAngle), 0)}°</td>
        <td>${gov ? `<b>${S(gov.stressIntensity, 2)}</b>` : '<span class="wrc__bad">not calculated</span>'}</td>
        <td>${gov ? `${gov.location}${gov.locationId && gov.locationId !== 'ATTACHMENT' ? ` <small>${SHORT_LOCATION[gov.locationId]}</small>` : ''}` : '—'}</td>
        <td>${gov ? escapeHtml(gov.name) : '—'}</td>
        <td>${cc ? `<span class="${cc.pass ? 'wrc__ok' : 'wrc__bad'}">${cc.pass ? 'pass' : 'FAIL'}</span>` : '—'}</td></tr>`;
    }).join('');
    const g = check.governingIndex === null ? null : check.rows[check.governingIndex];
    return `<div class="wrc__vessel-wrap"><table class="wrc__table wrc__vessel"><thead><tr><th>Attachment</th><th>Type and size</th><th>Along (${U().length})</th><th>Around</th><th>Governing SI (${U().stress})</th><th>Point</th><th>Load case</th><th>Code check</th></tr></thead>
      <tbody>${rows}</tbody>
      <caption>All attachments on this shell, the worst load case of each. Pick one to edit it.${g ? ` Highest: ${escapeHtml(g.name)}, ${S(g.governing.stressIntensity, 2)} ${U().stress}.` : ''} Each attachment is checked on its own: WRC 537 does not cover two attachments close together.</caption></table></div>`;
  }
  function selectAttachment(index) {
    sync();
    vessel = { ...vessel, active: Math.max(0, Math.min(vessel.attachments.length - 1, index)) };
    state = caseFor(vessel);
    writeForm();
    render();
  }
  function setVessel(next) {
    vessel = normalizeVessel(next);
    state = caseFor(vessel);
    writeForm();
    render();
  }

  /**
   * The governing result in one line: in the strip that stays in view when the form and the results
   * are in one column (a tablet held upright, a phone), and, as a sentence, for screen readers.
   */
  function renderSummary(tone) {
    const multi = batch.cases.length > 1 ? `${activeCase().name}: ` : '';
    const cc = result.ok ? result.codeCheck : null;
    let line;
    let spoken;
    if (result.ok) {
      const gov = result.governing;
      const where = result.padded ? `, ${gov.label.toLowerCase()}` : '';
      line = `${multi}governing ${S(gov.stressIntensity, 2)} ${U().stress} at ${gov.location}${where} · ${TIER_SHORT[result.tier]}${cc ? ` · code check ${cc.pass ? 'PASS' : 'FAIL'}` : ''}`;
      spoken = `${multi}governing stress intensity ${S(gov.stressIntensity, 2)} ${U().stress} at point ${gov.location}${where}.${cc ? ` Code check ${cc.pass ? 'passes' : 'fails'}.` : ''}`;
    } else {
      line = `${multi}not calculated: ${result.reasons[0]?.text ?? 'check the inputs.'}`;
      spoken = `${multi}not calculated. ${result.reasons[0]?.text ?? ''}`;
    }
    const strip = $('[data-role="wrc-summary"]');
    strip.className = `wrc__summary wrc__summary--${tone}`;
    strip.querySelector('[data-slot="summary"]').textContent = line.charAt(0).toUpperCase() + line.slice(1);
    announce(spoken.charAt(0).toUpperCase() + spoken.slice(1));
  }

  /** Says `text` to screen readers once typing pauses, instead of reading the whole results panel. */
  let announceTimer = null;
  function announce(text) {
    clearTimeout(announceTimer);
    announceTimer = setTimeout(() => {
      const live = $('[data-role="wrc-live"]');
      if (live && live.textContent !== text) live.textContent = text;
    }, 500);
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
          <td><button type="button" class="wrc__linkbtn" data-case="${i}"${i === state.activeCase ? ' aria-current="true"' : ''}>${escapeHtml(c.name)}</button></td>
          <td>${r.ok ? `<b>${S(r.governing.stressIntensity, 2)}</b>` : '<span class="wrc__bad">not calculated</span>'}</td>
          <td>${r.ok ? `${r.governing.location}${r.padded ? ` <small>${SHORT_LOCATION[r.governing.locationId]}</small>` : ''}` : '—'}</td><td>${S(pl, 2)}</td>
          ${hasCheck ? `<td>${r.codeCheck ? ratioCell(r.codeCheck.worst) : '—'}</td>` : ''}</tr>`;
      }).join('')}</tbody>
      <caption>All load cases, ${U().stress}. Pick a case to see its detail. ${batch.governing ? `Envelope: ${escapeHtml(batch.governing.name)}, ${S(batch.governing.stressIntensity, 2)} ${U().stress} at ${batch.governing.location}${batch.governing.locationId === 'ATTACHMENT' ? '' : ` ${SHORT_LOCATION[batch.governing.locationId]}`}.` : ''}${batch.codeCheck ? ` Code check: <b class="${batch.codeCheck.pass ? 'wrc__ok' : 'wrc__bad'}">${batch.codeCheck.pass ? 'all cases pass' : 'fails'}</b> (worst: ${escapeHtml(batch.codeCheck.worstCase)}).` : ''}</caption></table>`;
  }

  /**
   * The WRC result the FE model stands for: the active case without pressure or Kn/Kb, at the pad edge
   * when there is a pad (see wrcFeReference). `feMode` says whether FE is compared with it, or runs
   * alone for a lug WRC 537 refuses.
   */
  function feReference() {
    return wrcFeReference({ ...state, loads: { ...state.loadCases[state.activeCase].loads } });
  }
  /** What the FE run depends on, with the loads in N and N·mm: switching units does not make a run stale. */
  function feKey() {
    const c = state.loadCases[state.activeCase];
    const toBase = (l) => roundSig(Number(c.loads[l.key]) * (['P', 'Vc', 'Vl'].includes(l.key) ? FORCE_UNITS[state.forceUnit] : MOMENT_UNITS[state.momentUnit]), 6);
    return JSON.stringify([state.shellOutsideDiameter, state.shellThickness, state.corrosionAllowance, state.attachmentType, state.attachmentOutsideDiameter,
      state.attachmentLength, state.attachmentWidth, state.padOutsideDiameter, state.padLength, state.padWidth, state.padThickness,
      state.cylinderLength, state.attachmentStation, state.coordinate, ...LOADS.map(toBase)]);
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
    const what = reference.feMode === WRC_FE_MODE.FE_ONLY ? 'Shell FE run' : 'Shell FE cross-check';
    fe = { key, status: 'running', reference, started };
    renderFe();
    announce(`${what} started. It takes about 1 to 2 minutes.`);
    // The seconds counter is not announced; the start and the end are.
    const tick = setInterval(() => { if (fe?.status === 'running') renderFe(); }, 1000);
    worker.onmessage = (event) => {
      clearInterval(tick);
      worker.terminate();
      fe = event.data.ok
        ? { key, status: 'done', reference, result: event.data.result }
        : { key, status: 'error', error: feErrorText(event.data.error) };
      renderFe();
      announce(fe.status === 'done'
        ? `${what} finished: highest FE stress intensity ${S(fe.result.feGoverning.fe, 2)} ${U().stress} at point ${fe.result.feGoverning.location}.`
        : `${what} failed. ${fe.error}`);
    };
    worker.onerror = (event) => {
      clearInterval(tick);
      worker.terminate();
      fe = { key, status: 'error', error: event.message || 'The background solver failed.' };
      renderFe();
      announce(`${what} failed. ${fe.error}`);
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
    const u = U();
    const meshText = `Mesh ${r.mesh.nodeCount} nodes, ${r.mesh.dofs} DOF, solved in ${fmt(r.milliseconds / 1000, 0)} s.${r.lengthAssumed ? ` No cylinder length was given, so L = ${L(r.geometry.length, 0)} ${u.length} (8·Rm) was assumed.` : ''}`;
    const padText = ref.feLocation?.id === 'PAD_EDGE' ? ' Compared at the pad edge (shell only).' : '';
    let table;
    if (ref.feMode === WRC_FE_MODE.FE_ONLY) {
      table = `<table class="wrc__table wrc__fetable wrc__fetable--only"><thead><tr><th>Point</th><th>σφ circ.</th><th>σx long.</th><th>τ shear</th><th>Shell FE SI</th></tr></thead>
      <tbody>${r.rows.map((row) => `<tr${row.location === r.feGoverning.location ? ' class="is-gov"' : ''}><td>${row.location}</td><td>${S(row.feCircumferential, 2)}</td><td>${S(row.feLongitudinal, 2)}</td><td>${S(row.feShear, 2)}</td><td><b>${S(row.fe, 2)}</b></td></tr>`).join('')}</tbody>
      <caption>${u.stress}, all six loads of case "${caseName}", without pressure or Kn/Kb. FE only: WRC 537 has no result for this ${attachmentNoun(state)}.${padText} Highest of the 8 points: FE ${S(r.feGoverning.fe, 2)} at ${r.feGoverning.location}. ${meshText}</caption></table>`;
    } else {
      const wrcGov = ref.governing;
      const ratio = r.feGoverning.fe / wrcGov.stressIntensity;
      table = `<table class="wrc__table wrc__fetable"><thead><tr><th>Point</th><th>WRC 537 SI</th><th>Shell FE SI</th><th>FE / WRC</th></tr></thead>
      <tbody>${r.rows.map((row, i) => {
        const w = ref.rows[i].stressIntensity;
        return `<tr${row.location === r.feGoverning.location ? ' class="is-gov"' : ''}><td>${row.location}</td><td>${S(w, 2)}</td><td><b>${S(row.fe, 2)}</b></td><td>${w > 0.05 * wrcGov.stressIntensity ? fmt(row.fe / w, 2) : '—'}</td></tr>`;
      }).join('')}</tbody>
      <caption>${u.stress}, all six loads of case "${caseName}", without pressure or Kn/Kb.${padText} Governing: WRC ${S(wrcGov.stressIntensity, 2)} at ${wrcGov.location}, FE ${S(r.feGoverning.fe, 2)} at ${r.feGoverning.location} (FE / WRC = ${fmt(ratio, 2)}).
      ${meshText}</caption></table>`;
    }
    const peak = r.edgePeak ? `<p class="wrc__fepeak">${escapeHtml(feEdgePeakText(r, ref.feMode === WRC_FE_MODE.COMPARE ? ref.governing.stressIntensity : null, u))}</p>` : '';
    // The contour is drawn, and read by the pointer, in the case's units.
    const field = feFieldIn(r.field, u);
    slot.innerHTML = `
      ${stale ? '<p class="wrc__notes">Inputs have changed since this run. Run it again to compare the current case.</p>' : ''}
      ${table}
      ${peak}
      ${field ? buildFeContourHtml(field, { caption: FE_CONTOUR_CAPTION, unitsLabel: u.stress, lengthLabel: u.length, stressDigits: u.id === 'SI' ? 2 : 0 }) : ''}
      <p class="wrc__help">${r.rectangular ? FE_LUG_METHOD_NOTE : FE_METHOD_NOTE}</p>`;
    const contour = slot.querySelector('.fe-contour');
    if (contour && field) attachContourHover(contour, field, u);
  }

  /** `field` is in display units `u` (feFieldIn), so the pointer position reads straight off it. */
  function attachContourHover(contour, field, u) {
    const readout = contour.querySelector('[data-role="fe-contour-readout"]');
    const idle = 'Point at a plot to read the stress intensity there.';
    readout.textContent = idle;
    for (const svg of contour.querySelectorAll('svg[data-surface]')) {
      const surface = svg.dataset.surface;
      // Pointer events: a mouse moving over the plot, or a finger tapping or dragging on a tablet.
      const read = (event) => {
        const matrix = svg.getScreenCTM();
        if (!matrix) return;
        const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
        const s = point.x;
        const x = -point.y;
        const hit = triangleAt(field, s, x);
        if (hit) {
          const at = (v) => (u.id === 'SI' ? String(Math.round(v)) : v.toFixed(1));
          readout.textContent = `${surface === 'u' ? 'Outside' : 'Inside'} surface: ${hit[surface].toFixed(u.id === 'SI' ? 2 : 0)} ${u.stress} at s = ${at(s)} ${u.length}, x = ${at(x)} ${u.length} (element average).`;
        } else {
          readout.textContent = insideAttachment(field, s, x) ? 'Inside the attachment: not part of the shell result.' : idle;
        }
      };
      svg.addEventListener('pointermove', read);
      svg.addEventListener('pointerdown', read);
      svg.addEventListener('pointerleave', (event) => { if (event.pointerType === 'mouse') readout.textContent = idle; });
    }
  }

  function renderCheck() {
    const slot = $('[data-slot="check"]');
    const cc = result.ok ? result.codeCheck : null;
    if (!cc) { slot.innerHTML = ''; return; }
    const first = result.locations[0].result.codeCheck;
    const rows = result.locations.flatMap((l) => l.result.codeCheck.items.map((i) => `<tr${result.padded ? ` data-location="${l.id}"` : ''}><td>${escapeHtml(i.label)}</td>${result.padded ? `<td>${SHORT_LOCATION[l.id]}</td>` : ''}<td>${i.location}</td><td>${S(i.value, 2)}</td><td>${S(i.limit, 1)} <small>(${i.limitText})</small></td><td>${ratioCell(i)}</td></tr>`));
    slot.innerHTML = `
      <h3 class="wrc__h">Code check: <span class="${cc.pass ? 'wrc__ok' : 'wrc__bad'}">${cc.pass ? 'PASS' : 'FAIL'}</span></h3>
      <table class="wrc__table wrc__check"><thead><tr><th>Category</th>${result.padded ? '<th>Location</th>' : ''}<th>Point</th><th>Stress</th><th>Limit</th><th>Ratio</th></tr></thead>
      <tbody>${rows.join('')}</tbody>
      <caption>${U().stress}. S = ${S(first.S, 1)}, SPS = ${S(first.Sps, 1)}. Stress intensity (Tresca). PL is the membrane part: pressure, WRC membrane and shear.${result.padded ? ' Pm uses the wall at each location.' : ''} A screening check with your allowables, not a full code assessment.</caption></table>`;
  }

  /** One case replaces the whole vessel, as its only attachment (an example, or a case saved before A2). */
  function setCase(next) {
    vessel = vesselFromCase(next);
    state = caseFor(vessel);
    writeForm();
    render();
  }

  /** Show the same case in another unit system: the form and loads are converted, the results do not change. */
  function switchUnits(id) {
    if (id === unitSystem(state).id) return;
    state = convertCaseUnits(state, id);
    writeForm();
    render();
  }

  // The inputs are in the form and the bar (case title, units), so listen on the whole panel.
  const isInput = (el) => el.matches('[data-k], [data-load], [data-casename]');
  host.addEventListener('input', (event) => {
    if (!isInput(event.target)) return;
    if (event.target.dataset.k === 'units') { switchUnits(event.target.value); return; }
    state = readForm();
    if (event.target.matches('[data-casename]')) renderCaseTabs();
    render();
  });
  // 'input' has already drawn the result; a 'change' on leaving a box that changes nothing must not draw it
  // again, or the case button the keyboard focus is moving to is replaced under it.
  host.addEventListener('change', (event) => {
    if (!isInput(event.target)) return;
    if (event.target.dataset.k === 'units') { switchUnits(event.target.value); return; }
    const next = readForm();
    if (JSON.stringify(next) === JSON.stringify(state)) return;
    state = next;
    render();
  });
  form.addEventListener('submit', (event) => event.preventDefault());

  host.addEventListener('click', (event) => {
    const caseEl = event.target.closest('[data-case]');
    if (caseEl) { selectCase(Number(caseEl.dataset.case)); return; }
    const attEl = event.target.closest('[data-attachment]');
    if (attEl) { selectAttachment(Number(attEl.dataset.attachment)); return; }
    const act = event.target.closest('[data-act]')?.dataset.act;
    if (act === 'addAttachment') {
      vessel = addAttachment(sync());
      state = caseFor(vessel);
      writeForm();
      render();
      $('[data-k="attachmentName"]').focus();
      $('[data-k="attachmentName"]').select();
      return;
    }
    if (act === 'deleteAttachment') {
      vessel = removeAttachment(sync());
      state = caseFor(vessel);
      writeForm();
      render();
      $(`.wrc__atts [data-attachment="${vessel.active}"]`)?.focus();
      return;
    }
    if (act === 'runFe') { runFe(); return; }
    if (act === 'helpToggle') {
      showHelp = event.target.checked;
      try { globalThis.localStorage?.setItem(HELP_KEY, showHelp ? 'on' : 'off'); } catch { /* storage optional */ }
      applyHelp();
      return;
    }
    if (act === 'toResults') {
      $('.wrc__results').scrollIntoView({ block: 'start' });
      $('#wrc-results-heading').focus({ preventScroll: true });
      return;
    }
    if (act === 'addCase' && state.loadCases.length < MAX_CASES) {
      state.loadCases.push({ name: `Case ${state.loadCases.length + 1}`, loads: { ...activeCase().loads } });
      selectCase(state.loadCases.length - 1);
      $('[data-casename]').focus();
    }
    if (act === 'deleteCase' && state.loadCases.length > 1) {
      state.loadCases.splice(state.activeCase, 1);
      selectCase(Math.min(state.activeCase, state.loadCases.length - 1));
      $(`.wrc__cases button[data-case="${state.activeCase}"]`)?.focus();
    }
    if (act === 'save') downloadFile(`${slug(state.title)}.vessel.json`, JSON.stringify(vesselFile(sync()), null, 2), 'application/json');
    if (act === 'open') $('[data-act="file"]').click();
    if (act === 'print') printReport(batch);
    if (act === 'download') downloadFile(`${slug(state.title)}-wrc537-report.html`, reportHtml(batch), 'text/html');
  });
  $('[data-act="example"]').addEventListener('change', (event) => {
    const key = event.target.value;
    event.target.value = '';
    // An example is stored in SI; it opens in the units the user has chosen.
    const units = unitSystem(state).id;
    if (key.startsWith('VESSEL:')) {
      const example = EXAMPLE_VESSELS[key.slice(7)];
      if (example) setVessel({ ...example, shell: { ...example.shell, units } });
      return;
    }
    const example = key === 'DEFAULT' ? DEFAULT_CASE : EXAMPLE_CASES[key];
    if (example) setCase(convertCaseUnits(normalizeCase(example), units));
  });
  $('[data-act="file"]').addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      // A vessel file, or a case saved before canvas A2 (it opens as a vessel with one attachment).
      setVessel(vesselFromFile(JSON.parse(await file.text())));
    } catch (error) {
      globalThis.alert?.(`Could not open the file: ${error.message}`);
    }
  });

  writeForm();
  render();

  function reportHtml(r) {
    // Include the FE cross-check only when it was run on the current inputs.
    const currentFe = fe?.status === 'done' && fe.key === feKey()
      ? { caseName: activeCase().name, reference: fe.reference, result: fe.result }
      : null;
    return buildWrcReportHtml(r, {
      appVersion: typeof __BUILD_TIME__ === 'string' ? `build ${__BUILD_TIME__}` : '',
      fe: currentFe,
      vessel: { name: state.attachmentName, count: vessel.attachments.length, others: otherCases() },
    });
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
    getVessel: () => cloneCase(sync()),
    getResult: () => result,
    getBatch: () => batch,
    getFe: () => fe,
    setCase,
    setVessel,
    destroy() { clearTimeout(announceTimer); host.replaceChildren(); host.classList.remove('wrc'); },
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
function spreadHtml(location, padded, u) {
  const sp = location.result.factorSpread;
  const skipped = sp.corners.filter((c) => c.skipped).length;
  const where = padded ? ` ${escapeHtml(location.label.toLowerCase())}` : '';
  if (!Number.isFinite(sp.low)) {
    return `<p class="wrc__spread wrc__spread--wide" data-location="${location.id}">Table 7/8 interpolation spread${where}: not available, every corner run was outside the method.</p>`;
  }
  return `<p class="wrc__spread${sp.wide ? ' wrc__spread--wide' : ''}" data-location="${location.id}" title="The lug run again with the printed Table 7/8 rows on each side of the interpolation instead (lower or upper β1/β2 row × lower or upper γ row). Not a proven bound.">
    Table 7/8 interpolation spread${where}: <b>${stressText(sp.low, 2, u)}–${stressText(sp.high, 2, u)} ${u.stress}</b> with the nearest printed rows instead
    (${fmt(100 * sp.width, 1)}% of ${stressText(location.result.governing.stressIntensity, 2, u)} ${u.stress}${sp.wide ? ', wide: check it by FE or a benchmark' : ''})${skipped ? `; ${skipped} of ${sp.corners.length} corner runs were outside the method` : ''}.</p>`;
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

/** A derived value. Out of range, its allowed range is written out too: a tooltip alone is lost on a tablet. */
function chip(label, value, tone = '', title = '') {
  return `<div class="wrc__chip ${tone ? `wrc__chip--${tone}` : ''}" title="${title}"><span>${label}</span><b>${value}</b>${tone === 'bad' && title ? `<em>${title}</em>` : ''}</div>`;
}
function cloneCase(c) { return JSON.parse(JSON.stringify(c)); }
function ratioCell(item) {
  return `<span class="${item.pass ? 'wrc__ok' : 'wrc__bad'}">${fmt(item.ratio, 2)} ${item.pass ? 'pass' : 'FAIL'}</span>`;
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
function loadSavedVessel() {
  try {
    const raw = globalThis.localStorage?.getItem(VESSEL_KEY);
    return raw ? normalizeVessel(JSON.parse(raw)) : null;
  } catch { return null; }
}
function saveVessel(v) { try { globalThis.localStorage?.setItem(VESSEL_KEY, JSON.stringify(v)); } catch { /* storage optional */ } }
