# Abhas Eval Report (heldout)

- **Timestamp:** 2026-11-21T15:09:58+00:00 · **Commit:** `574f78a` · **Model:** `abhas-lgbm-1.0.0` · **Judge:** `-`
- **Golden pass rate:** 79.17% (38/48, threshold 80%) · **p95 inference:** 1.80 ms/ward
- **Global hold-out:** coverage_80=0.813 · within_one_tier=0.959 · critical_recall=0.909 · macro_f1=0.510 · floors_passed=False

## Global Metrics by Horizon
| Horizon | Model MAE | Clim MAE | Δ vs Clim | Seasonal Naive | Persistence | No-Weather | RMSE | Poisson Dev | Cov 80% |
|---|---|---|---|---|---|---|---|---|---|
| h=1 | 0.950 | 1.259 | +24.5% | 1.693 | 1.409 | 1.235 | 1.841 | 0.783 | 0.821 |
| h=2 | 1.019 | 1.259 | +19.1% | 1.693 | 1.659 | 1.235 | 2.048 | 0.845 | 0.809 |
| h=3 | 1.021 | 1.259 | +18.9% | 1.693 | 1.869 | 1.235 | 1.987 | 0.876 | 0.813 |
| h=4 | 1.209 | 1.259 | +3.9% | 1.693 | 2.056 | 1.236 | 2.355 | 1.085 | 0.808 |

## AC-5 Floor Checks
| Floor | Status |
|---|---|
| `mae_h2_le_1_10` | PASS |
| `mae_h3_le_1_10` | PASS |
| `mae_h2_beats_climatology_10pct` | PASS |
| `mae_h3_beats_climatology_10pct` | PASS |
| `mae_h4_beats_climatology` | PASS |
| `weather_ablation_worse_all_h` | PASS |
| `coverage_80_in_range` | PASS |
| `within_one_tier_ge_0_95` | PASS |
| `critical_recall_ge_0_85` | PASS |
| `p95_ward_ms_lt_50` | PASS |
| `golden_pass_rate_ge_threshold` | FAIL |

