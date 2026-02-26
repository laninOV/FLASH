# Checkmark Calibration Study (49→100)

## Summary
- Train usable: 49
- Valid usable: 99
- Train main baseline: 57.1% (28/49)
- Valid main baseline: 49.5% (49/99)
- Train current ✅✅✅: 78.9% (n=19)
- Valid current ✅✅✅: 60.0% (n=40)
- Best candidate: `combo_bt_ge_0_spread_le_30_pca_dev_le_30_conf_ge_51` -> valid precision 77.8% (n=9), Δvs baseline 17.8%

## Top Candidates

| Rule ID | Tags | Valid n | Valid precision | Δ vs baseline | Coverage | Train precision | Precision drop | Passes | 
|---|---|---:|---:|---:|---:|---:|---:|:---:|
| `combo_bt_ge_0_spread_le_30_pca_dev_le_30_conf_ge_53` | combo,bt,spread,pca,strict-confidence | 6 | 100.0% | 40.0% | 6.1% | 83.3% | 16.7% | no |
| `combo_bt_ge_0_spread_le_30_pca_dev_le_35_conf_ge_53` | combo,bt,spread,pca,strict-confidence | 6 | 100.0% | 40.0% | 6.1% | 83.3% | 16.7% | no |
| `combo_bt_ge_4_spread_le_30_pca_dev_le_30_conf_ge_53` | combo,bt,spread,pca,strict-confidence | 6 | 100.0% | 40.0% | 6.1% | 83.3% | 16.7% | no |
| `combo_bt_ge_4_spread_le_30_pca_dev_le_35_conf_ge_53` | combo,bt,spread,pca,strict-confidence | 6 | 100.0% | 40.0% | 6.1% | 83.3% | 16.7% | no |
| `combo_bt_ge_0_spread_le_25_pca_dev_le_20_nova_ge_4_conf_ge_51` | combo,bt,spread,pca,nova-margin,strict-confidence | 4 | 100.0% | 40.0% | 4.0% | 50.0% | 50.0% | no |
| `combo_bt_ge_0_spread_le_25_pca_dev_le_20_nova_ge_6_conf_ge_51` | combo,bt,spread,pca,nova-margin,strict-confidence | 4 | 100.0% | 40.0% | 4.0% | 50.0% | 50.0% | no |
| `combo_bt_ge_0_spread_le_25_pca_dev_le_20_nova_ge_8_conf_ge_51` | combo,bt,spread,pca,nova-margin,strict-confidence | 4 | 100.0% | 40.0% | 4.0% | 50.0% | 50.0% | no |
| `combo_bt_ge_0_spread_le_25_pca_dev_le_25_nova_ge_4_conf_ge_51` | combo,bt,spread,pca,nova-margin,strict-confidence | 4 | 100.0% | 40.0% | 4.0% | 50.0% | 50.0% | no |
| `combo_bt_ge_0_spread_le_25_pca_dev_le_25_nova_ge_6_conf_ge_51` | combo,bt,spread,pca,nova-margin,strict-confidence | 4 | 100.0% | 40.0% | 4.0% | 50.0% | 50.0% | no |
| `combo_bt_ge_0_spread_le_25_pca_dev_le_25_nova_ge_8_conf_ge_51` | combo,bt,spread,pca,nova-margin,strict-confidence | 4 | 100.0% | 40.0% | 4.0% | 50.0% | 50.0% | no |
| `combo_bt_ge_0_spread_le_25_pca_dev_le_30_nova_ge_4_conf_ge_51` | combo,bt,spread,pca,nova-margin,strict-confidence | 4 | 100.0% | 40.0% | 4.0% | 50.0% | 50.0% | no |
| `combo_bt_ge_0_spread_le_25_pca_dev_le_30_nova_ge_6_conf_ge_51` | combo,bt,spread,pca,nova-margin,strict-confidence | 4 | 100.0% | 40.0% | 4.0% | 50.0% | 50.0% | no |
| `combo_bt_ge_0_spread_le_25_pca_dev_le_30_nova_ge_8_conf_ge_51` | combo,bt,spread,pca,nova-margin,strict-confidence | 4 | 100.0% | 40.0% | 4.0% | 50.0% | 50.0% | no |
| `combo_bt_ge_0_spread_le_25_pca_dev_le_35_nova_ge_4_conf_ge_51` | combo,bt,spread,pca,nova-margin,strict-confidence | 4 | 100.0% | 40.0% | 4.0% | 50.0% | 50.0% | no |
| `combo_bt_ge_0_spread_le_25_pca_dev_le_35_nova_ge_6_conf_ge_51` | combo,bt,spread,pca,nova-margin,strict-confidence | 4 | 100.0% | 40.0% | 4.0% | 50.0% | 50.0% | no |
| `combo_bt_ge_0_spread_le_25_pca_dev_le_35_nova_ge_8_conf_ge_51` | combo,bt,spread,pca,nova-margin,strict-confidence | 4 | 100.0% | 40.0% | 4.0% | 50.0% | 50.0% | no |
| `combo_bt_ge_0_spread_le_30_pca_dev_le_20_nova_ge_4_conf_ge_51` | combo,bt,spread,pca,nova-margin,strict-confidence | 4 | 100.0% | 40.0% | 4.0% | 50.0% | 50.0% | no |
| `combo_bt_ge_0_spread_le_30_pca_dev_le_20_nova_ge_6_conf_ge_51` | combo,bt,spread,pca,nova-margin,strict-confidence | 4 | 100.0% | 40.0% | 4.0% | 50.0% | 50.0% | no |
| `combo_bt_ge_0_spread_le_30_pca_dev_le_20_nova_ge_8_conf_ge_51` | combo,bt,spread,pca,nova-margin,strict-confidence | 4 | 100.0% | 40.0% | 4.0% | 50.0% | 50.0% | no |
| `combo_bt_ge_0_spread_le_30_pca_dev_le_25_nova_ge_4_conf_ge_51` | combo,bt,spread,pca,nova-margin,strict-confidence | 4 | 100.0% | 40.0% | 4.0% | 50.0% | 50.0% | no |

