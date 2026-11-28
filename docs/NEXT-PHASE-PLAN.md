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

## Direction (owner, 2026-11-26)

The app is meant to become a **mini empirical solver**, not only a nozzle-load calculator:

1. a **universal canvas**, where basic geometry is drawn and boundary conditions are specified;
2. a **WRC (empirical) solver** that solves local stress from that model and presents it the way an FE app
   does, but lighter.

**Focus on production.** The first canvas and solver scope is **cylindrical shells** with **round
attachments** (nozzles, trunnions) and **rectangular plate attachments** (lugs). Spheres and heads come
later. The lug rules are confirmed from the licensed bulletin (2026-11-27): Tables 6–8 as extracted in
`docs/emp1`, and equations 28–30 and 50–51 from the PDF.

Production steps (owner, 2026-11-27: pads first):
1. **Reinforcing pads** on round attachments (M): done 2026-11-27, checked at the attachment
   (shell + pad) and at the pad edge. See the AUDIT-AND-ROADMAP progress entry.
2. **Lugs** in the WRC calculator (M): done 2026-11-27, within the WRC 537 rules (no torsion,
   β1/β2 0.25–4, γ ≥ 15 for moments on a non-square lug). See the AUDIT-AND-ROADMAP progress entry.

### Roadmap to finish the first production scope (2026-11-27)

The cheapest, strongest evidence comes first, and FE covers what nothing else does. The same list is
"Improvements planned" (PL-01 to PL-10) in the app's Status & roadmap tab.

| Step | What | Size | Needs | Why this order |
|---|---|---|---|---|
| PL-01 | **Interpolation spread for lugs:** rerun each lug with the nearest printed Table 7/8 rows and show the low–high range. **Done 2026-11-27.** | S | nothing | Shows at once how much the judgement matters for each lug |
| PL-02 | **Lug benchmark:** 3 lug cases (plus an optional one with a pad) run in your licensed program with WRC 537, frozen as checks. Cases: [LUG-BENCHMARK-REQUEST.md](LUG-BENCHMARK-REQUEST.md) | S | **your runs** | The only real WRC 537 evidence for lugs; FE gives only a ratio |
| PL-03 | **Trunnions:** round attachment, solid or hollow, labelled. **Done 2026-11-27.** | S | nothing | Completes the attachment types |
| PL-04 | **FE for lugs:** rectangular-footprint shell mesh; FE/WRC ratios for several shapes; FE as the route for lugs WRC 537 blocks (thin plates, torsion). **Done 2026-11-27.** FE finds less than WRC at the middle of a lug's edges and more at its corners | M | nothing | Covers what WRC 537 cannot; the corner peak is labelled mesh-dependent |
| PL-05 | **Code method for thin plate lugs:** EN 13445-3 clause 16 or PD 5500 Annex G | M | **your copy of the standard, and which one** | Thin plates welded straight to the shell are the usual lug, and outside WRC 537 |
| PL-06 | **Finish the UI**, then the canvas (roadmap stages A–D). In three parts. **Part 1 done 2026-11-27:** one look, laptop/tablet/phone layouts, keyboard tabs and links, a spoken result for screen readers. **Part 2 done 2026-11-27:** help text on every WRC input, inch/lbf/psi units. **Part 3 done 2026-11-28:** the LAFEA workbench and the advanced workflow in the same look, a "Technical details" switch for their custody text and codes, keyboard fixes there (the mesh is one Tab stop), and units and help text in the plate form. The advanced workflow keeps its example (decision 6, 2026-11-28). **Done.** | L | nothing | |

A simple torsion formula for lugs is not planned. A shear-flow estimate misses the shell bending that WRC 537
§4.3.4 warns about, so torsion goes to FE (PL-04: the FE model now takes a lug with torsion on its own) unless
you ask for a labelled screening value.

The app's **Status & roadmap** tab (`src/app/status/status-content.js`)
holds the known issues, the planned improvements and the staged roadmap (A: canvas, B: empirical solver on
the canvas, C: empirical and FE together, D: wider coverage). Keep that file and this plan in step.

### FE and empirical (owner, 2026-11-28)

Keep FE and empirical (WRC 537) work apart: plan them as separate tracks, and never justify one by the other.
A one-time FE run to build data or fit an approximation for the empirical side is fine (PL-07 is an example).
The empirical solver must not depend on FE when it runs.

### Canvas plan, roadmap stage A (2026-11-28)

The empirical track. You draw the vessel once, a shell with its attachments and their load cases, and each
attachment is checked by the existing WRC 537 core, which does not change. Rules for every step:
- the six examples give exactly the same numbers through the canvas as through the form;
- drawing is 2-D SVG with no new libraries, so the first load stays well under 500 kB;
- the calculator form stays, as the editor for the selected attachment;
- each step is usable on its own and has its own PR, and each starts only on your go-ahead.

Grid snapping, polar and object snaps, dimension lines and a library-free 3-D renderer are ported from Pdf-Hub
(your repository, MIT licence) as plain JS: `core/cad-grid/gridMath.ts`, `core/cad-modeling/draftingMath.ts`,
`core/annotations/cadSnapping.ts`, `components/annotations/DimensionNode.tsx`, `core/cad-3d/software3dRenderer.ts`.

