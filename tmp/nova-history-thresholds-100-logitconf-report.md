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
| rule_id | family | tags | n | coverage | hitRate | vs NOVA | vs HISTORY | rule |
|---|---|---|---:|---:|---:|---:|---:|---|
| agree_common_else_nova | baseline | baseline,agree,disagree,nova | 99 | 100.0% | 61.6% | +0.0pp | +12.1pp | if agree -> common; else NOVA |
| always_nova | baseline | baseline,nova | 99 | 100.0% | 61.6% | +0.0pp | +12.1pp | always pick NOVA |
| chooser_disagree_logit_conflict_ge_10_history_else_nova | chooser_logistic_conflict_exploratory | chooser,exploratory,disagree,logistic,conflict,nova,history | 99 | 100.0% | 60.6% | -1.0pp | +11.1pp | if agreementHN=false and NOVA/Logistic disagree and logisticMargin>=10 -> HISTORY; else NOVA/common |
| chooser_disagree_logit_conflict_ge_12_history_else_nova | chooser_logistic_conflict_exploratory | chooser,exploratory,disagree,logistic,conflict,nova,history | 99 | 100.0% | 60.6% | -1.0pp | +11.1pp | if agreementHN=false and NOVA/Logistic disagree and logisticMargin>=12 -> HISTORY; else NOVA/common |
| chooser_disagree_logit_conflict_ge_6_history_else_nova | chooser_logistic_conflict_exploratory | chooser,exploratory,disagree,logistic,conflict,nova,history | 99 | 100.0% | 60.6% | -1.0pp | +11.1pp | if agreementHN=false and NOVA/Logistic disagree and logisticMargin>=6 -> HISTORY; else NOVA/common |
| chooser_disagree_logit_conflict_ge_8_history_else_nova | chooser_logistic_conflict_exploratory | chooser,exploratory,disagree,logistic,conflict,nova,history | 99 | 100.0% | 60.6% | -1.0pp | +11.1pp | if agreementHN=false and NOVA/Logistic disagree and logisticMargin>=8 -> HISTORY; else NOVA/common |
| chooser_disagree_nova_ge_2_logit_ge_2_conf_ge_50_else_history | chooser_margin_logit_conf_disagree | chooser,disagree,margin,logistic-margin,confidence,nova,history | 99 | 100.0% | 59.6% | -2.0pp | +10.1pp | if agree -> common; if disagree and novaMargin>=2 and logisticMargin>=2 and confidence>=50% -> NOVA; else HISTORY |
| chooser_disagree_nova_ge_2_logit_ge_2_else_history | chooser_margin_logit_disagree | chooser,disagree,margin,logistic-margin,nova,history | 99 | 100.0% | 59.6% | -2.0pp | +10.1pp | if agree -> common; if disagree and novaMargin>=2 and logisticMargin>=2 -> NOVA; else HISTORY |
| chooser_disagree_nova_ge_4_conf_ge_50_else_history | chooser_margin_conf_disagree | chooser,nova,history,margin,confidence,disagree | 99 | 100.0% | 58.6% | -3.0pp | +9.1pp | if agree -> common; if disagree and novaMargin>=4 and confidence>=50% -> NOVA; else HISTORY |
| chooser_disagree_nova_ge_4_else_history | chooser_margin_disagree | chooser,nova,history,margin,disagree | 99 | 100.0% | 58.6% | -3.0pp | +9.1pp | if agree -> common; if disagree and novaMargin>=4 -> NOVA; if disagree and novaMargin<4 -> HISTORY |
| chooser_disagree_nova_ge_4_logit_ge_0_conf_ge_50_else_history | chooser_margin_logit_conf_disagree | chooser,disagree,margin,logistic-margin,confidence,nova,history | 99 | 100.0% | 58.6% | -3.0pp | +9.1pp | if agree -> common; if disagree and novaMargin>=4 and logisticMargin>=0 and confidence>=50% -> NOVA; else HISTORY |
| chooser_disagree_nova_ge_4_logit_ge_0_else_history | chooser_margin_logit_disagree | chooser,disagree,margin,logistic-margin,nova,history | 99 | 100.0% | 58.6% | -3.0pp | +9.1pp | if agree -> common; if disagree and novaMargin>=4 and logisticMargin>=0 -> NOVA; else HISTORY |
| chooser_disagree_nova_ge_4_logit_ge_2_conf_ge_50_else_history | chooser_margin_logit_conf_disagree | chooser,disagree,margin,logistic-margin,confidence,nova,history | 99 | 100.0% | 58.6% | -3.0pp | +9.1pp | if agree -> common; if disagree and novaMargin>=4 and logisticMargin>=2 and confidence>=50% -> NOVA; else HISTORY |
| chooser_disagree_nova_ge_4_logit_ge_2_else_history | chooser_margin_logit_disagree | chooser,disagree,margin,logistic-margin,nova,history | 99 | 100.0% | 58.6% | -3.0pp | +9.1pp | if agree -> common; if disagree and novaMargin>=4 and logisticMargin>=2 -> NOVA; else HISTORY |
| chooser_disagree_nova_ge_2_conf_ge_50_else_history | chooser_margin_conf_disagree | chooser,nova,history,margin,confidence,disagree | 99 | 100.0% | 57.6% | -4.0pp | +8.1pp | if agree -> common; if disagree and novaMargin>=2 and confidence>=50% -> NOVA; else HISTORY |
| chooser_disagree_nova_ge_2_else_history | chooser_margin_disagree | chooser,nova,history,margin,disagree | 99 | 100.0% | 57.6% | -4.0pp | +8.1pp | if agree -> common; if disagree and novaMargin>=2 -> NOVA; if disagree and novaMargin<2 -> HISTORY |
| chooser_disagree_nova_ge_2_logit_ge_0_conf_ge_50_else_history | chooser_margin_logit_conf_disagree | chooser,disagree,margin,logistic-margin,confidence,nova,history | 99 | 100.0% | 57.6% | -4.0pp | +8.1pp | if agree -> common; if disagree and novaMargin>=2 and logisticMargin>=0 and confidence>=50% -> NOVA; else HISTORY |
| chooser_disagree_nova_ge_2_logit_ge_0_else_history | chooser_margin_logit_disagree | chooser,disagree,margin,logistic-margin,nova,history | 99 | 100.0% | 57.6% | -4.0pp | +8.1pp | if agree -> common; if disagree and novaMargin>=2 and logisticMargin>=0 -> NOVA; else HISTORY |
| chooser_disagree_novaLogitAgree_nova_ge_4_else_history | chooser_nova_margin_logit_direction_disagree | chooser,disagree,margin,logistic,direction,nova,history | 99 | 100.0% | 57.6% | -4.0pp | +8.1pp | if agree -> common; if disagree and NOVA/Logistic agree and novaMargin>=4 -> NOVA; else HISTORY |
| chooser_disagree_novaLogitAgree_nova_ge_4_logit_ge_0_conf_ge_50_else_history | chooser_nova_logit_conf_full_disagree | chooser,disagree,margin,logistic,direction,logistic-margin,confidence,nova,history | 99 | 100.0% | 57.6% | -4.0pp | +8.1pp | if agree -> common; if disagree and NOVA/Logistic agree and novaMargin>=4 and logisticMargin>=0 and confidence>=50% -> NOVA; else HISTORY |

