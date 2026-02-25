# NOVA Booster Study (audit-only)
- Train joined: `tmp/shadow-bench-50-multiday-seeded-thresholds-joined.json`
- Valid joined: `tmp/shadow-bench-50-multiday-seeded-thresholds-joined.json`
- Train rows: 49
- Valid rows: 49
- Min overrides: 8

## Baselines
- Train NOVA: 33/49 (67.3%)
- Train HISTORY: 28/49 (57.1%)
- Valid NOVA: 33/49 (67.3%)
- Valid HISTORY: 28/49 (57.1%)

## Deterministic (D1) Candidates
| candidate_id | valid hitRate | vs NOVA | overrides | net | best subset lift | passes | train hitRate |
|---|---:|---:|---:|---:|---:|:---:|---:|
| D1_gate_0.45_ovr_0.36 | 67.3% | +0.0pp | 2 | 0 | +3.1pp | no | 67.3% |
| D1_gate_0.35_ovr_0.36 | 65.3% | -2.0pp | 3 | -1 | +3.1pp | no | 65.3% |
| D1_gate_0.40_ovr_0.36 | 65.3% | -2.0pp | 3 | -1 | +3.1pp | no | 65.3% |
| D1_gate_0.45_ovr_0.30 | 65.3% | -2.0pp | 3 | -1 | +0.0pp | no | 65.3% |
| D1_gate_0.45_ovr_0.42 | 65.3% | -2.0pp | 1 | -1 | +0.0pp | no | 65.3% |
| D1_gate_0.50_ovr_0.30 | 65.3% | -2.0pp | 1 | -1 | +0.0pp | no | 65.3% |
| D1_gate_0.50_ovr_0.36 | 65.3% | -2.0pp | 1 | -1 | +0.0pp | no | 65.3% |
| D1_gate_0.50_ovr_0.42 | 65.3% | -2.0pp | 1 | -1 | +0.0pp | no | 65.3% |
| D1_gate_0.55_ovr_0.18 | 65.3% | -2.0pp | 1 | -1 | +0.0pp | no | 65.3% |
| D1_gate_0.55_ovr_0.24 | 65.3% | -2.0pp | 1 | -1 | +0.0pp | no | 65.3% |
| D1_gate_0.55_ovr_0.30 | 65.3% | -2.0pp | 1 | -1 | +0.0pp | no | 65.3% |
| D1_gate_0.55_ovr_0.36 | 65.3% | -2.0pp | 1 | -1 | +0.0pp | no | 65.3% |
| D1_gate_0.55_ovr_0.42 | 65.3% | -2.0pp | 1 | -1 | +0.0pp | no | 65.3% |
| D1_gate_0.60_ovr_0.18 | 65.3% | -2.0pp | 1 | -1 | +0.0pp | no | 65.3% |
| D1_gate_0.60_ovr_0.24 | 65.3% | -2.0pp | 1 | -1 | +0.0pp | no | 65.3% |
| D1_gate_0.60_ovr_0.30 | 65.3% | -2.0pp | 1 | -1 | +0.0pp | no | 65.3% |
| D1_gate_0.60_ovr_0.36 | 65.3% | -2.0pp | 1 | -1 | +0.0pp | no | 65.3% |
| D1_gate_0.60_ovr_0.42 | 65.3% | -2.0pp | 1 | -1 | +0.0pp | no | 65.3% |
| D1_gate_0.35_ovr_0.24 | 63.3% | -4.1pp | 6 | -2 | +0.0pp | no | 63.3% |
| D1_gate_0.40_ovr_0.24 | 63.3% | -4.1pp | 6 | -2 | +0.0pp | no | 63.3% |

