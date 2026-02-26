# NOVA+ Trend/Strength Filter Study

## Summary
- Train usable rows: 49
- Valid usable rows: 99
- Deep collection: cacheHits=0, cacheMisses=246, collected=246, failed=0
- Baseline main valid hit-rate: 49.5%
- Baseline Agreement+Confidence filter (valid): kept=58/99 keptHit=55.2% skip=41 (41.4%) deltaVsMain=5.7pp
- Baseline NOVA+L+C filter (valid): kept=54/99 keptHit=48.1% skip=45 (45.5%) deltaVsMain=-1.3pp
- Conclusion: Trend+strength filters show improvement over existing baselines (best keptHitRate=56.6%).

## Top Candidates (valid)

| ruleId | valid keptHit | valid skipRate | skipped | ΔvsMain | ΔvsAC | ΔvsNLC | passes |
|---|---:|---:|---:|---:|---:|---:|:---:|
| t_ctrl_a3_c55_r0p45_td0 | 56.6% | 23.2% | 23 | 7.1pp | 1.4pp | 8.5pp | yes |
| t_ctrl_a3_c55_r0p6_td0 | 56.6% | 23.2% | 23 | 7.1pp | 1.4pp | 8.5pp | yes |
| t_ctrl_a3_c55_r0p75_td0 | 56.6% | 23.2% | 23 | 7.1pp | 1.4pp | 8.5pp | yes |
| t_ctrl_a3_c58_r0p45_td0 | 56.6% | 23.2% | 23 | 7.1pp | 1.4pp | 8.5pp | yes |
| t_ctrl_a3_c58_r0p6_td0 | 56.6% | 23.2% | 23 | 7.1pp | 1.4pp | 8.5pp | yes |
| t_ctrl_a3_c58_r0p75_td0 | 56.6% | 23.2% | 23 | 7.1pp | 1.4pp | 8.5pp | yes |
| t_ctrl_a3_c52_r0p45_td0 | 56.4% | 21.2% | 21 | 6.9pp | 1.2pp | 8.3pp | yes |
| t_ctrl_a3_c52_r0p6_td0 | 56.4% | 21.2% | 21 | 6.9pp | 1.2pp | 8.3pp | yes |
| t_ctrl_a3_c52_r0p75_td0 | 56.4% | 21.2% | 21 | 6.9pp | 1.2pp | 8.3pp | yes |
| t_combo_a3_c52_r0p45_t0 | 56.1% | 17.2% | 17 | 6.6pp | 0.9pp | 8.0pp | yes |
| t_combo_a3_c52_r0p6_t0 | 56.1% | 17.2% | 17 | 6.6pp | 0.9pp | 8.0pp | yes |
| t_combo_a3_c52_r0p75_t0 | 56.1% | 17.2% | 17 | 6.6pp | 0.9pp | 8.0pp | yes |
| t_combo_a3_c55_r0p45_t0 | 55.7% | 20.2% | 20 | 6.2pp | 0.5pp | 7.6pp | yes |
| t_combo_a3_c55_r0p6_t0 | 55.7% | 20.2% | 20 | 6.2pp | 0.5pp | 7.6pp | yes |
| t_combo_a3_c55_r0p75_t0 | 55.7% | 20.2% | 20 | 6.2pp | 0.5pp | 7.6pp | yes |
| t_combo_a3_c58_r0p45_t0 | 55.7% | 20.2% | 20 | 6.2pp | 0.5pp | 7.6pp | yes |
| t_combo_a3_c58_r0p6_t0 | 55.7% | 20.2% | 20 | 6.2pp | 0.5pp | 7.6pp | yes |
| t_combo_a3_c58_r0p75_t0 | 55.7% | 20.2% | 20 | 6.2pp | 0.5pp | 7.6pp | yes |
| t_combo_a3_c50_r0p45_t0 | 55.4% | 16.2% | 16 | 5.9pp | 0.2pp | 7.3pp | yes |
| t_combo_a3_c50_r0p6_t0 | 55.4% | 16.2% | 16 | 5.9pp | 0.2pp | 7.3pp | yes |
