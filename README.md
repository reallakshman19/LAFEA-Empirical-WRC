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

Tests that came along:

- `scripts/`: about 450 upstream LAFEA/EMP1/WRC node checks whose imports stay inside this module set. Run them all with `npm run check:all`; the summary goes to `reports/checks-summary.json`.
- `e2e/`: 18 Playwright specs that run against `lafea.html` or `e2e/fixtures/lafea-guided-workbench.html`. Run them with `npx playwright install chromium`, then `npx playwright test`.

What was left out on purpose: the combined workspace (`src/main.js`, `bootstrap`),
LFEA (`src/lfea`, `linear-fea-*`, `linear-piping-*`), the pipe model, topology,
load-calc, first-cut, Empirical V3 safety, sketcher, PCF and 3D. Also left out
are upstream checks and specs that need those parts, such as specs that open
the combined app at `/`.

`_source/` (the upstream clone) and `_tools/` (the extraction scripts: `closure.mjs`
and `tests.mjs`) are git-ignored. You can re-run them to re-extract from a newer
upstream commit.
