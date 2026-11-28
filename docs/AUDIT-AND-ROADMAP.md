# LAFEA + Empirical/WRC: audit and roadmap

Audit date: 2026-11-25. App at commit `8efba1b`. The audit was done by:
- running the app in a browser;
- reading the EMP1 core code;
- running the numeric verification scripts.

## Summary

| Area | Verdict |
|---|---|
| Empirical / WRC maths (γ = 5) | **Correct.** The built-in example's governing result, Au = 72.67 N/mm², matches the independent recalculation exactly. |
| Empirical / WRC maths (other γ) | **Correct but blocked.** At γ ≈ 48, the interpolated-γ path matches CAESAR II within 2.0% at all 8 points. The main workflow refuses to run it. |
| Empirical usability | **Weak.** There is no plain entry form and no report. The block reason is hidden. Each stage has to be re-run in order by hand. Work is lost on reload. |
| LAFEA usability | **Broken.** There is no working way to load a model (the extraction made this worse). The start-to-finish FE test fails here and upstream. |
| Look and feel | The whole app renders in Times New Roman, because no base font is set. Upstream has the same problem. |
| Code size | 84 k lines and a 1.9 MB main JS chunk, for 4 FE stages and 1 analytical calc. A great deal of it is "authority/custody" scaffolding. |

## 1. Empirical / WRC (EMP1), audited first

### What it calculates

WRC 537 (2013) local stress in a **cylindrical shell** at a **round attachment**. It reports stress at the 8 standard points (Au/Al … Du/Dl) from P, Vc, Vl, Mc, Ml and Mt.

- The production route is very narrow, in `src/core/emp1/emp1-wrc537-gamma5-zero-dp-route.js`:
  - γ = Rm/T must be **exactly 5**;
  - β = 0.875·r0/Rm must be between 0.05 and 0.5;
  - pressure must be zero;
  - Kn and Kb must be 1;
  - the cylinder must have L ≥ Rm and an end distance ≥ 0.5·Rm.
- Real vessels and pipes have γ between 10 and 300, so **almost no real case can run on the authorised route.**
- An interpolated-γ module already exists in `emp1-wrc537-cylindrical-gamma-interpolation.js`. It is labelled "comparison only, not WRC-source".
- No spherical shells, rectangular attachments, WRC 107/297, pressure stress or code allowables (no PL/PL+Pb/Q check against S).

### Numeric verification (run during this audit)

| Check | Result |
|---|---|
| App example (OD 220 × 20, γ = 5, β = 0.155) | Governing Au **72.67 N/mm²** |
| `emp1-wrc-gamma5-post-authority-independent-refreeze.mjs` | Au **72.6728**. All 8 points match the app. |
| `emp1-wrc-gamma5-full-table5-independent-handcalc.mjs` | Au **72.178**. This is the *older* curve choice (1B‑1/2B‑1), which the refreeze script records as superseded. Stale, not a bug. |
| `emp1-wrc537-caux-interpolated-comparison-check.mjs` (CAESAR II 2017 case, Rm 912.5, T 19, γ 48.0) | Worst point **+2.0%** (Cu). Governing point Du is the same in both. **PASS.** |
| `emp1-wrc-gamma5-zero-dp-route-qualification.mjs` | **Cannot run:** its JSON was not copied in the extraction. |

These numeric scripts are **not in `npm run check:all`** (`*-handcalc`, `*-qualification`, `*-refreeze` do not match its name filter), so a wrong number would not fail CI.

### Browser walk-through findings

| # | Severity | Finding |
|---|---|---|
| E1 | **High** | γ ≠ 5 gives "Local check: BLOCKED · ROUTE LIMIT" with **no visible reason**. The reason codes (`EMP1_LOCAL_METHOD_SCOPED_RUNTIME_NON_TABULATED_GAMMA` …) exist in the DOM but are not shown in plain language. |
| E2 | **High** | The working interpolated-γ result (2% from CAESAR II) is not offered as a run option. The "Interpolated γ · Comparison only" button only shows the domain. |
| E3 | **High** | There is no plain input form. Geometry and loads are edited as rows of a "governed source document" labelled with JSON paths (`document.pipeGeometry.outsideDiameter.value`). Changes also have to be applied group by group ("Apply Pipe geometry changes", "Apply Thickness changes"). Rm, T, γ and β are never shown next to the inputs. |
| E4 | **High** | There is no calculation report. "7 Review & export" has no export: the only export is "More actions → Export current step data" (JSON). There is no table of the 8-point stresses, no figures or curve values used, and no PDF or print. |
| E5 | Medium | After an edit you must re-run in order: load transfer → section check → local check. Only the main button tells you what is next. "Update local-check basis" quietly does nothing until the earlier stages are current. |
| E6 | Medium | The example starts with odd defaults: four pressure definitions, 10 lug/plate reference points and a 35.43 mm attachment OD. Pressure radii stay at 90/110 mm after the OD changes (the app does catch this and offers "Set radii to current wall", which is good). |
| E7 | Medium | Nothing is saved: a reload loses all inputs (localStorage holds only the active tab). |
| E8 | Low | Good: input changes correctly mark results **STALE**, and the out-of-range γ is refused rather than giving a wrong number. |
| E9 | Low | Two EMP1 source-semantics data files were not copied (`cylindrical-stress-semantics-source-reconciliation-v1.json`, `gamma5-zero-dp-route-qualification-v1.json` and others in `validation/emp1/wrc537-2013/`). |

## 2. LAFEA

| # | Severity | Finding |
|---|---|---|
| L1 | **High** (my extraction) | `src/app/app.css` hides `[data-role='lafea-mock']`, which is the **only** "load demonstration model" control. The LAFEA tab therefore opens empty, and the only way in is "Import stage JSON". |
| L2 | **High** (upstream) | Clicking the demo source anyway gives `LAFEA_SOURCE_EDIT_REJECTED` / `LAFEA_PREPARATION_PRODUCER_NOT_QUALIFIED`. Nothing loads. |
| L3 | **High** (upstream) | The start-to-finish e2e test (`lafea-standalone-golden-journey`) fails here and upstream. The solve reports `QUALIFIED`, but `resultReady` stays `false`, so results are never published. |
| L4 | Medium | LAFEA.6 Weld profile is shown but "Not implemented". The boot test expects 6 stages and finds 4 (upstream fails too). |
| L5 | Medium | The screen is crowded with status and custody text: "governed checks", "Technical custody detail", raw `LAFEA_RENDER_*` codes in the viewport. |
| L6 | Low | The EMP1 tab also appears inside the LAFEA view's stage bar. That duplicates the Empirical tab. |

## 3. Whole app

| # | Severity | Finding |
|---|---|---|
| A1 | Medium | There is no base font, so the app renders in Times New Roman. |
| A2 | Medium | One 1.9 MB JS chunk, so the first load is slow. EMP1 alone does not need the FE solver, meshers or the 3D/three.js code. |
| A3 | Medium | 128 checks are skipped as "known". 90 of them are stale upstream assertions, which hide real regressions. |
| A4 | Low | No CI and no hosted build. |

## Progress

**2026-11-25: WRC cleared first.** The new WRC 537 calculator
(`src/app/wrc/`) is now the default Empirical sub-tab. It closes these findings:

| Finding | Fix |
|---|---|
| E1 | Plain reasons and fixes for every block |
| E2 | Interpolated γ is a labelled result tier |
| E3 | Plain input form with live γ/β |
| E4 | Printable and downloadable HTML report |
| E5 | Live calculation, so there are no stages to re-run |
| E7 | Autosave, plus case files |
| E9 | Missing EMP1 data copied (but not the copyrighted PDFs) |
| A1 | Base font set |

`check:all` now includes the WRC hand-calculation scripts and the new `wrc-calculator-check.mjs`.

