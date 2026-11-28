/**
 * Content of the "Status & roadmap" tab: known issues, planned improvements and the future roadmap.
 *
 * Pure data, no DOM, so scripts/app-status-content-check.mjs can check it in Node. Keep it in step with
 * docs/AUDIT-AND-ROADMAP.md, docs/NEXT-PHASE-PLAN.md and scripts/known-upstream-failures.json.
 */

export const STATUS_UPDATED = '2026-11-28';

export const STATUS_VISION = Object.freeze({
  title: 'Where this app is going',
  summary: 'A mini empirical solver for local stress. Not only a nozzle-load calculator: you draw the '
    + 'geometry, set supports and loads, and the empirical methods (WRC and similar) solve the local '
    + 'stress and show it the way an FE program does, but in seconds and with the method\'s limits stated.',
  pillars: Object.freeze([
    Object.freeze({
      id: 'CANVAS',
      title: '1. Universal canvas',
      text: 'Draw the shell and its attachments from dimensions, then specify boundary conditions: supports, '
        + 'attachment loads, pressure and load cases. First release: cylindrical shells with round attachments '
        + '(nozzles, trunnions) and rectangular plate attachments (lugs), with or without a reinforcing pad. '
        + 'One model feeds every solver.',
    }),
    Object.freeze({
      id: 'SOLVER',
      title: '2. Empirical local-stress solver',
      text: 'From the canvas model, pick the applicable method for each attachment, check its range, '
        + 'and solve. Results read like a light FE app: stress maps around each attachment, a probe '
        + 'readout, governing point and load case, stress categories and a report.',
    }),
    Object.freeze({
      id: 'FE',
      title: '3. FE when the method runs out',
      text: 'The same model goes to the LAFEA finite-element solver for a cross-check, or when the '
        + 'geometry is outside every empirical method.',
    }),
  ]),
});

/** What can be used today, one line per area. */
export const STATUS_TODAY = Object.freeze([
  Object.freeze({ area: 'WRC 537 calculator', state: 'USABLE', text: 'Cylinders with round attachments, nozzles or trunnions (γ 5–300, β 0.05–0.5), and rectangular attachments such as lugs (β1/β2 0.25–4, no torsion), six loads, optional reinforcing pad (checked at the attachment and at the pad edge), up to 20 load cases, pressure membrane, Kn/Kb, screening code check, printable report, saved cases. SI or US units (in, lbf, psi), help text on every input. Works on a laptop, a tablet or a phone, and from the keyboard.' }),
  Object.freeze({ area: 'Shell-FE cross-check', state: 'USABLE', text: 'Solves the same nozzle, trunnion or lug with LAFEA shell elements in about 30 s, compares the 8 points and draws a stress-intensity contour. Reports a ratio, not a pass/fail. For a lug WRC 537 refuses (a thin plate, torsion), it gives the only answer.' }),
  Object.freeze({ area: 'LAFEA plate form', state: 'USABLE', text: 'Plane-stress rectangular plate, with or without a central round hole: edge supports and loads, automatic mesh, convergence study, Kt. SI or US units (in, psi), help text on every input.' }),
  Object.freeze({ area: 'LAFEA workbench', state: 'PARTIAL', text: 'Worked cantilever example and the plate form go end to end. Other geometry needs stage JSON. Shell and trunnion stages are not wired to a form. Same look as the rest of the app; internal codes and custody text stay hidden until you tick "Technical details".' }),
  Object.freeze({ area: 'Universal canvas', state: 'PARTIAL', text: 'Step A1 done: the WRC calculator draws a dimensioned side view and end section of its inputs (shell, length, attachment, station, pad, corrosion allowance), live as you type, in SI or US, and in the printed report. The model is not yet edited on the drawing, and a shell holds one attachment. Next: several attachments on one shell (A2), then moving them on the drawing (A3).' }),
]);

export const STATUS_STATES = Object.freeze({
  USABLE: 'Usable',
  PARTIAL: 'Partial',
  NOT_STARTED: 'Not started',
});

