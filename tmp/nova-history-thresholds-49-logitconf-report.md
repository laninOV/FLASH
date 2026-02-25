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
| rule_id | family | tags | n | coverage | hitRate | vs NOVA | vs HISTORY | rule |
|---|---|---|---:|---:|---:|---:|---:|---|
| agree_common_else_nova | baseline | baseline,agree,disagree,nova | 49 | 100.0% | 67.3% | +0.0pp | +10.2pp | if agree -> common; else NOVA |
| always_nova | baseline | baseline,nova | 49 | 100.0% | 67.3% | +0.0pp | +10.2pp | always pick NOVA |
| chooser_disagree_nova_ge_2_conf_ge_50_else_history | chooser_margin_conf_disagree | chooser,nova,history,margin,confidence,disagree | 49 | 100.0% | 67.3% | +0.0pp | +10.2pp | if agree -> common; if disagree and novaMargin>=2 and confidence>=50% -> NOVA; else HISTORY |
| chooser_disagree_nova_ge_2_else_history | chooser_margin_disagree | chooser,nova,history,margin,disagree | 49 | 100.0% | 67.3% | +0.0pp | +10.2pp | if agree -> common; if disagree and novaMargin>=2 -> NOVA; if disagree and novaMargin<2 -> HISTORY |
| chooser_disagree_nova_ge_2_logit_ge_0_conf_ge_50_else_history | chooser_margin_logit_conf_disagree | chooser,disagree,margin,logistic-margin,confidence,nova,history | 49 | 100.0% | 67.3% | +0.0pp | +10.2pp | if agree -> common; if disagree and novaMargin>=2 and logisticMargin>=0 and confidence>=50% -> NOVA; else HISTORY |
| chooser_disagree_nova_ge_2_logit_ge_0_else_history | chooser_margin_logit_disagree | chooser,disagree,margin,logistic-margin,nova,history | 49 | 100.0% | 67.3% | +0.0pp | +10.2pp | if agree -> common; if disagree and novaMargin>=2 and logisticMargin>=0 -> NOVA; else HISTORY |
| chooser_disagree_nova_ge_2_logit_ge_2_conf_ge_50_else_history | chooser_margin_logit_conf_disagree | chooser,disagree,margin,logistic-margin,confidence,nova,history | 49 | 100.0% | 67.3% | +0.0pp | +10.2pp | if agree -> common; if disagree and novaMargin>=2 and logisticMargin>=2 and confidence>=50% -> NOVA; else HISTORY |
| chooser_disagree_nova_ge_2_logit_ge_2_else_history | chooser_margin_logit_disagree | chooser,disagree,margin,logistic-margin,nova,history | 49 | 100.0% | 67.3% | +0.0pp | +10.2pp | if agree -> common; if disagree and novaMargin>=2 and logisticMargin>=2 -> NOVA; else HISTORY |
| chooser_disagree_logit_conflict_ge_10_history_else_nova | chooser_logistic_conflict_exploratory | chooser,exploratory,disagree,logistic,conflict,nova,history | 49 | 100.0% | 65.3% | -2.0pp | +8.2pp | if agreementHN=false and NOVA/Logistic disagree and logisticMargin>=10 -> HISTORY; else NOVA/common |
| chooser_disagree_logit_conflict_ge_12_history_else_nova | chooser_logistic_conflict_exploratory | chooser,exploratory,disagree,logistic,conflict,nova,history | 49 | 100.0% | 65.3% | -2.0pp | +8.2pp | if agreementHN=false and NOVA/Logistic disagree and logisticMargin>=12 -> HISTORY; else NOVA/common |
| chooser_disagree_logit_conflict_ge_6_history_else_nova | chooser_logistic_conflict_exploratory | chooser,exploratory,disagree,logistic,conflict,nova,history | 49 | 100.0% | 65.3% | -2.0pp | +8.2pp | if agreementHN=false and NOVA/Logistic disagree and logisticMargin>=6 -> HISTORY; else NOVA/common |
| chooser_disagree_logit_conflict_ge_8_history_else_nova | chooser_logistic_conflict_exploratory | chooser,exploratory,disagree,logistic,conflict,nova,history | 49 | 100.0% | 65.3% | -2.0pp | +8.2pp | if agreementHN=false and NOVA/Logistic disagree and logisticMargin>=8 -> HISTORY; else NOVA/common |
| chooser_disagree_nova_ge_2_logit_ge_4_conf_ge_50_else_history | chooser_margin_logit_conf_disagree | chooser,disagree,margin,logistic-margin,confidence,nova,history | 49 | 100.0% | 65.3% | -2.0pp | +8.2pp | if agree -> common; if disagree and novaMargin>=2 and logisticMargin>=4 and confidence>=50% -> NOVA; else HISTORY |
| chooser_disagree_nova_ge_2_logit_ge_4_else_history | chooser_margin_logit_disagree | chooser,disagree,margin,logistic-margin,nova,history | 49 | 100.0% | 65.3% | -2.0pp | +8.2pp | if agree -> common; if disagree and novaMargin>=2 and logisticMargin>=4 -> NOVA; else HISTORY |
| chooser_disagree_nova_ge_4_logit_ge_2_conf_ge_50_else_history | chooser_margin_logit_conf_disagree | chooser,disagree,margin,logistic-margin,confidence,nova,history | 49 | 100.0% | 65.3% | -2.0pp | +8.2pp | if agree -> common; if disagree and novaMargin>=4 and logisticMargin>=2 and confidence>=50% -> NOVA; else HISTORY |
| chooser_disagree_nova_ge_4_logit_ge_2_else_history | chooser_margin_logit_disagree | chooser,disagree,margin,logistic-margin,nova,history | 49 | 100.0% | 65.3% | -2.0pp | +8.2pp | if agree -> common; if disagree and novaMargin>=4 and logisticMargin>=2 -> NOVA; else HISTORY |
| chooser_disagree_nova_ge_4_conf_ge_50_else_history | chooser_margin_conf_disagree | chooser,nova,history,margin,confidence,disagree | 49 | 100.0% | 63.3% | -4.1pp | +6.1pp | if agree -> common; if disagree and novaMargin>=4 and confidence>=50% -> NOVA; else HISTORY |
| chooser_disagree_nova_ge_4_else_history | chooser_margin_disagree | chooser,nova,history,margin,disagree | 49 | 100.0% | 63.3% | -4.1pp | +6.1pp | if agree -> common; if disagree and novaMargin>=4 -> NOVA; if disagree and novaMargin<4 -> HISTORY |
| chooser_disagree_nova_ge_4_logit_ge_0_conf_ge_50_else_history | chooser_margin_logit_conf_disagree | chooser,disagree,margin,logistic-margin,confidence,nova,history | 49 | 100.0% | 63.3% | -4.1pp | +6.1pp | if agree -> common; if disagree and novaMargin>=4 and logisticMargin>=0 and confidence>=50% -> NOVA; else HISTORY |
| chooser_disagree_nova_ge_4_logit_ge_0_else_history | chooser_margin_logit_disagree | chooser,disagree,margin,logistic-margin,nova,history | 49 | 100.0% | 63.3% | -4.1pp | +6.1pp | if agree -> common; if disagree and novaMargin>=4 and logisticMargin>=0 -> NOVA; else HISTORY |