Still open:
- E6 (odd example defaults, advanced workflow only);
- all LAFEA items;
- A2–A4;
- Phase 2 onward.

**2026-11-25: Phase 2, first part.** Added to the WRC calculator:

| Item | Done |
|---|---|
| 12 | Design pressure (thin-shell membrane p·Rm/T and p·Rm/2T) and Kn/Kb inputs |
| 13 | Code check with user allowables: Pm ≤ S, PL ≤ 1.5S, PL+Pb+Q ≤ SPS (or PL+Pb ≤ 1.5S) |
| 16 | Up to 20 named load cases, with an envelope table and a code check for each case |

All of these are in the report and checked against hand arithmetic in `wrc-calculator-check.mjs`.

Still open in Phase 2:
- **14 spheres and 15 rectangular attachments:** blocked on source data. The extracted EMP1 core
  has only the WRC 537 curves for cylinders with round attachments. The sphere and
  rectangular-attachment curves must be digitised from the bulletin and validated before they
  can be added.
- **17 more benchmarks:** needs CAESAR II or PV Elite output for more γ/β cases.
- **Pressure stress concentration at the opening:** not included (WRC 368 or FE).

**2026-11-25: LAFEA fixed (Phase 3, item 18).** What was actually wrong:

- **L2:** the "demo source" route is refused on purpose. `lafea-preparation-profile.js` hard-codes
  `producerQualified: false`, so the simulated-source import can never qualify. The route that works is
  domain-first: source → analysis domain → geometry evidence → mesh profile → mesh. The upstream A17
  browser journey uses the same route.
- **L3:** not a solver bug. A solve is `QUALIFIED`, but `resultReady` also needs a passed mesh
  **convergence study** (lifecycle artifact `CONVERGENCE`). The upstream golden test never runs one.
  Its triangle fixture also uses a point load, which is singular in 2-D, so a study on it is correctly
  classified `DIVERGENT`. The test's `resultReady = true` expectation is stale, and the test stays on the
  known list.

The fix is a new **example bar** in the LAFEA tab (`src/app/lafea/`):

- **"Load: Cantilever plate"** loads a 200 × 40 × 10 mm plane-stress plate, fixed on the left edge, with
  a −5 MPa end shear traction. It is built on the domain-first route and the 40 mm mesh qualifies.
- **"Solve + convergence study"** solves, then runs the three-level study (40 / 20 / 10 mm) on the tip
  deflection. The study passes (`MONOTONIC_CONVERGING`) and results are published.

Results against hand calculations:

| Quantity | FE | Hand | Difference |
|---|---|---|---|
| Tip deflection, mm (h = 40 / 20 / 10 mm) | −0.4993 / −0.5073 / −0.5082 | −0.5156 (Timoshenko beam) | 1.4% stiffer, as expected for a fully clamped edge |
| Max σx at the root | 150.16 MPa | 6PL/(t·d²) = 150.0 MPa | 0.1% |

A 5 mm level fails: it solves without producing current recovery, likely above the qualified solve size.
That is why the ladder starts at 40 mm.

- **L6:** the duplicate EMP.1 entry is hidden in the LAFEA tab.
- **L4:** LAFEA.6 (weld profile, not implemented) is hidden there too.
- **L1:** the "mock" demo button stays hidden, because it only leads to the refused route.

Covered by `e2e/lafea-example.spec.js`.

**2026-11-25: Shell-FE cross-check of WRC 537 (Phase 3, item 19).** The WRC calculator has a
"Run shell FE cross-check" button. It solves the same geometry with the LAFEA shell core
(`src/core/local-shell`, CST/DKT thin-shell triangles) in a Web Worker and compares stress intensity at
the 8 WRC points. The model is built in `src/app/lafea/nozzle-shell.js`:

- full circumference with clamped ends;
- a graded polar patch around the attachment;
- the attachment as a near-rigid plug (4 × T);
- P, Mc and Ml applied at the plug centre (Vc, Vl, Mt and pressure are not modelled);
- stresses extrapolated from the first two element rings to r0.

CAESAR II nozzle (γ 48, β 0.155), per unit load, maximum stress intensity:

| Load | Shell FE | WRC 537 | FE / WRC | Finer mesh (16 330 DOF) | Plug 8 × T |
|---|---|---|---|---|---|
| Ml 10 kN·m | 57.99 | 60.86 | 0.95 | 57.65 | 58.81 |
| Mc 10 kN·m | 145.62 | 103.87 | 1.40 | 147.98 | 149.55 |
| P 10 kN | 21.58 | 16.83 | 1.28 | 21.88 | 22.91 |

- **Mesh-independent:** the finer mesh changes the maxima by under 2%.
- **Plug stiffness:** a stiffer plug changes them by up to 6%.
- **Signs:** they agree at every significant point.
- **Where FE and WRC differ:**
  - Under P, FE puts the stress on the circumferential axis (C/D) and much less on A/B.
  - Mc stresses are higher in FE.

  Published FE studies of WRC 107/537 report differences of this kind, so the button reports a
  ratio and does not give a pass/fail.

`scripts/wrc-nozzle-fe-check.mjs` (about 2 min) freezes these values, the sign mapping and superposition.

Shell core tolerances: the Jacobi-PCG solve of a thin shell cannot meet the core's default 1e-8
equilibrium tolerances. The cross-check model therefore uses 0.5 N / 1e-6 for forces and 1e-5 for
moments. The core is unchanged.

**2026-11-26: Phase 5.1, fast first load.** The LAFEA workbench is now loaded only when it is needed.

- `src/app/main.js` no longer imports the standalone controller or `lafea-view.js` statically. A single
  cached `import()` (`loadLafeaModules`) fetches both the first time someone opens the LAFEA tab or the
  "Full EMP.1 workflow (advanced)" sub-tab. "Loading LAFEA…" shows meanwhile. A failed load shows the
  reason and a "Try again" button, and it does not affect the WRC calculator.
- The workbench mounts only once its tab is visible, as before, so it never lays out in a hidden root.
- `globalThis.LafeaEmpApp` keeps the same methods. `whenReady(viewId)` is new. The LAFEA view's
  `loadExample`, `solveExample` and `getState` now return promises, and `getController()` is null until
  the workbench has mounted.
- `scripts/bundle-size-check.mjs` (`npm run check:bundle-size`) walks the static imports of `index.html`
  in `dist/.vite/manifest.json`. It fails if they total more than 500 kB, or if the standalone controller
  is among them. CI runs it after `build`.

| First-load JS | Before | After |
|---|---|---|
| `main-*.js` (app and WRC calculator) | 48.5 kB | 43.6 kB |
| EMP1 WRC 537 table chunk (shared with LAFEA) | in the controller | 56.2 kB |
| `standalone-controller-*.js` | 1,942.7 kB | not loaded (1,886.7 kB, lazy) |
| **Total** | **1,991 kB** (gzip about 529 kB) | **99.8 kB** (gzip 38.6 kB) |

Verification: see the README test table. New e2e tests check that the Empirical tab loads without
requesting the controller, that it is requested when the LAFEA tab opens, and that a failed load can be
retried. The app e2e specs pass on both the dev server and the production build (`vite preview`).

**2026-11-26: Phase 5.2, FE cross-check of all six loads, plus a stress contour.** The shell-FE
cross-check (`src/app/lafea/nozzle-shell.js`) now takes Vc, Vl and Mt as well as P, Mc and Ml.

- **How they are applied:**
  - Vc and Vl are in-plane forces. Mt is a couple of tangential forces, because the shell elements have
    no drilling rotation.
  - All three are spread over the plug ring at 0.75·r0, weighted by the angle each node covers. That
    avoids an in-plane point load, which is singular in a membrane.