export const SEVERITIES = Object.freeze({
  HIGH: 'High',
  MEDIUM: 'Medium',
  LOW: 'Low',
});

/**
 * Known issues. `what`: what happens; `workaround`: what to do today; `status`: where the fix stands.
 */
export const KNOWN_ISSUES = Object.freeze([
  // WRC calculator
  issue('KI-01', 'WRC calculator', 'HIGH', 'Interpolated γ is engineering judgement',
    'WRC 537 tabulates its curves only at γ = 5, 15, 50, 100 and 300 and gives no rule for values in between. '
    + 'The calculator blends the two nearest rows (linear in γ by default, or log γ). The only external WRC 537 '
    + 'reference is one CAESAR II case at γ = 48 (all 8 points within 2.0%).',
    'Treat interpolated results as screening. Run the shell-FE cross-check, or compare with your own program for important nozzles.',
    'Benchmarks (Phase 5.4) are partly done; see "Improvements planned".'),
  issue('KI-02', 'WRC calculator', 'MEDIUM', 'β limit assumed above γ = 5',
    'WRC 537 prints the β range 0.05–0.5 only for γ = 5. For other γ the same range is assumed.',
    'Be cautious near β = 0.05 or 0.5 at high γ.',
    'Open: needs the licensed bulletin to confirm.'),
  issue('KI-03', 'WRC calculator', 'HIGH', 'Cylinders only; lugs within the WRC 537 limits',
    'No spherical shells or heads, no saddles and no WRC 297 (which accounts for nozzle flexibility). PV Elite '
    + 'results using WRC 297 will differ: on a 36-inch nozzle its governing load stress was 1.39× (junction) and '
    + '1.78× (pad edge) of ours. Lugs (rectangular attachments) follow WRC 537 §4.2.2: torsion on a lug has no WRC '
    + 'method and is blocked; the footprint must have β1/β2 between 0.25 and 4, so a thin plate welded straight to '
    + 'the shell is blocked; moments on a non-square lug need γ ≥ 15. Table 7/8 factors between printed rows are '
    + 'interpolated (judgement), and some printed rows are approximate; the result shows the spread with the nearest printed '
    + 'rows instead, and flags it when wider than 10% (a narrow lug under Mc can reach about 22%).',
    'Run the shell-FE model for these lugs (it takes the blocked cases on its own), or use your licensed program.',
    'Lugs added 2026-11-27 (hand-checked against the bulletin equations), with a rectangular-footprint FE model the same '
    + 'day (PL-04). A lug benchmark is ready to run (PL-02). Spheres come later.'),
  issue('KI-04', 'WRC calculator', 'MEDIUM', 'Reinforcing pads use the two-location method',
    'WRC 537 has no pad rule. The calculator checks the shell twice, as PV Elite does: at the attachment with '
    + 'shell + pad thickness, and at the pad edge with the shell alone and the pad diameter. This assumes the pad '
    + 'is fully welded and acts with the shell. Pad welds and stress in the pad itself are not checked.',
    'For a narrow or thin pad, or high loads, look at FE as well. The FE cross-check covers the pad edge only.',
    'Added 2026-11-27; the geometry at both locations matches PV Elite.'),
  issue('KI-05', 'WRC calculator', 'MEDIUM', 'Pressure is membrane stress only',
    'Design pressure adds p·Rm/T and p·Rm/2T at every point. The stress concentration of pressure at the '
    + 'opening edge (WRC 368 or FE) is not included.',
    'Check the opening with the code nozzle rules or FE.',
    'Planned as part of wider coverage.'),
  issue('KI-06', 'WRC calculator', 'MEDIUM', 'Shear loads Vc and Vl are pure shear in WRC',
    'The shell FE shows that Vl is carried mostly as bearing, so WRC overstates it (about 2.7× on the '
    + 'CAESAR II case, conservative). Vc also bends the shell at C/D, which WRC 537 leaves out (FE/WRC 1.27, '
    + 'and the governing point moves).',
    'For nozzles where Vc governs, look at the FE cross-check.',
    'Documented. No change to the method.'),
  issue('KI-07', 'WRC calculator', 'MEDIUM', 'Stresses only at the 8 WRC points',
    'The method gives stress at A–D, outside and inside. The real peak can lie between them.',
    'The shell-FE contour shows where the peak is.',
    'Planned: a stress map in the empirical solver (roadmap stage B).'),
  issue('KI-08', 'WRC calculator', 'LOW', 'Code check is a screening check',
    'Pm, PL and PL+Pb+Q against S, 1.5S and SPS using ASME VIII-2 Part 5 categories, with your choice of how '
    + 'load bending is classified. It is not a full code assessment, and there is no fatigue check.',
    'Use it to find the governing case, then do the code assessment.',
    'Fatigue is on the roadmap (stage D).'),
  issue('KI-09', 'LAFEA', 'LOW', 'The LAFEA workbench is metric only',
    'The WRC calculator and the plate form show SI or US units (in, lbf, psi). The workbench\'s own stage inputs, '
    + 'results and the advanced EMP.1 workflow stay in mm, N and MPa.',
    'Use the plate form, or convert before editing stage inputs.',
    'US units in the calculator (2026-11-27) and the plate form (2026-11-28). The canvas (roadmap stage A) will use one units setting everywhere.'),
  // Shell-FE cross-check
  issue('KI-10', 'Shell-FE cross-check', 'MEDIUM', 'Simplified FE model',
    'A near-rigid round plug, or a stiff plate the size of a lug footprint, on a full cylinder with clamped ends. '
    + 'Pressure and Kn/Kb are not modelled; with a pad it checks the pad edge only (36-inch example: FE/WRC 1.17, '
    + 'same governing point). On the CAESAR II case FE/WRC is 0.95 (Ml) to 1.40 (Mc). On four lug shapes FE finds 0.50–0.89 '
    + 'of WRC at the middle of the edges and more than WRC at the corners, where the value depends on the mesh '
    + '(+21–28% from 16 to 24 divisions) and on a real lug is set by the weld. So it reports a ratio, not a pass/fail.',
    'Read a large ratio, or a corner value well above WRC, as a reason to look closer.',
    'Kept as is; the canvas will let FE use the real geometry.'),
  issue('KI-11', 'Shell-FE cross-check', 'LOW', 'Loosened solver tolerances',
    'The iterative solver (Jacobi-preconditioned CG) cannot meet the core\'s default 1e-8 equilibrium tolerance '
    + 'on thin shells, so the cross-check uses 0.5 N / 1e-6 for forces and 1e-5 for moments.',
    'None needed for the cross-check; the results are mesh-independent within 2%.',
    'Planned: a better solver (see KI-13).'),
  // LAFEA
  issue('KI-12', 'LAFEA', 'MEDIUM', 'Plate form covers one shape family',
    'Plane stress only; a rectangle with at most one central round hole; uniform edge loads; about 4,000 '
    + 'elements at the finest level. No 3-D, no general outlines, no point loads (singular in 2-D).',
    'Other shapes need stage JSON in the workbench.',
    'Replaced by the universal canvas (roadmap stage A).'),
  issue('KI-13', 'LAFEA', 'MEDIUM', 'Solver stalls on very slender models',
    'On a slender fine-mesh cantilever the solver stops at residual 1.2e-8 against a 1.1e-10 target after '
    + '34,816 iterations. A thick plane-strain cylinder stalls the same way. The default and tested plates converge.',
    'Use a coarser mesh or a less slender plate.',
    'Planned: stronger preconditioner or a direct solver for small models.'),
  issue('KI-14', 'LAFEA', 'LOW', 'Kt is not the convergence-study point',
    'The hole edge is meshed by its curvature at every level, so stress there moves 1–2% between meshes and '
    + 'the study rightly refuses it. The study uses an edge displacement; Kt is read from the finest and coarsest mesh.',
    'Compare the two Kt values shown (they differ by about 1%).',
    'Planned: tie the arc resolution to the mesh size.'),
  issue('KI-15', 'LAFEA', 'LOW', 'Hand-imported meshes are not fully screened',
    'The direct route accepts an inverted T3 element and misplaced T6/Q8 midside nodes (4 of 16 negative tests). '
    + 'Meshes made by the app\'s mesher have their own quality gate and are not affected.',
    'Let the app mesh the geometry.',
    'Open real gap, inherited from upstream.'),
  issue('KI-16', 'LAFEA', 'LOW', 'Shell stages are not ready for general use',
    'The LAFEA.4 shell mesher fails on shells with holes, and the experimental MITC4 element fails its energy '
    + 'check at t/L = 0.001. LAFEA.6 (weld profile) is not implemented and is hidden.',
    'The WRC cross-check builds its own shell mesh and is not affected.',
    'Open real gaps, inherited from upstream.'),
  // Whole app
  issue('KI-17', 'Whole app', 'LOW', 'Workbench screens still use specialist wording',
    'Internal codes, JSON paths and custody records are hidden until you tick "Technical details", but some '
    + 'sentences in the LAFEA workbench still speak of "governed" sources and authority. The advanced EMP.1 workflow '
    + 'opens on its γ = 5 qualification example (four pressure definitions, ten reference points, a 35.43 mm attachment) '
    + 'and runs only the γ = 5 route.',
    'Use the WRC calculator and the plate form for everyday work.',
    'Technical details switch added 2026-11-28. The example is unchanged: 19 checks and the γ = 5 hand calculation are built on it (open decision).'),
  issue('KI-18', 'Whole app', 'LOW', 'Work is saved per tab, in this browser',
    'WRC cases and plate inputs are kept in browser storage, and WRC cases can be saved as files. '
    + 'There is no single project file for both tabs.',
    'Save WRC case files; note plate inputs separately.',
    'Planned: one project file.'),
  issue('KI-19', 'Whole app', 'LOW', 'Some inherited tests do not run or fail',
    '8 browser tests of the original single-view LAFEA page fail here and upstream. Two full B02D production '
    + 'checks are too slow to run, so their result is unknown. 13 checks in all are listed as known, each with a reason.',
    'None for users.',
    'Tracked in scripts/known-upstream-failures.json.'),
]);

