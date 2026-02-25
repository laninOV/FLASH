# Agreement + Confidence Study (49→100)

## Summary
- Train usable rows: 49
- Valid usable rows: 99
- Train main baseline: 28/49 (57.1%)
- Valid main baseline: 49/99 (49.5%)
- Valid NOVA baseline (context): 61/99 (61.6%)
- Correlation (valid): agreementRatio↔mainCorrect=0.175, confidencePct↔mainCorrect=0.07

## Hypothesis Check
- Rule: `skip if agreementCount <= 1 && confidencePct <= 50`
- Train: skipped=5/49 (10.2%), keptHit=56.8%, deltaKeptVsMain=-0.3pp
- Valid: skipped=10/99 (10.1%), keptHit=50.6%, deltaKeptVsMain=1.1pp

## Accuracy by Agreement (valid)
| Agreement | n | Hit | HitRate | ErrorRate | Wilson95 |
| --- | --- | --- | --- | --- | --- |
| 1 | 14 | 5 | 35.7% | 64.3% | [16.3%, 61.2%] |
| 2 | 16 | 7 | 43.8% | 56.3% | [23.1%, 66.8%] |
| 3 | 11 | 5 | 45.5% | 54.5% | [21.3%, 72%] |
| 4 | 18 | 8 | 44.4% | 55.6% | [24.6%, 66.3%] |
| 5 | 40 | 24 | 60% | 40% | [44.6%, 73.7%] |
| <=1 | 14 | 5 | 35.7% | 64.3% | [16.3%, 61.2%] |
| <=2 | 30 | 12 | 40% | 60% | [24.6%, 57.7%] |
| >=4 | 58 | 32 | 55.2% | 44.8% | [42.5%, 67.3%] |
| ==methods | 40 | 24 | 60% | 40% | [44.6%, 73.7%] |

## Accuracy by Confidence (valid)
| Confidence | n | Hit | HitRate | ErrorRate | Wilson95 |
| --- | --- | --- | --- | --- | --- |
| <=50 | 45 | 22 | 48.9% | 51.1% | [35%, 63%] |
| (50, 52] | 9 | 1 | 11.1% | 88.9% | [2%, 43.5%] |
| (52, 55] | 8 | 5 | 62.5% | 37.5% | [30.6%, 86.3%] |
| (55, 58] | 6 | 3 | 50% | 50% | [18.8%, 81.2%] |
| (58, 60] | 1 | 0 | 0% | 100% | [0%, 79.3%] |
| (60, 62] | 12 | 8 | 66.7% | 33.3% | [39.1%, 86.2%] |
| (62, 65] | 8 | 5 | 62.5% | 37.5% | [30.6%, 86.3%] |
| (65, 70] | 5 | 3 | 60% | 40% | [23.1%, 88.2%] |
| >70 | 5 | 2 | 40% | 60% | [11.8%, 76.9%] |

## Agreement × Confidence Matrix (valid, hitRate / n)
| Agreement \ Confidence | <=50 | (50,58] | (58,65] | >65 |
| --- | --- | --- | --- | --- |
| <=1 | 40% / 10 | 25% / 4 | 0% / 0 | 0% / 0 |
| 2 | 53.8% / 13 | 0% / 3 | 0% / 0 | 0% / 0 |
| 3 | 37.5% / 8 | 66.7% / 3 | 0% / 0 | 0% / 0 |
| 4 | 61.5% / 13 | 0% / 4 | 0% / 0 | 0% / 1 |
| 5 | 0% / 1 | 66.7% / 9 | 61.9% / 21 | 55.6% / 9 |

## Top SKIP Candidates
| Rule | Train skipped | Train keptHit | Train Δ | Valid skipped | Valid keptHit | Valid Δ | Valid skippedErr | Passes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `skip_conf_le_58` | 36/49 | 76.9% | 19.8pp | 68/99 | 58.1% | 8.6pp | 54.4% | no |
| `skip_agree_le_0_or_conf_le_58` | 36/49 | 76.9% | 19.8pp | 68/99 | 58.1% | 8.6pp | 54.4% | no |
| `skip_agree_le_1_or_conf_le_58` | 36/49 | 76.9% | 19.8pp | 68/99 | 58.1% | 8.6pp | 54.4% | no |
| `skip_agree_le_2_or_conf_le_58` | 36/49 | 76.9% | 19.8pp | 68/99 | 58.1% | 8.6pp | 54.4% | no |
| `skip_agree_le_3_or_conf_le_58` | 36/49 | 76.9% | 19.8pp | 68/99 | 58.1% | 8.6pp | 54.4% | no |
| `skip_agree_le_1_or_conf_le_52` | 29/49 | 75% | 17.9pp | 57/99 | 59.5% | 10pp | 57.9% | no |
| `skip_agree_le_2_or_conf_le_52` | 29/49 | 75% | 17.9pp | 58/99 | 61% | 11.5pp | 58.6% | no |
| `skip_agree_le_3_or_conf_le_52` | 30/49 | 73.7% | 16.5pp | 60/99 | 59% | 9.5pp | 56.7% | no |
| `skip_conf_le_60` | 38/49 | 72.7% | 15.6pp | 69/99 | 60% | 10.5pp | 55.1% | no |
| `skip_agree_le_0_or_conf_le_60` | 38/49 | 72.7% | 15.6pp | 69/99 | 60% | 10.5pp | 55.1% | no |
| `skip_agree_le_1_or_conf_le_60` | 38/49 | 72.7% | 15.6pp | 69/99 | 60% | 10.5pp | 55.1% | no |
| `skip_agree_le_2_or_conf_le_60` | 38/49 | 72.7% | 15.6pp | 69/99 | 60% | 10.5pp | 55.1% | no |
| `skip_agree_le_3_or_conf_le_60` | 38/49 | 72.7% | 15.6pp | 69/99 | 60% | 10.5pp | 55.1% | no |
| `skip_conf_le_52` | 28/49 | 71.4% | 14.3pp | 54/99 | 57.8% | 8.3pp | 57.4% | no |
| `skip_agree_le_0_or_conf_le_52` | 28/49 | 71.4% | 14.3pp | 54/99 | 57.8% | 8.3pp | 57.4% | no |