- **Signs:**
  - FE shear is reported in WRC's point convention: the (s, x) shear at A/B and its negative at C/D.
  - With Vc, Vl and Mt all mapped with sign +1, FE and WRC shear agree in sign at every loaded point.
    That also reproduces WRC's pattern (Vc and Mt add at A and subtract at B; Vl and Mt subtract at C
    and add at D).
  - WRC gives no normal stress for Vc or Vl, so their direction relative to P, Mc and Ml cannot be
    checked against WRC.

CAESAR II nozzle (γ 48, β 0.155), per unit load, maximum stress intensity, MPa:

| Load | Shell FE | WRC 537 | FE / WRC | FE shear / WRC shear at the WRC points | Finer mesh (16 330 DOF) | Plug 8 × T | Loaded at 0.5·r0 |
|---|---|---|---|---|---|---|---|
| Mt 10 kN·m | 7.38 (Dl) | 6.39 | 1.16 | 0.78–1.15 | 7.37 | 7.38 | 7.39 |
| Vc 10 kN | 2.63 (Cl) | 2.07 | 1.27 | 0.69–0.72 | 2.71 | 2.58 | 2.99 |
| Vl 10 kN | 0.76 (Du) | 2.07 | 0.37 | 0.35–0.37 | 0.77 | 0.79 | 0.75 |

What the FE shows:

- **Mt:** for a rigid round attachment, the WRC torsion formula τ = Mt/(2π·r0²·T) is exact. FE averages
  within a few percent of it. Shell curvature makes it about 20% lower at A/B and 15% higher at C/D.