/**
 * Near-term improvements, in the recommended order: what, why, size (S under ½ day, M 1–2 days, L 3+ days)
 * and what it needs. PL-02 to PL-05 finish and prove the first production scope (nozzles, trunnions and
 * lugs on cylinders); the cheapest, strongest evidence comes first and FE covers what nothing else does.
 * PL-01 (interpolation spread for lugs), PL-03 (trunnions) and PL-04 (FE for lugs) were done on 2026-11-27 and are now
 * part of the calculator. PL-06 (finish the UI) was done in three parts on 2026-11-27 and 2026-11-28.
 */
export const PLANNED_IMPROVEMENTS = Object.freeze([
  plan('PL-02', 'Lug benchmark from your licensed program', 'S', 'Your runs of 3 lug cases with WRC 537 (docs/LUG-BENCHMARK-REQUEST.md)',
    'The only real WRC 537 evidence for lugs: the same footprints run in PV Elite or similar, compared point by point. '
    + 'FE (PL-04) gives only a ratio, and on lugs it differs from WRC 537 in kind: less at the middle of the edges, more at the corners.',
    ['Cases ready: L1 (γ 100, β1/β2 2, printed factors), L2 (γ 62, ratio 0.5, interpolated), L3 (γ 50, ratio 0.25, edge of range), optional L4 with a pad',
      'Freeze each report as a JSON reference and check our 8 points against it, as for the CAESAR II nozzle',
      'Trace any large difference to its load term: interpolation, curve reading or convention']),
  plan('PL-05', 'A code method for thin plate lugs', 'M', 'Your copy of the standard, and which one: EN 13445-3 (clause 16) or PD 5500 (Annex G)',
    'Thin plates welded straight to the shell are the most common lug and are outside WRC 537; a code method written for them is a cheaper everyday answer than FE.',
    ['Confirm the method\'s range and formulas from your copy', 'Implement it as a separate, labelled route next to WRC 537',
      'Check it against the standard\'s worked example, if it has one, and against the lug FE model (PL-04, done)']),
  plan('PL-07', 'Evidence for interpolated γ', 'M', 'Optional: WRC 537 output from your program',
    'Turns interpolated γ from judgement into evidence (Phase 5.4).',
    ['Shell-FE sweep across γ 15–100 at two or three β values, checking that the FE/WRC ratio moves smoothly between tabulated rows',
      'A WRC 537 rerun of the 36-inch PV Elite nozzle, if available (adds two cases at once)',
      'Search the CAESAR II conference paper for more worked examples']),
  plan('PL-08', 'Stronger FE solver', 'M', 'Nothing',
    'Fixes the stall on slender models (KI-13) and the loosened shell tolerances (KI-11).',
    ['Better preconditioner (incomplete Cholesky or SSOR)', 'Direct sparse solve for small models',
      'Keep every frozen result within its tolerance']),
  plan('PL-09', 'Kt through the convergence study', 'S', 'Nothing',
    'Lets the study certify the peak stress itself (KI-14).',
    ['Mesh-profile option tying the hole-edge arc length to h', 'Study point on the hole edge']),
  plan('PL-10', 'One project file and one report', 'M', 'Nothing',
    'A job should open and print as one thing.',
    ['Save and open both tabs\' inputs together', 'Combined report: WRC table, FE cross-check, plate results',
      'Export tables as CSV']),
]);
/** Longer-term stages toward the universal canvas and the empirical solver. */
export const ROADMAP = Object.freeze([
  stage('A', 'Universal canvas', 'L', 'Draw the model once, use it everywhere. First release: cylindrical shells.', [
    'Cylindrical shell from OD, thickness, corrosion allowance and length, in 2-D (unrolled and section views) with a 3-D preview',
    'Round attachments: nozzles (hollow) and trunnions (solid or hollow), at any angle around and position along the shell',
    'Rectangular plate attachments: lugs, given by length, width and orientation',
    'Optional reinforcing pad on any attachment',
    'Everything driven by dimensions: edit a number and the shape updates; snaps and a grid for placement',
    'Boundary conditions: fixed, pinned, roller and symmetry supports; forces and moments at attachments; pressure; edge tractions',
    'Named load cases (sustained, operating, occasional) on the model',
    'One saved model format read by both the empirical solver and LAFEA',
  ], 'Replaces the WRC input form and the plate form, which become two ready-made canvas templates.'),
  stage('B', 'Empirical solver on the canvas', 'L', 'Solve local stress like an FE app, without a mesh.', [
    'For each attachment, choose the applicable method and say why: WRC 537 round-attachment curves for nozzles and trunnions, WRC 537 rectangular-attachment rules for lugs, FE otherwise',
    'Pads checked twice: at the attachment (shell + pad) and at the pad edge (already in the WRC calculator)',
    'Range checks shown on the model: γ, β, cylinder length, end distance, spacing to the next attachment',
    'Stress map around each attachment built from the method\'s points and the shell\'s decay length √(Rm·T), clearly labelled as an estimate between the points',
    'Probe readout, governing point and load case, membrane / bending / total, stress categories and allowables',
    'Warnings where two local zones overlap, which the methods do not cover',
    'Report generated from the model',
  ], 'Uses the existing WRC 537 core, which is already checked against the γ = 5 hand calculation and CAESAR II.'),
  stage('C', 'Empirical and FE together', 'L', 'Check the empirical answer, or go beyond it.', [
    'One click: mesh the canvas model and solve with LAFEA',
    'Side-by-side empirical and FE stress maps, with the ratio at each point',
    'Automatic FE route when the geometry is outside every empirical method',
    'A benchmark library in the app: CAESAR II, PV Elite, hand calculations and FE sweeps, with their status',
  ], 'Builds on the shell-FE cross-check and the plate form.'),
  stage('D', 'Wider coverage', 'L', 'More shapes and methods, each validated before release.', [
    'Spherical shells and heads (WRC 537 spherical curves)',
    'Flat plates and other shell shapes on the canvas',
    'WRC 297 for flexible nozzles, so results can match programs that use it',
    'Pressure stress at the opening (WRC 368 or FE)',
    'Fatigue screening and a material and allowable-stress library',
  ], 'Spheres need your licensed WRC 537 bulletin. They come after the cylindrical-shell release.'),
]);

