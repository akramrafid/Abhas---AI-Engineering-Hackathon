# Abhas Eval Report (all)

- **Timestamp:** 2026-11-21T19:56:57+00:00 · **Commit:** `6de1837` · **Model:** `abhas-lgbm-baseline-0.1.0` · **Judge:** `-`
- **Golden pass rate:** 90.62% (87/96, threshold 80%) · **p95 inference:** 0.84 ms/ward
- **Global hold-out:** coverage_80=0.849 · within_one_tier=0.954 · critical_recall=0.901 · macro_f1=0.510 · floors_passed=False

## Global Metrics by Horizon
| Horizon | Model MAE | Clim MAE | Δ vs Clim | Seasonal Naive | Persistence | No-Weather | RMSE | Poisson Dev | Cov 80% |
|---|---|---|---|---|---|---|---|---|---|
| h=1 | 0.969 | 1.259 | +23.1% | 1.693 | 1.409 | 1.234 | 1.888 | 0.802 | 0.852 |
| h=2 | 1.036 | 1.259 | +17.7% | 1.693 | 1.659 | 1.234 | 2.097 | 0.862 | 0.860 |
| h=3 | 1.026 | 1.259 | +18.5% | 1.693 | 1.869 | 1.234 | 1.994 | 0.885 | 0.830 |
| h=4 | 1.235 | 1.259 | +1.9% | 1.693 | 2.056 | 1.234 | 2.425 | 1.104 | 0.855 |

## AC-5 Floor Checks
| Floor | Status |
|---|---|
| `mae_h2_le_1_10` | PASS |
| `mae_h3_le_1_10` | PASS |
| `mae_h2_beats_climatology_10pct` | PASS |
| `mae_h3_beats_climatology_10pct` | PASS |
| `mae_h4_beats_climatology` | PASS |
| `weather_ablation_worse_all_h` | FAIL |
| `coverage_80_in_range` | PASS |
| `within_one_tier_ge_0_95` | PASS |
| `critical_recall_ge_0_85` | PASS |
| `p95_ward_ms_lt_50` | PASS |
| `golden_pass_rate_ge_threshold` | PASS |