- **Vl (axial shear):** WRC assumes all of the load is carried by shear, τ = Vl/(π·r0·T). FE splits it
  into bearing stress on the loaded side (A/B, about 0.63 of WRC's τ) and shear on the flanks (C/D, 0.37).
  Classical elasticity for a rigid circular inclusion loaded in a flat plate splits the load the same way
  (more as bearing than as shear). So WRC overstates the stress intensity for Vl, here by about 2.7 times,
  which is conservative.
- **Vc (circumferential shear):** the shear at A/B is 0.7 of WRC's. A tangential load also bends the
  curved shell, giving ±2.3 MPa of bending stress at C/D, which WRC 537 does not include at all. The
  governing point moves from A/B (WRC) to C/D (FE). This bending depends on how the attachment carries
  the load (up to 14% between the modelling choices above), so it is reported, not frozen tightly.

The original plan assumed that "the shear-stress formulas are exact, so they should agree closely". That
holds for Mt only. The Vc/Vl differences are differences in kind, and the panel and the report say so.

**Contour:** the FE result now includes the element-average stress intensity of every ring element
between r0 and 2.5·r0. `src/app/wrc/fe-contour.js` draws it as SVG:

- two plots (outside and inside surface) with one sequential 8-band blue scale;
- the 8 WRC points marked, and a hover readout in the app;
- the same markup in the printed or downloaded report. The report now has an FE section (the 8-point
  table with FE σφ, σx and τ, plus the contour) whenever the FE run matches the current inputs.

It is drawn as a small SVG of its own, not with the workbench canvas renderer the plan suggested. That
renderer is part of the lazy-loaded LAFEA chunk (5.1), and the report needs static markup that prints.

**Checks:** the new `scripts/wrc-nozzle-fe-shear-check.mjs` (in `check:all`, about 2 min) checks:

- the solve is accepted;
- shear signs and shear-size bands at every WRC point;
- frozen maxima (±1%) and FE/WRC bands;
- superposition through the app path with all three loads together;
- the contour field.

`e2e/wrc-calculator.spec.js` checks the six-load comparison, both contour plots, the hover readout and
the FE section in the downloaded report.

**2026-11-26: Phase 5.3, LAFEA plate form.** The LAFEA tab has a "Set up a plate" form
(`src/app/lafea/lafea-plate.js`, `lafea-view.js`):

- a rectangular plate, or one with a central round hole;
- dimensions, E and ν;
- each edge's support (free, fixed, roller in x or y) and uniform normal and shear stress;
- the mesh size.

It builds the same domain-first model as the worked example. The hole is a HOLE loop of four clockwise
arcs, which the general mesher already supports. Inputs it cannot use are refused with a plain reason:

- supports that let the plate slide or rotate;
- a load on a fixed edge;
- a hole leaving under 5% of the plate;
- a result point outside the material;
- a mesh whose finest level would exceed about 4,000 elements.

**The mesher was too slow, so three core fixes were needed.** Meshing the plate with a hole took
9.5 s at 1,094 elements, and at h = 10 mm (1,960 elements) it ran for 376 s.

1. **`lawsonFlip` (`src/core/lafea-meshing/constrained-delaunay-t6.js`).**
   - *Problem:* it did one flip per pass, then rebuilt and re-sorted the whole edge index (about
     O(n² log n)).
   - *Fix:* the index and a heap of candidate edges are now kept up to date incrementally. It makes the
     same flips in the same order: the first violating edge in sorted key order.
   - *Evidence:* the meshes of 8 test cases are byte-identical, and 20 random triangulations match a
     copy of the original algorithm.
2. **Flip cycle guard (same file).**
   - *Problem:* the in-circle test uses an absolute 1e-12 threshold on a determinant of about 10⁶ here.
     On a nearly cocircular quad, both diagonals pass in floating point, and the flips alternate until
     the n² pass cap. On the small sub-meshes of interior refinement that cap is only a few thousand,
     so in one h = 14 mesh one edge was flipped 3,496 times, and which diagonal survived depended on the
     cap's parity.
   - *Fix:* an edge that has been flipped away 3 times can no longer come back. In exact arithmetic,
     a Lawson flip never brings back a removed edge.
   - *Effect:* the h = 10 mesh now takes 1.4 s instead of 376 s. Meshes without a cycle are unchanged.
     The h = 14 plate mesh changed, because its old result was a cap-parity artifact; both diagonals
     there are equally Delaunay.
3. **SHA-256 (`src/core/shared-primitives/canonical-json-sha256.js`).** Mesh custody hashes every
   artifact.
   - *Fix:* the hash now uses int32 arithmetic with hoisted constants, and the canonical-JSON writer
     builds its error-path strings only when it throws.
   - *Evidence:* identical to `node:crypto` on 700+ inputs, with the same error messages.

Together: mesh generation is 3–15× faster, and a solve plus a 3-level study of the plate with a hole
takes about 30 s. `check:all` still passes everything it passed before, so no frozen upstream mesh or
hash moved. `scripts/lafea-mesher-speed-check.mjs` keeps all of this.

**Kt result.** The default case is a 400 × 200 × 10 mm plate, d = 20 mm (d/W = 0.1), fixed on the left,
100 MPa on the right, mesh 40 / 20 / 10 mm.

| | FE | Reference | Difference |
|---|---|---|---|
| Kt (finest mesh) | 3.047 | 3.025, finite-width plate in tension (the cubic fit given in Roark's Formulas), gross section | +0.7% |
| Peak σ1 at the hole edge, h = 40 → 10 mm | 307.7 → 304.7 MPa | — | 1.0% change |
| End displacement (study point) | 0.20063 → 0.20070 → 0.20072 mm, MONOTONIC_CONVERGING | σL/E = 0.200 mm | +0.4% (the hole adds compliance) |

With mesh sizes 32 and 28, Kt was 3.023 and 3.052, and the studies passed.

**Finding: the study's result point cannot be the peak stress.**
- *What happens:* the hole edge is meshed by its curvature (15° arcs) at every level, not by h. Direct
  element stresses at or near the edge therefore move up and down by 1–2% between meshes.
- *Tried and dropped:* points at 1.002a, 1.25a and 1.5a passed the governed study on some ladders and
  were OSCILLATORY or DIVERGENT on others.
- *Plain plate:* the stress is exact on every mesh, so a stress point shows only rounding changes,
  which the study also calls OSCILLATORY.
- *Decision:* the automatic study point is the displacement at the most loaded edge, which converges
  steadily. Kt is read from the peak on the coarsest and finest mesh and compared with the reference.
  The strict classifier was not loosened.
- *Possible follow-up:* a mesh-profile option that ties the arc resolution to h would let a point at
  the hole edge itself go through the study.

**Checks:**
- `scripts/lafea-plate-form-check.mjs` (about 65 s) covers validation, the Kt case end to end and the
  plain plate against σL/E.
- `scripts/lafea-mesher-speed-check.mjs` covers the three core fixes.
- `e2e/lafea-plate.spec.js` drives the form in the browser, from validation through build and solve to
  Kt, and checks that the inputs are remembered.

**2026-11-26: Phase 5.5, inherited checks triaged (closes A3 and roadmap item 21).** All 128 checks that
`check:all` skipped as KNOWN were run again and sorted one by one. 13 remain on the list, each with a
plain reason in `scripts/known-upstream-failures.json`.

| What happened | Count | Examples |
|---|---|---|
| Fixed: the test was stale, the code was right | 18 | New `PRESSURE_RADII` input group and Undo wording (EMP1 layout, issue 1743); WRC 537 gate records that moved on upstream but stay BLOCKED; a mesh-quality fixture weaker than the tightened policy (aspect-ratio warning 5 vs 3); the new Convergence workflow step; closed-end pressure cases that must now say whether the axial load includes pressure thrust; a near-zero GCI fixture that no longer counts as near zero under the relative rule; a fake DOM missing `replaceWith` |
| Already pass, or pass with python3 | 5 | B01 registered route (54 runs) and metamorphic route (270 runs) need `python3` for their mesh generator: CI has it, and `check:all` reports them as SKIPPED where it is missing |
| Deleted | 92 | 75 cannot run here: they need modules, data or scripts that were not extracted (the combined-app facade, templates, LFEA, oracle data), upstream exact-head or clean-checkout gates, or `--base <sha>` arguments. 13 only assert upstream source shape (line-count ceilings, regexes on source text). 3 are aggregates whose parts run on their own. 1 tests the superseded V1 B02D polar mesh, which upstream replaced with V2 because V1 blocks T3/T6 quality by design |
| Kept as KNOWN | 13 | 10 real gaps (below); 2 too slow (the full B02D production runs: they timed out upstream and did not finish in 30 minutes here, so pass or fail is not established); 1 helper |

Another 16 files went with them: the source guard and benchmark-custody check that only read deleted
scripts, upstream runner scripts that only call deleted checks, and diagnostics nothing else uses. Four npm
scripts that ran deleted checks were removed. `lafea.4-contract-check` no longer imports the MITC
aggregate, so the CST/DKT shell contracts that the WRC FE cross-check relies on are checked again.

**Real gaps found (all upstream, none caused by this repo):**

| Gap | Affects the app? |
|---|---|
| **Jacobi-PCG stall.** On the slender fine-mesh cantilever (bucket-01) the sparse solver ends at residual 1.2e-8 against a 1.1e-10 target after 34,816 iterations; the plane-strain B-bar thick cylinder stalls the same way. | Possibly: a very slender plate in the plate form uses the same solver. The default and tested plates converge. |
| **B01 negative inputs accepted.** The direct LAFEA.3 route accepts an inverted T3 element and misplaced T6/Q8 midside nodes, and keeps a result accepted after its source changes (4 of 16 negative cases). | Not for app meshes: they come from the mesher, which has its own quality gate. A hand-imported mesh would get through. |
| **LAFEA.4 shell mesher with holes.** Quality blocks for flat and curved shells with holes; the curved-hole contract rejects its own point keys (4 checks). | No: only the full LAFEA.4 workbench uses it. The WRC FE cross-check builds its own nozzle mesh. |
| **Experimental MITC4 at t/L = 0.001** fails its own recovery-energy check (2 checks). | No: the shell FE uses CST+DKT. |
| **B02A definition drift.** The frozen B02A benchmark file was edited upstream after its freeze. | No. |

**2026-11-26: Phase 5.4, partly done: a PV Elite WRC 297 reference.** The only new data was a PV Elite 28
report for one 36-inch nozzle (914.4 × 10 mm) on a 2111 mm ID × 25 mm column shell, with a
1064.4 × 25 mm pad and all six sustained loads. PV Elite evaluated it with **WRC 297**, not WRC 537, so
it cannot be a WRC 537 benchmark: the two methods use different curves. The numbers are frozen in
`validation/emp1/pvelite28-wrc297-36in-nozzle/` (the PDF itself is not committed; `validation/**/*.pdf`
is now ignored), and `scripts/wrc-pvelite-wrc297-reference-check.mjs` checks what does not depend on
the method:

| Check | Result |
|---|---|
| PV Elite's 24 printed stress intensities (vessel at the junction and at the pad edge, nozzle at the junction) from its own summaries, using our Tresca function | all within 6 kPa (rounding of the printed summaries) |
| PV Elite's vessel stresses rebuilt from its printed WRC 297 coefficients | 24 of 24 terms: stress = **1.2 (shell SCF)** × coefficient × load / T² (P) or / (d·T²) (Mc, Ml), × 6 for bending; every implied coefficient within 0.0008 of the printed one |
| Sign of each load term (P, Mc, Ml; membrane and bending) at each of the 8 points, ours vs PV Elite | all 192 term-points (2 locations × 12 terms × 8 points): same sign wherever PV Elite prints a value, zero wherever it prints zero (Mc at A/B, Ml at C/D) |
| Shear from Vc, Vl and Mt | within 1% at all 16 points |
| Linear-γ vs log-γ interpolation, our WRC 537 | same governing point (Cu); 1.8% apart at γ = 21.6, 1.3% at γ = 42.7 |

**Why the stresses differ.** Two reasons, now separated:

1. PV Elite applies the 1.2 shell stress concentration factor from its input to every load stress. With
   Kn = Kb = 1 our results are 1.2 times lower for that reason alone.
2. With the same 1.2 on both sides, the rest is the method. WRC 297 and WRC 537 split the load between the
   two directions differently: at the junction PV Elite's stress normal to the plane is 1.4 to 2.9 times
   ours, while its stress parallel to the plane is 0.3 to 0.6 times ours. Per load term the ratio runs
   from 0.28 to 3.69.

Load-only stress intensity (pressure rows removed from PV Elite), both with the 1.2 SCF:

| Location | γ, β | PV Elite WRC 297 governing | Ours, WRC 537 governing | Ratio |
|---|---|---|---|---|
| Nozzle-to-shell junction (PV Elite adds the pad: T = 50 mm) | 21.6, 0.370 | 42.5 MPa at Bu | 30.6 MPa at Cu | 1.39 |
| Pad edge (T = 25 mm) | 42.7, 0.436 | 153.6 MPa at Cu | 86.4 MPa at Cu | 1.78 |

So for this nozzle our WRC 537 result is lower than PV Elite's WRC 297 result, and at the junction the
governing point is different. That is a property of the two methods, not an error found in either
program, but an engineer comparing the two reports should expect it. Both pad treatments are PV Elite's
WRC 297 choices: at the junction the pad is added to the shell, at the pad edge it is modelled as part of
a thick nozzle (t = 85 mm). Our runs use the same thickness and diameter at each location.

**What this does not settle.** Interpolated γ is still engineering judgement: the only external WRC 537
reference is still the CAESAR II case at γ = 48. 5.4 stays open for WRC 537 output from CAESAR II or
PV Elite.

**2026-11-26: Status & roadmap tab.** A third app tab shows, in the app itself:
- the direction set by the owner: a universal canvas plus an empirical local-stress solver that reads
  like a light FE app;
- what works today;
- 19 known issues (what happens, what to do today, fix status), filterable by area;
- 6 planned improvements, starting with finishing the UI;
- the roadmap in four stages (A canvas, B empirical solver on the canvas, C empirical and FE together,
  D wider coverage) and the decisions only the owner can make.

The content is plain data in `src/app/status/status-content.js`. `scripts/wrc-app-status-content-check.mjs`
checks its structure and that the facts it states (tabulated γ rows, the KNOWN-check count, the PV Elite
ratios) match their sources. `e2e/app-status.spec.js` checks the tab and its filter, and that it does not
load the LAFEA workbench.

**2026-11-27: reinforcing pads in the WRC calculator.** WRC 537 has no pad rule (the bulletin lists pad
guidance as future work). So the calculator uses the two-location practice that PV Elite uses:
- at the attachment, the pad is added to the shell wall on the outside: T = t − CA + t<sub>pad</sub>, with Rm
  the mean radius of that wall;
- at the pad edge, the shell alone is checked, with the pad diameter as the attachment.

Each location gets its own range checks and 8-point table. The governing value, envelope and code check take
the worse location, and the result and report label the method as practice, not a WRC rule. Evidence
(`scripts/wrc-pad-check.mjs`):

| Check | Result |
|---|---|
| Per-location geometry from PV Elite's raw inputs (shell ID 2111, T 25, nozzle 914.4, pad 1064.4 × 25) against its printed values | exact: D 2161 / T 50 / d 914.4 at the attachment, D 2136 / T 25 / d 1064.4 at the pad edge |
| Pressure hoop p·Rm/T against PV Elite's largest hoop pressure stress | 11 317 vs 11 320 kPa (0.03%) and 22 372 vs 22 372 kPa |
| Shear from Vc, Vl and Mt | within 1% at 16/16 points |
| Torsion alone, τ = Mt/(2π r0² T), by hand | exact at 8/8 points at both locations |
| No pad (blank or 0) | identical to the single-location result |
| Shell FE cross-check at the pad edge (pad as the rigid attachment), 36-inch example, all six loads | FE/WRC 1.17 at Cu, same governing point; 7 660 DOF, 21 s |

The check at the attachment (shell + pad) has no FE counterpart in the current shell model.

**2026-11-27: rectangular attachments (lugs).** The rules were read from the licensed WRC 537 PDF (printed
pages 13 and 17, Tables 6–8 on pages 31–32). Each load and stress component gets its own β, read on the same
curves as a round attachment:
- radial load: equations 28–30 with Table 6;
- Mc and ML: §4.2.2.4–5 with Tables 7 and 8;
- shear: equations 50–51.

§4.3 uses "the applicable values of γ and β" both to read each curve and in its stress formula, so each term's
own β appears in both places. The calculator reuses the verified Table 5 core for the signs and the
superposition.

Engineering judgement, labelled in the app and the report:
- Table 7/8 factors between printed rows are interpolated, linearly or in log γ (the user's choice) and in
  log(β1/β2), with factor 1 for a square (§4.2.2.2);
- the Table 6 K for a component (Nφ, Nx, Mφ, Mx) is used at every point where that component is evaluated.
  The round route reads different P curves at A/B and C/D, validated against CAESAR II.

Blocked: torsion on a lug (§4.3.4, "acceptable methods … are not available"), β1/β2 outside 0.25–4, Mc/ML
on a non-square footprint below γ 15 (Tables 7–8 start there), and any term β outside 0.05–0.5. A thin plate
welded straight to the shell (for example 300 × 25 mm, β1/β2 ≈ 0.08) is outside the range. A pad does not
change that at the lug itself.

Evidence (`scripts/wrc-lug-check.mjs`):

| Check | Result |
|---|---|
| Tables 6–8 in code vs the `docs/emp1` extraction | 116 values equal, parentheses (approximate rows) equal |
| Independent hand calculation at γ = 100, β1/β2 = 2 (every factor a printed value), all six terms of P, Mc, ML plus Vc, VL | σφ, σx, τ and SI at 8/8 points to 1e-9 |
| Square footprint vs round attachment with r0 = c/0.875 (equations 26–27), γ 62 | normal stresses identical at 8/8 points; shear V/(4cT) |
| Factor interpolation | exact at printed rows, 1 for a square, continuous through it, approximate rows flagged |

There is no external lug benchmark yet, and the shell FE cross-check has a round footprint only.

**2026-11-27: lug roadmap.** The Status & roadmap tab now lists 10 planned improvements in the
recommended order (details in NEXT-PHASE-PLAN.md):
1. interpolation spread for lugs;
2. a lug benchmark from the owner's licensed program (cases ready in `docs/LUG-BENCHMARK-REQUEST.md`,
   checked to be accepted by the calculator);
3. trunnions;
4. FE for lugs;
5. a code method for thin plate lugs;
6. then the UI finish.

**2026-11-27: PL-01, interpolation spread for lugs.** When a Table 7/8 factor used by a non-zero load is
interpolated, the lug is run again with the printed rows on each side of each bracket instead: lower or upper
β1/β2 row × lower or upper γ row, up to four corner runs. The curves are read exactly as in the main run; only
the factors change. The low–high governing stress is shown under the result and in the report, and flagged
when wider than 10% of the governing value. The corners show how much the judgement matters; they are not a
proven bound.

| Lug (shell OD 1500 × 12 mm, γ 62) | Spread of governing SI |
|---|---|
| 200 × 100 mm footprint (β1/β2 0.5), app example loads | 150.10–156.26 MPa, 4.0% (Table 7/8 ratios printed, γ interpolated) |
| 200 × 60 mm (β1/β2 0.3), Mc only | about 22%: flagged (the 0.25 and 0.5 rows of Table 7 differ a lot) |
| Printed factors only (γ 100, β1/β2 2), or a square footprint | no spread |

So narrow lugs under Mc are where the interpolation judgement matters most. They are the first candidates for
the lug benchmark (PL-02) and FE (PL-04).

**2026-11-27: PL-03, trunnions.** WRC 537 §4.2.2 describes a round attachment on a cylinder only by r0. It
has no solid/hollow or rigid/flexible selector (see `docs/emp1/WRC537_2013_Cylindrical_Attachment_Class_Authority.md`),
and §4.3.4 itself gives "a pipe" as the example round attachment. So a trunnion is the round route with its own labels:
- a solid bar or pipe choice, recorded but not changing the stress;
- a note that a hollow trunnion is treated as rigid;
- a pressure note without the opening-edge remark, since a trunnion does not open the shell;
- "stresses in the trunnion and its weld are not calculated".

`scripts/wrc-trunnion-check.mjs` confirms trunnion = nozzle at all 8 points on the γ = 5 hand calculation and the
CAESAR II case, and solid = hollow. Not done: entering the support load at the trunnion's free end and moving it
to the shell (the moment arm). Its signs need the WRC 537 Figure 2 axes checked first.

**2026-11-27: PL-04, FE for lugs.** `src/app/lafea/lug-shell.js` is the round nozzle model with a rectangular
footprint:
- rings run from the footprint edge out to a rectangle d = 1.5·max(c1, c2)/0.875 further out, so the
  footprint corners are mesh nodes;
- the footprint is a stiff plate (4× the shell thickness, as for the nozzle plug);
- all six loads go onto its interior nodes as statically exact forces about the centre: P uniform, Mc and Ml
  linear, Vc and Vl uniform, Mt as a couple. A long, narrow plug is not rigid, so a centre point load would bend
  it; spreading the load is also how WRC 537's rectangular solution applies it.

Stresses at A–D are extrapolated to the middle of each edge, with the same sign conventions as the nozzle model.
Every single load gives the WRC 537 sign at every point it loads; torsion (refused by WRC 537 on a lug) gives the
sign of WRC 537's round-attachment torsion at all 8 points.

FE / WRC, maximum over the 8 points, one load at a time (shell 1500 × 12, γ 62):

| Footprint | P | Vc | Vl | Mc | Ml |
|---|---|---|---|---|---|
| 200 along × 100 around (the app example, β1/β2 0.5) | 0.71 | 0.36 | 0.50 | 0.66 | 0.71 |
| 200 along × 60 around (β1/β2 0.3) | 0.64 | | | 0.60 | 0.74 |
| 100 along × 200 around (β1/β2 2) | 0.78 | | | 0.89 | 0.50 |
| 100 × 100 square | 0.76 | | | 0.66 | 0.57 |
| WRC-equivalent round plug, r0 = 50/0.875 (nozzle model) | 1.31 | | | 1.27 | 0.92 |

WRC 537 gives a square the stresses of the round attachment with r0 = c/0.875. With both stiff, FE does not. At
the middle of the square's edges it finds 0.53× the round plug's edge stress (Mc). The highest element next to
a corner is 1.22× the round plug's edge stress. So a stiff rectangle carries much of its load at the corners:
WRC 537 overstates the stress at the middle of a lug's edges and understates it at the corners.

The corner of a stiff rectangle is a stress singularity in a shell model, so the corner value is shown
separately and labelled mesh-dependent. Sensitivity, run once (too slow for every check run):
- mesh: 24 divisions and 15 rings (16 050 DOF, against 8 950) change the 8-point maxima by under 1.2%, but the
  corner value by 21–28%;
- plug stiffness: a 12×-thick plug lowers the 8-point maxima by 4–8% on the example, and by up to 13% on a
  28 mm wide thin plate.

On a real lug, the weld fillet sets the corner stress.

The FE route (`wrcFeReference`):
- **Compare.** The lug WRC 537 solves, at the pad edge when there is a pad. That includes a thin plate on a pad:
  the pad edge is still a WRC 537 case even when the shell + pad location is refused.
- **FE only.** A lug refused only for WRC 537's own lug limits: torsion, β1/β2 outside 0.25–4, Mc/ML below γ 15,
  or a term β outside 0.05–0.5. The panel and report then show the FE stresses alone, say why, and remind the
  user to enter a thin plate's weld footprint (plate thickness plus both weld legs).
- **Blocked.** Round attachments outside WRC 537, γ outside the curves, the length rules and input errors stay
  blocked.

Example: a 200 × 28 mm plate with torsion gives FE 199.91 MPa at Au, and its corner value is 363.51 MPa.

Checks:
- `scripts/wrc-lug-fe-check.mjs`: the mesh, the load resultants, signs, frozen maxima and ratios,
  superposition;
- `scripts/wrc-lug-fe-route-check.mjs`: routing, the thin plate, square vs round, report and contour;
- an e2e test for the FE-only route in the browser.

No simple torsion formula was added (see NEXT-PHASE-PLAN.md).

**2026-11-27: PL-06 part 1, one look, layouts and keyboard.** PL-06 (finish the UI) is split into three parts.
This first part covers the app shell, the WRC calculator, the plate form and the status page.

- **One look.** `src/app/theme.css` holds the colours, type and control styles. The calculator's and the status
  page's own variables point at it, and the plate form and example bar now use the calculator's inputs, buttons
  and 14 px text. The printable report keeps its own light styles.
- **Layouts.**
  - Laptop: the form and results stay side by side from 900 px wide, and the form takes at most 40% of the width.
  - Tablet held upright or phone: one column, with a strip under the app bar that keeps the governing result in
    view while the form scrolls. Its "Results ↓" button jumps to the results.
  - Phone: the form no longer runs 58 px off a 375 px screen (fieldsets and long dropdown options now shrink).
  - Tablet: the FE contour readout works by tap (pointer events), and an out-of-range γ, β or β1/β2 chip writes
    out its allowed range instead of only showing it in a tooltip.
- **Keyboard.**
  - The view tabs and the Empirical sub-tabs follow the ARIA tabs pattern. Only the open tab is in the Tab
    order; Left/Right/Home/End move between tabs; Enter opens one. Activation is manual because the LAFEA tab
    loads the large workbench.
  - "Skip to content" is the first stop on the page.
  - Each view is a link (`#LAFEA`, `#EMPIRICAL`, `#STATUS`) that works without a reload, and the browser tab
    title names the open view.
  - Load cases in the envelope table are buttons. After a redraw, the keyboard focus goes back to the case that
    was picked; leaving a box without a change no longer redraws the results.
  - The status page's section buttons move the focus to the section heading.
- **Screen readers.**
  - The results panel was one live region, so every keystroke re-read the whole table. Now one sentence is said
    once typing pauses, such as "Governing stress intensity 72.67 MPa at point Au." The FE run says when it
    starts and finishes, not every second.
  - The plate form's edge-table inputs had no names. Each now says its edge and quantity, for example
    "Left (x = 0) edge: support".
- **Bug fixed.** "Loading LAFEA…" stayed above the advanced EMP.1 workflow after it loaded.

Checks:
- new `e2e/app-ui.spec.js` (4 tests): tabs, links and skip link; the spoken result, the tablet strip and a phone
  with nothing wider than the screen; picking load cases from the keyboard; a name on every control of the
  calculator (four examples) and the status page;
- the plate spec checks every plate input has a name;
- the workflow spec checks the loading line is gone.

Still to do in PL-06:
- **Part 2:** help text on every input, and inch/lbf/psi units in the calculator and its report.
- **Part 3:** the LAFEA workbench and the advanced workflow. Move the custody and authority text into a
  "Technical details" drawer, use plain example defaults, and bring the same look and keyboard checks there.

**2026-11-27: PL-06 part 2, US units and help text in the WRC calculator.**

- **Units.** A case is shown in SI (mm, MPa) or US customary (in, psi). Calculations are unchanged: the case
  still stores lengths in mm and pressure and allowables in MPa, and `units` only chooses the display
  (`src/app/wrc/wrc-units.js`).
  - **Loads** keep their own units, now N, kN, lbf or kip and N·m, kN·m, N·mm, in·lbf, ft·lbf, in·kip or ft·kip.
    All factors are exact (1 in = 25.4 mm, 1 lbf = 4.4482216152605 N).
  - **Switching the system** converts the form and every load case's loads to the matching units (N ↔ lbf,
    N·m ↔ ft·lbf, N·mm ↔ in·lbf), so the physical case is the same. Back in SI, the boxes show the typed values
    again. US boxes show 7 significant figures, and a box left alone keeps its exact stored value.
  - **Follows the units:** the results, code check, envelope, live summary, the calculator's reasons and
    warnings (for example "Attachment OD must lie between 2.22 and 22.21 in"), the report, and the FE table,
    edge-peak text and contour. An inch shows one more decimal than a mm; a psi shows two fewer than a MPa.
  - **Saving:** the choice is saved with the case. An example opens in the units the user has chosen. Old
    cases open in SI.
- **Help text** under every input, linked with `aria-describedby` so screen readers read it with the input. The
  "Help text" box in the bar hides the lines and is remembered.
  - Each line says what the input is and how it is used.
  - Three facts in the load help are checked against the calculator: +P pushes the attachment into the shell
    (compressive membrane at A–D); Mc is largest at C or D; Ml is largest at A or B.
- **Also:** the panel now listens for changes on the bar too, so editing the case title is saved at once.

Checks:
- new `scripts/wrc-units-check.mjs`:
  - exact factors;
  - all six examples go SI → US → SI and give the same stresses;
  - formatting;
  - messages, report and contour in US, with SI text unchanged;
  - the three load-help facts;
- new `e2e/wrc-units-help.spec.js` (3 tests):
  - switching and typing in inches;
  - examples keep the units;
  - every input has a description, and the help toggle.

**2026-11-28: PL-06 part 3, the LAFEA workbench, the advanced workflow and the plate form.** Closes L5 (noisy
workbench screens) and the plate form's share of KI-09 (metric only). E6 (the advanced workflow's example) is
left as it is, pending the owner's decision (below).