## Top Filter Candidates
| rule_id | family | tags | n | coverage | hitRate | vs NOVA | vs HISTORY | balance | rule |
|---|---|---|---:|---:|---:|---:|---:|---:|---|
| send_nova_margin_ge_2_conf_ge_50_pick_nova | filter_global_margin_conf | filter,global,margin,confidence,nova | 39 | 79.6% | 66.7% | +0.0pp | +12.8pp | 0.572 | send only if novaMargin>=2 and confidence>=50%; pick NOVA |
| send_nova_margin_ge_2_logit_ge_0_pick_nova | filter_global_margin_logit | filter,global,margin,logistic-margin,nova | 39 | 79.6% | 66.7% | +0.0pp | +12.8pp | 0.572 | send only if novaMargin>=2 and logisticMargin>=0; pick NOVA |
| send_novaMargin_ge_2_pick_nova | filter_global_margin | filter,global,margin,nova | 39 | 79.6% | 66.7% | +0.0pp | +12.8pp | 0.572 | send only if novaMargin>=2; pick NOVA |
| send_novaLogisticAgree_logit_ge_0_pick_nova | filter_global_logistic_agree_margin | filter,global,logistic,direction,logistic-margin,nova | 38 | 77.6% | 65.8% | +0.0pp | +5.3pp | 0.562 | send only if NOVA/Logistic agree and logisticMargin>=0; pick NOVA |
| send_novaLogisticAgree_pick_nova | filter_global_logistic_agree | filter,global,logistic,direction,nova | 38 | 77.6% | 65.8% | +0.0pp | +5.3pp | 0.562 | send only if NOVA and Logistic pick same side; pick NOVA |
| send_novaLogisticAgree_logit_ge_4_pick_nova | filter_global_logistic_agree_margin | filter,global,logistic,direction,logistic-margin,nova | 22 | 44.9% | 81.8% | +0.0pp | +13.6pp | 0.544 | send only if NOVA/Logistic agree and logisticMargin>=4; pick NOVA |
| send_nova_margin_ge_4_conf_ge_50_pick_nova | filter_global_margin_conf | filter,global,margin,confidence,nova | 33 | 67.3% | 66.7% | +0.0pp | +9.1pp | 0.535 | send only if novaMargin>=4 and confidence>=50%; pick NOVA |
| send_nova_margin_ge_4_logit_ge_0_pick_nova | filter_global_margin_logit | filter,global,margin,logistic-margin,nova | 33 | 67.3% | 66.7% | +0.0pp | +9.1pp | 0.535 | send only if novaMargin>=4 and logisticMargin>=0; pick NOVA |
| send_novaMargin_ge_4_pick_nova | filter_global_margin | filter,global,margin,nova | 33 | 67.3% | 66.7% | +0.0pp | +9.1pp | 0.535 | send only if novaMargin>=4; pick NOVA |
| send_nova_margin_ge_2_logit_ge_4_pick_nova | filter_global_margin_logit | filter,global,margin,logistic-margin,nova | 21 | 42.9% | 81.0% | +0.0pp | +19.0pp | 0.533 | send only if novaMargin>=2 and logisticMargin>=4; pick NOVA |
| send_nova_margin_ge_2_logit_ge_2_pick_nova | filter_global_margin_logit | filter,global,margin,logistic-margin,nova | 26 | 53.1% | 73.1% | +0.0pp | +19.2pp | 0.525 | send only if novaMargin>=2 and logisticMargin>=2; pick NOVA |
| send_novaLogisticAgree_nova_ge_2_logit_ge_4_pick_nova | filter_global_nova_logit_confirmed | filter,global,margin,logistic,direction,logistic-margin,nova | 20 | 40.8% | 80.0% | +0.0pp | +15.0pp | 0.522 | send only if NOVA/Logistic agree and novaMargin>=2 and logisticMargin>=4; pick NOVA |
| send_novaLogisticAgree_logit_ge_2_pick_nova | filter_global_logistic_agree_margin | filter,global,logistic,direction,logistic-margin,nova | 29 | 59.2% | 69.0% | +0.0pp | +6.9pp | 0.522 | send only if NOVA/Logistic agree and logisticMargin>=2; pick NOVA |
| send_novaLogisticAgree_nova_ge_2_conf_ge_50_pick_nova | filter_global_nova_logit_conf | filter,global,margin,logistic,direction,confidence,nova | 31 | 63.3% | 64.5% | +0.0pp | +6.5pp | 0.512 | send only if NOVA/Logistic agree and novaMargin>=2 and confidence>=50%; pick NOVA |
| send_novaLogisticAgree_nova_ge_2_logit_ge_0_pick_nova | filter_global_nova_logit_confirmed | filter,global,margin,logistic,direction,logistic-margin,nova | 31 | 63.3% | 64.5% | +0.0pp | +6.5pp | 0.512 | send only if NOVA/Logistic agree and novaMargin>=2 and logisticMargin>=0; pick NOVA |
| send_nova_margin_ge_4_logit_ge_4_pick_nova | filter_global_margin_logit | filter,global,margin,logistic-margin,nova | 19 | 38.8% | 78.9% | +0.0pp | +15.8pp | 0.511 | send only if novaMargin>=4 and logisticMargin>=4; pick NOVA |
| send_novaLogisticAgree_nova_ge_4_logit_ge_4_pick_nova | filter_global_nova_logit_confirmed | filter,global,margin,logistic,direction,logistic-margin,nova | 19 | 38.8% | 78.9% | +0.0pp | +15.8pp | 0.511 | send only if NOVA/Logistic agree and novaMargin>=4 and logisticMargin>=4; pick NOVA |
| send_nova_margin_ge_6_conf_ge_50_pick_nova | filter_global_margin_conf | filter,global,margin,confidence,nova | 29 | 59.2% | 65.5% | +0.0pp | +10.3pp | 0.505 | send only if novaMargin>=6 and confidence>=50%; pick NOVA |
| send_nova_margin_ge_6_logit_ge_0_pick_nova | filter_global_margin_logit | filter,global,margin,logistic-margin,nova | 29 | 59.2% | 65.5% | +0.0pp | +10.3pp | 0.505 | send only if novaMargin>=6 and logisticMargin>=0; pick NOVA |
| send_novaMargin_ge_6_pick_nova | filter_global_margin | filter,global,margin,nova | 29 | 59.2% | 65.5% | +0.0pp | +10.3pp | 0.505 | send only if novaMargin>=6; pick NOVA |