## Why false-positive ✅✅✅ can pass (baseline splits)

### Valid: baseline by Agreement (4/5 vs 5/5 and more)
- 4/5: n=1, hit=0/1, precision=0.0%
- 5/5: n=39, hit=24/39, precision=61.5%

### Valid: baseline by Confidence bands
- >60: n=29, hit=18/29, precision=62.1%
- 50-55: n=6, hit=3/6, precision=50.0%
- 55-60: n=5, hit=3/5, precision=60.0%

### Valid: baseline by BT agree/disagree
- BT agree: n=39, hit=24/39, precision=61.5%
- BT disagree: n=1, hit=0/1, precision=0.0%

### Valid: baseline by Spread band
- spread:high: n=19, hit=14/19, precision=73.7%
- spread:low: n=21, hit=10/21, precision=47.6%

### Valid: baseline by PCA outlier
- pca:normal: n=7, hit=4/7, precision=57.1%
- pca:outlier: n=33, hit=20/33, precision=60.6%

## Baseline false-positive ✅✅✅ examples (valid)
- Jovic I. vs Пегула Дж. | agr=5/5 conf=51.8 nova=50.833 bt=59.286 spread=8.996 pcaDev=5.015 | pick=Jovic I. | fact=Пегула Дж.
- Moller E. vs Бурручага Р. А. | agr=5/5 conf=51.1 nova=49.084 bt=44.286 spread=15.833 pcaDev=14.748 | pick=Бурручага Р. А. | fact=Moller E.
- Pacheco Mendez R. vs Коболли Ф. | agr=5/5 conf=70.8 nova=60.666 bt=72.857 spread=39.543 pcaDev=33.195 | pick=Pacheco Mendez R. | fact=Коболли Ф.
- Атман Т. vs Коболли Ф. | agr=5/5 conf=63.3 nova=67.81 bt=65.714 spread=36.482 pcaDev=30.632 | pick=Атман Т. | fact=Коболли Ф.
- Бенчич Б. vs Свитолина Э. | agr=5/5 conf=64.4 nova=60.87 bt=75.714 spread=39.335 pcaDev=32.351 | pick=Бенчич Б. | fact=Свитолина Э.
- Бурручага Р. А. vs Коприва В. | agr=5/5 conf=50.7 nova=61.469 bt=60 spread=17.756 pcaDev=14.429 | pick=Бурручага Р. А. | fact=Коприва В.
- Вонг Ч. vs Коболли Ф. | agr=5/5 conf=68.3 nova=51.685 bt=73.571 spread=34.596 pcaDev=27.351 | pick=Вонг Ч. | fact=Коболли Ф.
- Гаубас В. vs Баррена А. | agr=5/5 conf=61.5 nova=61.676 bt=62.143 spread=32.657 pcaDev=28.49 | pick=Гаубас В. | fact=Баррена А.
- Коприва В. vs Черундоло Х.-М. | agr=5/5 conf=58.7 nova=48.137 bt=49.286 spread=34.855 pcaDev=34.162 | pick=Черундоло Х.-М. | fact=Коприва В.
- Крюгер Э. vs Макналли К. | agr=5/5 conf=71.0 nova=37.429 bt=30.714 spread=35.43 pcaDev=30.706 | pick=Макналли К. | fact=Крюгер Э.
- Луж О. vs Роша Э. | agr=5/5 conf=66.4 nova=60.346 bt=65.714 spread=32.496 pcaDev=28.348 | pick=Луж О. | fact=Роша Э.
- Медведев Д. vs Циципас С. | agr=4/5 conf=55.3 nova=72.577 bt=49.286 spread=26.597 pcaDev=23.125 | pick=Медведев Д. | fact=Циципас С.
- Меншик Я. vs Синнер Я. | agr=5/5 conf=60.2 nova=37.521 bt=37.143 spread=34.02 pcaDev=28.424 | pick=Синнер Я. | fact=Меншик Я.
- Меншик Я. vs Чжан Ч. | agr=5/5 conf=65.0 nova=38.971 bt=25 spread=36.803 pcaDev=27.398 | pick=Чжан Ч. | fact=Меншик Я.
- Нава Э. vs Берреттини М. | agr=5/5 conf=60.9 nova=29.829 bt=42.857 spread=30.662 pcaDev=29.048 | pick=Берреттини М. | fact=Нава Э.
- Накасима Б. vs Вонг Ч. | agr=5/5 conf=60.5 nova=63.284 bt=59.286 spread=34.691 pcaDev=30.972 | pick=Накасима Б. | fact=Вонг Ч.