- **One look.** `src/app/lafea/workbench.css` maps the workbench's colours onto the app theme: its own
  `--workspace-*` variables, then the panels, controls, stage buttons, tables and the main action of each step
  (the app's blue instead of teal and sky blue). The workbench marks many colours `!important`, so the overrides
  do too. Everything is scoped to `.app-view`: the original `lafea.html` page and its upstream tests see no
  change.
- **Technical details** (`src/app/lafea/tech-details.js`). A switch in the LAFEA example bar and above the
  advanced workflow, off by default and remembered. Off, the app hides:
  - the header's custody block and stage line;
  - the "N governed checks" lists, the technical-identifier and qualification-evidence drawers, and the
    advanced mesh evidence;
  - raw render codes and the "Scene Revision" line in the model view;
  - JSON paths and the Source/status column of the input tables;
  - the formula identity, source path and authority columns of the result table, and the solver-evidence line.
  On, everything shows where the workbench puts it. Working menus that share the workbench's custody style
  ("More actions", "Readiness and technical details", "Blocking evidence") are not hidden. The scope statements
  ("Authority: … does not calculate WRC 107/537 …") and the solver limitations stay visible, because they say
  what a result may be used for.
- **Keyboard and screen readers** (an audit of every control in both screens, then three upstream fixes):
  - the model view gave **every mesh element its own Tab stop**: 206 of the 297 Tab stops on the solved
    example, and thousands on a plate. The mesh is now one Tab stop (roving tabindex): arrow keys move between
    elements, Home and End jump to the first and last, Enter selects as before
    (`src/workspace/lafea-canvas/retained-mesh-overlay.js`);
  - the continuum formulation box had no name (`lafea-analysis-settings-view.js`);
  - the model view's drawing had no name; it is now "Model view: geometry, mesh, supports and loads"
    (`hybrid-viewport.js`);
  - everything else already had a name, and no control had a positive tabindex or a duplicate id.
- **Plate form.**
  - **Units:** SI (mm, MPa) or US (in, psi), as in the calculator, reusing `src/app/wrc/wrc-units.js`. The plate
    is stored and solved in mm, N and MPa; `units` only chooses the display. A box left alone keeps its exact
    stored value, so SI → US → SI shows the typed values again. The model is identical in both systems (same
    source hash, domain, mesh and study). In US the Kt example reads 15.75 × 7.874 in, a 0.7874 in hole and
    14504 psi on the right edge, and gives the same Kt = 3.047 (44195 / 14504 psi).
  - **Help text** under every input, the edge table and the result point, linked with `aria-describedby`. The
    "Help text" box shares its setting with the calculator.

**E6, the advanced workflow's example, is not changed.** "Run complete example" loads the γ = 5 qualification
sample (four pressure definitions, ten reference points, a 35.43 mm attachment). 19 checks are built on it,
including the γ = 5 hand calculation (Au 72.6728 MPa) that anchors the WRC 537 core, so making it plain would
cut that evidence. Owner decision 2026-11-28 (NEXT-PHASE-PLAN, decision 6): keep it, and treat the calculator's
six examples as the plain starting points. E6 is closed as "kept by decision", and PL-06 is done.

Checks:
- new `e2e/lafea-workbench-ui.spec.js` (3 tests):
  - workbench: technical details hidden by default and shown and remembered when ticked, the app's background
    and font, a name on every control, the mesh as one Tab stop with the arrow keys;
  - advanced workflow: the same switch, its menus still shown, a name on every control;
  - plate form: SI → US → SI, the build message and the mesh-size reason in inches, a help line on every
    input, the help toggle remembered;
- `scripts/lafea-plate-form-check.mjs`: units default to SI, the reason in inches (SI unchanged), and the units
  do not change the model;
- the upstream source checks on the three changed files still pass.

**2026-11-28: canvas step A1, the sketch of the WRC inputs (roadmap stage A).** The first step of the canvas
plan in NEXT-PHASE-PLAN, on the empirical track. The owner also set a rule: keep FE and empirical work apart
(a one-time FE run to build data or fit an approximation is fine).
- `src/app/wrc/vessel-sketch.js` draws two SVG views of the calculator's inputs:
  - **side view:** the shell along its axis with its wall (dashed), the ends (dashed when no length is given),
    the attachment at its station, a pad, and dimensions for OD, length, station, attachment and pad;
  - **end section:** the wall and the corrosion allowance (dashed), the attachment on top and a pad band, with
    the OD, the attachment width around and the pad width around.
- It is to scale except the attachment's height, which is not an input, and the caption says so. Missing
  inputs give a note instead of a guess: no length, no station, no attachment size, no shell.
- It is redrawn on every input, in the case's units (6 significant figures in SI, 4 in US), and printed in
  the report after the geometry table in black on white. Each view has a name for screen readers that
  states the inputs, and "Sketch" folds it away.
- The sketch only reads the case: the check confirms that the input and the WRC 537 results of all six
  examples are unchanged.
- The dimension lines (extension lines, arrowheads, a label that reads upright) are adapted from Pdf-Hub's
  `DimensionNode.tsx` (MIT). Nothing from React or Konva is used, and nothing is added to the first load
  apart from the sketch code itself.
- The status page's canvas row moves from "not started" to "partial", and the four canvas decisions
  (7–10 in NEXT-PHASE-PLAN) are on the page.

Checks:
- new `scripts/wrc-sketch-check.mjs` (in `check:all`): two named views for the six examples in SI and US with
  finite numbers only; the dimensions read the inputs (lug, γ = 5 case, pad); notes for missing inputs; input
  and results unchanged; the report holds the sketch in plain colours;
- new `e2e/wrc-sketch.spec.js` (2 tests): the default nozzle's dimensions and screen-reader name, redrawing as
  you type, US units, a lug in both views, folding away; no sideways scrolling on a phone.

**2026-11-28: canvas step A2, several attachments on one shell.** Owner decisions 7 and 8: the canvas lives
in the Empirical tab above the calculator form, and the model file is empirical only.
- `src/app/wrc/vessel-model.js`: a vessel is a shell and up to 20 attachments. An attachment joined with the
  shell is exactly the calculator's single case (`caseFor`), so the WRC 537 core is used unchanged. The shell
  holds what one shell shares (size, length, corrosion allowance, pressure, allowables, method settings);
  an attachment holds its name, type, size, pad, position along and around, Kn/Kb and load cases.
- The "Vessel" box above the form: a button per attachment, "+ Add attachment" (a copy a quarter turn round),
  "Delete attachment", the sketch, and with two or more attachments a table of each one's governing stress
  intensity, point, load case and code check, naming the highest. Picking an attachment loads it into the
  form; the focus stays on what was picked.
- Each attachment is checked on its own. WRC 537 does not cover two attachments close together, and the
  table caption says so; the spacing warning is A4 (decision 9).
- The position around the shell is new and used for the drawing only: the loads stay in each attachment's
  own WRC 537 axes (vessel axes are A5, decision 10).
- The sketch draws every attachment: in the side view (seen from the 90° side) as a stub up or down, or as a
  foreshortened footprint on the face (dashed behind the shell); in the end section turned to its angle. The
  selected one is highlighted and dimensioned, with its angle as an arc in the end section.
- Files: `*.vessel.json` (`lafea-emp-app/vessel/v1`); a `*.wrc.json` case from before opens as one
  attachment. The browser copy moves to the key `lafea-emp-app/wrc-vessel`; the old key is read once.
- The report is for the selected attachment, names it ("Attachment N1, one of 3 on this shell") and its
  sketch shows the whole shell.
- New example "Vessel: two nozzles and a lug" (the lug example's shell with N1, N2 and L1).

Checks:
- new `scripts/wrc-vessel-check.mjs` (in `check:all`): the six examples give the same stresses as
  one-attachment vessels (the γ = 5 hand calculation still 72.67 MPa); shell inputs shared and attachment
  inputs kept; add, remove, unique names, angles; US = SI for every attachment, including one not visited
  since the switch; vessel files round-trip, old case files open, others are refused; every attachment equals
  its own single-case result and the highest is named; the sketch and the report show all of them;
- new `e2e/wrc-vessel.spec.js` (2 tests): the canvas above the form; the worked vessel's table; picking from
  the table with the focus kept; shared and own inputs; add, rename, delete; kept after a reload; save to a
  file and open it again; an old case file opens as one attachment with the γ = 5 result.

**2026-11-28: canvas step A3, moving attachments on the unrolled shell.** Approved by the owner after A2 merged.
- `src/app/wrc/vessel-unrolled.js`: the outside of the shell cut along the top (0°) and laid flat, position along
  left to right, angle around top to bottom. Footprints and pads at true size (along × arc length around); one
  that crosses the 0°/360° cut is drawn at both edges. The strip is 150–300 px high: a long thin shell would be
  too thin to scale, so it is stretched around and the caption gives the factor. A grid of a round step along
  (at most 40 cells, in the case's units) and 15° around.
- `src/app/wrc/canvas-snap.js`, ported from Pdf-Hub (MIT, commit 74fcb94) as plain JS: the grid snap
  (`snapToOrthogonalGrid`, one spacing per axis), the one-axis lock (`applyOrthoConstraint`, weighed in pixels),
  lining up with another attachment within an 8 px capture radius (`findSnapTarget`, per axis, the angle the
  short way round), and their order from `resolveLineEndpoint` (lock, then another attachment, then the grid).
- In the panel, under the sketch: drag an attachment to move it (it is picked first); Shift holds one axis, Alt
  or the "Snap" box turns snapping off, Esc puts it back. A wobble under 4 px is a click, not a move. Where
  attachments overlap, the selected one is grabbed. The scale is held during a drag. Each attachment is a
  focusable element: the arrow keys move it to the next grid line, Shift+arrow a small step (1 mm or 0.1 in,
  1°); Enter picks it; the new position is announced. Tab goes through them in order.
- Moving sets the attachment's position along and angle around, the same two inputs as the form, which
  follows; nothing else changes. The angle is for the drawing; position along only enters the §4.5.2
  end-distance check. Positions are held between the shell's ends.

Checks:
- new `scripts/wrc-unrolled-check.mjs` (in `check:all`, 16 checks): the ported snaps behave as in Pdf-Hub;
  `snapMove`'s order, lock, snap-off rounding, the ends and the cut; drawing ↔ shell coordinates round-trip;
  the worked vessel to scale and a long pipe stretched with its caption; the grid step in SI and US; every
  attachment drawn, named, focusable and movable, N1 at 0° shown at both edges; the guides and readout name
  what it lined up with; moving N2 leaves its stresses and the other attachments unchanged, and too near an
  end the §4.5.2 check still applies;
- new `e2e/wrc-unrolled.spec.js` (2 tests): a real mouse drag lands on the grid and updates the form, table and
  sketch; lining up with an off-grid attachment on both axes; Shift; Esc during a drag; snap off; arrow keys,
  Shift+arrow, across 0°, focus kept, the announcement, Tab and Enter, kept after a reload;
- `scripts/wrc-app-status-content-check.mjs`: the canvas row says attachments move on the unrolled view, that
  sizes and loads are still typed, and that A4–A6 are still to come.

## Roadmap

Ordered by value to an engineer using the Empirical calc. Sizes: S = under ½ day, M = 1–2 days, L = 3+ days.

### Phase 0: stop the bleeding (S, ~1 day)
1. Fix L1: un-hide the LAFEA demo button (or give LAFEA its own "Load example").
2. Fix A1: set a base font in `src/app/app.css`.
3. Fix E9: copy the missing `validation/emp1/wrc537-2013/*.json` and make the route-qualification script run.
4. Add the numeric WRC scripts (refreeze, CAUX comparison, route qualification) to `check:all`, so that a wrong stress fails the run.
5. Add CI (build, boundary check, `check:all`) and a GitHub Pages deploy.

### Phase 1: make the Empirical calc usable for real jobs (M–L, ~1 week)
6. **Plain input form** (E3): one panel with
   - shell OD, thickness and corrosion allowance;
   - attachment OD, cylinder length and attachment position;
   - P, Vc, Vl, Mc, Ml and Mt in WRC axes, with units;
   - Rm, T, γ and β shown live, with green or red range badges.

   It writes into the existing governed source, so all the checks stay.
7. **One "Calculate" button** (E5): runs load transfer → section → local in order. The current per-stage buttons move under "Advanced".
8. **Show why it is blocked** (E1): map each reason code to a sentence and a fix, for example "γ = 49.5; WRC tables are exact only at γ = 5, 15, 50…; use interpolated γ".
9. **Interpolated-γ results as a selectable route** (E2). Label it clearly as "Interpolated γ, engineering judgement, not WRC-source", and show the CAESAR II 2% comparison as evidence. This is the single change that makes the calc useful for most real geometries.
10. **Calculation report** (E4): a printable HTML/PDF page with
    - inputs and derived γ/β;
    - the WRC figures and curve values used;
    - the 8-point stress table (membrane, bending, total, stress intensity);
    - the governing point, limitations and the reviewer sign-off.
11. **Save and load** (E7): autosave to localStorage, plus "Save case / Open case" as a JSON file.

### Phase 2: widen the Empirical method (L, 2–4 weeks; each needs source data and validation)
12. Pressure stress (zero-ΔP is the current limit) and a Kn/Kb stress-concentration input.
13. Code check: PL / PL+Pb / PL+Pb+Q against S, 1.5S and 3S, with user-entered allowables.
14. Spherical shells (WRC 537 spherical tables).
15. Rectangular attachments (lugs) and reinforcing pads: done 2026-11-27 (FE cross-check for lugs still open).
16. A batch of load cases (sustained, operating, occasional) with an envelope table.
17. More benchmarks: at least 3 more CAESAR II / PV Elite cases across γ = 10–300 and β = 0.05–0.5.

### Phase 3: LAFEA (L; decide whether it is worth it)
18. Fix L2/L3 so that one example model goes all the way: load → mesh → solve → contour plot.
19. Use LAFEA as a **cross-check** for the Empirical result, with the same nozzle-on-cylinder case solved by shell FE (LAFEA.4). This is the natural link between the two tabs.
20. Hide or remove LAFEA.6 until it exists. Remove the EMP1 entry from the LAFEA stage bar.

### Phase 4: housekeeping (M, ongoing)
21. Triage the 90 stale upstream checks: fix, update or delete each, then shrink the known list to the real gaps.
22. Split the bundle: load the FE solver and meshers only when the LAFEA tab opens (target: Empirical first load under 500 KB).
23. Trim the custody/authority UI text from the main screens into a "Technical details" drawer.

### Suggested order
Do Phase 0, then items 6–9 (the Empirical tab becomes usable on real γ), then 10–11 (reports and saving). After that, decide between Phase 2 (more methods) and Phase 3 (LAFEA) based on which jobs come in.
