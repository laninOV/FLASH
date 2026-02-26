# NOVA+ Trend/Strength Filter Study

## Summary
- Train usable rows: 49
- Valid usable rows: 99
- Deep collection: cacheHits=0, cacheMisses=0, collected=0, failed=0
- Baseline main valid hit-rate: 49.5%
- Baseline Agreement+Confidence filter (valid): kept=58/99 keptHit=55.2% skip=41 (41.4%) deltaVsMain=5.7pp
- Baseline NOVA+L+C filter (valid): kept=54/99 keptHit=48.1% skip=45 (45.5%) deltaVsMain=-1.3pp
- Best pre-index trend/strength candidate (valid keptHit): 56.6%
- Preferred form variant: tech-only
- Form rationale: tech-only is simpler and not meaningfully worse on validation (56.6% vs 55.1%)
- Conclusion: Trend+strength filters show improvement over existing baselines (best keptHitRate=56.6%).

## Index Correlations (valid)

- strengthEdge ↔ mainCorrect: 0.019
- stabilityEdge ↔ mainCorrect: 0.155
- formTechEdge ↔ mainCorrect: 0.07
- formPlusEdge ↔ mainCorrect: 0.08

## Top Candidates (valid)

| ruleId | family | valid keptHit | valid skipRate | skipped | ΔvsMain | ΔvsAC | ΔvsNLC | ΔvsTrend | passes |
|---|---|---:|---:|---:|---:|---:|---:|---:|:---:|
| t_ctrl_a3_c55_r0p45_td0 | trend | 56.6% | 23.2% | 23 | 7.1pp | 1.4pp | 8.5pp | 0.0pp | yes |
| t_ctrl_a3_c55_r0p6_td0 | trend | 56.6% | 23.2% | 23 | 7.1pp | 1.4pp | 8.5pp | 0.0pp | yes |
| t_ctrl_a3_c55_r0p75_td0 | trend | 56.6% | 23.2% | 23 | 7.1pp | 1.4pp | 8.5pp | 0.0pp | yes |
| i1_formtech_a3_c55_r0p45_f0 | index-form-tech | 56.6% | 23.2% | 23 | 7.1pp | 1.4pp | 8.5pp | 0.0pp | yes |
| i1_formtech_a3_c55_r0p6_f0 | index-form-tech | 56.6% | 23.2% | 23 | 7.1pp | 1.4pp | 8.5pp | 0.0pp | yes |
| i1_formtech_a3_c55_r0p75_f0 | index-form-tech | 56.6% | 23.2% | 23 | 7.1pp | 1.4pp | 8.5pp | 0.0pp | yes |
| t_ctrl_a3_c58_r0p45_td0 | trend | 56.6% | 23.2% | 23 | 7.1pp | 1.4pp | 8.5pp | 0.0pp | yes |
| t_ctrl_a3_c58_r0p6_td0 | trend | 56.6% | 23.2% | 23 | 7.1pp | 1.4pp | 8.5pp | 0.0pp | yes |
| t_ctrl_a3_c58_r0p75_td0 | trend | 56.6% | 23.2% | 23 | 7.1pp | 1.4pp | 8.5pp | 0.0pp | yes |
| i1_formtech_a3_c58_r0p45_f0 | index-form-tech | 56.6% | 23.2% | 23 | 7.1pp | 1.4pp | 8.5pp | 0.0pp | yes |
| i1_formtech_a3_c58_r0p6_f0 | index-form-tech | 56.6% | 23.2% | 23 | 7.1pp | 1.4pp | 8.5pp | 0.0pp | yes |
| i1_formtech_a3_c58_r0p75_f0 | index-form-tech | 56.6% | 23.2% | 23 | 7.1pp | 1.4pp | 8.5pp | 0.0pp | yes |
| t_ctrl_a3_c52_r0p45_td0 | trend | 56.4% | 21.2% | 21 | 6.9pp | 1.2pp | 8.3pp | -0.2pp | yes |
| t_ctrl_a3_c52_r0p6_td0 | trend | 56.4% | 21.2% | 21 | 6.9pp | 1.2pp | 8.3pp | -0.2pp | yes |
| t_ctrl_a3_c52_r0p75_td0 | trend | 56.4% | 21.2% | 21 | 6.9pp | 1.2pp | 8.3pp | -0.2pp | yes |
| i1_formtech_a3_c52_r0p45_f0 | index-form-tech | 56.4% | 21.2% | 21 | 6.9pp | 1.2pp | 8.3pp | -0.2pp | yes |
| i1_formtech_a3_c52_r0p6_f0 | index-form-tech | 56.4% | 21.2% | 21 | 6.9pp | 1.2pp | 8.3pp | -0.2pp | yes |
| i1_formtech_a3_c52_r0p75_f0 | index-form-tech | 56.4% | 21.2% | 21 | 6.9pp | 1.2pp | 8.3pp | -0.2pp | yes |
| t_combo_a3_c52_r0p45_t0 | trend | 56.1% | 17.2% | 17 | 6.6pp | 0.9pp | 8.0pp | -0.5pp | yes |
| t_combo_a3_c52_r0p6_t0 | trend | 56.1% | 17.2% | 17 | 6.6pp | 0.9pp | 8.0pp | -0.5pp | yes |