| Step | What you can do when it is done | Size | Needs |
|---|---|---|---|
| A1 | **Sketch:** a dimensioned side view and end section of the calculator's inputs, live, in SI or US, and in the report. **Done 2026-11-28.** | S–M | nothing |
| A2 | **Several attachments** on one shell, each with its type, size, pad, station, angle around and load cases. "Check all" gives the governing result per attachment. A `.vessel.json` model file; an old `.wrc.json` opens as one attachment | M | decisions 7 and 8 |
| A3 | **Edit on the drawing:** an unrolled view (along × around, wrapping at 360°); select and drag with grid and 15° snaps; arrow keys do the same | M (S–M with the Pdf-Hub port) | A2 |
| A4 | **Range checks on the model:** γ and β out of range, too close to an end (§4.5.2), too close to another attachment, coloured on the drawing | S–M | decision 9 |
| A5 | **Loads in vessel axes** (optional): converted to each attachment's WRC axes from its angle | M | decision 10 |
| A6 | **3-D preview** (optional), view only, loaded only when opened | S–M | nothing |

Out of scope, and blocked with a label on the drawing: hillside or angled nozzles, heads and spheres (stage D),
and stress where two attachments' zones overlap (WRC 537 does not cover it).

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

### 5.4 Benchmarks (S per case, **needs your data**): partly done 2026-11-26
- Add at least 3 more CAESAR II or PV Elite WRC 537 outputs across γ 10–300 and β 0.05–0.5, as
  frozen checks.
- This is what turns "interpolated γ" from engineering judgement into evidence.
- Done: one PV Elite 28 report (36-inch nozzle, γ 21.6 and 42.7) is frozen as a **different-method
  reference**, because PV Elite used WRC 297. It confirms stress intensity, load signs and shear, and
  records that WRC 297 gives 1.39× (junction) and 1.78× (pad edge) our governing load stress. See the
  AUDIT-AND-ROADMAP progress entry.
- Still open: WRC 537 output from CAESAR II or PV Elite. Rerunning the same nozzle with the local-load
  method set to WRC 537 would add two interpolated-γ cases at once.

### 5.5 Clean up inherited checks (M): done 2026-11-26 for the checks (128 KNOWN → 13, see the AUDIT-AND-ROADMAP progress entry); `lafea.html` kept (owner decision, 2026-11-26)
- Fix, update or delete each of the 90 stale upstream checks, so `check:all` reflects real risk.
- ~~Delete `lafea.html` and the specs that only test it~~: decided 2026-11-26 to keep the single-view entry, its build step and its specs.

### 5.6 Widen WRC 537 (L, **needs your decision and source**)
- Spherical shells and rectangular attachments need their curves digitised from your licensed copy
  of the bulletin, then validated. Only worth it if those jobs come in.

## Decisions needed from you

1. **Benchmarks:** can you supply CAESAR II or PV Elite WRC outputs (inputs and the 8-point stress
   table) for 3 or more nozzles?
2. **Spheres and rectangular attachments:** *decided 2026-11-26: lugs (rectangular attachments on
   cylinders) now, spheres later.* *Resolved 2026-11-27: the curves are in `docs/emp1` and confirmed against the
   PDF; pads go first, then lugs.*
3. **`lafea.html`:** *decided 2026-11-26: keep it.* Keep the original single-view LAFEA page, or remove it with its upstream-only
   tests?
4. **Lug benchmark (PL-02):** can you run the cases in [LUG-BENCHMARK-REQUEST.md](LUG-BENCHMARK-REQUEST.md)
   in PV Elite (or similar) with WRC 537?
5. **Thin plate lugs (PL-05):** do you have EN 13445-3 or PD 5500, and which should the app follow?
6. **Advanced EMP.1 workflow example (PL-06):** *decided 2026-11-28: keep it as it is.* Its "Run complete example"
   loads the γ = 5 qualification sample (four pressure definitions, ten reference points, a 35.43 mm attachment),
   which 19 checks and the γ = 5 hand calculation are built on. The calculator's six examples are the plain
   starting points.
7. **Where the canvas lives (stage A):** inside the Empirical tab, above the calculator form (proposed), or in a
   tab of its own? Needed before A2.
8. **Canvas model file (before A2):** keep it empirical only, with FE importing its geometry one way later
   (proposed, in line with keeping FE and empirical apart), or one file read by both WRC and LAFEA as the
   roadmap first said?
9. **Spacing between attachments (A4):** WRC 537 has no rule for two attachments close together. Which
   criterion should the warning use, for example a centre spacing in multiples of √(Rm·T), or your company rule?
   Until then it can only be a labelled warning.
10. **Vessel axes for loads (A5):** which axis convention (for example CAESAR II, Y up), and a case converted by a
    piping program to check against.

## Suggested start

5.1, then 5.2, then 5.3 (all done 2026-11-26), then PL-01, PL-03 and PL-04 (done 2026-11-27). PL-06 (the UI) is
done: parts 1 and 2 on 2026-11-27 and part 3 on 2026-11-28 (decision 6: keep the advanced workflow's example).
Canvas step A1 (the sketch) was done on 2026-11-28; A2 waits on decisions 7 and 8. PL-02 and PL-05 start as soon as your runs or your standard arrive.
