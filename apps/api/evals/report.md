# Abhas Eval Report (dev)

- **Timestamp:** 2026-11-21T10:26:03+00:00 · **Commit:** `0b1687b` · **Model:** `climatology-le2018` · **Judge:** `-`
- **Golden pass rate:** 64.58% (31/48, threshold 80%) · **p95 inference:** 0.25 ms/ward
- **Global hold-out:** coverage_80=0.877 · within_one_tier=0.947 · critical_recall=0.841 · macro_f1=0.497 · floors_passed=False

## Global Metrics by Horizon
| Horizon | Model MAE | Clim MAE | Δ vs Clim | Seasonal Naive | Persistence | No-Weather | RMSE | Poisson Dev | Cov 80% |
|---|---|---|---|---|---|---|---|---|---|
| h=1 | 1.507 | 1.507 | +0.0% | 1.891 | 1.675 | n/a | 3.075 | 2.694 | 0.877 |
| h=2 | 1.507 | 1.507 | +0.0% | 1.891 | 1.970 | n/a | 3.075 | 2.694 | 0.877 |
| h=3 | 1.507 | 1.507 | +0.0% | 1.891 | 2.188 | n/a | 3.075 | 2.694 | 0.877 |
| h=4 | 1.507 | 1.507 | +0.0% | 1.891 | 2.423 | n/a | 3.075 | 2.694 | 0.877 |

## AC-5 Floor Checks
| Floor | Status |
|---|---|
| `mae_h2_le_1_10` | FAIL |
| `mae_h3_le_1_10` | FAIL |
| `mae_h2_beats_climatology_10pct` | FAIL |
| `mae_h3_beats_climatology_10pct` | FAIL |
| `mae_h4_beats_climatology` | FAIL |
| `weather_ablation_worse_all_h` | FAIL |
| `coverage_80_in_range` | PASS |
| `within_one_tier_ge_0_95` | FAIL |
| `critical_recall_ge_0_85` | FAIL |
| `p95_ward_ms_lt_50` | PASS |
| `golden_pass_rate_ge_threshold` | FAIL |

