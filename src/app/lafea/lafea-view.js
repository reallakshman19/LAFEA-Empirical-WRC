/**
 * LAFEA view: the standalone LAFEA workbench, an example bar and a plate input form.
 *
 * "Load example" re-creates the workbench on the cantilever example through the qualified
 * domain-first route (source → domain → geometry → mesh), so Run works straight away.
 * The plate form builds a rectangular plate, optionally with a central hole, from plain inputs
 * (dimensions, material, edge supports and edge stresses, mesh size) through the same route.
 * "Solve + convergence study" then runs the solve and the governed three-level study on the
 * model's result point, which is what the workbench needs before it will publish results
 * (resultReady).
 */
import './workbench.css';
import { LafeaStandaloneController } from '../../lafea-app/standalone-controller.js';
import { createTechSwitch } from './tech-details.js';
import {
  LAFEA_EXAMPLE,
  buildLafeaExample,
  lafeaExampleConvergenceRequest,
  lafeaExampleHandTipDeflection,
  lafeaExampleMeshProfile,
} from './lafea-example.js';
import {
  PLATE_DEFAULTS,
  PLATE_EDGES,
  PLATE_PROBE_QUANTITIES,
  PLATE_SUPPORTS,
  buildPlateModel,
  normalizePlateInput,
  validatePlateInput,
} from './lafea-plate.js';
import {
  UNIT_SYSTEMS, fromDisplay, lengthText, roundSig, stressText, toDisplay, unitSystem,
} from '../wrc/wrc-units.js';

const STAGE = 'LAFEA.3';
const PLATE_STORAGE_KEY = 'lafea-emp-app/lafea-plate';
// One help-text choice for the whole app: the WRC calculator's "Help text" box uses the same key.
const HELP_KEY = 'lafea-emp-app/wrc-help';
const EDGE_LABEL = { LEFT: 'Left (x = 0)', RIGHT: 'Right (x = L)', BOTTOM: 'Bottom (y = 0)', TOP: 'Top (y = H)' };
const SHEAR_HINT = { LEFT: '+y', RIGHT: '+y', BOTTOM: '+x', TOP: '+x' };

/**
 * The plate form's number fields. `kind` says how a value converts for display: 'length' (stored in
 * mm), 'stress' (stored in MPa) or none. Each has a help line, read by screen readers with the input.
 */
const PLATE_FIELDS = Object.freeze([
  { key: 'length', label: 'Length L (along x)', kind: 'length', help: 'Plate size along x. The origin is the bottom-left corner.' },
  { key: 'height', label: 'Height H (along y)', kind: 'length', help: 'Plate size along y.' },
  { key: 'thickness', label: 'Thickness t', kind: 'length', help: 'Plane stress: the stresses are taken as constant through the thickness.' },
  { key: 'holeDiameter', label: 'Hole diameter d', kind: 'length', hole: true, help: 'The hole is at the plate centre. It must leave at least 5% of the plate on each side.' },
  { key: 'elasticModulus', label: 'Young\'s modulus E', kind: 'stress', help: 'For example 200 000 MPa (29 000 000 psi) for steel.' },
  { key: 'poissonRatio', label: 'Poisson\'s ratio ν', kind: null, help: 'At least 0 and less than 0.5; 0.3 for steel.' },
  { key: 'meshSize', label: 'Mesh size h', kind: 'length', help: 'Target element size. The convergence study also solves h/2 and h/4; near a hole the mesh is finer automatically.' },
]);
const PLATE_KIND = Object.freeze(Object.fromEntries(PLATE_FIELDS.map((f) => [f.key, f.kind])));
const unitOf = (kind, u) => (kind === 'length' ? u.length : kind === 'stress' ? u.stress : '');
/** Significant figures in a box: enough in SI to show any typed value again, 7 after a conversion. */
const figures = (u) => (u.id === 'SI' ? 10 : 7);
/** A stored value as the form shows it in system `u`. */
function shownText(kind, stored, u) {
  const value = kind ? toDisplay(kind, stored, u) : stored;
  return Number.isFinite(value) ? String(kind ? roundSig(value, figures(u)) : value) : '';
}
/** The accessible name of an edge-load box, e.g. "Left (x = 0) edge: normal stress σn, MPa, + = tension". */
function edgeLabel(id, field, u) {
  return field === 'normal'
    ? `${EDGE_LABEL[id]} edge: normal stress σn, ${u.stress}, + = tension`
    : `${EDGE_LABEL[id]} edge: shear τ, ${u.stress}, in ${SHEAR_HINT[id]}`;
}
/** A plate dimension in a sentence: as stored in SI ("400"), to 4 significant figures in US ("15.75"). */
const dim = (mm, u) => (u.id === 'SI' ? `${mm}` : `${roundSig(mm / u.mmPer, 4)}`);

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));
const fmt = (value, digits = 3) => (Number.isFinite(value) ? value.toFixed(digits) : '—');
/** Let the browser paint a status line before a long synchronous solve. */
const nextPaint = () => new Promise((resolve) => { setTimeout(resolve, 30); });