## Top Filter Candidates
| rule_id | family | tags | n | coverage | hitRate | vs NOVA | vs HISTORY | balance | rule |
|---|---|---|---:|---:|---:|---:|---:|---:|---|
| send_nova_margin_ge_2_conf_ge_50_pick_nova | filter_global_margin_conf | filter,global,margin,confidence,nova | 77 | 77.8% | 61.0% | +0.0pp | +10.4pp | 0.539 | send only if novaMargin>=2 and confidence>=50%; pick NOVA |
| send_nova_margin_ge_2_logit_ge_0_pick_nova | filter_global_margin_logit | filter,global,margin,logistic-margin,nova | 77 | 77.8% | 61.0% | +0.0pp | +10.4pp | 0.539 | send only if novaMargin>=2 and logisticMargin>=0; pick NOVA |
| send_novaMargin_ge_2_pick_nova | filter_global_margin | filter,global,margin,nova | 77 | 77.8% | 61.0% | +0.0pp | +10.4pp | 0.539 | send only if novaMargin>=2; pick NOVA |
| send_novaLogisticAgree_logit_ge_0_pick_nova | filter_global_logistic_agree_margin | filter,global,logistic,direction,logistic-margin,nova | 73 | 73.7% | 60.3% | +0.0pp | +6.8pp | 0.523 | send only if NOVA/Logistic agree and logisticMargin>=0; pick NOVA |
| send_novaLogisticAgree_pick_nova | filter_global_logistic_agree | filter,global,logistic,direction,nova | 73 | 73.7% | 60.3% | +0.0pp | +6.8pp | 0.523 | send only if NOVA and Logistic pick same side; pick NOVA |
| send_nova_margin_ge_4_conf_ge_50_pick_nova | filter_global_margin_conf | filter,global,margin,confidence,nova | 64 | 64.6% | 62.5% | +0.0pp | +14.1pp | 0.506 | send only if novaMargin>=4 and confidence>=50%; pick NOVA |
| send_nova_margin_ge_4_logit_ge_0_pick_nova | filter_global_margin_logit | filter,global,margin,logistic-margin,nova | 64 | 64.6% | 62.5% | +0.0pp | +14.1pp | 0.506 | send only if novaMargin>=4 and logisticMargin>=0; pick NOVA |
| send_novaMargin_ge_4_pick_nova | filter_global_margin | filter,global,margin,nova | 64 | 64.6% | 62.5% | +0.0pp | +14.1pp | 0.506 | send only if novaMargin>=4; pick NOVA |
| send_novaLogisticAgree_nova_ge_2_conf_ge_50_pick_nova | filter_global_nova_logit_conf | filter,global,margin,logistic,direction,confidence,nova | 62 | 62.6% | 61.3% | +0.0pp | +8.1pp | 0.494 | send only if NOVA/Logistic agree and novaMargin>=2 and confidence>=50%; pick NOVA |
| send_novaLogisticAgree_nova_ge_2_logit_ge_0_pick_nova | filter_global_nova_logit_confirmed | filter,global,margin,logistic,direction,logistic-margin,nova | 62 | 62.6% | 61.3% | +0.0pp | +8.1pp | 0.494 | send only if NOVA/Logistic agree and novaMargin>=2 and logisticMargin>=0; pick NOVA |
| send_nova_margin_ge_2_logit_ge_2_pick_nova | filter_global_margin_logit | filter,global,margin,logistic-margin,nova | 56 | 56.6% | 64.3% | +0.0pp | +17.9pp | 0.491 | send only if novaMargin>=2 and logisticMargin>=2; pick NOVA |
| send_novaLogisticAgree_nova_ge_4_conf_ge_50_pick_nova | filter_global_nova_logit_conf | filter,global,margin,logistic,direction,confidence,nova | 54 | 54.5% | 63.0% | +0.0pp | +14.8pp | 0.478 | send only if NOVA/Logistic agree and novaMargin>=4 and confidence>=50%; pick NOVA |
| send_novaLogisticAgree_nova_ge_4_logit_ge_0_pick_nova | filter_global_nova_logit_confirmed | filter,global,margin,logistic,direction,logistic-margin,nova | 54 | 54.5% | 63.0% | +0.0pp | +14.8pp | 0.478 | send only if NOVA/Logistic agree and novaMargin>=4 and logisticMargin>=0; pick NOVA |
| send_novaLogisticAgree_logit_ge_2_pick_nova | filter_global_logistic_agree_margin | filter,global,logistic,direction,logistic-margin,nova | 56 | 56.6% | 60.7% | +0.0pp | +8.9pp | 0.473 | send only if NOVA/Logistic agree and logisticMargin>=2; pick NOVA |
| send_nova_margin_ge_4_logit_ge_2_pick_nova | filter_global_margin_logit | filter,global,margin,logistic-margin,nova | 49 | 49.5% | 63.3% | +0.0pp | +18.4pp | 0.465 | send only if novaMargin>=4 and logisticMargin>=2; pick NOVA |
| send_nova_margin_ge_6_conf_ge_50_pick_nova | filter_global_margin_conf | filter,global,margin,confidence,nova | 51 | 51.5% | 60.8% | +0.0pp | +13.7pp | 0.458 | send only if novaMargin>=6 and confidence>=50%; pick NOVA |
| send_nova_margin_ge_6_logit_ge_0_pick_nova | filter_global_margin_logit | filter,global,margin,logistic-margin,nova | 51 | 51.5% | 60.8% | +0.0pp | +13.7pp | 0.458 | send only if novaMargin>=6 and logisticMargin>=0; pick NOVA |
| send_novaMargin_ge_6_pick_nova | filter_global_margin | filter,global,margin,nova | 51 | 51.5% | 60.8% | +0.0pp | +13.7pp | 0.458 | send only if novaMargin>=6; pick NOVA |
| send_novaLogisticAgree_nova_ge_2_logit_ge_2_pick_nova | filter_global_nova_logit_confirmed | filter,global,margin,logistic,direction,logistic-margin,nova | 49 | 49.5% | 61.2% | +0.0pp | +12.2pp | 0.455 | send only if NOVA/Logistic agree and novaMargin>=2 and logisticMargin>=2; pick NOVA |
| send_disagree_nova_margin_ge_4_logit_ge_2_pick_nova | filter_disagree_margin_logit | filter,disagree,margin,logistic-margin,nova | 15 | 15.2% | 80.0% | +0.0pp | +60.0pp | 0.445 | send only if agreementHN=false and novaMargin>=4 and logisticMargin>=2; pick NOVA |