### Best D1 subset diagnostics (valid)
| subset | n | booster | NOVA | lift |
|---|---:|---:|---:|---:|
| gateOpen | 7 | 71.4% | 71.4% | +0.0pp |
| overridden | 2 | 50.0% | 50.0% | +0.0pp |
| disagreeHN | 19 | 63.2% | 63.2% | +0.0pp |
| novaLogisticConflict | 11 | 72.7% | 72.7% | +0.0pp |
| lowConfidence | 32 | 62.5% | 59.4% | +3.1pp |
| lowNovaMargin | 20 | 70.0% | 70.0% | +0.0pp |

## Fitted (F1) Candidates
| candidate_id | valid hitRate | vs NOVA | overrides | net | best subset lift | passes | train hitRate |
|---|---:|---:|---:|---:|---:|:---:|---:|
| F1_risk_0.45_meta_0.03 | 71.4% | +4.1pp | 2 | 2 | +6.3pp | no | 71.4% |
| F1_risk_0.45_meta_0.05 | 71.4% | +4.1pp | 2 | 2 | +6.3pp | no | 71.4% |
| F1_risk_0.45_meta_0.07 | 69.4% | +2.0pp | 1 | 1 | +3.1pp | no | 69.4% |
| F1_risk_0.45_meta_0.10 | 67.3% | +0.0pp | 0 | 0 | +0.0pp | no | 67.3% |
| F1_risk_0.45_meta_0.12 | 67.3% | +0.0pp | 0 | 0 | +0.0pp | no | 67.3% |
| F1_risk_0.50_meta_0.03 | 67.3% | +0.0pp | 0 | 0 | +0.0pp | no | 67.3% |
| F1_risk_0.50_meta_0.05 | 67.3% | +0.0pp | 0 | 0 | +0.0pp | no | 67.3% |
| F1_risk_0.50_meta_0.07 | 67.3% | +0.0pp | 0 | 0 | +0.0pp | no | 67.3% |
| F1_risk_0.50_meta_0.10 | 67.3% | +0.0pp | 0 | 0 | +0.0pp | no | 67.3% |
| F1_risk_0.50_meta_0.12 | 67.3% | +0.0pp | 0 | 0 | +0.0pp | no | 67.3% |
| F1_risk_0.55_meta_0.03 | 67.3% | +0.0pp | 0 | 0 | +0.0pp | no | 67.3% |
| F1_risk_0.55_meta_0.05 | 67.3% | +0.0pp | 0 | 0 | +0.0pp | no | 67.3% |
| F1_risk_0.55_meta_0.07 | 67.3% | +0.0pp | 0 | 0 | +0.0pp | no | 67.3% |
| F1_risk_0.55_meta_0.10 | 67.3% | +0.0pp | 0 | 0 | +0.0pp | no | 67.3% |
| F1_risk_0.55_meta_0.12 | 67.3% | +0.0pp | 0 | 0 | +0.0pp | no | 67.3% |
| F1_risk_0.60_meta_0.03 | 67.3% | +0.0pp | 0 | 0 | +0.0pp | no | 67.3% |
| F1_risk_0.60_meta_0.05 | 67.3% | +0.0pp | 0 | 0 | +0.0pp | no | 67.3% |
| F1_risk_0.60_meta_0.07 | 67.3% | +0.0pp | 0 | 0 | +0.0pp | no | 67.3% |
| F1_risk_0.60_meta_0.10 | 67.3% | +0.0pp | 0 | 0 | +0.0pp | no | 67.3% |
| F1_risk_0.60_meta_0.12 | 67.3% | +0.0pp | 0 | 0 | +0.0pp | no | 67.3% |

### Best F1 subset diagnostics (valid)
| subset | n | booster | NOVA | lift |
|---|---:|---:|---:|---:|
| gateOpen | 2 | 100.0% | 0.0% | +100.0pp |
| overridden | 2 | 100.0% | 0.0% | +100.0pp |
| disagreeHN | 19 | 63.2% | 63.2% | +0.0pp |
| novaLogisticConflict | 11 | 72.7% | 72.7% | +0.0pp |
| lowConfidence | 32 | 65.6% | 59.4% | +6.3pp |
| lowNovaMargin | 20 | 70.0% | 70.0% | +0.0pp |

