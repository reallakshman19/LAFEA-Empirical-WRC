# LAFEA + Empirical/WRC

A standalone app with two working views and a status page, extracted from
[reallakshman19/Advanced_Analysis](https://github.com/reallakshman19/Advanced_Analysis)
at `11eca8e40` (main, 2026-11-25):

| View | What it is | Controller config |
|---|---|---|
| **LAFEA** | Local finite-element analysis workbench (2D continuum, shell, trunnion footprint, weld profile…) | `LafeaStandaloneController`, `initialStage: 'LAFEA.3'` |
| **Empirical / WRC** | Opens on the **WRC 537 calculator** (below). The full governed EMP1 workflow is kept as the "Full EMP.1 workflow (advanced)" sub-tab. | calculator: `src/app/wrc/`; workflow: same controller, `presentationMode: 'ANALYTICAL_CALC'`, `analyticalOnly: true`, `initialStage: 'LAFEA.1'` |
| **Status & roadmap** | The app's vision, what works today, **known issues** (what happens, what to do today, fix status; filter by area), **improvements planned** and the **future roadmap** toward a universal canvas and an empirical local-stress solver. | `src/app/status/`; the content is plain data in `status-content.js` |

The LAFEA tab and the advanced EMP1 workflow use the same two configurations the
upstream combined app uses for its `LAFEA` and `EMPIRICAL` tabs
(`src/workspace/bootstrap.js` upstream). They run without the combined workspace,
LFEA, pipe-model, event bus, mock data or benchmark panels.

**First load.** Opening the app downloads only the WRC calculator (about 110 kB of JS).
The LAFEA workbench (about 1.9 MB) is downloaded the first time you open the LAFEA tab or
the "Full EMP.1 workflow (advanced)" sub-tab; "Loading LAFEA…" shows meanwhile. If that
download fails, the tab says so and offers "Try again". `npm run check:bundle-size` fails
the build in CI if the first-load JS grows past 500 kB. `globalThis.LafeaEmpApp` still works;
`await LafeaEmpApp.whenReady('LAFEA')` waits for the workbench, and the LAFEA view's
`loadExample`, `solveExample` and `getState` now return promises.

**Screens and keyboard.**
- **One look.** The calculator, the plate form, the status page, the LAFEA workbench and the advanced EMP.1
  workflow share one look (`src/app/theme.css`; the workbench's colours are mapped in
  `src/app/lafea/workbench.css`, so the original `lafea.html` page keeps its own).
- **Technical details.** The LAFEA workbench and the advanced workflow hide their internal codes, JSON paths,
  custody and qualification records until you tick "Technical details" (in the LAFEA example bar or above the
  workflow). The choice is remembered.
- **Screen sizes.** On a laptop the WRC form and results sit side by side. On a tablet held upright or a phone
  they stack, and a strip under the app bar keeps the governing result in view.
- **Links.** Each view has a link: `#LAFEA`, `#EMPIRICAL` or `#STATUS`.
- **Keyboard.** The tabs work with the arrow keys and Enter, and "Skip to content" is the first Tab stop. In
  the LAFEA model view the whole mesh is one Tab stop; the arrow keys move between its elements.
- **Screen readers.** They hear the governing result as one sentence when typing pauses.

## LAFEA example

The LAFEA tab has an example bar:

- **Load: Cantilever plate, end shear.** A 200 × 40 × 10 mm plane-stress plate, fixed on the left
  edge, with a uniform end shear traction. It is mounted on the qualified domain-first route, and its
  mesh is generated and qualified.
- **Solve + convergence study.** Solves, then runs the governed three-level mesh study (40 / 20 / 10 mm)
  on the tip deflection. The workbench publishes results only after this study passes.
  - Tip deflection converges to −0.508 mm, which is 1.4% from Timoshenko beam theory.
  - Root bending stress is 150.2 MPa, against 150.0 MPa by hand.

You can also use the workbench's own Run and Convergence steps after loading.

## LAFEA plate form

"Set up a plate", under the example bar, builds your own plane-stress plate without writing JSON:

- **Shape:** a rectangular plate, or a plate with a central round hole.
- **Inputs:** length, height, thickness, hole diameter, E and ν.
- **Each edge:** a support (free, fixed, or a roller in x or y) and a uniform normal stress (+ = tension)
  and shear stress.
- **Mesh size h:** the convergence study solves h, h/2 and h/4. Near a hole the mesh is finer
  automatically.
- **Checks:** it explains any input it can't use. For example, supports that let the plate slide or
  rotate, a load on a fixed edge, a hole that is too big, or a mesh that would take too long.
- **Saving:** the inputs are remembered in the browser.
- **Units:** SI (mm, MPa) or US (in, psi). The model is always built and solved in mm, N and MPa; the units
  only change what the form and the results show, and switching back shows the typed values again.
- **Help text** under every input, read by screen readers with it. "Help text" hides the lines; the choice is
  shared with the WRC calculator.

It uses the same domain-first route as the example. "Solve + convergence study" then reports:

- **The convergence study,** on the total displacement at the middle of the most loaded edge, or on a
  point and quantity you choose. When it passes, the workbench publishes the results.
- **For a hole, Kt:** the peak principal stress just inside the hole edge, 90° from the load, divided
  by the applied stress. It is read on the finest and coarsest mesh, and compared with the
  finite-width reference for uniaxial tension (3.0 for an infinite plate).

**Kt check (the default):** a 400 × 200 × 10 mm plate with a 20 mm hole (d/W = 0.1), fixed on the left,
with 100 MPa on the right.
- The study passes (MONOTONIC_CONVERGING), and Kt = 3.047, against 3.025 from the reference (+0.7%).
- The peak moves 1% between the 40 mm and 10 mm meshes.
- It takes about 30 s in the browser.

**Why Kt is not the study's result point:** the hole edge is meshed by its curvature (15° segments) at
every level, so the stress there wobbles by 1–2% between meshes instead of following a trend. The
governed study correctly refuses to call that convergence. See
[docs/AUDIT-AND-ROADMAP.md](docs/AUDIT-AND-ROADMAP.md).

## WRC 537 calculator

This calculates WRC Bulletin 537 (2013) local stress in a **cylindrical shell** at a
**round attachment** (nozzle, trunnion) or a **rectangular attachment** (lug, plate), at the 8 WRC points
(A–D, outside/inside surface).

- **Units:** SI (mm, MPa; loads in N or kN, and N·m, kN·m or N·mm) or US customary (in, psi; loads in lbf or
  kip, and in·lbf, ft·lbf, in·kip or ft·kip).
  - Switching converts the form and the loads, and the results, report and FE contour follow.
  - The calculation itself always runs in mm, N and MPa (`src/app/wrc/wrc-units.js`).
  - The choice is saved with the case, and an example opens in the units you chose.
- **Help text** under every input says what it is and how it is used, for example which way +P points. Screen
  readers read it with the input. "Help text" in the bar hides it.
- **Sketch** (canvas step A1, `src/app/wrc/vessel-sketch.js`): a side view and an end section of what you
  entered, with dimensions:
  - the shell's OD, length and wall, and the corrosion allowance (dashed);
  - the attachment at its station, and a pad;
  - drawn to scale except the attachment's height, which is not an input;
  - redrawn as you type, in the case's units, and printed in the report;
  - each view is named for screen readers, and "Sketch" folds it away.

  The sketch only reads the case, so the results are the same with or without it. Its dimension lines are
  adapted from Pdf-Hub (MIT).
- **Several attachments on one shell** (canvas step A2, `src/app/wrc/vessel-model.js`), in the "Vessel" box
  above the form:
  - up to 20 attachments, each with its name, type, size, pad, position along and around the shell, Kn/Kb
    and load cases. The shell, pressure, allowables and method settings are shared by all of them;
  - pick one to edit it in the form; "+ Add attachment" copies it a quarter turn round; "Delete attachment";
  - the sketch shows all of them, the selected one highlighted and dimensioned (its angle in the end section);
  - with two or more, a table gives each one's governing stress intensity, point, load case and code check,
    and names the highest;
  - each attachment is checked on its own, exactly as a single case: WRC 537 does not cover two attachments
    close together. The position around the shell is used for the drawing only;
  - the report is for the selected attachment, says which one it is, and its sketch shows the whole shell.
- **Layout: the shell unrolled** (canvas step A3, `src/app/wrc/vessel-unrolled.js`, `canvas-snap.js`): the outside
  of the shell cut along the top and laid flat, position along left to right and angle around top to bottom:
  - every attachment and pad at its true size; one that crosses the 0°/360° cut shows at both edges. A long
    thin shell is stretched around to stay workable, and the caption says by how much;
  - drag an attachment to move it. It snaps to a grid (a round step along, 15° around) and lines up with the
    other attachments; Shift moves it only along or only around, Alt moves it freely, Esc puts it back, and
    "Snap" turns snapping off;
  - or focus it and use the arrow keys: one grid line at a time, a small step with Shift;
  - moving changes the attachment's position along and around, the same two inputs as in the form, and
    nothing else. The grid, lock and snap logic is ported from Pdf-Hub (MIT).
- **Inputs:**
  - shell OD, thickness and corrosion allowance;
  - attachment type: nozzle or trunnion (OD; a trunnion is a solid bar or a pipe), or rectangular (length along
    and width around the shell);
  - optional reinforcing pad (round: outside diameter; rectangular: length and width; and thickness);
  - optional cylinder length and attachment position;
  - P, Vc, Vl, Mc, Ml and Mt in WRC axes, as **up to 20 named load cases**;
  - design pressure, and stress concentration factors Kn and Kb;
  - optional allowables S and SPS.
- **Live results:** T, Rm, γ and β are shown live, with range badges. Results update as you type.
- **Which γ it accepts:**

  | γ = Rm/T | Result |
  |---|---|
  | exactly 5 | WRC 537 source-qualified range |
  | 15, 50, 100 or 300 | tabulated WRC row; β limit 0.05–0.5 assumed, because the source does not print it |
  | between those rows | **interpolated** between the two nearest rows; linear in γ by default (conservative) or log γ. Labelled engineering judgement, not a WRC rule. |
  | below 5 or above 300, β outside 0.05–0.5, or §4.5.2 length/end-distance limits not met | **not calculated**, with a plain reason and a suggested fix |

- **Output:** circumferential, longitudinal and shear stress, membrane stress intensity (PL)
  and total stress intensity (Tresca), at each point. The governing point is highlighted.
  With more than one load case, an envelope table shows each case's governing point.
- **Reinforcing pad:** WRC 537 has no pad rule, so the shell is checked twice, as PV Elite does:
  - **at the attachment**, with the pad added to the shell wall on the outside (T = t − CA + t<sub>pad</sub>,
    and Rm of that combined wall);
  - **at the pad edge**, with the shell alone and the pad diameter as the attachment.

  Each location has its own γ/β badges, range checks, 8-point table and code check. The governing value,
  envelope and code check take the worse location. This assumes the pad is fully welded and acts with the
  shell; it is common practice, not a WRC rule. Pad welds and stress in the pad are not checked.
- **Trunnions:** checked as a round attachment of their outside diameter, so a trunnion gives exactly the shell
  stress of a nozzle with the same OD. WRC 537 §4.2.2 has no solid/hollow selector for cylindrical shells; the
  choice is recorded and a hollow trunnion gets a note that it is treated as rigid. The notes, report and limits say
  trunnion: a trunnion does not open the shell (no opening-edge pressure note), and stresses in the trunnion and its
  weld are not calculated. The FE cross-check works as for a nozzle.
- **Rectangular attachments (lugs):** WRC 537 §4.2.2 gives each load and stress component its own β, read
  on the same curves as a round attachment:
  - radial load P: equations 28–30 with the Table 6 K factor for Nφ, Nx, Mφ or Mx;
  - Mc: β = ∛(β1²β2) for membrane, multiplied by Cc; Kc·∛(β1²β2) for bending (Table 7);
  - ML: β = ∛(β1β2²) for membrane, multiplied by CL; KL·∛(β1β2²) for bending (Table 8);
  - shear: Vc/(4·c1·T) and VL/(4·c2·T) (equations 50–51).

  The β of each term is used both to read its curve and in its stress formula, and a table shows each one.
  **Blocked, with the reason:** torsion Mt on a lug (WRC 537 §4.3.4: no method); a footprint with β1/β2
  outside 0.25–4 (Tables 6–8), which rules out most thin plates welded straight to the shell; Mc or ML on a
  non-square footprint below γ = 15 (Tables 7–8 start there); any equivalent β outside 0.05–0.5.
  Table 7/8 factors between printed rows are interpolated in γ and in log(β1/β2), with factor 1 for a square.
  This is labelled engineering judgement, and factors from rows printed in parentheses are flagged as approximate.
  The result also shows the **interpolation spread**: the governing stress with the printed rows on each side
  of each interpolation instead (up to four corner runs). It is flagged when wider than 10%; a narrow lug under
  Mc can reach about 22%.
  The FE cross-check works for lugs too (see below). It also gives the only answer, labelled FE only, for a lug
  WRC 537 blocks for its own lug limits: a thin plate, torsion, Mc/ML below γ 15, or a term β out of range.
- **Pressure:** adds the thin-shell membrane stress p·Rm/T (hoop) and p·Rm/2T (longitudinal)
  at every point. This is common practice, not part of WRC 537. The extra pressure stress at
  the edge of the opening is **not** included.
- **Code check (when S is entered):** a screening check using the ASME VIII-2 Part 5 categories:
  Pm ≤ S, PL ≤ 1.5S, and PL+Pb+Q ≤ SPS (default 3S). Shell bending from the nozzle loads is
  Q by default (VIII-2 Table 5.6); you can treat it as primary Pb (PL+Pb ≤ 1.5S) instead.
- **Report:** "Print report" or "Download report" produces a self-contained HTML report:
  - geometry, pressure, Kn/Kb, allowables, all load cases and derived γ/β;
  - the load-case envelope and each case's code check;
  - the WRC curve values used;
  - the 8-point table and limitations;
  - prepared/checked sign-off lines.
- **Saving:** the vessel is saved automatically in the browser. "Save file" writes a `*.vessel.json` file
  (`lafea-emp-app/vessel/v1`, empirical only), and "Open file…" reads it. A `*.wrc.json` case saved before
  canvas A2 still opens, as a vessel with one attachment.
- **Shell FE cross-check:** "Run shell FE cross-check" solves the same geometry with LAFEA's shell
  solver in the background, taking about 30 s. The model is a rigid round attachment on a clamped cylinder,
  with all six loads (P, Vc, Vl, Mc, Ml, Mt), but not pressure or Kn/Kb. The table shows WRC and FE stress intensity at the 8
  points. Below it, a **stress-intensity contour** of the shell around the attachment (outside and inside
  surface, with a hover readout) shows where the FE peak really is. A downloaded or printed report includes
  the FE table and the contour, as long as the run matches the current inputs.
  On the CAESAR II case, FE/WRC (one load at a time) is:
  - Ml 0.95, Mc 1.40, P 1.28 and Mt 1.16, mesh-independent within 2%;
  - Vc 1.27 and Vl 0.37. WRC 537 treats both as pure shear, but FE also finds bearing stress on the loaded
    side, and for Vc, shell bending at C/D. The Vc value moves by up to 14% with how the attachment is modelled.

  With a pad, the FE model checks the pad edge: the pad is the rigid attachment on the bare shell. The
  check at the attachment (shell + pad) has no FE counterpart. On the 36-inch pad example, FE/WRC at the
  pad edge is 1.17, with the same governing point (Cu).

  For a **lug** the footprint is a stiff plate carrying all six loads (`src/app/lafea/lug-shell.js`). On the
  200 × 100 mm example, FE/WRC is P 0.71, Mc 0.66 and Ml 0.71. A stiff rectangle carries much of its load at the
  corners, so FE finds less than WRC 537 at the middle of the edges and more at the corners. The highest element
  value next to the footprint is shown separately and labelled mesh-dependent: the corner is a singularity in
  this model, and on a real lug the weld fillet sets it.
  - When WRC 537 refuses a lug only for its own lug limits, the FE run is the answer, labelled **FE only**: it
    shows the FE stresses at the 8 points and the corner value, with no WRC column.
  - For a thin plate, enter the weld footprint as the width: plate thickness plus both weld legs.

  A large ratio is a reason to look closer, not a pass or fail. See [docs/AUDIT-AND-ROADMAP.md](docs/AUDIT-AND-ROADMAP.md).
- **Not covered:** spherical shells, saddles, torsion on lugs by WRC 537 (FE only), pressure stress
  concentration at the opening, and fatigue. See [docs/AUDIT-AND-ROADMAP.md](docs/AUDIT-AND-ROADMAP.md).

The calculator is a thin wrapper over the EMP1 core
(`buildEmp1Wrc537InterpolatedTable5Ordinates` and
`evaluateEmp1Wrc537CylindricalTable5`). `npm run check:wrc` checks it against:

- the frozen **γ = 5 independent hand calculation**: all 8 points to 1e‑9; governing Au = 72.67 MPa;
- the **CAESAR II 2017 WRC benchmark** at γ = 48.03 (interpolated): worst point
  +2.0%, never below CAESAR II, same governing point (Du);
- every blocking rule, unit conversion and the corroded mean radius;
- pressure, Kn/Kb, the code check and load-case envelopes, against hand arithmetic;
- a **PV Elite 28 report** for a 36-inch nozzle (γ = 21.6 at the junction, 42.7 at the pad edge).
  PV Elite used **WRC 297**, so this is a different-method reference, not a WRC 537 benchmark. The
  check confirms what does not depend on the method: the 24 printed stress intensities, the sign of
  every load term at every point, and the shear stresses within 1%. With the same 1.2 shell SCF,
  PV Elite's governing load stress is 1.39× ours at the junction and 1.78× at the pad edge; see
  the Phase 5.4 entry in [docs/AUDIT-AND-ROADMAP.md](docs/AUDIT-AND-ROADMAP.md).
- the **pad option** (`scripts/wrc-pad-check.mjs`), against that same PV Elite report. From PV Elite's raw
  inputs, both locations reproduce its printed mean diameter, thickness and attachment diameter (2161/50/914.4
  and 2136/25/1064.4 mm), and its pressure hoop stress within 0.03%. Shear is within 1% at all 16 points. With
  torsion alone, τ = Mt/(2π r0² T) holds at both locations by hand. It also checks that no pad gives exactly the
  old result, and checks the worst-location envelope and code check and the blocking rules.
- **trunnions** (`scripts/wrc-trunnion-check.mjs`): trunnion = nozzle at all 8 points on the γ = 5 hand calculation
  and the CAESAR II case; solid = hollow; the notes, pads, load cases, β limit and report;
- **lugs** (`scripts/wrc-lug-check.mjs`):
  - Tables 6–8 in the code match the `docs/emp1` extraction (116 values, including the parentheses);
  - an independent hand calculation at γ = 100 and β1/β2 = 2, where every factor is a printed value,
    matches all 8 points to 1e-9;
  - a square footprint gives the same normal stresses as a round attachment with r0 = c/0.875;
  - the factor interpolation and every blocking rule are checked.

## Run

```powershell
npm install
npm run dev          # http://localhost:5173  (two-view app)
npm run build        # -> dist/  (index.html + lafea.html)
```

`lafea.html` is the original single-view standalone LAFEA entry, kept so the
inherited boundary checks and e2e specs run unchanged.

## What was extracted

The runtime set is the **import closure of the upstream standalone entry**
(`lafea.html` → `src/lafea-app/main.js`): 490 source modules and **no runtime npm
dependencies**.

- `src/app/`: new two-view shell (the only new runtime code)
- `src/lafea-app/`: upstream standalone LAFEA entry and controller
- `src/workspace/`: LAFEA workbench UI, EMP1 workflow, review and presentation views, canvas, mesh custody
- `src/core/`
  - **LAFEA:** `lafea-*`, `local-continuum`, `local-shell`, `local-stress`, `local-trunnion-footprint`, `local-attachment-screening`, `local-attachment-correlation`, `local-load-foundation`
  - **Empirical/WRC:** `emp1` (WRC 537 data, gamma interpolation, A→B refresh, route authority)
  - **Common:** `shared-primitives`, `shared-analysis-contract`
- `validation/emp1/…`: CAUX/WRC benchmark JSON used at runtime by EMP1

## Tests

Results after canvas step A3 (2026-11-28), on Windows with Node 22 and Chrome:

| Suite | Command | Result |
|---|---|---|
| Node checks (LAFEA / EMP1 / WRC) | `npm run check:all` | **313 pass** in CI, 0 fail, 13 skipped as KNOWN (10 real gaps, 2 slow, 1 helper). Locally 311 pass: the 2 B01 route checks need `python3`, and without it they show as SKIPPED. |
| Shell-FE cross-checks (in `check:all`) | `node scripts/wrc-nozzle-fe-check.mjs` (P, Mc, Ml), `node scripts/wrc-nozzle-fe-shear-check.mjs` (Vc, Vl, Mt, contour field), `node scripts/wrc-lug-fe-check.mjs` (lug model, all six loads), `node scripts/wrc-lug-fe-route-check.mjs` (FE-only route, square vs round) | pass, about 1 min each |
| Plate form and mesher (in `check:all`) | `node scripts/lafea-plate-form-check.mjs` (validation, Kt = 3.047 against 3.025, plain plate against σL/E), `node scripts/lafea-mesher-speed-check.mjs` (same flips as the original, h = 10 mesh in seconds, SHA-256 against `node:crypto`) | pass, about 45 s and 4 s |
| Browser e2e (28 specs, 71 tests) | `npx playwright test` (dev server) | The app specs below all pass; the 18 upstream specs were last run for PL-06 part 3 (32 pass, 8 fail) and are not touched by the canvas. The 8 also fail upstream. They run on the original `lafea.html` entry or the `e2e/fixtures/lafea-guided-workbench.html` fixture, not the app. |
| App e2e (WRC calculator, WRC units and help text, WRC sketch, vessel with several attachments, moving them on the unrolled shell, LAFEA example, plate form, workbench look/technical details/keyboard, status page, tabs/layouts/keyboard) | `npx playwright test e2e/wrc-calculator.spec.js e2e/wrc-units-help.spec.js e2e/wrc-sketch.spec.js e2e/wrc-vessel.spec.js e2e/wrc-unrolled.spec.js e2e/lafea-example.spec.js e2e/lafea-plate.spec.js e2e/lafea-workbench-ui.spec.js e2e/app-status.spec.js e2e/app-ui.spec.js` | **31 pass** on the dev server. The plate test takes about 1 min; on a busy machine it can pass its 7-minute limit, so run it alone. |
| Isolation | `npm run check:boundary` | pass for both `src/lafea-app/main.js` and `src/app/main.js` |
| WRC calculator | `npm run check:wrc` | pass (γ = 5 hand calc exact; CAESAR II γ = 48 within 2.0%; PV Elite WRC 297 reference: stress intensities, signs and shear agree) |
| Build | `npm run build`, `npm run build:lafea` | pass |
| First-load size | `npm run check:bundle-size` (after `build`) | pass: 216.5 kB of JS (limit 500 kB); the LAFEA workbench is lazy-loaded |

`scripts/known-upstream-failures.json` lists the 13 KNOWN checks that `check:all`
skips, each with a plain reason:

- **10 `REAL_GAP`**: real upstream limitations, with what each means for the app.
  Examples: the Jacobi-PCG solver stalls on a slender fine-mesh cantilever; the
  LAFEA.4 shell mesher fails on shells with holes (not used by the app).
- **2 `SLOW`**: the full B02D production runs, too long for `check:all`.
- **1 `HELPER`**: a script another check runs with arguments.

Phase 5.5 triaged the 128 checks that used to be listed here: 18 were fixed (stale
tests, correct code), 92 were deleted (they could not run outside upstream, or only
asserted upstream source shape), and the rest run again. See the Phase 5.5 entry in
`docs/AUDIT-AND-ROADMAP.md`.

The B01 route checks need `python3` for their mesh generator. CI has it; where it is
missing, `check:all` reports them as SKIPPED. Run the KNOWN checks anyway with
`node scripts/run-all-checks.mjs --include-known`.

For e2e, Playwright uses its bundled Chromium. Install it with
`npx playwright install chromium`, or set `PLAYWRIGHT_BROWSER_CHANNEL=chrome`
to use the Chrome you already have.

## Not included

- The combined workspace (`src/main.js`, `bootstrap`).
- LFEA (`src/lfea`, `linear-fea-*`, `linear-piping-*`).
- The pipe model, topology, load-calc, first-cut, sketcher, PCF and 3D.
- **Empirical V3 safety**, the combined app's other empirical piping calc. It
  needs about 240 more modules, including the pipe model, topology,
  `linear-fea-*` and the event bus, which this app's isolation check forbids.
  Its real runs also go through the combined app's `AnalysisCoordinator`.
  Upstream itself only tests it inside the combined app.

- The WRC 537 bulletin PDF and the CAESAR II training PDF from upstream
  `docs/emp1/`. They are third-party copyrighted documents, so they are git-ignored
  here. The checks that read them stay on the known list.

`_source/` (the upstream clone) and `_tools/` (the extraction scripts: `closure.mjs`
and `tests.mjs`) are git-ignored. You can re-run them to re-extract from a newer
upstream commit.
