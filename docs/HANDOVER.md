# Handover report: LAFEA + Empirical/WRC

Written 2026-11-26 at the end of the first agent's sessions. `main` is at `d15e7e5`, CI is green and Pages is
deployed. Read this file, then [NEXT-PHASE-PLAN.md](NEXT-PHASE-PLAN.md) and
[AUDIT-AND-ROADMAP.md](AUDIT-AND-ROADMAP.md).

- **Repo:** https://github.com/reallakshman19/LAFEA-Empirical-WRC (public)
- **Live app:** https://reallakshman19.github.io/LAFEA-Empirical-WRC/
- **Local checkout:** `D:\CodeE\LAFEA and Empherical`. Windows 11, Node 22, Git Bash and PowerShell.
- **Upstream source:** [reallakshman19/Advanced_Analysis](https://github.com/reallakshman19/Advanced_Analysis) at
  `11eca8e40`. A git-ignored clone is in `_source/`, and the extraction scripts are in `_tools/`.

## 1. What the app is

A Vite 7 vanilla-JS app (ES modules, `base: './'`, no runtime npm dependencies) with two tabs:

| Tab | Code | State |
|---|---|---|
| **Empirical / WRC** (default) | `src/app/wrc/` | WRC 537 calculator for cylinders with round attachments. Has an "advanced" sub-tab with the full EMP.1 workflow. |
| **LAFEA** | `src/app/lafea/` and the upstream workbench | Local FEA workbench, with a working cantilever example. |

Most of `src/` (490 modules) is extracted upstream code. **New code written here** is only:

- `src/app/` — `main.js`, `app.css`, `theme.css`, `ui-tabs.js`, `wrc/*`, `lafea/*`, `status/*`;
- `scripts/wrc-calculator-check.mjs`, `scripts/wrc-nozzle-fe-check.mjs`, `scripts/run-all-checks.mjs`, `scripts/known-upstream-failures.json`;
- `e2e/wrc-calculator.spec.js`, `e2e/lafea-example.spec.js`;
- `.github/workflows/ci.yml`, `.github/workflows/pages.yml`, `.gitattributes`, `index.html`, and the docs.

## 2. Commit history

| Commit | What |
|---|---|
| `4eedc72` | Extracted the import closure of the upstream standalone LAFEA entry, plus EMP1 |
| `8efba1b` | Recorded the 128 known upstream failures, with reasons |
| `4bf669a` | WRC 537 calculator, Phase 1 (the default Empirical view) |
| `1caffcf` | WRC Phase 2: pressure, Kn/Kb, allowables code check, up to 20 load cases |
| `87d2b07` | LAFEA: working example (cantilever, through convergence to published results) |
| `37f9876` | WRC shell-FE cross-check, using the LAFEA shell solver in a Web Worker |
| `f34db44` … `d15e7e5` | CI and the GitHub Pages deploy, the CI fixes, and the Phase 5 plan |

## 3. Components in detail

### 3.1 WRC 537 calculator (`src/app/wrc/`)

- **`wrc-calc.js`** — the pure calculation.
  - `calculateWrc537(input)` wraps the EMP1 core: `buildEmp1Wrc537InterpolatedTable5Ordinates`,
    `evaluateEmp1Wrc537CylindricalTable5` (takes Kn and Kb) and `emp1Wrc537PlaneStressIntensity` (Tresca).
  - **Allowed γ = Rm/T:** exactly 5 is source-qualified; 15, 50, 100 and 300 are tabulated; values in between
    are interpolated (linear in γ by default, or log γ). γ < 5 or > 300, β outside 0.05–0.5, or §4.5.2
    length failures are blocked, with a reason.
  - **Pressure** adds pRm/T (hoop) and pRm/2T (longitudinal) at every point.
  - **PL** is the Tresca of the membrane terms.
  - **`buildCodeCheck`** checks Pm ≤ S, PL ≤ 1.5S, and either PL+Pb+Q ≤ SPS (default 3S, bending class `Q`)
    or PL+Pb ≤ 1.5S (class `PB`). It returns null when S is blank.
  - **`calculateWrcAttachment(input)`** adds the optional reinforcing pad (`padOutsideDiameter`,
    `padThickness`; blank or 0 means no pad). `wrcLocationInputs` turns the input into one location
    (`ATTACHMENT`) or two (`JUNCTION`: OD + 2·tp and t + tp, so T = t − CA + tp; `PAD_EDGE`: the pad diameter as
    the attachment). Each is a plain `calculateWrc537` run. `governing` and `codeCheck` are the worst over the
    locations. WRC 537 has no pad rule: this is the PV Elite two-location practice, and it is labelled as such.
  - **Rectangular attachments** (`attachmentType: 'RECTANGULAR'`, `attachmentLength` = 2·c2 along the shell,
    `attachmentWidth` = 2·c1 around it; rectangular pads use `padLength`/`padWidth`). `wrc537-rectangular.js`
    holds Tables 6–8 and gives each Table 5 term its own β and factor (WRC 537 §4.2.2). `evaluateRectangular`
    in `wrc-calc.js` reads each term at its β and calls the same Table 5 core with β = 1, passing each ordinate
    as (value × C)/β_term. Shear goes through the core with an equivalent radius, π·r = 4·c (equations 50–51).
    Blocked: Mt ≠ 0, β1/β2 outside 0.25–4, Mc/ML below γ 15 on a non-square footprint, any term β outside 0.05–0.5.
  - **`calculateWrc537Cases({loadCases:[{name, loads}]})`** runs each case through `calculateWrcAttachment`.
    It gives the envelope, the governing case (with its location) and the overall code check. Each case's
    stresses are in `cases[i].result.locations[j].result.rows`.
- **`wrc-panel.js`** — the form UI.
  - Load-case tabs (MAX_CASES 20), live γ/β badges, the envelope, the code check and the FE section.
  - Saves to localStorage automatically. Save and Open use `*.wrc.json` files.
  - `normalizeCase` migrates the old single-`loads` format.
- **`wrc-report.js`** — the self-contained HTML report, covering every case, the envelope and the code checks.
- **Verification** (`npm run check:wrc`):
  - the γ = 5 hand calculation matches exactly (Au = 72.67 MPa);
  - against CAESAR II 2017 at γ = 48.03 the worst point is +2.0%, with the same governing point (Du);
  - pressure, Kn/Kb, the code check and the envelope match hand arithmetic;
  - the pad option (`scripts/wrc-pad-check.mjs`) reproduces PV Elite's per-location geometry and pressure
    stress, and hand-calculated torsion shear, at both locations.
  - The FE cross-check, given a pad, compares the pad-edge location (see `wrcFeReference` in `wrc-calc.js`).
    For a lug WRC 537 refuses only for its own lug limits (reasons marked `feRoute`), it runs FE only.
  - lugs (`scripts/wrc-lug-check.mjs`): the tables against the `docs/emp1` extraction; an independent hand
    calculation at γ 100, β1/β2 2; square footprint = round with r0 = c/0.875; interpolation; blocking.

### 3.2 Shell-FE cross-check (`src/app/lafea/nozzle-shell.js`, `nozzle-worker.js`)

- **Model:** a full periodic cylinder with clamped ends, a polar-graded patch around the attachment, and a
  stiff plug (`plugFactor: 4` passed in practice). Loads are applied at the centre node.
- **Element:** the CST+DKT shell core in `src/core/local-shell`, solved by sparse Jacobi PCG above 1536 DOF.
- **Stress recovery:** stresses are extrapolated from rings 0–1 to the attachment radius, at the q nearest
  each WRC axis angle (A = −π/2, B = π/2, C = π, D = 0).
- **Gotchas:**
  - `resultRequests.retainElementMatrices` must be true;
  - the stress field is `combinedStress`;
  - the equilibrium tolerances had to be relaxed. The qualification profile is in the file.
- **Covers P, Mc and Ml only.** On the CAESAR case, FE/WRC is Ml 0.95, Mc 1.40 and P 1.28. A finer mesh
  (16,330 DOF) changes it by less than 2%.
- **Run times:** about 26 s in the browser; `scripts/wrc-nozzle-fe-check.mjs` takes about 2 min.
- **Frozen FE maxima:** P 21.58, Mc 145.62, Ml 57.99 (±1%).
- **Lugs** (`src/app/lafea/lug-shell.js`, PL-04): the same model with a rectangular footprint.
  - Rings are the footprint scaled out to a patch rectangle, so the corners are nodes.
  - The plug is a structured grid, and the loads go on its interior nodes as statically exact forces.
    A long, narrow plug is not rigid, so a centre load would bend it.
  - A–D are the middle of each edge.
  - `edgePeak` is the highest element value next to the footprint. It sits at a corner and grows with the mesh.
  - The worker picks the model by `geometry.rectangular`.
  - Checks: `scripts/wrc-lug-fe-check.mjs` and `scripts/wrc-lug-fe-route-check.mjs`, about 70 s each.
  - Don't run the refined mesh (24 divisions) on a 100 mm square with three load cases: it hits Node's
    default heap limit.

### 3.3 LAFEA example (`src/app/lafea/lafea-example.js`, `lafea-view.js`)

- **Model:** a 200 × 40 × 10 mm cantilever, E 200 GPa, ν 0.3, with an end shear traction of −5 MPa.
- **Route (domain-first):** source → `issueLafeaSourceAuthority` → `createLafeaContinuumAnalysisDomain` →
  geometry → T6 mesh profile → `generateAnalysisMesh` → `store.prepareContinuumForRun` → run →
  `runContinuumConvergenceStudy` (h = 40, 20, 10 mm).
- **Results:**
  - tip deflection converges to −0.5082 mm, against −0.5156 mm from Timoshenko theory (1.4%);
  - root σx is 150.16 MPa, against 150.0 MPa by hand.
- **Lessons:**
  - `resultReady` needs a CURRENT/PASS convergence artifact;
  - a point load in 2-D gives DIVERGENT;
  - a probe on an element edge is ambiguous, so the probe is at (198.7, 21.3);
  - a 5 mm mesh level fails recovery.
- **API:** `globalThis.LafeaEmpApp` exposes `loadExample`, `solveExample` and `getState`. The e2e tests use it.

### 3.3a App shell, look and keyboard (PL-06 part 1)

- **Colours and controls.** They live in `src/app/theme.css` as `--ui-*` variables. `wrc.css` and `status.css`
  map their own `--wrc-*` / `--st-*` names onto them, so change a colour there, not in each panel. The printed
  WRC report is standalone HTML with its own light styles.
- **Tabs.**
  - `src/app/ui-tabs.js` gives the view tabs and the Empirical sub-tabs the ARIA tabs pattern, with manual
    activation: the arrow keys move the focus and Enter opens a tab. Opening LAFEA loads the 1.9 MB
    workbench, so an arrow key must never open it.
  - The tabs use `aria-selected`, not `aria-pressed`.
- **View links.** `#LAFEA`, `#EMPIRICAL` and `#STATUS` open a view, from a link or the address bar, with no
  reload. `activate()` writes the open view back with `history.replaceState`.
- **WRC layout.** Below 900 px, `.wrc__summary` sticks under the app bar at `--ui-nav-height` (41 px); keep
  that variable equal to the bar's height. Screen readers get `[data-role="wrc-live"]`, one sentence 500 ms
  after typing stops. Do not put `aria-live` back on the whole results panel.
- **Redraws.** `render()` redraws the case buttons. `caseFocus()` / `restoreCaseFocus()` keep the keyboard focus
  on the same case.

### 3.3b WRC units and help text (PL-06 part 2)

- **Storage stays SI.** A case stores lengths in mm and pressure and allowables in MPa whatever `units` says
  (`src/app/wrc/wrc-units.js`), so the calculator, the FE worker and old case files need nothing new. Loads
  are stored as typed with `forceUnit` / `momentUnit`. `FORCE_UNITS` and `MOMENT_UNITS` live in
  `wrc-units.js`, and `wrc-calc.js` re-exports them.
- **The form converts:**
  - `writeForm()` shows stored values in the case's units: 10 significant figures in SI, 7 in US.
  - `readForm()` converts back, but keeps the exact stored value when a box's text is unchanged, so showing a
    value in inches never moves it.
  - Switching systems goes through `convertCaseUnits` (loads to the twin units, full precision).
- **Output in the case's units.** In the panel use `L()` / `S()`, in the report `L()` / `S()`, and in
  `wrc-calc.js` messages `lengthIn()` / `stressIn()`. For the FE contour, `feFieldIn(field, u)` converts the
  field and `buildFeContourHtml` takes `lengthLabel` and `stressDigits`. Never print "mm" or "MPa" directly
  in new output. `scripts/wrc-units-check.mjs` checks the US report has no other "MPa".
- **Help text** comes from `help` in `FIELDS` and `LOADS`, shown as `.wrc__fieldhelp` and linked with
  `aria-describedby`. The load help's physics (+P pushes in; Mc largest at C/D, Ml at A/B) is asserted in
  the units check.

### 3.3c Workbench look, technical details and the plate form (PL-06 part 3)

- **Scope everything to the app.** `src/app/lafea/workbench.css` restyles the upstream workbench only under
  `.app-view`, so `lafea.html` and the upstream e2e specs (which run on it and on the fixture page) see no
  change. The workbench marks many colours `!important`; an override needs `.app-view …` and `!important` too.
  Map colours to `--ui-*` variables; keep the green/amber/red status tones.
- **Technical details.** `src/app/lafea/tech-details.js` puts `app-tech-off` on `<html>` (default) and syncs
  every `[data-tech-switch]`; key `lafea-emp-app/tech-details`. The hide list is in section 2 of
  `workbench.css`. Do not hide by the class `.lafea-workbench__custody-details` alone: in the EMP.1 workflow it
  also wraps working menus ("More actions", "Blocking evidence"). Keep scope and limitation statements visible.
- **Mesh keyboard.** `retained-mesh-overlay.js` uses a roving tabindex (one element at `tabindex=0`).
  `scripts/lafea-ui-guided-discretization-check.mjs` fails if that file mentions triangulate, refine, smooth,
  repair or solver, even in a comment.
- **Plate form units.** As in the calculator: stored in mm and MPa, `units` is display only, `writeBox()` /
  `readBox()` keep an untouched box's exact value, and `dim()` / `lengthText()` / `stressText()` format output.
  SI output text is unchanged except the Kt line, which now names its unit. The help-text key is shared with the
  calculator (`lafea-emp-app/wrc-help`).
- **Not changed:** the advanced workflow's example (E6). 19 checks and the γ = 5 hand calculation are built on
  it. The owner decided on 2026-11-28 to keep it (decision 6 in NEXT-PHASE-PLAN.md), so don't simplify it.
  The WRC calculator's six examples are the plain starting points.

### 3.4 CI and Pages

- **`ci.yml`:**
  - **checks job:** lint → `check:boundary` → `build` → `build:lafea` → `env -u GITHUB_ACTIONS npm run check:all`;
  - **e2e job:** the app specs on Chromium: wrc-calculator, lafea-example, lafea-plate, app-status, app-ui.
- **`pages.yml`:** builds `dist/` and deploys on every push to `main`.
- **Three non-obvious fixes. Do not undo them:**
  1. **`.gitattributes` `docs/emp1/*.md text eol=crlf`.** The EMP1 oracle checks hash these files, and the
     stored hashes were taken from the CRLF copies.
  2. **`build:lafea` before `check:all`.** One artifact check needs that build.
  3. **`env -u GITHUB_ACTIONS`.** One upstream check switches on Advanced_Analysis's exact-head release gate
     when it sees GitHub Actions. An empty env override does not work.

## 4. Test state at handover

| Suite | Command | Result |
|---|---|---|
| Node checks | `npm run check:all` | 278 pass, 0 fail, 128 KNOWN (see `scripts/known-upstream-failures.json`) |
| WRC | `npm run check:wrc` | pass |
| FE cross-check | `node scripts/wrc-nozzle-fe-check.mjs` | pass, about 2 min. Not in CI. |
| e2e (all) | `npx playwright test` | 38 pass, 8 fail. All 8 also fail upstream and run on `lafea.html`. |
| e2e (new) | `e2e/wrc-calculator.spec.js`, `e2e/lafea-example.spec.js` | pass |
| Isolation / build | `npm run check:boundary`, `build`, `build:lafea` | pass |

**Local e2e tips:**
- the bundled Chromium is not installed, so set `PLAYWRIGHT_BROWSER_CHANNEL=chrome`;
- if the cold Vite server times out, start `npm run preview` (or a warm dev server) and set
  `PLAYWRIGHT_SERVER_PORT` to its port. 5180 was used.

**Windows shell tips:**
- Bash heredocs with backticks break, so write patch scripts to a file first;
- the in-app browser pane failed to navigate, so use Playwright probe scripts instead.

## 5. Current bundle (why 5.1 is next)

| Chunk | Size |
|---|---|
| `standalone-controller-*.js` (LAFEA and EMP.1 workbench) | **1,943 kB** |
| `main-*.js` (app and WRC calculator) | 49 kB |
| `nozzle-worker-*.js` (already a separate chunk) | 99 kB |
| EMP1 product-execution and qualification-sample chunks | 28 kB, 7 kB |

`src/app/main.js` statically imports `LafeaStandaloneController` and `mountLafeaView`, so every visitor
downloads 1.9 MB before WRC appears.

## 6. Next work: Phase 5 (details in NEXT-PHASE-PLAN.md)

### 5.1 Fast first load (next; about ½ day; no input needed from the owner)

1. In `src/app/main.js`, replace the static imports of the controller and `lafea-view.js` with a cached
   `import()`. Trigger it the first time someone opens the LAFEA tab or the "Full EMP.1 workflow (advanced)"
   sub-tab, and show "Loading LAFEA…" while it loads.
2. Keep the WRC calculator in the first load. Confirm that `wrc-calc.js` → EMP1 core does not pull the
   workbench back in. Check the Vite build output and the chunk graph.
3. Create one controller and share it between both views. Keep `globalThis.LafeaEmpApp` working, with its
   methods awaiting the lazy load. Update the e2e specs to wait for the tab rather than for page load.
4. Add `scripts/bundle-size-check.mjs`. Fail when the JS the first load needs (the entry chunk and its
   static imports, from `dist/.vite/manifest.json` or by parsing `dist/index.html`) is over 500 kB. Run it
   in CI after `build`.
5. **Done when:**
   - the first-load JS is under 500 kB;
   - `check:all` still shows 278 pass;
   - check:wrc and the two new e2e specs pass;
   - CI is green and the live site is smoke-tested (γ = 5 → 72.67 MPa, the LAFEA example loads and solves).
   - README test table and AUDIT-AND-ROADMAP progress are updated.

### Later items

- **5.2** — add Vc, Vl and Mt to the FE cross-check, plus an FE stress-intensity contour.
- **5.3** — a LAFEA input form for plates and plates with holes (Kt ≈ 3 check).
- **5.4** — benchmarks. Needs the owner's data.
- **5.5** — clean up the 90 stale upstream checks, and possibly `lafea.html`.
- **5.6** — spheres and rectangular attachments. Needs the owner's decision and their licensed bulletin.

## 7. Open questions for the owner

1. Can they supply CAESAR II or PV Elite WRC 537 outputs (inputs and the 8-point table) for 3 or more nozzles?
2. Are spheres or rectangular attachments needed now, or later?
3. Should `lafea.html` and its upstream-only e2e specs be kept or removed?

## 8. Working rules the owner set

- **Commit trailer:** end every commit message with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Remote Control:** the owner follows over Remote Control, so each closing message must stand alone and
  carry its question with the choices.
- **Status header:** the owner's hook asks for a status header (time, progress-page line, `⚙ NEXT:` effort
  line) at the top of every closing message. The hook output gives the exact lines.
- **Approval:** ask before starting a new phase. Keep plain language in the docs and the UI.
- **Copyright:** do not commit the WRC 537 bulletin or CAESAR training PDFs. They are git-ignored on
  purpose.