## Golden Cases
| ID | Split | Ward | Origin | h | Actual | Expected [P10, P90] | Tier (Act→Pred) | Pass |
|---|---|---|---|---|---|---|---|---|
| HO-001 | heldout | DNCC_Ward_04 | 2023-12-18 | 2 | 0 | 0.03 [0.0, 0.4] | Low→Low | PASS |
| HO-002 | heldout | CCC_Ward_08 | 2023-12-18 | 3 | 0 | 0.03 [0.0, 0.5] | Low→Low | PASS |
| HO-003 | heldout | DSCC_Ward_09 | 2023-12-18 | 4 | 0 | 0.03 [0.0, 0.5] | Low→Low | PASS |
| HO-004 | heldout | NCC_Ward_02 | 2024-01-29 | 2 | 0 | 0.09 [0.0, 0.8] | Low→Low | PASS |
| HO-005 | heldout | DNCC_Ward_10 | 2024-04-08 | 2 | 4 | 1.06 [0.3, 3.5] | Medium→Low | FAIL |
| HO-006 | heldout | CCC_Ward_05 | 2024-06-17 | 3 | 7 | 3.31 [1.8, 8.9] | Medium→Medium | PASS |
| HO-007 | heldout | DSCC_Ward_12 | 2024-06-10 | 4 | 7 | 5.60 [3.1, 14.2] | Medium→Medium | PASS |
| HO-008 | heldout | DNCC_Ward_04 | 2024-07-01 | 2 | 8 | 4.31 [2.6, 10.1] | High→Low | FAIL |
| HO-009 | heldout | DNCC_Ward_19 | 2024-07-01 | 2 | 15 | 6.88 [4.5, 15.0] | Critical→High | PASS |
| HO-010 | heldout | DSCC_Ward_04 | 2024-07-01 | 3 | 18 | 13.97 [9.6, 30.2] | Critical→Critical | PASS |
| HO-011 | heldout | CCC_Ward_03 | 2024-07-01 | 4 | 14 | 10.15 [6.2, 23.9] | Critical→High | PASS |
| HO-012 | heldout | CCC_Ward_03 | 2024-07-22 | 2 | 17 | 11.75 [8.1, 24.1] | Critical→High | PASS |
| HO-013 | heldout | CCC_Ward_02 | 2024-07-22 | 3 | 9 | 4.23 [2.4, 10.9] | High→Low | FAIL |
| HO-014 | heldout | DSCC_Ward_12 | 2024-07-22 | 3 | 15 | 8.06 [5.2, 18.6] | Critical→Medium | FAIL |
| HO-015 | heldout | DNCC_Ward_19 | 2024-07-22 | 4 | 19 | 9.66 [5.9, 22.8] | Critical→Critical | PASS |
| HO-016 | heldout | GCC_Ward_03 | 2024-08-12 | 2 | 29 | 13.89 [9.7, 28.0] | Critical→Critical | FAIL |
| HO-017 | heldout | DSCC_Ward_04 | 2024-08-05 | 4 | 11 | 19.23 [12.4, 42.8] | High→Critical | FAIL |
| HO-018 | heldout | GCC_Ward_03 | 2024-08-12 | 3 | 18 | 14.15 [9.7, 30.5] | Critical→Critical | PASS |
| HO-019 | heldout | NCC_Ward_05 | 2024-08-26 | 2 | 12 | 10.14 [6.9, 21.1] | High→High | PASS |
| HO-020 | heldout | NCC_Ward_05 | 2024-08-19 | 4 | 18 | 12.68 [7.9, 29.1] | Critical→Critical | PASS |
| HO-021 | heldout | DNCC_Ward_09 | 2024-09-09 | 2 | 14 | 8.33 [5.6, 17.7] | Critical→High | PASS |
| HO-022 | heldout | NCC_Ward_01 | 2024-09-09 | 2 | 4 | 7.68 [5.1, 16.5] | Medium→High | FAIL |
| HO-023 | heldout | GCC_Ward_03 | 2024-09-16 | 3 | 8 | 4.91 [2.9, 12.3] | High→Low | FAIL |
| HO-024 | heldout | DSCC_Ward_07 | 2025-03-31 | 3 | 1 | 0.30 [0.0, 1.7] | Low→Low | PASS |
| HO-025 | heldout | DNCC_Ward_10 | 2025-04-14 | 4 | 1 | 1.28 [0.3, 4.5] | Low→Low | PASS |
| HO-026 | heldout | DSCC_Ward_10 | 2025-05-26 | 3 | 3 | 1.43 [0.5, 4.8] | Medium→Low | PASS |
| HO-027 | heldout | CCC_Ward_03 | 2025-05-26 | 4 | 10 | 8.17 [4.9, 19.7] | High→Medium | PASS |
| HO-028 | heldout | DNCC_Ward_12 | 2025-06-02 | 3 | 20 | 11.34 [7.7, 25.0] | Critical→Critical | PASS |
| HO-029 | heldout | DNCC_Ward_12 | 2025-06-02 | 4 | 23 | 21.98 [14.3, 48.5] | Critical→Critical | PASS |
| HO-030 | heldout | DSCC_Ward_03 | 2025-06-16 | 2 | 12 | 16.85 [11.9, 33.5] | High→Critical | PASS |
| HO-031 | heldout | DSCC_Ward_12 | 2025-06-23 | 2 | 16 | 18.63 [13.3, 36.8] | Critical→Critical | PASS |
| HO-032 | heldout | CCC_Ward_03 | 2025-06-23 | 3 | 21 | 9.98 [6.7, 22.4] | Critical→Critical | PASS |
| HO-033 | heldout | DNCC_Ward_09 | 2025-06-16 | 4 | 6 | 16.23 [10.4, 36.6] | Medium→Critical | FAIL |
| HO-034 | heldout | DSCC_Ward_10 | 2025-06-23 | 4 | 14 | 12.14 [7.6, 28.0] | Critical→Critical | PASS |
| HO-035 | heldout | GCC_Ward_01 | 2025-07-14 | 2 | 15 | 8.45 [5.6, 17.9] | Critical→Medium | FAIL |
| HO-036 | heldout | DNCC_Ward_18 | 2025-07-14 | 3 | 8 | 9.67 [6.4, 21.7] | High→High | PASS |
| HO-037 | heldout | DNCC_Ward_09 | 2025-07-28 | 3 | 16 | 8.99 [5.9, 20.4] | Critical→High | PASS |
| HO-038 | heldout | GCC_Ward_04 | 2025-08-04 | 2 | 7 | 6.27 [4.0, 13.9] | Medium→Medium | PASS |
| HO-039 | heldout | DSCC_Ward_12 | 2025-07-28 | 4 | 17 | 9.88 [6.0, 23.3] | Critical→Critical | PASS |
| HO-040 | heldout | DNCC_Ward_19 | 2025-08-18 | 2 | 18 | 13.32 [9.3, 27.0] | Critical→Critical | PASS |
| HO-041 | heldout | NCC_Ward_01 | 2025-08-04 | 4 | 9 | 9.24 [5.6, 21.9] | High→High | PASS |
| HO-042 | heldout | CCC_Ward_10 | 2025-08-18 | 3 | 7 | 6.09 [3.8, 14.6] | Medium→High | PASS |
| HO-043 | heldout | DNCC_Ward_05 | 2025-08-18 | 3 | 18 | 9.46 [6.3, 21.3] | Critical→Critical | PASS |
| HO-044 | heldout | GCC_Ward_05 | 2025-08-25 | 2 | 11 | 10.22 [7.0, 21.3] | High→Critical | PASS |
| HO-045 | heldout | CCC_Ward_03 | 2025-08-18 | 4 | 14 | 12.01 [7.5, 27.7] | Critical→Critical | PASS |
| HO-046 | heldout | DSCC_Ward_04 | 2025-09-15 | 2 | 16 | 9.29 [6.3, 19.5] | Critical→High | PASS |
| HO-047 | heldout | CCC_Ward_07 | 2025-10-06 | 2 | 1 | 0.60 [0.1, 2.4] | Low→Low | PASS |
| HO-048 | heldout | GCC_Ward_02 | 2025-09-29 | 3 | 1 | 0.32 [0.0, 1.8] | Low→Low | PASS |
