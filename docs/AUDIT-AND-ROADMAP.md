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
15. Rectangular attachments (lugs, trunnion pads).
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
