# NOVA Booster Study (audit-only)
- Train joined: `tmp/shadow-bench-50-multiday-seeded-thresholds-joined.json`
- Valid joined: `tmp/shadow-bench-100-multiday-global-priority-prodlike-v2-joined.json`
- Train rows: 49
- Valid rows: 99
- Min overrides: 8

## Baselines
- Train NOVA: 33/49 (67.3%)
- Train HISTORY: 28/49 (57.1%)
- Valid NOVA: 61/99 (61.6%)
- Valid HISTORY: 49/99 (49.5%)

## Deterministic (D1) Candidates
| candidate_id | valid hitRate | vs NOVA | overrides | net | best subset lift | passes | train hitRate |
|---|---:|---:|---:|---:|---:|:---:|---:|
| D1_gate_0.45_ovr_0.36 | 60.6% | -1.0pp | 5 | -1 | +1.6pp | no | 67.3% |
| D1_gate_0.50_ovr_0.36 | 60.6% | -1.0pp | 5 | -1 | +1.6pp | no | 65.3% |
| D1_gate_0.50_ovr_0.30 | 59.6% | -2.0pp | 6 | -2 | +0.0pp | no | 65.3% |
| D1_gate_0.45_ovr_0.42 | 59.6% | -2.0pp | 4 | -2 | +0.0pp | no | 65.3% |
| D1_gate_0.50_ovr_0.42 | 59.6% | -2.0pp | 4 | -2 | +0.0pp | no | 65.3% |
| D1_gate_0.60_ovr_0.36 | 59.6% | -2.0pp | 2 | -2 | +0.0pp | no | 65.3% |
| D1_gate_0.60_ovr_0.42 | 59.6% | -2.0pp | 2 | -2 | +0.0pp | no | 65.3% |
| D1_gate_0.50_ovr_0.24 | 58.6% | -3.0pp | 9 | -3 | -1.6pp | no | 63.3% |
| D1_gate_0.35_ovr_0.36 | 58.6% | -3.0pp | 7 | -3 | +0.0pp | no | 65.3% |
| D1_gate_0.40_ovr_0.36 | 58.6% | -3.0pp | 7 | -3 | +0.0pp | no | 65.3% |
| D1_gate_0.45_ovr_0.30 | 58.6% | -3.0pp | 7 | -3 | -1.6pp | no | 65.3% |
| D1_gate_0.55_ovr_0.36 | 58.6% | -3.0pp | 3 | -3 | -1.6pp | no | 65.3% |
| D1_gate_0.55_ovr_0.42 | 58.6% | -3.0pp | 3 | -3 | -1.6pp | no | 65.3% |
| D1_gate_0.60_ovr_0.18 | 58.6% | -3.0pp | 3 | -3 | -1.6pp | no | 65.3% |
| D1_gate_0.60_ovr_0.24 | 58.6% | -3.0pp | 3 | -3 | -1.6pp | no | 65.3% |
| D1_gate_0.60_ovr_0.30 | 58.6% | -3.0pp | 3 | -3 | -1.6pp | no | 65.3% |
| D1_gate_0.45_ovr_0.24 | 57.6% | -4.0pp | 10 | -4 | -3.2pp | no | 63.3% |
| D1_gate_0.50_ovr_0.18 | 57.6% | -4.0pp | 10 | -4 | -3.2pp | no | 63.3% |
| D1_gate_0.35_ovr_0.42 | 57.6% | -4.0pp | 6 | -4 | -1.6pp | no | 63.3% |
| D1_gate_0.40_ovr_0.42 | 57.6% | -4.0pp | 6 | -4 | -1.6pp | no | 63.3% |

### Best D1 subset diagnostics (valid)
| subset | n | booster | NOVA | lift |
|---|---:|---:|---:|---:|
| gateOpen | 21 | 61.9% | 66.7% | -4.8pp |
| overridden | 5 | 40.0% | 60.0% | -20.0pp |
| disagreeHN | 38 | 63.2% | 65.8% | -2.6pp |
| novaLogisticConflict | 26 | 57.7% | 65.4% | -7.7pp |
| lowConfidence | 62 | 61.3% | 59.7% | +1.6pp |
| lowNovaMargin | 48 | 60.4% | 62.5% | -2.1pp |