## Top Logistic-linked Strategy Candidates
| rule_id | n | coverage | hitRate | vs NOVA | rule |
|---|---:|---:|---:|---:|---|
| chooser_disagree_logit_conflict_ge_10_history_else_nova | 99 | 100.0% | 60.6% | -1.0pp | if agreementHN=false and NOVA/Logistic disagree and logisticMargin>=10 -> HISTORY; else NOVA/common |
| chooser_disagree_logit_conflict_ge_12_history_else_nova | 99 | 100.0% | 60.6% | -1.0pp | if agreementHN=false and NOVA/Logistic disagree and logisticMargin>=12 -> HISTORY; else NOVA/common |
| chooser_disagree_logit_conflict_ge_6_history_else_nova | 99 | 100.0% | 60.6% | -1.0pp | if agreementHN=false and NOVA/Logistic disagree and logisticMargin>=6 -> HISTORY; else NOVA/common |
| chooser_disagree_logit_conflict_ge_8_history_else_nova | 99 | 100.0% | 60.6% | -1.0pp | if agreementHN=false and NOVA/Logistic disagree and logisticMargin>=8 -> HISTORY; else NOVA/common |
| chooser_disagree_novaLogitAgree_nova_ge_4_else_history | 99 | 100.0% | 57.6% | -4.0pp | if agree -> common; if disagree and NOVA/Logistic agree and novaMargin>=4 -> NOVA; else HISTORY |
| chooser_disagree_novaLogitAgree_nova_ge_4_logit_ge_0_conf_ge_50_else_history | 99 | 100.0% | 57.6% | -4.0pp | if agree -> common; if disagree and NOVA/Logistic agree and novaMargin>=4 and logisticMargin>=0 and confidence>=50% -> NOVA; else HISTORY |
| chooser_disagree_novaLogitAgree_nova_ge_4_logit_ge_0_else_history | 99 | 100.0% | 57.6% | -4.0pp | if agree -> common; if disagree and NOVA/Logistic agree and novaMargin>=4 and logisticMargin>=0 -> NOVA; else HISTORY |
| chooser_disagree_novaLogitAgree_nova_ge_4_logit_ge_2_conf_ge_50_else_history | 99 | 100.0% | 56.6% | -5.1pp | if agree -> common; if disagree and NOVA/Logistic agree and novaMargin>=4 and logisticMargin>=2 and confidence>=50% -> NOVA; else HISTORY |
| chooser_disagree_novaLogitAgree_nova_ge_4_logit_ge_2_else_history | 99 | 100.0% | 56.6% | -5.1pp | if agree -> common; if disagree and NOVA/Logistic agree and novaMargin>=4 and logisticMargin>=2 -> NOVA; else HISTORY |
| chooser_disagree_novaLogitAgree_nova_ge_2_logit_ge_2_conf_ge_50_else_history | 99 | 100.0% | 55.6% | -6.1pp | if agree -> common; if disagree and NOVA/Logistic agree and novaMargin>=2 and logisticMargin>=2 and confidence>=50% -> NOVA; else HISTORY |
| chooser_disagree_novaLogitAgree_nova_ge_2_logit_ge_2_else_history | 99 | 100.0% | 55.6% | -6.1pp | if agree -> common; if disagree and NOVA/Logistic agree and novaMargin>=2 and logisticMargin>=2 -> NOVA; else HISTORY |
| chooser_disagree_novaLogitAgree_nova_ge_6_logit_ge_2_conf_ge_50_else_history | 99 | 100.0% | 55.6% | -6.1pp | if agree -> common; if disagree and NOVA/Logistic agree and novaMargin>=6 and logisticMargin>=2 and confidence>=50% -> NOVA; else HISTORY |
| chooser_disagree_novaLogitAgree_nova_ge_6_logit_ge_2_else_history | 99 | 100.0% | 55.6% | -6.1pp | if agree -> common; if disagree and NOVA/Logistic agree and novaMargin>=6 and logisticMargin>=2 -> NOVA; else HISTORY |
| chooser_disagree_novaLogitAgree_logit_ge_0_conf_ge_50_else_history | 99 | 100.0% | 54.5% | -7.1pp | if agree -> common; if disagree and NOVA/Logistic agree and logisticMargin>=0 and confidence>=50% -> NOVA; else HISTORY |
| chooser_disagree_novaLogitAgree_logit_ge_0_else_history | 99 | 100.0% | 54.5% | -7.1pp | if agree -> common; if disagree and NOVA/Logistic agree and logisticMargin>=0 -> NOVA; else HISTORY |
| chooser_disagree_novaLogitAgree_logit_ge_2_conf_ge_50_else_history | 99 | 100.0% | 54.5% | -7.1pp | if agree -> common; if disagree and NOVA/Logistic agree and logisticMargin>=2 and confidence>=50% -> NOVA; else HISTORY |
| chooser_disagree_novaLogitAgree_logit_ge_2_else_history | 99 | 100.0% | 54.5% | -7.1pp | if agree -> common; if disagree and NOVA/Logistic agree and logisticMargin>=2 -> NOVA; else HISTORY |
| chooser_disagree_novaLogitAgree_logit_ge_4_conf_ge_50_else_history | 99 | 100.0% | 54.5% | -7.1pp | if agree -> common; if disagree and NOVA/Logistic agree and logisticMargin>=4 and confidence>=50% -> NOVA; else HISTORY |
| chooser_disagree_novaLogitAgree_logit_ge_4_else_history | 99 | 100.0% | 54.5% | -7.1pp | if agree -> common; if disagree and NOVA/Logistic agree and logisticMargin>=4 -> NOVA; else HISTORY |
| chooser_disagree_novaLogitAgree_nova_ge_2_else_history | 99 | 100.0% | 54.5% | -7.1pp | if agree -> common; if disagree and NOVA/Logistic agree and novaMargin>=2 -> NOVA; else HISTORY |