/** Decisions only the owner can make, kept on the page so they are not lost. */
export const OPEN_DECISIONS = Object.freeze([
  'Benchmarks: can you supply WRC 537 output (inputs and the 8-point table) from CAESAR II or PV Elite for more nozzles?',
  'Lug benchmark (PL-02): can you run the 3 cases in docs/LUG-BENCHMARK-REQUEST.md in PV Elite (or similar) with WRC 537?',
  'Thin plate lugs (PL-05): do you have EN 13445-3 or PD 5500, and which should the app follow?',
  'Canvas (stage A): should the canvas stay inside the Empirical tab, above the calculator form (proposed), or have a tab of its own?',
  'Canvas model file (before A2): keep it empirical only, with FE importing its geometry one way later (proposed), or one file read by both WRC and LAFEA?',
  'Canvas spacing check (A4): WRC 537 has no rule for two attachments close together. What criterion should the warning use, for example a centre spacing in multiples of √(Rm·T), or your company rule?',
  'Canvas loads in vessel axes (A5): which axis convention (for example CAESAR II, Y up), and do you have a converted case to check against?',
]);

/** Decisions already made, with their date. */
export const DECISIONS_MADE = Object.freeze([
  '2026-11-26: focus on production. First canvas and solver scope: cylindrical shells, with round attachments (nozzles, trunnions) and rectangular plate attachments (lugs).',
  '2026-11-26: spherical shells and heads come later.',
  '2026-11-26: keep the original single-view LAFEA page (lafea.html).',
  '2026-11-27: lug data comes from the licensed WRC 537 bulletin: Tables 6–8 as extracted in docs/emp1, the equations from the PDF.',
  '2026-11-27: reinforcing pads before lugs.',
  '2026-11-27: lugs in the WRC calculator, within the WRC 537 rules; cases outside them are blocked and sent to FE.',
  '2026-11-27: lugs WRC 537 refuses (thin plates, torsion) get a shell-FE answer, labelled FE only. No simple torsion formula.',
  '2026-11-28: the advanced EMP.1 workflow keeps its γ = 5 qualification example (19 checks and the hand calculation are built on it); the WRC calculator\'s six examples are the plain starting points.',
  '2026-11-28: keep FE and empirical (WRC 537) work apart. A one-time FE run to build data or fit an approximation for the empirical side is fine; the empirical solver does not depend on FE when it runs.',
  '2026-11-28: canvas step A1 (the sketch) started; A2–A6 stay proposed until you approve each one. Grid, snapping, dimension and 3-D code is ported from Pdf-Hub (MIT) as plain JS, with no React, Konva or three.js.',
]);

function issue(id, area, severity, title, what, workaround, status) {
  return Object.freeze({ id, area, severity, title, what, workaround, status });
}
function plan(id, title, size, needs, why, items) {
  return Object.freeze({ id, title, size, needs, why, items: Object.freeze(items) });
}
function stage(id, title, size, goal, items, note) {
  return Object.freeze({ id, title, size, goal, items: Object.freeze(items), note });
}