## Golden Cases
| ID | Split | Ward | Origin | h | Actual | Expected [P10, P90] | Tier (Act→Pred) | Pass |
|---|---|---|---|---|---|---|---|---|
| DEV-001 | dev | DNCC_Ward_04 | 2018-12-24 | 2 | 0 | 0.03 [0.0, 0.4] | Low→Low | PASS |
| DEV-002 | dev | DNCC_Ward_02 | 2019-01-14 | 3 | 0 | 0.04 [0.0, 0.6] | Low→Low | PASS |
| DEV-003 | dev | DNCC_Ward_18 | 2019-04-15 | 4 | 1 | 0.84 [0.0, 3.2] | Low→Low | PASS |
| DEV-004 | dev | DNCC_Ward_18 | 2019-05-06 | 2 | 3 | 1.61 [0.6, 5.0] | Medium→Medium | PASS |
| DEV-005 | dev | DNCC_Ward_15 | 2019-06-10 | 2 | 9 | 4.99 [2.8, 12.0] | High→Medium | PASS |
| DEV-006 | dev | DNCC_Ward_06 | 2019-06-17 | 3 | 3 | 4.80 [2.7, 12.5] | Medium→High | PASS |
| DEV-007 | dev | DNCC_Ward_05 | 2019-07-08 | 2 | 19 | 14.60 [9.5, 30.8] | Critical→Critical | PASS |
| DEV-008 | dev | DNCC_Ward_09 | 2019-07-08 | 3 | 21 | 18.90 [13.0, 41.0] | Critical→Critical | PASS |
| DEV-009 | dev | DNCC_Ward_06 | 2019-07-15 | 3 | 11 | 13.43 [9.0, 30.1] | High→Critical | PASS |
| DEV-010 | dev | DNCC_Ward_18 | 2019-07-22 | 4 | 27 | 19.80 [11.9, 42.0] | Critical→Critical | PASS |
| DEV-011 | dev | DNCC_Ward_01 | 2019-08-12 | 4 | 10 | 12.20 [7.0, 26.8] | High→Critical | PASS |
| DEV-012 | dev | DNCC_Ward_04 | 2019-08-12 | 4 | 3 | 7.10 [3.7, 16.6] | Medium→High | FAIL |
| DEV-013 | dev | DSCC_Ward_10 | 2020-01-06 | 2 | 0 | 0.03 [0.0, 0.4] | Low→Low | PASS |
| DEV-014 | dev | DSCC_Ward_06 | 2020-03-30 | 3 | 2 | 1.20 [0.3, 4.5] | Low→Low | PASS |
| DEV-015 | dev | DSCC_Ward_12 | 2020-05-18 | 2 | 4 | 1.27 [0.3, 4.2] | Medium→Low | PASS |
| DEV-016 | dev | DSCC_Ward_12 | 2020-05-11 | 4 | 2 | 1.49 [0.3, 4.8] | Low→Low | PASS |
| DEV-017 | dev | DSCC_Ward_08 | 2020-06-22 | 2 | 10 | 7.28 [4.4, 16.6] | High→High | PASS |
| DEV-018 | dev | DSCC_Ward_13 | 2020-06-22 | 3 | 7 | 6.85 [4.2, 16.8] | Medium→High | PASS |
| DEV-019 | dev | DSCC_Ward_20 | 2020-07-20 | 2 | 14 | 6.66 [3.9, 15.4] | Critical→Medium | FAIL |
| DEV-020 | dev | DSCC_Ward_05 | 2020-07-13 | 4 | 5 | 6.36 [3.3, 15.1] | Medium→High | PASS |
| DEV-021 | dev | DSCC_Ward_11 | 2020-07-27 | 3 | 11 | 5.62 [3.3, 14.2] | High→Medium | PASS |
| DEV-022 | dev | DSCC_Ward_04 | 2020-08-17 | 3 | 18 | 13.15 [8.8, 29.5] | Critical→Critical | PASS |
| DEV-023 | dev | DSCC_Ward_10 | 2020-08-24 | 4 | 11 | 12.40 [7.1, 27.2] | High→Critical | PASS |
| DEV-024 | dev | DSCC_Ward_08 | 2020-08-31 | 4 | 17 | 14.73 [8.7, 31.9] | Critical→Critical | PASS |
| DEV-025 | dev | CCC_Ward_08 | 2020-12-28 | 2 | 0 | 0.03 [0.0, 0.4] | Low→Low | PASS |
| DEV-026 | dev | CCC_Ward_09 | 2021-06-14 | 3 | 2 | 1.90 [0.8, 6.2] | Low→Low | PASS |
| DEV-027 | dev | CCC_Ward_04 | 2021-06-28 | 2 | 4 | 5.16 [2.9, 12.4] | Medium→High | PASS |
| DEV-028 | dev | CCC_Ward_08 | 2021-08-09 | 3 | 6 | 5.93 [3.5, 14.9] | Medium→Medium | PASS |
| DEV-029 | dev | CCC_Ward_03 | 2021-08-23 | 2 | 10 | 9.48 [5.9, 20.9] | High→High | PASS |
| DEV-030 | dev | CCC_Ward_02 | 2021-09-06 | 2 | 18 | 6.78 [4.0, 15.6] | Critical→Medium | FAIL |
| DEV-031 | dev | CCC_Ward_03 | 2021-08-30 | 3 | 17 | 16.37 [11.1, 35.9] | Critical→Critical | PASS |
| DEV-032 | dev | CCC_Ward_07 | 2021-09-20 | 3 | 10 | 9.14 [5.8, 21.4] | High→Critical | PASS |
| DEV-033 | dev | GCC_Ward_02 | 2022-03-21 | 4 | 0 | 0.42 [0.0, 2.0] | Low→Low | PASS |
| DEV-034 | dev | GCC_Ward_01 | 2022-05-16 | 4 | 6 | 2.67 [1.0, 7.4] | Medium→Medium | PASS |
| DEV-035 | dev | GCC_Ward_03 | 2022-05-30 | 2 | 4 | 5.28 [3.0, 12.6] | Medium→High | PASS |
| DEV-036 | dev | GCC_Ward_02 | 2022-05-30 | 4 | 22 | 20.84 [12.6, 44.1] | Critical→Critical | PASS |
| DEV-037 | dev | GCC_Ward_04 | 2022-06-13 | 2 | 18 | 13.19 [8.5, 28.1] | Critical→Critical | PASS |
| DEV-038 | dev | GCC_Ward_03 | 2022-07-25 | 4 | 13 | 14.71 [8.6, 31.9] | High→Critical | PASS |
| DEV-039 | dev | GCC_Ward_04 | 2022-08-29 | 2 | 2 | 5.83 [3.4, 13.7] | Low→High | FAIL |
| DEV-040 | dev | GCC_Ward_02 | 2022-09-12 | 2 | 8 | 7.86 [4.8, 17.7] | High→High | PASS |
| DEV-041 | dev | NCC_Ward_03 | 2023-01-23 | 3 | 0 | 0.07 [0.0, 0.8] | Low→Low | PASS |
| DEV-042 | dev | NCC_Ward_05 | 2023-05-15 | 4 | 1 | 0.97 [0.1, 3.5] | Low→Low | PASS |
| DEV-043 | dev | NCC_Ward_01 | 2023-05-29 | 3 | 5 | 2.31 [1.0, 7.1] | Medium→Low | PASS |
| DEV-044 | dev | NCC_Ward_02 | 2023-05-29 | 4 | 4 | 4.72 [2.2, 11.7] | Medium→High | PASS |
| DEV-045 | dev | NCC_Ward_05 | 2023-06-05 | 3 | 10 | 8.05 [5.1, 19.2] | High→Medium | PASS |
| DEV-046 | dev | NCC_Ward_03 | 2023-07-10 | 3 | 14 | 13.66 [9.1, 30.5] | Critical→Critical | PASS |
| DEV-047 | dev | NCC_Ward_03 | 2023-07-10 | 4 | 12 | 13.71 [8.0, 29.8] | High→Critical | PASS |
| DEV-048 | dev | NCC_Ward_05 | 2023-08-14 | 4 | 18 | 16.21 [9.6, 34.8] | Critical→Critical | PASS |
| HO-001 | heldout | DNCC_Ward_04 | 2023-12-18 | 2 | 0 | 0.03 [0.0, 0.4] | Low→Low | PASS |
| HO-002 | heldout | CCC_Ward_08 | 2023-12-18 | 3 | 0 | 0.03 [0.0, 0.5] | Low→Low | PASS |
| HO-003 | heldout | DSCC_Ward_09 | 2023-12-18 | 4 | 0 | 0.03 [0.0, 0.4] | Low→Low | PASS |
| HO-004 | heldout | NCC_Ward_02 | 2024-01-29 | 2 | 0 | 0.09 [0.0, 0.8] | Low→Low | PASS |
| HO-005 | heldout | DNCC_Ward_10 | 2024-04-08 | 2 | 4 | 1.15 [0.3, 3.9] | Medium→Low | FAIL |
| HO-006 | heldout | CCC_Ward_05 | 2024-06-17 | 3 | 7 | 3.34 [1.7, 9.4] | Medium→Medium | PASS |
| HO-007 | heldout | DSCC_Ward_12 | 2024-06-10 | 4 | 7 | 6.09 [3.1, 14.5] | Medium→Medium | PASS |
| HO-008 | heldout | DNCC_Ward_04 | 2024-07-01 | 2 | 8 | 4.41 [2.4, 10.9] | High→Medium | PASS |
| HO-009 | heldout | DNCC_Ward_19 | 2024-07-01 | 2 | 15 | 6.95 [4.1, 15.9] | Critical→High | PASS |
| HO-010 | heldout | DSCC_Ward_04 | 2024-07-01 | 3 | 18 | 14.25 [9.6, 31.7] | Critical→Critical | PASS |
| HO-011 | heldout | CCC_Ward_03 | 2024-07-01 | 4 | 14 | 10.32 [5.8, 23.1] | Critical→High | PASS |
| HO-012 | heldout | CCC_Ward_03 | 2024-07-22 | 2 | 17 | 11.81 [7.6, 25.4] | Critical→Critical | PASS |
| HO-013 | heldout | CCC_Ward_02 | 2024-07-22 | 3 | 9 | 4.49 [2.5, 11.9] | High→Medium | PASS |
| HO-014 | heldout | DSCC_Ward_12 | 2024-07-22 | 3 | 15 | 8.80 [5.6, 20.7] | Critical→High | PASS |
| HO-015 | heldout | DNCC_Ward_19 | 2024-07-22 | 4 | 19 | 9.53 [5.3, 21.5] | Critical→High | PASS |
| HO-016 | heldout | GCC_Ward_03 | 2024-08-12 | 2 | 29 | 15.55 [10.2, 32.7] | Critical→Critical | PASS |
| HO-017 | heldout | DSCC_Ward_04 | 2024-08-05 | 4 | 11 | 21.15 [12.8, 44.7] | High→Critical | FAIL |
| HO-018 | heldout | GCC_Ward_03 | 2024-08-12 | 3 | 18 | 13.93 [9.3, 31.1] | Critical→Critical | PASS |
| HO-019 | heldout | NCC_Ward_05 | 2024-08-26 | 2 | 12 | 10.31 [6.5, 22.5] | High→Critical | PASS |
| HO-020 | heldout | NCC_Ward_05 | 2024-08-19 | 4 | 18 | 15.16 [8.9, 32.7] | Critical→Critical | PASS |
| HO-021 | heldout | DNCC_Ward_09 | 2024-09-09 | 2 | 14 | 8.19 [5.0, 18.4] | Critical→High | PASS |
| HO-022 | heldout | NCC_Ward_01 | 2024-09-09 | 2 | 4 | 7.39 [4.4, 16.8] | Medium→High | FAIL |
| HO-023 | heldout | GCC_Ward_03 | 2024-09-16 | 3 | 8 | 4.95 [2.8, 12.8] | High→Medium | PASS |
| HO-024 | heldout | DSCC_Ward_07 | 2025-03-31 | 3 | 1 | 0.32 [0.0, 1.9] | Low→Low | PASS |
| HO-025 | heldout | DNCC_Ward_10 | 2025-04-14 | 4 | 1 | 1.12 [0.1, 3.9] | Low→Low | PASS |
| HO-026 | heldout | DSCC_Ward_10 | 2025-05-26 | 3 | 3 | 1.32 [0.4, 4.8] | Medium→Low | PASS |
| HO-027 | heldout | CCC_Ward_03 | 2025-05-26 | 4 | 10 | 7.87 [4.2, 18.1] | High→Medium | PASS |
| HO-028 | heldout | DNCC_Ward_12 | 2025-06-02 | 3 | 20 | 8.36 [5.3, 19.8] | Critical→Medium | FAIL |
| HO-029 | heldout | DNCC_Ward_12 | 2025-06-02 | 4 | 23 | 26.21 [16.1, 54.8] | Critical→Critical | PASS |
| HO-030 | heldout | DSCC_Ward_03 | 2025-06-16 | 2 | 12 | 17.14 [11.3, 35.8] | High→Critical | PASS |
| HO-031 | heldout | DSCC_Ward_12 | 2025-06-23 | 2 | 16 | 19.27 [12.8, 39.9] | Critical→Critical | PASS |
| HO-032 | heldout | CCC_Ward_03 | 2025-06-23 | 3 | 21 | 9.48 [6.1, 22.1] | Critical→Critical | PASS |
| HO-033 | heldout | DNCC_Ward_09 | 2025-06-16 | 4 | 6 | 13.99 [8.2, 30.4] | Medium→Critical | FAIL |
| HO-034 | heldout | DSCC_Ward_10 | 2025-06-23 | 4 | 14 | 11.95 [6.9, 26.3] | Critical→Critical | PASS |
| HO-035 | heldout | GCC_Ward_01 | 2025-07-14 | 2 | 15 | 9.02 [5.6, 20.0] | Critical→High | PASS |
| HO-036 | heldout | DNCC_Ward_18 | 2025-07-14 | 3 | 8 | 9.84 [6.4, 22.9] | High→High | PASS |
| HO-037 | heldout | DNCC_Ward_09 | 2025-07-28 | 3 | 16 | 9.62 [6.2, 22.4] | Critical→High | PASS |
| HO-038 | heldout | GCC_Ward_04 | 2025-08-04 | 2 | 7 | 6.43 [3.8, 14.9] | Medium→Medium | PASS |
| HO-039 | heldout | DSCC_Ward_12 | 2025-07-28 | 4 | 17 | 10.08 [5.7, 22.6] | Critical→Critical | PASS |
| HO-040 | heldout | DNCC_Ward_19 | 2025-08-18 | 2 | 18 | 12.65 [8.1, 27.1] | Critical→Critical | PASS |
| HO-041 | heldout | NCC_Ward_01 | 2025-08-04 | 4 | 9 | 9.21 [5.1, 20.8] | High→High | PASS |
| HO-042 | heldout | CCC_Ward_10 | 2025-08-18 | 3 | 7 | 5.69 [3.4, 14.4] | Medium→High | PASS |
| HO-043 | heldout | DNCC_Ward_05 | 2025-08-18 | 3 | 18 | 8.91 [5.7, 21.0] | Critical→Critical | PASS |
| HO-044 | heldout | GCC_Ward_05 | 2025-08-25 | 2 | 11 | 10.57 [6.7, 23.0] | High→Critical | PASS |
| HO-045 | heldout | CCC_Ward_03 | 2025-08-18 | 4 | 14 | 11.68 [6.7, 25.8] | Critical→Critical | PASS |
| HO-046 | heldout | DSCC_Ward_04 | 2025-09-15 | 2 | 16 | 8.87 [5.5, 19.7] | Critical→High | PASS |
| HO-047 | heldout | CCC_Ward_07 | 2025-10-06 | 2 | 1 | 0.63 [0.0, 2.6] | Low→Low | PASS |
| HO-048 | heldout | GCC_Ward_02 | 2025-09-29 | 3 | 1 | 0.26 [0.0, 1.7] | Low→Low | PASS |
