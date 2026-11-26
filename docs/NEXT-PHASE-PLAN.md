# Next phase plan (Phase 5): from working app to everyday tool

Written 2026-11-26, after:
- WRC Phase 1–2: calculator, pressure, Kn/Kb, allowables and load cases;
- the LAFEA example;
- the shell-FE cross-check;
- CI and Pages.

## Where things stand

| Area | State |
|---|---|
| WRC 537 calculator | Usable on real jobs. Cylinders with round attachments, γ 5–300, 20 load cases, pressure membrane, Kn/Kb, screening code check, printable report. Checked against the γ = 5 hand calculation (exact) and CAESAR II (2%). |
| Shell-FE cross-check | Works (≈30 s, in the background). Covers all six loads, with a stress contour, since 5.2. On the CAESAR II case, FE/WRC is 0.95–1.40 for P, Mc, Ml and Mt, 1.27 for Vc and 0.37 for Vl. |
| LAFEA | One worked example goes load → mesh → solve → convergence → published results, and matches beam theory. There is no way yet to enter your own geometry except by importing JSON. |
| Hosting / CI | GitHub Pages and CI on every push. |
| Debt | A 1.9 MB first load. 128 inherited checks are skipped (90 of them are stale upstream assertions). The custody/authority text is noisy. |

## Proposed order

Sizes: S = under ½ day, M = 1–2 days, L = 3+ days.

### 5.1 Fast first load (S–M): done 2026-11-26 (first load 1,991 kB → about 110 kB)
- Load the LAFEA workbench, solver and three.js only when the LAFEA tab or the advanced EMP.1 view
  opens (dynamic `import()`).
- Target: the Empirical tab loads in under 500 kB.
- Done when: the build report shows a small main chunk, and CI and the e2e tests still pass.

### 5.2 Complete the FE cross-check (M): done 2026-11-26 (see the AUDIT-AND-ROADMAP progress entry; Vc and Vl turned out *not* to agree closely with WRC, for physical reasons)
- Add Vc, Vl and Mt:
  - shear forces on the plug centre;
  - torsion through a drilling-free couple on the plug rim.
  Check each against WRC (shear-stress formulas are exact in WRC 537, so they should agree closely).
- Show an FE stress-intensity contour around the attachment. This uses the existing canvas
  renderer, so the engineer can see where the peak really is, not only at the 8 points.
- Done when: all six loads are cross-checked, the check script is extended, and the contour is
  visible in the report.

### 5.3 LAFEA input form (M): done 2026-11-26 (Kt = 3.047 against 3.025; needed three mesher speed fixes, see the AUDIT-AND-ROADMAP progress entry)
- A plain form for a rectangular or holed plate, like the WRC form:
  - dimensions, thickness and material;
  - edge restraints and tractions;
  - mesh size.
- It builds the same domain-first model as the example. This replaces "Import stage JSON" for
  everyday use.
- Done when: an engineer can set up a plate-with-hole stress-concentration check (Kt ≈ 3)
  without writing JSON, and it converges.

### 5.4 Benchmarks (S per case, **needs your data**)
- Add at least 3 more CAESAR II or PV Elite WRC 537 outputs across γ 10–300 and β 0.05–0.5, as
  frozen checks.
- This is what turns "interpolated γ" from engineering judgement into evidence.

### 5.5 Clean up inherited checks (M)
- Fix, update or delete each of the 90 stale upstream checks, so `check:all` reflects real risk.
- Delete `lafea.html` and the specs that only test it, if you don't need the single-view entry.

### 5.6 Widen WRC 537 (L, **needs your decision and source**)
- Spherical shells and rectangular attachments need their curves digitised from your licensed copy
  of the bulletin, then validated. Only worth it if those jobs come in.

## Decisions needed from you

1. **Benchmarks:** can you supply CAESAR II or PV Elite WRC outputs (inputs and the 8-point stress
   table) for 3 or more nozzles?
2. **Spheres and rectangular attachments:** needed now, or later?
3. **`lafea.html`:** keep the original single-view LAFEA page, or remove it with its upstream-only
   tests?

## Suggested start

5.1, then 5.2, then 5.3. None of these needs input from you. 5.4 can run in parallel as soon as data
arrives.