## Top Logistic-linked Filter Candidates
| rule_id | n | coverage | hitRate | vs NOVA | balance | rule |
|---|---:|---:|---:|---:|---:|---|
| send_novaLogisticAgree_logit_ge_0_pick_nova | 73 | 73.7% | 60.3% | +0.0pp | 0.523 | send only if NOVA/Logistic agree and logisticMargin>=0; pick NOVA |
| send_novaLogisticAgree_pick_nova | 73 | 73.7% | 60.3% | +0.0pp | 0.523 | send only if NOVA and Logistic pick same side; pick NOVA |
| send_novaLogisticAgree_nova_ge_2_conf_ge_50_pick_nova | 62 | 62.6% | 61.3% | +0.0pp | 0.494 | send only if NOVA/Logistic agree and novaMargin>=2 and confidence>=50%; pick NOVA |
| send_novaLogisticAgree_nova_ge_2_logit_ge_0_pick_nova | 62 | 62.6% | 61.3% | +0.0pp | 0.494 | send only if NOVA/Logistic agree and novaMargin>=2 and logisticMargin>=0; pick NOVA |
| send_novaLogisticAgree_nova_ge_4_conf_ge_50_pick_nova | 54 | 54.5% | 63.0% | +0.0pp | 0.478 | send only if NOVA/Logistic agree and novaMargin>=4 and confidence>=50%; pick NOVA |
| send_novaLogisticAgree_nova_ge_4_logit_ge_0_pick_nova | 54 | 54.5% | 63.0% | +0.0pp | 0.478 | send only if NOVA/Logistic agree and novaMargin>=4 and logisticMargin>=0; pick NOVA |
| send_novaLogisticAgree_logit_ge_2_pick_nova | 56 | 56.6% | 60.7% | +0.0pp | 0.473 | send only if NOVA/Logistic agree and logisticMargin>=2; pick NOVA |
| send_novaLogisticAgree_nova_ge_2_logit_ge_2_pick_nova | 49 | 49.5% | 61.2% | +0.0pp | 0.455 | send only if NOVA/Logistic agree and novaMargin>=2 and logisticMargin>=2; pick NOVA |
| send_disagree_novaLogisticAgree_nova_ge_4_logit_ge_2_conf_ge_50_pick_nova | 11 | 11.1% | 81.8% | +0.0pp | 0.442 | send only if agreementHN=false and NOVA/Logistic agree and novaMargin>=4 and logisticMargin>=2 and confidence>=50%; pick NOVA |
| send_disagree_novaLogisticAgree_nova_ge_4_logit_ge_2_pick_nova | 11 | 11.1% | 81.8% | +0.0pp | 0.442 | send only if agreementHN=false and NOVA/Logistic agree and novaMargin>=4 and logisticMargin>=2; pick NOVA |
| send_novaLogisticAgree_nova_ge_6_conf_ge_50_pick_nova | 47 | 47.5% | 59.6% | +0.0pp | 0.440 | send only if NOVA/Logistic agree and novaMargin>=6 and confidence>=50%; pick NOVA |
| send_novaLogisticAgree_nova_ge_6_logit_ge_0_pick_nova | 47 | 47.5% | 59.6% | +0.0pp | 0.440 | send only if NOVA/Logistic agree and novaMargin>=6 and logisticMargin>=0; pick NOVA |
| send_novaLogisticAgree_nova_ge_4_logit_ge_2_pick_nova | 44 | 44.4% | 61.4% | +0.0pp | 0.440 | send only if NOVA/Logistic agree and novaMargin>=4 and logisticMargin>=2; pick NOVA |
| send_disagree_novaLogisticAgree_nova_ge_6_logit_ge_2_conf_ge_50_pick_nova | 10 | 10.1% | 80.0% | +0.0pp | 0.430 | send only if agreementHN=false and NOVA/Logistic agree and novaMargin>=6 and logisticMargin>=2 and confidence>=50%; pick NOVA |
| send_disagree_novaLogisticAgree_nova_ge_6_logit_ge_2_pick_nova | 10 | 10.1% | 80.0% | +0.0pp | 0.430 | send only if agreementHN=false and NOVA/Logistic agree and novaMargin>=6 and logisticMargin>=2; pick NOVA |
| send_novaLogisticAgree_nova_ge_8_conf_ge_50_pick_nova | 45 | 45.5% | 57.8% | +0.0pp | 0.425 | send only if NOVA/Logistic agree and novaMargin>=8 and confidence>=50%; pick NOVA |
| send_novaLogisticAgree_nova_ge_8_logit_ge_0_pick_nova | 45 | 45.5% | 57.8% | +0.0pp | 0.425 | send only if NOVA/Logistic agree and novaMargin>=8 and logisticMargin>=0; pick NOVA |
| send_disagree_novaLogisticAgree_nova_ge_4_conf_ge_50_pick_nova | 16 | 16.2% | 75.0% | +0.0pp | 0.423 | send only if agreementHN=false and NOVA/Logistic agree and novaMargin>=4 and confidence>=50%; pick NOVA |
| send_disagree_novaLogisticAgree_nova_ge_4_logit_ge_0_conf_ge_50_pick_nova | 16 | 16.2% | 75.0% | +0.0pp | 0.423 | send only if agreementHN=false and NOVA/Logistic agree and novaMargin>=4 and logisticMargin>=0 and confidence>=50%; pick NOVA |
| send_disagree_novaLogisticAgree_nova_ge_4_logit_ge_0_pick_nova | 16 | 16.2% | 75.0% | +0.0pp | 0.423 | send only if agreementHN=false and NOVA/Logistic agree and novaMargin>=4 and logisticMargin>=0; pick NOVA |

