# Lug benchmark request (roadmap step PL-02)

The calculator's lug (rectangular attachment) route is checked against the WRC 537 equations by hand
(`scripts/wrc-lug-check.mjs`), but no other program has run the same lugs yet. Three short runs in your
licensed program would give the first real WRC 537 lug benchmark, the same way the CAESAR II case
benchmarks round nozzles.

The cases are also in `validation/emp1/lug-benchmark-request/lug-benchmark-cases-v1.json`.
`scripts/wrc-lug-check.mjs` checks that the calculator accepts every case, so none of them is blocked here.

## Settings for every case

- Method: **WRC 537** (not WRC 297), cylindrical shell, **rectangular** attachment.
- Shell stress concentration factor 1.0 (no Kn/Kb), design pressure 0 (or pressure stress switched off),
  corrosion allowance 0, no cylinder-length limits.
- Loads in the WRC 537 Figure 2 convention (WRC 107/537), N and N·m. Torsion Mt = 0: WRC 537 gives no
  method for torsion on a rectangular attachment.
- c1 is the half-width **around** the shell (circumferential), c2 the half-length **along** it
  (longitudinal). Both full and half sizes are listed, because programs label them differently.

## Cases

| Case | Shell OD / ID / T (mm) | Footprint along × around (mm) | c1 / c2 (mm) | P (N) | Vc (N) | Vl (N) | Mc (N·m) | Ml (N·m) | What it tests |
|---|---|---|---|---|---|---|---|---|---|
| L1 | 2010 / 1990 / 10 | 100 × 200 | 100 / 50 | −3000 | 800 | −1200 | 2000 | −3000 | γ = 100, β1/β2 = 2: every factor is a printed table value |
| L2 | 1500 / 1476 / 12 | 200 × 100 | 50 / 100 | −5000 | 1000 | −3000 | 1000 | −4000 | γ = 62, β1/β2 = 0.5: γ and the factors are interpolated; some rows are approximate |
| L3 | 1616 / 1584 / 16 | 400 × 100 | 50 / 200 | −8000 | 2000 | −4000 | 3000 | −6000 | γ = 50, β1/β2 = 0.25: the edge of the WRC 537 shape range |
| L4 (optional) | as L2, plus a 300 × 200 × 10 mm pad (along × around × thick) | 200 × 100 | 50 / 100 | as L2 | | | | | the pad: at the lug (shell + pad) and at the pad edge |

## What to send back

For each case, the report page or pages that show:
1. the geometry parameters the program used (γ, β1, β2, and the β it used for each term, if printed);
2. the stress table at the 8 points (Au … Dl), by load term if the program prints it;
3. the stress intensity at each point.

A PDF or a screenshot is fine. Report PDFs stay out of git (`validation/**/*.pdf` is ignored). Only the
numbers are frozen into a JSON reference, as with the PV Elite nozzle and the CAESAR II pages.

## What happens next

Each case becomes a frozen check: our 8-point stresses against yours. For a printed-factor case like L1 the
target is a few percent, as with CAESAR II (2.0%). Any larger difference is traced to its term and recorded,
whether it comes from interpolation, curve reading or a different convention.
