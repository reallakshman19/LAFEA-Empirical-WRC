/**
 * LAFEA view: the standalone LAFEA workbench plus an example bar.
 *
 * "Load example" re-creates the workbench on the cantilever example through the qualified
 * domain-first route (source → domain → geometry → mesh), so Run works straight away.
 * "Solve + convergence study" then runs the solve and the governed three-level study, which
 * is what the workbench needs before it will publish results (resultReady).
 */
import { LafeaStandaloneController } from '../../lafea-app/standalone-controller.js';
import {
  LAFEA_EXAMPLE,
  buildLafeaExample,
  lafeaExampleConvergenceRequest,
  lafeaExampleHandTipDeflection,
  lafeaExampleMeshProfile,
} from './lafea-example.js';

const STAGE = 'LAFEA.3';

export function mountLafeaView(host, options = {}) {
  const doc = host.ownerDocument;
  const bar = doc.createElement('div');
  bar.className = 'app-examplebar';
  bar.dataset.role = 'lafea-example-bar';
  bar.innerHTML = `
    <span class="app-examplebar__label">Example</span>
    <button type="button" data-lafea-example="load" title="Replace the workbench model with the example and generate its mesh">Load: ${LAFEA_EXAMPLE.title}</button>
    <button type="button" data-lafea-example="solve" disabled title="Solve, then run the 3-level mesh convergence study so results can be published">Solve + convergence study</button>
    <span class="app-examplebar__status" data-lafea-example-status aria-live="polite">No example loaded. Use Import, or load the example.</span>`;
  const workbenchHost = doc.createElement('div');
  workbenchHost.className = 'app-workbench-host';
  host.replaceChildren(bar, workbenchHost);

  const status = bar.querySelector('[data-lafea-example-status]');
  const solveButton = bar.querySelector('[data-lafea-example="solve"]');
  let controller = new LafeaStandaloneController(workbenchHost, { ...options }).init();
  let exampleLoaded = false;

  function setStatus(text, tone = '') {
    status.textContent = text;
    status.dataset.tone = tone;
  }

  function loadExample() {
    try {
      const built = buildLafeaExample();
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
      controller.bindAnalysisMeshProfile(lafeaExampleMeshProfile());
      const generated = controller.generateAnalysisMesh();
      if (generated?.evidence?.qualification !== 'PASS') throw new Error('The example mesh did not qualify.');
      exampleLoaded = true;
      solveButton.disabled = false;
      const ex = LAFEA_EXAMPLE;
      setStatus(`Loaded: ${ex.length} × ${ex.depth} mm plate, t = ${ex.thickness} mm, fixed left edge, end shear ${ex.endShear} MPa. `
        + `Mesh ${ex.coarseMesh} mm qualified. Next: Run, or "Solve + convergence study".`, 'ok');
    } catch (error) {
      exampleLoaded = false;
      solveButton.disabled = true;
      setStatus(`Could not load the example: ${error?.code ?? error?.message ?? error}`, 'bad');
    }
    return controller.getState();
  }

  function solveExample() {
    if (!exampleLoaded) return null;
    setStatus('Solving and running the 3-level convergence study…');
    try {
      // Re-bind the coarse mesh so the study always starts from the example's base level.
      controller.bindAnalysisMeshProfile(lafeaExampleMeshProfile());
      controller.generateAnalysisMesh();
      const preflight = controller.store.prepareContinuumForRun();
      if (preflight?.projection?.state !== 'CURRENT_PASS') throw new Error('Pre-run checks did not pass.');
      controller.run();
      const study = controller.runContinuumConvergenceStudy(lafeaExampleConvergenceRequest());
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

  bar.addEventListener('click', (event) => {
    const action = event.target.closest('[data-lafea-example]')?.dataset.lafeaExample;
    if (action === 'load') loadExample();
    if (action === 'solve') solveExample();
  });

  return Object.freeze({
    getController: () => controller,
    loadExample,
    solveExample,
    getState: () => controller.getState(),
    destroy() {
      controller.destroy();
      host.replaceChildren();
    },
  });
}
