# NOVA + HISTORY Threshold Analysis
- Joined file: `tmp/shadow-bench-50-multiday-seeded-thresholds-joined.json`
- Rows: 49
- Min bucket: 8

## Baseline
- NOVA: 33/49 (67.3%)
- HISTORY: 28/49 (57.1%)
- AGREE (n=30) common: 21/30 (70.0%)
- DISAGREE (n=19) NOVA: 12/19 (63.2%) / HISTORY: 7/19 (36.8%)

## Top Strategy Candidates
| rule_id | n | coverage | hitRate | vs NOVA | vs HISTORY | rule |
|---|---:|---:|---:|---:|---:|---|
| always_nova | 49 | 100.0% | 67.3% | +0.0pp | +10.2pp | always pick NOVA |
| chooser_disagree_nova_ge_2_else_history | 49 | 100.0% | 67.3% | +0.0pp | +10.2pp | if agree -> common; if disagree and novaMargin>=2 -> NOVA; if disagree and novaMargin<2 -> HISTORY |
| chooser_disagree_nova_ge_4_else_history | 49 | 100.0% | 63.3% | -4.1pp | +6.1pp | if agree -> common; if disagree and novaMargin>=4 -> NOVA; if disagree and novaMargin<4 -> HISTORY |
| chooser_disagree_nova_ge_6_else_history | 49 | 100.0% | 63.3% | -4.1pp | +6.1pp | if agree -> common; if disagree and novaMargin>=6 -> NOVA; if disagree and novaMargin<6 -> HISTORY |
| chooser_disagree_nova_ge_2_conf_ge_55_else_history | 49 | 100.0% | 61.2% | -6.1pp | +4.1pp | if agree -> common; if disagree and novaMargin>=2 and confidence>=55% -> NOVA; else HISTORY |
| chooser_disagree_nova_ge_8_else_history | 49 | 100.0% | 61.2% | -6.1pp | +4.1pp | if agree -> common; if disagree and novaMargin>=8 -> NOVA; if disagree and novaMargin<8 -> HISTORY |
| chooser_disagree_nova_ge_10_else_history | 49 | 100.0% | 59.2% | -8.2pp | +2.0pp | if agree -> common; if disagree and novaMargin>=10 -> NOVA; if disagree and novaMargin<10 -> HISTORY |
| chooser_disagree_nova_ge_2_conf_ge_58_else_history | 49 | 100.0% | 59.2% | -8.2pp | +2.0pp | if agree -> common; if disagree and novaMargin>=2 and confidence>=58% -> NOVA; else HISTORY |
| chooser_disagree_nova_ge_2_conf_ge_60_else_history | 49 | 100.0% | 59.2% | -8.2pp | +2.0pp | if agree -> common; if disagree and novaMargin>=2 and confidence>=60% -> NOVA; else HISTORY |
| chooser_disagree_nova_ge_2_conf_ge_62_else_history | 49 | 100.0% | 59.2% | -8.2pp | +2.0pp | if agree -> common; if disagree and novaMargin>=2 and confidence>=62% -> NOVA; else HISTORY |
| chooser_disagree_nova_ge_2_conf_ge_65_else_history | 49 | 100.0% | 59.2% | -8.2pp | +2.0pp | if agree -> common; if disagree and novaMargin>=2 and confidence>=65% -> NOVA; else HISTORY |
| chooser_disagree_nova_ge_2_conf_ge_68_else_history | 49 | 100.0% | 59.2% | -8.2pp | +2.0pp | if agree -> common; if disagree and novaMargin>=2 and confidence>=68% -> NOVA; else HISTORY |
| chooser_disagree_nova_ge_2_conf_ge_70_else_history | 49 | 100.0% | 59.2% | -8.2pp | +2.0pp | if agree -> common; if disagree and novaMargin>=2 and confidence>=70% -> NOVA; else HISTORY |
| chooser_disagree_nova_ge_2_conf_ge_75_else_history | 49 | 100.0% | 59.2% | -8.2pp | +2.0pp | if agree -> common; if disagree and novaMargin>=2 and confidence>=75% -> NOVA; else HISTORY |
| chooser_disagree_nova_ge_4_conf_ge_55_else_history | 49 | 100.0% | 59.2% | -8.2pp | +2.0pp | if agree -> common; if disagree and novaMargin>=4 and confidence>=55% -> NOVA; else HISTORY |

## Top Filter Candidates
| rule_id | n | coverage | hitRate | vs NOVA | vs HISTORY | rule |
|---|---:|---:|---:|---:|---:|---|
| send_novaMargin_ge_2_pick_nova | 39 | 79.6% | 66.7% | +0.0pp | +12.8pp | send only if novaMargin>=2; pick NOVA |
| send_novaMargin_ge_4_pick_nova | 33 | 67.3% | 66.7% | +0.0pp | +9.1pp | send only if novaMargin>=4; pick NOVA |
| send_disagree_novaMargin_ge_2_pick_nova | 15 | 30.6% | 66.7% | +0.0pp | +33.3pp | send only if agreementHN=false and novaMargin>=2; pick NOVA |
| send_disagree_novaMargin_ge_6_pick_nova | 9 | 18.4% | 66.7% | +0.0pp | +33.3pp | send only if agreementHN=false and novaMargin>=6; pick NOVA |
| send_novaMargin_ge_6_pick_nova | 29 | 59.2% | 65.5% | +0.0pp | +10.3pp | send only if novaMargin>=6; pick NOVA |
| send_novaMargin_ge_8_pick_nova | 26 | 53.1% | 65.4% | +0.0pp | +7.7pp | send only if novaMargin>=8; pick NOVA |
| send_disagree_novaMargin_ge_4_pick_nova | 11 | 22.4% | 63.6% | +0.0pp | +27.3pp | send only if agreementHN=false and novaMargin>=4; pick NOVA |
| send_disagree_novaMargin_ge_8_pick_nova | 8 | 16.3% | 62.5% | +0.0pp | +25.0pp | send only if agreementHN=false and novaMargin>=8; pick NOVA |
| send_novaMargin_ge_10_pick_nova | 18 | 36.7% | 61.1% | +0.0pp | +5.6pp | send only if novaMargin>=10; pick NOVA |