## Top Logistic-linked Strategy Candidates
| rule_id | n | coverage | hitRate | vs NOVA | rule |
|---|---:|---:|---:|---:|---|
| chooser_disagree_logit_conflict_ge_10_history_else_nova | 49 | 100.0% | 65.3% | -2.0pp | if agreementHN=false and NOVA/Logistic disagree and logisticMargin>=10 -> HISTORY; else NOVA/common |
| chooser_disagree_logit_conflict_ge_12_history_else_nova | 49 | 100.0% | 65.3% | -2.0pp | if agreementHN=false and NOVA/Logistic disagree and logisticMargin>=12 -> HISTORY; else NOVA/common |
| chooser_disagree_logit_conflict_ge_6_history_else_nova | 49 | 100.0% | 65.3% | -2.0pp | if agreementHN=false and NOVA/Logistic disagree and logisticMargin>=6 -> HISTORY; else NOVA/common |
| chooser_disagree_logit_conflict_ge_8_history_else_nova | 49 | 100.0% | 65.3% | -2.0pp | if agreementHN=false and NOVA/Logistic disagree and logisticMargin>=8 -> HISTORY; else NOVA/common |
| chooser_disagree_novaLogitAgree_logit_ge_4_conf_ge_50_else_history | 49 | 100.0% | 63.3% | -4.1pp | if agree -> common; if disagree and NOVA/Logistic agree and logisticMargin>=4 and confidence>=50% -> NOVA; else HISTORY |
| chooser_disagree_novaLogitAgree_logit_ge_4_else_history | 49 | 100.0% | 63.3% | -4.1pp | if agree -> common; if disagree and NOVA/Logistic agree and logisticMargin>=4 -> NOVA; else HISTORY |
| chooser_disagree_novaLogitAgree_nova_ge_2_logit_ge_2_conf_ge_50_else_history | 49 | 100.0% | 63.3% | -4.1pp | if agree -> common; if disagree and NOVA/Logistic agree and novaMargin>=2 and logisticMargin>=2 and confidence>=50% -> NOVA; else HISTORY |
| chooser_disagree_novaLogitAgree_nova_ge_2_logit_ge_2_else_history | 49 | 100.0% | 63.3% | -4.1pp | if agree -> common; if disagree and NOVA/Logistic agree and novaMargin>=2 and logisticMargin>=2 -> NOVA; else HISTORY |
| chooser_disagree_novaLogitAgree_nova_ge_2_logit_ge_4_conf_ge_50_else_history | 49 | 100.0% | 63.3% | -4.1pp | if agree -> common; if disagree and NOVA/Logistic agree and novaMargin>=2 and logisticMargin>=4 and confidence>=50% -> NOVA; else HISTORY |
| chooser_disagree_novaLogitAgree_nova_ge_2_logit_ge_4_else_history | 49 | 100.0% | 63.3% | -4.1pp | if agree -> common; if disagree and NOVA/Logistic agree and novaMargin>=2 and logisticMargin>=4 -> NOVA; else HISTORY |
| chooser_disagree_novaLogitAgree_nova_ge_4_logit_ge_2_conf_ge_50_else_history | 49 | 100.0% | 63.3% | -4.1pp | if agree -> common; if disagree and NOVA/Logistic agree and novaMargin>=4 and logisticMargin>=2 and confidence>=50% -> NOVA; else HISTORY |
| chooser_disagree_novaLogitAgree_nova_ge_4_logit_ge_2_else_history | 49 | 100.0% | 63.3% | -4.1pp | if agree -> common; if disagree and NOVA/Logistic agree and novaMargin>=4 and logisticMargin>=2 -> NOVA; else HISTORY |
| chooser_disagree_novaLogitAgree_nova_ge_4_logit_ge_4_conf_ge_50_else_history | 49 | 100.0% | 63.3% | -4.1pp | if agree -> common; if disagree and NOVA/Logistic agree and novaMargin>=4 and logisticMargin>=4 and confidence>=50% -> NOVA; else HISTORY |
| chooser_disagree_novaLogitAgree_nova_ge_4_logit_ge_4_else_history | 49 | 100.0% | 63.3% | -4.1pp | if agree -> common; if disagree and NOVA/Logistic agree and novaMargin>=4 and logisticMargin>=4 -> NOVA; else HISTORY |
| chooser_disagree_novaLogitAgree_nova_ge_6_logit_ge_2_conf_ge_50_else_history | 49 | 100.0% | 63.3% | -4.1pp | if agree -> common; if disagree and NOVA/Logistic agree and novaMargin>=6 and logisticMargin>=2 and confidence>=50% -> NOVA; else HISTORY |
| chooser_disagree_novaLogitAgree_nova_ge_6_logit_ge_2_else_history | 49 | 100.0% | 63.3% | -4.1pp | if agree -> common; if disagree and NOVA/Logistic agree and novaMargin>=6 and logisticMargin>=2 -> NOVA; else HISTORY |
| chooser_disagree_novaLogitAgree_nova_ge_6_logit_ge_4_conf_ge_50_else_history | 49 | 100.0% | 63.3% | -4.1pp | if agree -> common; if disagree and NOVA/Logistic agree and novaMargin>=6 and logisticMargin>=4 and confidence>=50% -> NOVA; else HISTORY |
| chooser_disagree_novaLogitAgree_nova_ge_6_logit_ge_4_else_history | 49 | 100.0% | 63.3% | -4.1pp | if agree -> common; if disagree and NOVA/Logistic agree and novaMargin>=6 and logisticMargin>=4 -> NOVA; else HISTORY |
| chooser_disagree_novaLogitAgree_logit_ge_0_conf_ge_50_else_history | 49 | 100.0% | 61.2% | -6.1pp | if agree -> common; if disagree and NOVA/Logistic agree and logisticMargin>=0 and confidence>=50% -> NOVA; else HISTORY |
| chooser_disagree_novaLogitAgree_logit_ge_0_else_history | 49 | 100.0% | 61.2% | -6.1pp | if agree -> common; if disagree and NOVA/Logistic agree and logisticMargin>=0 -> NOVA; else HISTORY |

