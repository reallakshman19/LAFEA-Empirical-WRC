# LAFEA + Empirical/WRC

A standalone app with two views, extracted from
[reallakshman19/Advanced_Analysis](https://github.com/reallakshman19/Advanced_Analysis)
at `11eca8e40` (main, 2026-11-25):

| View | What it is | Controller config |
|---|---|---|
| **LAFEA** | Local finite-element analysis workbench (2D continuum, shell, trunnion footprint, weld profile…) | `LafeaStandaloneController`, `initialStage: 'LAFEA.3'` |
| **Empirical / WRC** | EMP1 local-attachment analytical assessment (WRC 537 cylindrical data, gamma interpolation, section/local checks) | same controller, `presentationMode: 'ANALYTICAL_CALC'`, `analyticalOnly: true`, `initialStage: 'LAFEA.1'` |

These are the same two configurations the upstream combined app uses for its
`LAFEA` and `EMPIRICAL` tabs (`src/workspace/bootstrap.js` upstream), without the
combined workspace, LFEA, pipe-model, event bus, mock data or benchmark panels.

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

Results at extraction time, on Windows with Node 22 and Chrome:

| Suite | Command | Result |
|---|---|---|
| Node checks (LAFEA / EMP1 / WRC) | `npm run check:all` | **274 pass**, 0 fail, 128 skipped as KNOWN |
| Browser e2e (18 specs, 40 tests) | `npx playwright test` | **32 pass**, 8 fail (the same 8 fail upstream) |
| Isolation | `npm run check:boundary` | pass for both `src/lafea-app/main.js` and `src/app/main.js` |
| Build | `npm run build`, `npm run build:lafea` | pass |

`scripts/known-upstream-failures.json` lists the 128 KNOWN checks, each with the
reason:

- **90 (`FAIL` / `TIMEOUT_120S`)** also fail or time out in upstream
  `Advanced_Analysis` at the extraction commit. These are stale assertions, such
  as line-count guards on files that have grown, and heavy qualification runs.
- **38 (`PASS` upstream, `OUT_OF_SCOPE`)** need parts that are not in this app,
  or upstream's git history:
  - parts: the combined-app `lafea-workbench.js` facade, `lafea-templates/`,
    LFEA, the pipe model, and the combined-app e2e specs;
  - git history: pinned baseline commits.

Run them anyway with `node scripts/run-all-checks.mjs --include-known`.

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

`_source/` (the upstream clone) and `_tools/` (the extraction scripts: `closure.mjs`
and `tests.mjs`) are git-ignored. You can re-run them to re-extract from a newer
upstream commit.