export function mountLafeaView(host, options = {}) {
  const doc = host.ownerDocument;
  const bar = doc.createElement('div');
  bar.className = 'app-examplebar';
  bar.dataset.role = 'lafea-example-bar';
  bar.innerHTML = `
    <span class="app-examplebar__label">Example</span>
    <button type="button" data-lafea-example="load" title="Replace the workbench model with the example and generate its mesh">Load: ${LAFEA_EXAMPLE.title}</button>
    <button type="button" data-lafea-example="solve" disabled title="Solve, then run the 3-level mesh convergence study so results can be published">Solve + convergence study</button>
    <span class="app-examplebar__status" data-lafea-example-status aria-live="polite">No example loaded. Use Import, load the example, or set up a plate below.</span>`;
  bar.append(createTechSwitch(doc));
  const plateForm = doc.createElement('details');
  plateForm.className = 'app-plate';
  plateForm.dataset.role = 'lafea-plate';
  const workbenchHost = doc.createElement('div');
  workbenchHost.className = 'app-workbench-host';
  host.replaceChildren(bar, plateForm, workbenchHost);

  const status = bar.querySelector('[data-lafea-example-status]');
  const solveButton = bar.querySelector('[data-lafea-example="solve"]');
  let controller = new LafeaStandaloneController(workbenchHost, { ...options }).init();
  // The model currently in the workbench: { kind: 'EXAMPLE' | 'PLATE', meshProfile, convergenceRequest, plate? }
  let loaded = null;
  let busy = false;

  function setStatus(text, tone = '') {
    status.textContent = text;
    status.dataset.tone = tone;
  }

  /** Re-create the workbench on a built model and generate its first mesh. Throws on failure. */
  function mountModel(built, meshProfile) {
    controller.destroy();
    controller = new LafeaStandaloneController(workbenchHost, {
      ...options,
      initialStage: STAGE,
      initialDocument: built.source,
      initialSourceHash: built.authority.sourceHash,
    }).init();
    controller.store.activateDomainFirstProfile();
    controller.store.registerAnalysisDomain(built.domain);
    controller.store.registerAnalysisGeometryEvidence(built.geometryEvidence);
    controller.bindAnalysisMeshProfile(meshProfile);
    const generated = controller.generateAnalysisMesh();
    if (generated?.evidence?.qualification !== 'PASS') throw new Error('The mesh did not qualify.');
    return generated.evidence.mesh;
  }

  function loadExample() {
    try {
      const built = buildLafeaExample();
      mountModel(built, lafeaExampleMeshProfile());
      loaded = { kind: 'EXAMPLE', meshProfile: lafeaExampleMeshProfile(), convergenceRequest: lafeaExampleConvergenceRequest() };
      solveButton.disabled = false;
      const ex = LAFEA_EXAMPLE;
      setStatus(`Loaded: ${ex.length} × ${ex.depth} mm plate, t = ${ex.thickness} mm, fixed left edge, end shear ${ex.endShear} MPa. `
        + `Mesh ${ex.coarseMesh} mm qualified. Next: Run, or "Solve + convergence study".`, 'ok');
    } catch (error) {
      loaded = null;
      solveButton.disabled = true;
      setStatus(`Could not load the example: ${error?.code ?? error?.message ?? error}`, 'bad');
    }
    return controller.getState();
  }

  /**
   * Solve on the coarse mesh, then run the 3-level study. `afterCoarse` runs between the two
   * (while the coarse solution is current). Returns the study, or throws.
   */
  function solveAndStudy(afterCoarse = () => {}) {
    // Re-bind the coarse mesh so the study always starts from the model's base level.
    controller.bindAnalysisMeshProfile(loaded.meshProfile);
    controller.generateAnalysisMesh();
    const preflight = controller.store.prepareContinuumForRun();
    if (preflight?.projection?.state !== 'CURRENT_PASS') throw new Error('Pre-run checks did not pass.');
    controller.run();
    afterCoarse();
    return controller.runContinuumConvergenceStudy(loaded.convergenceRequest);
  }
  /** Value of a physical probe on the current solution, or null if it cannot be evaluated. */
  function probeValue(probeRequest) {
    try {
      const evidence = controller.store.evaluateContinuumPhysicalProbe(probeRequest);
      return evidence?.status === 'PASS' ? evidence.authoritativeValue : null;
    } catch {
      return null;
    }
  }

  function solveExample() {
    if (loaded?.kind !== 'EXAMPLE') return null;
    setStatus('Solving and running the 3-level convergence study…');
    try {
      const study = solveAndStudy();
      const levels = study.study.levels.map((level) => ({ h: level.h, value: level.authoritativeValue }));
      const fine = levels.at(-1).value;
      const hand = lafeaExampleHandTipDeflection();
      const stage = controller.getState().stages[STAGE];
      const summary = {
        status: study.status,
        classification: study.projection?.classification ?? null,
        resultReady: stage.lifecycleReadiness.resultReady === true,
        levels,
        fineTipDeflection: fine,
        beamTheoryTipDeflection: hand,
        differencePercent: (fine - hand) / Math.abs(hand) * 100,
      };
      setStatus(`Convergence ${summary.status === 'CURRENT_PASS' ? 'passed' : 'blocked'} (${summary.classification}). `
        + `Tip deflection ${levels.map((l) => l.value.toFixed(4)).join(' → ')} mm at h = ${levels.map((l) => l.h).join(' / ')} mm; `
        + `beam theory ${hand.toFixed(4)} mm, so FE is ${Math.abs(summary.differencePercent).toFixed(1)}% ${Math.abs(fine) < Math.abs(hand) ? 'stiffer' : 'more flexible'}. `
        + `${summary.resultReady ? 'Results are published.' : 'Results are not yet publishable.'}`,
      summary.resultReady ? 'ok' : 'warn');
      return summary;
    } catch (error) {
      setStatus(`Solve or convergence failed: ${error?.code ?? error?.message ?? error}`, 'bad');
      return null;
    }
  }

  // ---- Plate form -------------------------------------------------------------------------

  let plateInput = loadPlateInput();
  plateForm.innerHTML = `
    <summary><b>Set up a plate</b> <span>rectangular plate or plate with a hole: dimensions, material, edge supports and loads, mesh size</span></summary>
    <form class="app-plate__form" autocomplete="off" novalidate>
      <div class="app-plate__bar">
        <label>Units <select data-plate-units aria-describedby="plate-help-units">${Object.values(UNIT_SYSTEMS).map((s) => `<option value="${s.id}">${s.label}</option>`).join('')}</select></label>
        <label class="app-plate__helptoggle"><input type="checkbox" data-plate-helptoggle> Help text</label>
        <p class="app-plate__fieldhelp" id="plate-help-units">The model is always built and solved in mm, N and MPa; this only changes what the form and results show.</p>
      </div>
      <div class="app-plate__grid">
        <div class="app-plate__field">
          <label>Shape <select data-plate="shape" aria-describedby="plate-help-shape">
            <option value="HOLE">Plate with a central round hole</option>
            <option value="RECT">Rectangular plate</option></select></label>
          <p class="app-plate__fieldhelp" id="plate-help-shape">A rectangle, or a rectangle with a round hole at its centre for a stress concentration (Kt) check.</p>
        </div>
        ${PLATE_FIELDS.map((f) => `
        <div class="app-plate__field"${f.hole ? ' data-plate-hole' : ''}>
          <label>${f.label} <span><input data-plate="${f.key}" type="number" step="any" min="0"${f.key === 'poissonRatio' ? ' max="0.5"' : ''} inputmode="decimal" aria-describedby="plate-help-${f.key}">${f.kind ? ` <em data-plate-unit="${f.kind}">${unitOf(f.kind, UNIT_SYSTEMS.SI)}</em>` : ''}</span></label>
          <p class="app-plate__fieldhelp" id="plate-help-${f.key}">${esc(f.help)}</p>
        </div>`).join('')}
      </div>
      <div class="app-plate__edges-wrap"><table class="app-plate__edges">
        <thead><tr><th>Edge</th><th>Support</th><th>Normal stress σn <small><span data-plate-unit="stress">MPa</span>, + = tension</small></th><th>Shear τ <small data-plate-unit="stress">MPa</small></th></tr></thead>
        <tbody>${PLATE_EDGES.map((id) => `
          <tr><td>${EDGE_LABEL[id]}</td>
            <td><select data-edge="${id}" data-field="support" aria-label="${EDGE_LABEL[id]} edge: support" aria-describedby="plate-help-edges">${Object.entries(PLATE_SUPPORTS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></td>
            <td><input data-edge="${id}" data-field="normal" type="number" step="any" inputmode="decimal" aria-label="${edgeLabel(id, 'normal', UNIT_SYSTEMS.SI)}" aria-describedby="plate-help-edges"></td>
            <td><input data-edge="${id}" data-field="shear" type="number" step="any" inputmode="decimal" aria-label="${edgeLabel(id, 'shear', UNIT_SYSTEMS.SI)}" aria-describedby="plate-help-edges"> <small>in ${SHEAR_HINT[id]}</small></td></tr>`).join('')}
        </tbody>
      </table></div>
      <p class="app-plate__fieldhelp" id="plate-help-edges">Fixed stops both directions; a roller stops one. σn is a uniform normal stress (+ pulls the edge outward); τ is a uniform shear along the edge, in +x on the bottom and top edges and in +y on the left and right edges. A fixed edge cannot take a load.</p>
      <fieldset class="app-plate__probe">
        <legend>Result point (checked by the convergence study)</legend>
        <label><input type="checkbox" data-plate-probe="auto" aria-describedby="plate-help-probe"> Automatic: total displacement at the middle of the most loaded edge. (For a hole, the peak stress and Kt at the hole edge are reported as well.)</label>
        <span data-plate-probe-custom>
          <label>x <input data-plate-probe="x" type="number" step="any" inputmode="decimal" aria-describedby="plate-help-probe"> <em data-plate-unit="length">mm</em></label>
          <label>y <input data-plate-probe="y" type="number" step="any" inputmode="decimal" aria-describedby="plate-help-probe"> <em data-plate-unit="length">mm</em></label>
          <label>Quantity <select data-plate-probe="quantityId" aria-describedby="plate-help-probe">${Object.entries(PLATE_PROBE_QUANTITIES).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}</select></label>
        </span>
        <p class="app-plate__fieldhelp" id="plate-help-probe">Automatic suits most plates. Otherwise pick a point inside the material, not on an edge or in the hole; a displacement converges more steadily than a stress.</p>
      </fieldset>
      <p class="app-plate__help">Plane stress, quadratic triangles (T6). The convergence study solves 3 meshes: h, h/2 and h/4. Near a hole the mesh is finer automatically. A large plate with a small h can take a minute. Origin at the bottom-left corner; the hole is at the plate centre.</p>
      <div class="app-plate__actions">
        <button type="button" data-plate-act="build">Build model</button>
        <button type="button" data-plate-act="solve" disabled>Solve + convergence study</button>
        <button type="button" data-plate-act="reset">Reset to the Kt example</button>
      </div>
      <ul class="app-plate__errors" data-plate-errors aria-live="polite"></ul>
      <div class="app-plate__result" data-plate-result aria-live="polite"></div>
    </form>`;
  const $p = (selector) => plateForm.querySelector(selector);
  const plateSolveButton = $p('[data-plate-act="solve"]');

  /** Put a stored value in a box, shown in the form's units; remember the text to spot an edit. */
  function writeBox(el, kind, stored) {
    el.value = kind ? shownText(kind, stored, unitSystem(plateInput)) : (stored ?? '');
    el.dataset.shown = el.value;
  }
  /** A box's value in stored units (mm, MPa). An untouched box keeps its exact stored value. */
  function readBox(el, kind, stored) {
    if (!kind || el.value === '') return el.value;
    if (el.value === el.dataset.shown && Number.isFinite(stored)) return stored;
    return fromDisplay(kind, Number(el.value), unitSystem(plateInput));
  }

  function writePlateForm() {
    const u = unitSystem(plateInput);
    for (const el of plateForm.querySelectorAll('[data-plate]')) writeBox(el, PLATE_KIND[el.dataset.plate], plateInput[el.dataset.plate]);
    for (const el of plateForm.querySelectorAll('[data-edge]')) {
      const stored = plateInput.edges[el.dataset.edge][el.dataset.field];
      writeBox(el, el.dataset.field === 'support' ? null : 'stress', stored);
      if (el.dataset.field !== 'support') el.setAttribute('aria-label', edgeLabel(el.dataset.edge, el.dataset.field, u));
    }
    const auto = !plateInput.probe;
    $p('[data-plate-probe="auto"]').checked = auto;
    writeBox($p('[data-plate-probe="x"]'), 'length', plateInput.probe?.x ?? '');
    writeBox($p('[data-plate-probe="y"]'), 'length', plateInput.probe?.y ?? '');
    $p('[data-plate-probe="quantityId"]').value = plateInput.probe?.quantityId ?? 'PRINCIPAL_MAXIMUM';
    $p('[data-plate-units]').value = u.id;
    for (const el of plateForm.querySelectorAll('[data-plate-unit]')) el.textContent = unitOf(el.dataset.plateUnit, u);
    syncPlateVisibility();
  }
  function readPlateForm() {
    const raw = { title: plateInput.title, units: plateInput.units, edges: {} };
    for (const el of plateForm.querySelectorAll('[data-plate]')) {
      raw[el.dataset.plate] = readBox(el, PLATE_KIND[el.dataset.plate], plateInput[el.dataset.plate]);
    }
    for (const id of PLATE_EDGES) raw.edges[id] = {};
    for (const el of plateForm.querySelectorAll('[data-edge]')) {
      const kind = el.dataset.field === 'support' ? null : 'stress';
      const value = readBox(el, kind, plateInput.edges[el.dataset.edge][el.dataset.field]);
      raw.edges[el.dataset.edge][el.dataset.field] = value === '' ? 0 : value;
    }
    raw.probe = $p('[data-plate-probe="auto"]').checked ? null : {
      x: readBox($p('[data-plate-probe="x"]'), 'length', plateInput.probe?.x),
      y: readBox($p('[data-plate-probe="y"]'), 'length', plateInput.probe?.y),
      quantityId: $p('[data-plate-probe="quantityId"]').value,
    };
    return normalizePlateInput(raw);
  }
  /** Show the form in another system. The stored values (mm, MPa) do not change. */
  function switchPlateUnits(id) {
    plateInput = { ...readPlateForm(), units: UNIT_SYSTEMS[id] ? id : 'SI' };
    writePlateForm();
    savePlateInput(plateInput);
  }
  // Help text under every input: on unless turned off (shared with the WRC calculator).
  let showHelp = true;
  try { showHelp = globalThis.localStorage?.getItem(HELP_KEY) !== 'off'; } catch { /* storage optional */ }
  function applyHelp() {
    plateForm.classList.toggle('app-plate--nohelp', !showHelp);
    $p('[data-plate-helptoggle]').checked = showHelp;
  }
  function syncPlateVisibility() {
    $p('[data-plate-hole]').hidden = $p('[data-plate="shape"]').value !== 'HOLE';
    $p('[data-plate-probe-custom]').hidden = $p('[data-plate-probe="auto"]').checked;
  }
  function showPlateErrors(errors) {
    $p('[data-plate-errors]').innerHTML = errors.map((text) => `<li>${esc(text)}</li>`).join('');
  }

  function loadPlate(raw) {
    if (raw) { plateInput = normalizePlateInput(raw); writePlateForm(); }
    plateInput = readPlateForm();
    savePlateInput(plateInput);
    const errors = validatePlateInput(plateInput);
    showPlateErrors(errors);
    $p('[data-plate-result]').innerHTML = '';
    if (errors.length) {
      plateSolveButton.disabled = true;
      return { ok: false, errors };
    }
    try {
      const built = buildPlateModel(plateInput);
      const mesh = mountModel(built, built.meshProfile);
      loaded = { kind: 'PLATE', meshProfile: built.meshProfile, convergenceRequest: built.convergenceRequest, plate: built };
      solveButton.disabled = true; // the example's solve button is for the example
      plateSolveButton.disabled = false;
      const p = built.input;
      const u = unitSystem(p);
      const shape = p.shape === 'HOLE'
        ? `${dim(p.length, u)} × ${dim(p.height, u)} ${u.length} plate with a ${dim(p.holeDiameter, u)} ${u.length} hole`
        : `${dim(p.length, u)} × ${dim(p.height, u)} ${u.length} plate`;
      setStatus(`Loaded: ${shape}, t = ${dim(p.thickness, u)} ${u.length}. Mesh ${dim(p.meshSize, u)} ${u.length} qualified (${mesh.elements.length} elements). Next: Run, or "Solve + convergence study" in the plate form.`, 'ok');
      $p('[data-plate-result]').innerHTML = `<p>Model built: ${mesh.elements.length} elements at h = ${dim(p.meshSize, u)} ${u.length}. Result point: ${esc(describeProbe(built))}.</p>`;
      return { ok: true, elements: mesh.elements.length, probe: built.probe };
    } catch (error) {
      loaded = null;
      plateSolveButton.disabled = true;
      const reasons = error?.reasons ?? [`Could not build the model: ${error?.code ?? error?.message ?? error}`];
      showPlateErrors(reasons);
      setStatus(reasons[0], 'bad');
      return { ok: false, errors: reasons };
    }
  }

  async function solvePlate() {
    if (loaded?.kind !== 'PLATE' || busy) return null;
    busy = true;
    plateSolveButton.disabled = true;
    const started = Date.now();
    const resultSlot = $p('[data-plate-result]');
    resultSlot.innerHTML = '<p>Solving and running the 3-level convergence study… The page may not respond until it finishes.</p>';
    setStatus('Solving the plate and running the 3-level convergence study…');
    await nextPaint();
    try {
      const built = loaded.plate;
      let peakCoarse = null;
      const study = solveAndStudy(() => { if (built.peakProbe) peakCoarse = probeValue(built.peakProbe); });
      const peakFine = built.peakProbe ? probeValue(built.peakProbe) : null;
      const stage = controller.getState().stages[STAGE];
      const levels = study.study.levels.map((level) => ({ h: level.h, value: level.authoritativeValue }));
      const fine = levels.at(-1).value;
      const quantity = PLATE_PROBE_QUANTITIES[built.probe.quantityId];
      const isStress = quantity.units === 'MPa';
      // Results in the form's units: stresses to 2 decimals in MPa, displacements to 5 in mm.
      const u = unitSystem(built.input);
      const shownUnit = isStress ? u.stress : u.length;
      const valueText = (v) => (isStress ? stressText(v, 2, u) : lengthText(v, 5, u));
      const L = (mm) => lengthText(mm, 2, u);
      const S = (mpa) => stressText(mpa, 2, u);
      const kt = peakFine !== null && built.nominalStress > 0 ? peakFine / built.nominalStress : null;
      const ref = built.referenceKt;
      const summary = {
        status: study.status,
        classification: study.projection?.classification ?? null,
        resultReady: stage.lifecycleReadiness.resultReady === true,
        quantityId: built.probe.quantityId,
        units: quantity.units,
        probe: { x: built.probe.x, y: built.probe.y },
        levels,
        fineValue: fine,
        peak: built.peakProbe ? { coarse: peakCoarse, fine: peakFine, x: built.peakProbe.physicalCoordinate.x, y: built.peakProbe.physicalCoordinate.y } : null,
        nominalStress: built.nominalStress,
        kt,
        referenceKt: ref ? ref.ktGross : null,
        ktDifferencePercent: kt !== null && ref ? (kt - ref.ktGross) / ref.ktGross * 100 : null,
        seconds: (Date.now() - started) / 1000,
      };
      const passed = summary.status === 'CURRENT_PASS';
      const values = levels.map((l) => l.value);
      const spread = (Math.max(...values) - Math.min(...values)) / Math.max(1e-30, Math.abs(fine));
      const oscillatoryNote = summary.classification === 'OSCILLATORY'
        ? (spread < 1e-3
          ? ` The three values agree within ${fmt(spread * 100, 3)}%: the result here is effectively the same on every mesh, so the study cannot show a trend. Pick a displacement, or a point where the stress changes (near a hole or a support).`
          : ' The value goes up and down between meshes. Try a point a little further from edges and corners, or a smaller mesh size.')
        : '';
      resultSlot.innerHTML = `
        <table class="app-plate__levels"><thead><tr><th>Mesh size h</th><th>${esc(quantity.label)} (${shownUnit})</th></tr></thead>
          <tbody>${levels.map((l) => `<tr><td>${L(l.h)} ${u.length}</td><td>${valueText(l.value)}</td></tr>`).join('')}</tbody></table>
        <p><b>Convergence ${passed ? 'passed' : 'not passed'}</b> (${esc(summary.classification ?? '—')}). ${summary.resultReady ? 'Results are published in the workbench.' : 'Results are not publishable yet.'}
          ${esc(describeProbe(built))}. Took ${fmt(summary.seconds, 0)} s.${esc(oscillatoryNote)}</p>
        ${kt !== null ? `<p class="app-plate__kt"><b>Kt = σmax / σnominal = ${S(peakFine)} / ${S(built.nominalStress)} ${u.stress} = ${fmt(kt, 3)}</b>
          ${ref ? ` · reference ${fmt(ref.ktGross, 3)} for d/W = ${fmt(ref.dOverW, 3)} (finite-width plate in tension, gross section; 3.0 for an infinite plate), so FE is ${fmt(Math.abs(summary.ktDifferencePercent), 1)}% ${summary.ktDifferencePercent >= 0 ? 'above' : 'below'}.` : ' · no reference value: the loading is not uniaxial tension.'}</p>
          <p class="app-plate__note">σmax is the maximum principal stress just inside the hole edge, 90° from the load, on the finest mesh (h = ${L(levels.at(-1).h)} ${u.length})${peakCoarse !== null ? `; on the coarsest mesh it was ${S(peakCoarse)} ${u.stress}, ${fmt(Math.abs(peakFine - peakCoarse) / peakFine * 100, 1)}% different` : ''}. The hole edge is meshed by its curvature (15° segments) on every level, so the peak is read on each mesh rather than put through the convergence study, which checks the displacement.</p>` : ''}`;
      setStatus(`Plate: convergence ${passed ? 'passed' : 'not passed'} (${summary.classification}). `
        + `${quantity.label} at the result point: ${valueText(fine)} ${shownUnit}${kt !== null ? `; Kt = ${fmt(kt, 3)}` : ''}. `
        + `${summary.resultReady ? 'Results are published.' : 'Results are not yet publishable.'}`, passed && summary.resultReady ? 'ok' : 'warn');
      return summary;
    } catch (error) {
      const text = `Solve or convergence failed: ${error?.code ?? error?.message ?? error}`;
      resultSlot.innerHTML = `<p class="app-plate__bad">${esc(text)}</p>`;
      setStatus(text, 'bad');
      return null;
    } finally {
      busy = false;
      plateSolveButton.disabled = loaded?.kind !== 'PLATE';
    }
  }

  function describeProbe(built) {
    const q = PLATE_PROBE_QUANTITIES[built.probe.quantityId];
    const where = built.probe.automatic ? `${built.probe.location}, ` : '';
    const u = unitSystem(built.input);
    return `${q.label} at ${where}x = ${lengthText(built.probe.x, 2, u)}, y = ${lengthText(built.probe.y, 2, u)} ${u.length}`;
  }

  // The units box and the help toggle are settings, not plate inputs.
  const isSetting = (target) => target.matches?.('[data-plate-units], [data-plate-helptoggle]');
  plateForm.addEventListener('input', (event) => {
    if (isSetting(event.target)) return;
    plateInput = readPlateForm(); savePlateInput(plateInput); syncPlateVisibility();
  });
  plateForm.addEventListener('change', (event) => {
    if (event.target.matches?.('[data-plate-units]')) { switchPlateUnits(event.target.value); return; }
    if (event.target.matches?.('[data-plate-helptoggle]')) {
      showHelp = event.target.checked;
      try { globalThis.localStorage?.setItem(HELP_KEY, showHelp ? 'on' : 'off'); } catch { /* storage optional */ }
      applyHelp();
      return;
    }
    plateInput = readPlateForm(); savePlateInput(plateInput); syncPlateVisibility();
  });
  plateForm.addEventListener('click', (event) => {
    const act = event.target.closest('[data-plate-act]')?.dataset.plateAct;
    if (act === 'build') loadPlate();
    if (act === 'solve') solvePlate();
    if (act === 'reset') {
      // The Kt example, in the units the form is showing.
      plateInput = normalizePlateInput({ ...PLATE_DEFAULTS, units: plateInput.units });
      writePlateForm(); savePlateInput(plateInput); showPlateErrors([]);
    }
  });
  writePlateForm();
  applyHelp();

  bar.addEventListener('click', (event) => {
    const action = event.target.closest('[data-lafea-example]')?.dataset.lafeaExample;
    if (action === 'load') { loadExample(); plateSolveButton.disabled = true; }
    if (action === 'solve') solveExample();
  });

  return Object.freeze({
    getController: () => controller,
    loadExample,
    solveExample,
    loadPlate,
    solvePlate,
    getPlateInput: () => normalizePlateInput(plateInput),
    getState: () => controller.getState(),
    destroy() {
      controller.destroy();
      host.replaceChildren();
    },
  });
}

function loadPlateInput() {
  try {
    const saved = JSON.parse(globalThis.localStorage?.getItem(PLATE_STORAGE_KEY) ?? 'null');
    if (saved && typeof saved === 'object') return normalizePlateInput(saved);
  } catch { /* storage optional */ }
  return normalizePlateInput(PLATE_DEFAULTS);
}
function savePlateInput(input) {
  try { globalThis.localStorage?.setItem(PLATE_STORAGE_KEY, JSON.stringify(input)); } catch { /* storage optional */ }
}
