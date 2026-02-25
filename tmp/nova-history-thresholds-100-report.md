# NOVA + HISTORY Threshold Analysis
- Joined file: `tmp/shadow-bench-100-multiday-global-priority-prodlike-v2-joined.json`
- Rows: 99
- Min bucket: 8

## Baseline
- NOVA: 61/99 (61.6%)
- HISTORY: 49/99 (49.5%)
- AGREE (n=61) common: 36/61 (59.0%)
- DISAGREE (n=38) NOVA: 25/38 (65.8%) / HISTORY: 13/38 (34.2%)

## Top Strategy Candidates
| rule_id | n | coverage | hitRate | vs NOVA | vs HISTORY | rule |
|---|---:|---:|---:|---:|---:|---|
| always_nova | 99 | 100.0% | 61.6% | +0.0pp | +12.1pp | always pick NOVA |
| chooser_disagree_nova_ge_4_else_history | 99 | 100.0% | 58.6% | -3.0pp | +9.1pp | if agree -> common; if disagree and novaMargin>=4 -> NOVA; if disagree and novaMargin<4 -> HISTORY |
| chooser_disagree_nova_ge_2_else_history | 99 | 100.0% | 57.6% | -4.0pp | +8.1pp | if agree -> common; if disagree and novaMargin>=2 -> NOVA; if disagree and novaMargin<2 -> HISTORY |
| chooser_disagree_nova_ge_6_else_history | 99 | 100.0% | 56.6% | -5.1pp | +7.1pp | if agree -> common; if disagree and novaMargin>=6 -> NOVA; if disagree and novaMargin<6 -> HISTORY |
| chooser_disagree_nova_ge_8_else_history | 99 | 100.0% | 55.6% | -6.1pp | +6.1pp | if agree -> common; if disagree and novaMargin>=8 -> NOVA; if disagree and novaMargin<8 -> HISTORY |
| chooser_disagree_nova_ge_10_else_history | 99 | 100.0% | 53.5% | -8.1pp | +4.0pp | if agree -> common; if disagree and novaMargin>=10 -> NOVA; if disagree and novaMargin<10 -> HISTORY |
| chooser_disagree_nova_ge_12_else_history | 99 | 100.0% | 53.5% | -8.1pp | +4.0pp | if agree -> common; if disagree and novaMargin>=12 -> NOVA; if disagree and novaMargin<12 -> HISTORY |
| chooser_disagree_nova_ge_15_else_history | 99 | 100.0% | 52.5% | -9.1pp | +3.0pp | if agree -> common; if disagree and novaMargin>=15 -> NOVA; if disagree and novaMargin<15 -> HISTORY |
| chooser_disagree_nova_ge_2_conf_ge_55_else_history | 99 | 100.0% | 51.5% | -10.1pp | +2.0pp | if agree -> common; if disagree and novaMargin>=2 and confidence>=55% -> NOVA; else HISTORY |
| chooser_disagree_nova_ge_2_conf_ge_58_else_history | 99 | 100.0% | 50.5% | -11.1pp | +1.0pp | if agree -> common; if disagree and novaMargin>=2 and confidence>=58% -> NOVA; else HISTORY |
| chooser_disagree_nova_ge_2_conf_ge_60_else_history | 99 | 100.0% | 50.5% | -11.1pp | +1.0pp | if agree -> common; if disagree and novaMargin>=2 and confidence>=60% -> NOVA; else HISTORY |
| chooser_disagree_nova_ge_2_conf_ge_62_else_history | 99 | 100.0% | 50.5% | -11.1pp | +1.0pp | if agree -> common; if disagree and novaMargin>=2 and confidence>=62% -> NOVA; else HISTORY |
| chooser_disagree_nova_ge_2_conf_ge_65_else_history | 99 | 100.0% | 50.5% | -11.1pp | +1.0pp | if agree -> common; if disagree and novaMargin>=2 and confidence>=65% -> NOVA; else HISTORY |
| chooser_disagree_nova_ge_2_conf_ge_68_else_history | 99 | 100.0% | 50.5% | -11.1pp | +1.0pp | if agree -> common; if disagree and novaMargin>=2 and confidence>=68% -> NOVA; else HISTORY |
| chooser_disagree_nova_ge_2_conf_ge_70_else_history | 99 | 100.0% | 50.5% | -11.1pp | +1.0pp | if agree -> common; if disagree and novaMargin>=2 and confidence>=70% -> NOVA; else HISTORY |

## Top Filter Candidates
| rule_id | n | coverage | hitRate | vs NOVA | vs HISTORY | rule |
|---|---:|---:|---:|---:|---:|---|
| send_disagree_novaMargin_ge_6_pick_nova | 15 | 15.2% | 73.3% | +0.0pp | +46.7pp | send only if agreementHN=false and novaMargin>=6; pick NOVA |
| send_disagree_novaMargin_ge_8_pick_nova | 14 | 14.1% | 71.4% | +0.0pp | +42.9pp | send only if agreementHN=false and novaMargin>=8; pick NOVA |
| send_disagree_novaMargin_ge_10_pick_nova | 10 | 10.1% | 70.0% | +0.0pp | +40.0pp | send only if agreementHN=false and novaMargin>=10; pick NOVA |
| send_disagree_novaMargin_ge_4_pick_nova | 23 | 23.2% | 69.6% | +0.0pp | +39.1pp | send only if agreementHN=false and novaMargin>=4; pick NOVA |
| send_disagree_novaMargin_ge_2_pick_nova | 30 | 30.3% | 63.3% | +0.0pp | +26.7pp | send only if agreementHN=false and novaMargin>=2; pick NOVA |
| send_novaMargin_ge_4_pick_nova | 64 | 64.6% | 62.5% | +0.0pp | +14.1pp | send only if novaMargin>=4; pick NOVA |
| send_novaMargin_ge_2_pick_nova | 77 | 77.8% | 61.0% | +0.0pp | +10.4pp | send only if novaMargin>=2; pick NOVA |
| send_novaMargin_ge_6_pick_nova | 51 | 51.5% | 60.8% | +0.0pp | +13.7pp | send only if novaMargin>=6; pick NOVA |
| send_novaMargin_ge_8_pick_nova | 49 | 49.5% | 59.2% | +0.0pp | +12.2pp | send only if novaMargin>=8; pick NOVA |
| send_novaMargin_ge_12_pick_nova | 21 | 21.2% | 57.1% | +0.0pp | +19.0pp | send only if novaMargin>=12; pick NOVA |
| send_novaMargin_ge_10_pick_nova | 37 | 37.4% | 54.1% | +0.0pp | +10.8pp | send only if novaMargin>=10; pick NOVA |
| send_novaMargin_ge_15_pick_nova | 13 | 13.1% | 53.8% | +0.0pp | +23.1pp | send only if novaMargin>=15; pick NOVA |