## Fitted (F1) Candidates
| candidate_id | valid hitRate | vs NOVA | overrides | net | best subset lift | passes | train hitRate |
|---|---:|---:|---:|---:|---:|:---:|---:|
| F1_risk_0.45_meta_0.03 | 62.6% | +1.0pp | 1 | 1 | +1.6pp | no | 71.4% |
| F1_risk_0.45_meta_0.05 | 62.6% | +1.0pp | 1 | 1 | +1.6pp | no | 71.4% |
| F1_risk_0.45_meta_0.07 | 61.6% | +0.0pp | 0 | 0 | +0.0pp | no | 69.4% |
| F1_risk_0.45_meta_0.10 | 61.6% | +0.0pp | 0 | 0 | +0.0pp | no | 67.3% |
| F1_risk_0.45_meta_0.12 | 61.6% | +0.0pp | 0 | 0 | +0.0pp | no | 67.3% |
| F1_risk_0.50_meta_0.03 | 61.6% | +0.0pp | 0 | 0 | +0.0pp | no | 67.3% |
| F1_risk_0.50_meta_0.05 | 61.6% | +0.0pp | 0 | 0 | +0.0pp | no | 67.3% |
| F1_risk_0.50_meta_0.07 | 61.6% | +0.0pp | 0 | 0 | +0.0pp | no | 67.3% |
| F1_risk_0.50_meta_0.10 | 61.6% | +0.0pp | 0 | 0 | +0.0pp | no | 67.3% |
| F1_risk_0.50_meta_0.12 | 61.6% | +0.0pp | 0 | 0 | +0.0pp | no | 67.3% |
| F1_risk_0.55_meta_0.03 | 61.6% | +0.0pp | 0 | 0 | +0.0pp | no | 67.3% |
| F1_risk_0.55_meta_0.05 | 61.6% | +0.0pp | 0 | 0 | +0.0pp | no | 67.3% |
| F1_risk_0.55_meta_0.07 | 61.6% | +0.0pp | 0 | 0 | +0.0pp | no | 67.3% |
| F1_risk_0.55_meta_0.10 | 61.6% | +0.0pp | 0 | 0 | +0.0pp | no | 67.3% |
| F1_risk_0.55_meta_0.12 | 61.6% | +0.0pp | 0 | 0 | +0.0pp | no | 67.3% |
| F1_risk_0.60_meta_0.03 | 61.6% | +0.0pp | 0 | 0 | +0.0pp | no | 67.3% |
| F1_risk_0.60_meta_0.05 | 61.6% | +0.0pp | 0 | 0 | +0.0pp | no | 67.3% |
| F1_risk_0.60_meta_0.07 | 61.6% | +0.0pp | 0 | 0 | +0.0pp | no | 67.3% |
| F1_risk_0.60_meta_0.10 | 61.6% | +0.0pp | 0 | 0 | +0.0pp | no | 67.3% |
| F1_risk_0.60_meta_0.12 | 61.6% | +0.0pp | 0 | 0 | +0.0pp | no | 67.3% |

### Best F1 subset diagnostics (valid)
| subset | n | booster | NOVA | lift |
|---|---:|---:|---:|---:|
| gateOpen | 1 | 100.0% | 0.0% | +100.0pp |
| overridden | 1 | 100.0% | 0.0% | +100.0pp |
| disagreeHN | 38 | 65.8% | 65.8% | +0.0pp |
| novaLogisticConflict | 26 | 65.4% | 65.4% | +0.0pp |
| lowConfidence | 62 | 61.3% | 59.7% | +1.6pp |
| lowNovaMargin | 48 | 62.5% | 62.5% | +0.0pp |