## Golden Cases
| ID | Split | Ward | Origin | h | Actual | Expected [P10, P90] | Tier (Act→Pred) | Pass |
|---|---|---|---|---|---|---|---|---|
| DEV-001 | dev | DNCC_Ward_04 | 2018-12-24 | 2 | 0 | 0.00 [0.0, 0.0] | Low→Low | PASS |
| DEV-002 | dev | DNCC_Ward_02 | 2019-01-14 | 3 | 0 | 0.00 [0.0, 0.0] | Low→Low | PASS |
| DEV-003 | dev | DNCC_Ward_18 | 2019-04-15 | 4 | 1 | 2.00 [0.0, 4.0] | Low→Low | PASS |
| DEV-004 | dev | DNCC_Ward_18 | 2019-05-06 | 2 | 3 | 1.33 [0.0, 3.0] | Medium→Low | PASS |
| DEV-005 | dev | DNCC_Ward_15 | 2019-06-10 | 2 | 9 | 3.67 [1.0, 7.0] | High→Medium | FAIL |
| DEV-006 | dev | DNCC_Ward_06 | 2019-06-17 | 3 | 3 | 2.33 [0.0, 5.0] | Medium→Low | PASS |
| DEV-007 | dev | DNCC_Ward_05 | 2019-07-08 | 2 | 19 | 6.67 [2.0, 12.0] | Critical→Medium | FAIL |
| DEV-008 | dev | DNCC_Ward_09 | 2019-07-08 | 3 | 21 | 11.33 [4.0, 20.0] | Critical→Critical | FAIL |
| DEV-009 | dev | DNCC_Ward_06 | 2019-07-15 | 3 | 11 | 6.33 [2.0, 11.0] | High→High | PASS |
| DEV-010 | dev | DNCC_Ward_18 | 2019-07-22 | 4 | 27 | 12.00 [5.0, 21.0] | Critical→High | FAIL |
| DEV-011 | dev | DNCC_Ward_01 | 2019-08-12 | 4 | 10 | 4.67 [1.0, 9.0] | High→High | FAIL |
| DEV-012 | dev | DNCC_Ward_04 | 2019-08-12 | 4 | 3 | 3.67 [1.0, 7.0] | Medium→Medium | PASS |
| DEV-013 | dev | DSCC_Ward_10 | 2020-01-06 | 2 | 0 | 0.00 [0.0, 0.0] | Low→Low | PASS |
| DEV-014 | dev | DSCC_Ward_06 | 2020-03-30 | 3 | 2 | 0.33 [0.0, 1.0] | Low→Low | FAIL |
| DEV-015 | dev | DSCC_Ward_12 | 2020-05-18 | 2 | 4 | 0.67 [0.0, 2.0] | Medium→Low | FAIL |
| DEV-016 | dev | DSCC_Ward_12 | 2020-05-11 | 4 | 2 | 1.33 [0.0, 3.0] | Low→Low | PASS |
| DEV-017 | dev | DSCC_Ward_08 | 2020-06-22 | 2 | 10 | 5.00 [1.0, 9.0] | High→High | FAIL |
| DEV-018 | dev | DSCC_Ward_13 | 2020-06-22 | 3 | 7 | 4.67 [1.0, 9.0] | Medium→High | PASS |
| DEV-019 | dev | DSCC_Ward_20 | 2020-07-20 | 2 | 14 | 11.67 [4.0, 20.0] | Critical→High | PASS |
| DEV-020 | dev | DSCC_Ward_05 | 2020-07-13 | 4 | 5 | 5.67 [2.0, 10.0] | Medium→High | PASS |
| DEV-021 | dev | DSCC_Ward_11 | 2020-07-27 | 3 | 11 | 12.00 [5.0, 21.0] | High→High | PASS |
| DEV-022 | dev | DSCC_Ward_04 | 2020-08-17 | 3 | 18 | 13.00 [5.0, 22.0] | Critical→High | PASS |
| DEV-023 | dev | DSCC_Ward_10 | 2020-08-24 | 4 | 11 | 12.67 [5.0, 22.0] | High→Critical | PASS |
| DEV-024 | dev | DSCC_Ward_08 | 2020-08-31 | 4 | 17 | 12.33 [5.0, 21.0] | Critical→Critical | PASS |
| DEV-025 | dev | CCC_Ward_08 | 2020-12-28 | 2 | 0 | 0.00 [0.0, 0.0] | Low→Low | PASS |
| DEV-026 | dev | CCC_Ward_09 | 2021-06-14 | 3 | 2 | 2.00 [0.0, 4.0] | Low→Low | PASS |
| DEV-027 | dev | CCC_Ward_04 | 2021-06-28 | 2 | 4 | 2.67 [0.0, 5.0] | Medium→Low | PASS |
| DEV-028 | dev | CCC_Ward_08 | 2021-08-09 | 3 | 6 | 9.67 [4.0, 17.0] | Medium→Critical | FAIL |
| DEV-029 | dev | CCC_Ward_03 | 2021-08-23 | 2 | 10 | 14.33 [6.0, 24.0] | High→Critical | PASS |
| DEV-030 | dev | CCC_Ward_02 | 2021-09-06 | 2 | 18 | 7.33 [2.0, 13.0] | Critical→High | FAIL |
| DEV-031 | dev | CCC_Ward_03 | 2021-08-30 | 3 | 17 | 12.67 [5.0, 22.0] | Critical→Critical | PASS |
| DEV-032 | dev | CCC_Ward_07 | 2021-09-20 | 3 | 10 | 8.67 [3.0, 15.0] | High→Critical | PASS |
| DEV-033 | dev | GCC_Ward_02 | 2022-03-21 | 4 | 0 | 0.33 [0.0, 1.0] | Low→Low | PASS |
| DEV-034 | dev | GCC_Ward_01 | 2022-05-16 | 4 | 6 | 1.00 [0.0, 2.0] | Medium→Low | FAIL |
| DEV-035 | dev | GCC_Ward_03 | 2022-05-30 | 2 | 4 | 0.00 [0.0, 0.0] | Medium→Low | FAIL |
| DEV-036 | dev | GCC_Ward_02 | 2022-05-30 | 4 | 22 | 7.67 [3.0, 14.0] | Critical→High | FAIL |
| DEV-037 | dev | GCC_Ward_04 | 2022-06-13 | 2 | 18 | 4.00 [1.0, 8.0] | Critical→Medium | FAIL |
| DEV-038 | dev | GCC_Ward_03 | 2022-07-25 | 4 | 13 | 13.67 [5.0, 23.0] | High→High | PASS |
| DEV-039 | dev | GCC_Ward_04 | 2022-08-29 | 2 | 2 | 6.00 [2.0, 11.0] | Low→Medium | PASS |
| DEV-040 | dev | GCC_Ward_02 | 2022-09-12 | 2 | 8 | 9.67 [4.0, 17.0] | High→High | PASS |
| DEV-041 | dev | NCC_Ward_03 | 2023-01-23 | 3 | 0 | 0.33 [0.0, 1.0] | Low→Low | PASS |
| DEV-042 | dev | NCC_Ward_05 | 2023-05-15 | 4 | 1 | 0.33 [0.0, 1.0] | Low→Low | PASS |
| DEV-043 | dev | NCC_Ward_01 | 2023-05-29 | 3 | 5 | 1.00 [0.0, 2.0] | Medium→Low | FAIL |
| DEV-044 | dev | NCC_Ward_02 | 2023-05-29 | 4 | 4 | 2.67 [0.0, 5.0] | Medium→Low | PASS |
| DEV-045 | dev | NCC_Ward_05 | 2023-06-05 | 3 | 10 | 4.67 [1.0, 9.0] | High→High | FAIL |
| DEV-046 | dev | NCC_Ward_03 | 2023-07-10 | 3 | 14 | 11.33 [4.0, 20.0] | Critical→High | PASS |
| DEV-047 | dev | NCC_Ward_03 | 2023-07-10 | 4 | 12 | 7.00 [2.0, 13.0] | High→Medium | PASS |
| DEV-048 | dev | NCC_Ward_05 | 2023-08-14 | 4 | 18 | 10.00 [4.0, 17.0] | Critical→High | FAIL |