## Top Logistic-linked Filter Candidates
| rule_id | n | coverage | hitRate | vs NOVA | balance | rule |
|---|---:|---:|---:|---:|---:|---|
| send_novaLogisticAgree_logit_ge_0_pick_nova | 38 | 77.6% | 65.8% | +0.0pp | 0.562 | send only if NOVA/Logistic agree and logisticMargin>=0; pick NOVA |
| send_novaLogisticAgree_pick_nova | 38 | 77.6% | 65.8% | +0.0pp | 0.562 | send only if NOVA and Logistic pick same side; pick NOVA |
| send_novaLogisticAgree_logit_ge_4_pick_nova | 22 | 44.9% | 81.8% | +0.0pp | 0.544 | send only if NOVA/Logistic agree and logisticMargin>=4; pick NOVA |
| send_novaLogisticAgree_nova_ge_2_logit_ge_4_pick_nova | 20 | 40.8% | 80.0% | +0.0pp | 0.522 | send only if NOVA/Logistic agree and novaMargin>=2 and logisticMargin>=4; pick NOVA |
| send_novaLogisticAgree_logit_ge_2_pick_nova | 29 | 59.2% | 69.0% | +0.0pp | 0.522 | send only if NOVA/Logistic agree and logisticMargin>=2; pick NOVA |
| send_novaLogisticAgree_nova_ge_2_conf_ge_50_pick_nova | 31 | 63.3% | 64.5% | +0.0pp | 0.512 | send only if NOVA/Logistic agree and novaMargin>=2 and confidence>=50%; pick NOVA |
| send_novaLogisticAgree_nova_ge_2_logit_ge_0_pick_nova | 31 | 63.3% | 64.5% | +0.0pp | 0.512 | send only if NOVA/Logistic agree and novaMargin>=2 and logisticMargin>=0; pick NOVA |
| send_novaLogisticAgree_nova_ge_4_logit_ge_4_pick_nova | 19 | 38.8% | 78.9% | +0.0pp | 0.511 | send only if NOVA/Logistic agree and novaMargin>=4 and logisticMargin>=4; pick NOVA |
| send_novaLogisticAgree_nova_ge_2_logit_ge_2_pick_nova | 24 | 49.0% | 70.8% | +0.0pp | 0.501 | send only if NOVA/Logistic agree and novaMargin>=2 and logisticMargin>=2; pick NOVA |
| send_novaLogisticAgree_nova_ge_6_logit_ge_4_pick_nova | 18 | 36.7% | 77.8% | +0.0pp | 0.499 | send only if NOVA/Logistic agree and novaMargin>=6 and logisticMargin>=4; pick NOVA |
| send_novaLogisticAgree_nova_ge_4_conf_ge_50_pick_nova | 28 | 57.1% | 64.3% | +0.0pp | 0.493 | send only if NOVA/Logistic agree and novaMargin>=4 and confidence>=50%; pick NOVA |
| send_novaLogisticAgree_nova_ge_4_logit_ge_0_pick_nova | 28 | 57.1% | 64.3% | +0.0pp | 0.493 | send only if NOVA/Logistic agree and novaMargin>=4 and logisticMargin>=0; pick NOVA |
| send_novaLogisticAgree_nova_ge_4_logit_ge_2_pick_nova | 23 | 46.9% | 69.6% | +0.0pp | 0.489 | send only if NOVA/Logistic agree and novaMargin>=4 and logisticMargin>=2; pick NOVA |
| send_novaLogisticAgree_nova_ge_6_conf_ge_50_pick_nova | 27 | 55.1% | 63.0% | +0.0pp | 0.480 | send only if NOVA/Logistic agree and novaMargin>=6 and confidence>=50%; pick NOVA |
| send_novaLogisticAgree_nova_ge_6_logit_ge_0_pick_nova | 27 | 55.1% | 63.0% | +0.0pp | 0.480 | send only if NOVA/Logistic agree and novaMargin>=6 and logisticMargin>=0; pick NOVA |
| send_novaLogisticAgree_logit_ge_6_pick_nova | 11 | 22.4% | 81.8% | +0.0pp | 0.476 | send only if NOVA/Logistic agree and logisticMargin>=6; pick NOVA |
| send_novaLogisticAgree_nova_ge_2_logit_ge_6_pick_nova | 11 | 22.4% | 81.8% | +0.0pp | 0.476 | send only if NOVA/Logistic agree and novaMargin>=2 and logisticMargin>=6; pick NOVA |
| send_novaLogisticAgree_nova_ge_4_logit_ge_6_pick_nova | 11 | 22.4% | 81.8% | +0.0pp | 0.476 | send only if NOVA/Logistic agree and novaMargin>=4 and logisticMargin>=6; pick NOVA |
| send_novaLogisticAgree_nova_ge_6_logit_ge_2_pick_nova | 22 | 44.9% | 68.2% | +0.0pp | 0.476 | send only if NOVA/Logistic agree and novaMargin>=6 and logisticMargin>=2; pick NOVA |
| send_novaLogisticAgree_nova_ge_8_logit_ge_4_pick_nova | 16 | 32.7% | 75.0% | +0.0pp | 0.473 | send only if NOVA/Logistic agree and novaMargin>=8 and logisticMargin>=4; pick NOVA |

