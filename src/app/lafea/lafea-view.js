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
import { LafeaStandaloneController } from '../../lafea-app/standalone-controller.js';
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

const STAGE = 'LAFEA.3';
const PLATE_STORAGE_KEY = 'lafea-emp-app/lafea-plate';
const EDGE_LABEL = { LEFT: 'Left (x = 0)', RIGHT: 'Right (x = L)', BOTTOM: 'Bottom (y = 0)', TOP: 'Top (y = H)' };
const SHEAR_HINT = { LEFT: '+y', RIGHT: '+y', BOTTOM: '+x', TOP: '+x' };

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
      <div class="app-plate__grid">
        <label>Shape <select data-plate="shape">
          <option value="HOLE">Plate with a central round hole</option>
          <option value="RECT">Rectangular plate</option></select></label>
        <label>Length L (along x) <span><input data-plate="length" type="number" step="any" min="0" inputmode="decimal"> mm</span></label>
        <label>Height H (along y) <span><input data-plate="height" type="number" step="any" min="0" inputmode="decimal"> mm</span></label>
        <label>Thickness t <span><input data-plate="thickness" type="number" step="any" min="0" inputmode="decimal"> mm</span></label>
        <label data-plate-hole>Hole diameter d <span><input data-plate="holeDiameter" type="number" step="any" min="0" inputmode="decimal"> mm</span></label>
        <label>Young's modulus E <span><input data-plate="elasticModulus" type="number" step="any" min="0" inputmode="decimal"> MPa</span></label>
        <label>Poisson's ratio ν <span><input data-plate="poissonRatio" type="number" step="any" min="0" max="0.5" inputmode="decimal"></span></label>
        <label>Mesh size h <span><input data-plate="meshSize" type="number" step="any" min="0" inputmode="decimal"> mm</span></label>
      </div>
      <div class="app-plate__edges-wrap"><table class="app-plate__edges">
        <thead><tr><th>Edge</th><th>Support</th><th>Normal stress σn <small>MPa, + = tension</small></th><th>Shear τ <small>MPa</small></th></tr></thead>
        <tbody>${PLATE_EDGES.map((id) => `
          <tr><td>${EDGE_LABEL[id]}</td>
            <td><select data-edge="${id}" data-field="support" aria-label="${EDGE_LABEL[id]} edge: support">${Object.entries(PLATE_SUPPORTS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></td>
            <td><input data-edge="${id}" data-field="normal" type="number" step="any" inputmode="decimal" aria-label="${EDGE_LABEL[id]} edge: normal stress σn, MPa, + = tension"></td>
            <td><input data-edge="${id}" data-field="shear" type="number" step="any" inputmode="decimal" aria-label="${EDGE_LABEL[id]} edge: shear τ, MPa, in ${SHEAR_HINT[id]}"> <small>in ${SHEAR_HINT[id]}</small></td></tr>`).join('')}
        </tbody>
      </table></div>
      <fieldset class="app-plate__probe">
        <legend>Result point (checked by the convergence study)</legend>
        <label><input type="checkbox" data-plate-probe="auto"> Automatic: total displacement at the middle of the most loaded edge. (For a hole, the peak stress and Kt at the hole edge are reported as well.)</label>
        <span data-plate-probe-custom>
          <label>x <input data-plate-probe="x" type="number" step="any" inputmode="decimal"> mm</label>
          <label>y <input data-plate-probe="y" type="number" step="any" inputmode="decimal"> mm</label>
          <label>Quantity <select data-plate-probe="quantityId">${Object.entries(PLATE_PROBE_QUANTITIES).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}</select></label>
        </span>
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

  function writePlateForm() {
    for (const el of plateForm.querySelectorAll('[data-plate]')) el.value = plateInput[el.dataset.plate] ?? '';
    for (const el of plateForm.querySelectorAll('[data-edge]')) el.value = plateInput.edges[el.dataset.edge][el.dataset.field] ?? '';
    const auto = !plateInput.probe;
    $p('[data-plate-probe="auto"]').checked = auto;
    $p('[data-plate-probe="x"]').value = plateInput.probe?.x ?? '';
    $p('[data-plate-probe="y"]').value = plateInput.probe?.y ?? '';
    $p('[data-plate-probe="quantityId"]').value = plateInput.probe?.quantityId ?? 'PRINCIPAL_MAXIMUM';
    syncPlateVisibility();
  }
  function readPlateForm() {
    const raw = { title: plateInput.title, edges: {} };
    for (const el of plateForm.querySelectorAll('[data-plate]')) raw[el.dataset.plate] = el.value;
    for (const id of PLATE_EDGES) raw.edges[id] = {};
    for (const el of plateForm.querySelectorAll('[data-edge]')) raw.edges[el.dataset.edge][el.dataset.field] = el.value === '' ? 0 : el.value;
    raw.probe = $p('[data-plate-probe="auto"]').checked ? null : {
      x: $p('[data-plate-probe="x"]').value,
      y: $p('[data-plate-probe="y"]').value,
      quantityId: $p('[data-plate-probe="quantityId"]').value,
    };
    return normalizePlateInput(raw);
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
      const shape = p.shape === 'HOLE' ? `${p.length} × ${p.height} mm plate with a ${p.holeDiameter} mm hole` : `${p.length} × ${p.height} mm plate`;
      setStatus(`Loaded: ${shape}, t = ${p.thickness} mm. Mesh ${p.meshSize} mm qualified (${mesh.elements.length} elements). Next: Run, or "Solve + convergence study" in the plate form.`, 'ok');
      $p('[data-plate-result]').innerHTML = `<p>Model built: ${mesh.elements.length} elements at h = ${p.meshSize} mm. Result point: ${esc(describeProbe(built))}.</p>`;
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
        <table class="app-plate__levels"><thead><tr><th>Mesh size h</th><th>${esc(quantity.label)} (${quantity.units})</th></tr></thead>
          <tbody>${levels.map((l) => `<tr><td>${fmt(l.h, 2)} mm</td><td>${fmt(l.value, isStress ? 2 : 5)}</td></tr>`).join('')}</tbody></table>
        <p><b>Convergence ${passed ? 'passed' : 'not passed'}</b> (${esc(summary.classification ?? '—')}). ${summary.resultReady ? 'Results are published in the workbench.' : 'Results are not publishable yet.'}
          ${esc(describeProbe(built))}. Took ${fmt(summary.seconds, 0)} s.${esc(oscillatoryNote)}</p>
        ${kt !== null ? `<p class="app-plate__kt"><b>Kt = σmax / σnominal = ${fmt(peakFine, 2)} / ${fmt(built.nominalStress, 2)} = ${fmt(kt, 3)}</b>
          ${ref ? ` · reference ${fmt(ref.ktGross, 3)} for d/W = ${fmt(ref.dOverW, 3)} (finite-width plate in tension, gross section; 3.0 for an infinite plate), so FE is ${fmt(Math.abs(summary.ktDifferencePercent), 1)}% ${summary.ktDifferencePercent >= 0 ? 'above' : 'below'}.` : ' · no reference value: the loading is not uniaxial tension.'}</p>
          <p class="app-plate__note">σmax is the maximum principal stress just inside the hole edge, 90° from the load, on the finest mesh (h = ${fmt(levels.at(-1).h, 2)} mm)${peakCoarse !== null ? `; on the coarsest mesh it was ${fmt(peakCoarse, 2)} MPa, ${fmt(Math.abs(peakFine - peakCoarse) / peakFine * 100, 1)}% different` : ''}. The hole edge is meshed by its curvature (15° segments) on every level, so the peak is read on each mesh rather than put through the convergence study, which checks the displacement.</p>` : ''}`;
      setStatus(`Plate: convergence ${passed ? 'passed' : 'not passed'} (${summary.classification}). `
        + `${quantity.label} at the result point: ${fmt(fine, isStress ? 2 : 5)} ${quantity.units}${kt !== null ? `; Kt = ${fmt(kt, 3)}` : ''}. `
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
    return `${q.label} at ${where}x = ${fmt(built.probe.x, 2)}, y = ${fmt(built.probe.y, 2)} mm`;
  }

  plateForm.addEventListener('input', () => { plateInput = readPlateForm(); savePlateInput(plateInput); syncPlateVisibility(); });
  plateForm.addEventListener('change', () => { plateInput = readPlateForm(); savePlateInput(plateInput); syncPlateVisibility(); });
  plateForm.addEventListener('click', (event) => {
    const act = event.target.closest('[data-plate-act]')?.dataset.plateAct;
    if (act === 'build') loadPlate();
    if (act === 'solve') solvePlate();
    if (act === 'reset') { plateInput = normalizePlateInput(PLATE_DEFAULTS); writePlateForm(); savePlateInput(plateInput); showPlateErrors([]); }
  });
  writePlateForm();

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
