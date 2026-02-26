# NOVA+ Trend/Strength Filter Study

## Summary
- Train usable rows: 49
- Valid usable rows: 99
- Deep collection: cacheHits=0, cacheMisses=246, collected=80, failed=166
- Baseline main valid hit-rate: 49.5%
- Baseline Agreement+Confidence filter (valid): kept=58/99 keptHit=55.2% skip=41 (41.4%) deltaVsMain=5.7pp
- Baseline NOVA+L+C filter (valid): kept=54/99 keptHit=48.1% skip=45 (45.5%) deltaVsMain=-1.3pp
- Conclusion: No trend+strength candidate clearly outperforms simpler existing filters on validation; keep simpler filters.

## Top Candidates (valid)

| ruleId | valid keptHit | valid skipRate | skipped | ΔvsMain | ΔvsAC | ΔvsNLC | passes |
|---|---:|---:|---:|---:|---:|---:|:---:|
| s_vol_a3_c55_v0p05 | 50.0% | 9.1% | 9 | 0.5pp | -5.2pp | 1.9pp | yes |
| s_vol_a3_c55_v0p1 | 50.0% | 9.1% | 9 | 0.5pp | -5.2pp | 1.9pp | yes |
| s_vol_a3_c55_v0p15 | 50.0% | 9.1% | 9 | 0.5pp | -5.2pp | 1.9pp | yes |
| s_vol_a3_c58_v0p05 | 50.0% | 9.1% | 9 | 0.5pp | -5.2pp | 1.9pp | yes |
| s_vol_a3_c58_v0p1 | 50.0% | 9.1% | 9 | 0.5pp | -5.2pp | 1.9pp | yes |
| s_vol_a3_c58_v0p15 | 50.0% | 9.1% | 9 | 0.5pp | -5.2pp | 1.9pp | yes |
