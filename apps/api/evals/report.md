# Abhas Eval Report (heldout)

- **Timestamp:** 2026-11-21T20:16:50+00:00 · **Commit:** `f1eaee6` · **Model:** `abhas-lgbm-1.1.0` · **Judge:** `-`
- **Golden pass rate:** 79.17% (38/48, threshold 80%) · **p95 inference:** 0.59 ms/ward
- **Global hold-out:** coverage_80=0.860 · within_one_tier=0.960 · critical_recall=0.920 · macro_f1=0.525 · floors_passed=False

## Global Metrics by Horizon
| Horizon | Model MAE | Clim MAE | Δ vs Clim | Seasonal Naive | Persistence | No-Weather | RMSE | Poisson Dev | Cov 80% |
|---|---|---|---|---|---|---|---|---|---|
| h=1 | 0.944 | 1.259 | +25.0% | 1.693 | 1.409 | 1.235 | 1.835 | 0.777 | 0.873 |
| h=2 | 0.991 | 1.259 | +21.3% | 1.693 | 1.659 | 1.242 | 1.968 | 0.816 | 0.845 |
| h=3 | 1.010 | 1.259 | +19.8% | 1.693 | 1.869 | 1.239 | 1.963 | 0.862 | 0.865 |
| h=4 | 1.193 | 1.259 | +5.2% | 1.693 | 2.056 | 1.248 | 2.295 | 1.085 | 0.857 |

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
| HO-001 | heldout | DNCC_Ward_04 | 2023-12-18 | 2 | 0 | 0.01 [0.0, 0.2] | Low→Low | PASS |
| HO-002 | heldout | CCC_Ward_08 | 2023-12-18 | 3 | 0 | 0.01 [0.0, 0.3] | Low→Low | PASS |
| HO-003 | heldout | DSCC_Ward_09 | 2023-12-18 | 4 | 0 | 0.03 [0.0, 0.5] | Low→Low | PASS |
| HO-004 | heldout | NCC_Ward_02 | 2024-01-29 | 2 | 0 | 0.07 [0.0, 0.7] | Low→Low | PASS |
| HO-005 | heldout | DNCC_Ward_10 | 2024-04-08 | 2 | 4 | 0.94 [0.2, 3.5] | Medium→Low | FAIL |
| HO-006 | heldout | CCC_Ward_05 | 2024-06-17 | 3 | 7 | 3.69 [1.7, 8.7] | Medium→Medium | PASS |
| HO-007 | heldout | DSCC_Ward_12 | 2024-06-10 | 4 | 7 | 6.72 [3.4, 16.9] | Medium→High | PASS |
| HO-008 | heldout | DNCC_Ward_04 | 2024-07-01 | 2 | 8 | 4.73 [2.7, 11.4] | High→Medium | PASS |
| HO-009 | heldout | DNCC_Ward_19 | 2024-07-01 | 2 | 15 | 7.49 [4.8, 16.6] | Critical→High | PASS |
| HO-010 | heldout | DSCC_Ward_04 | 2024-07-01 | 3 | 18 | 14.65 [9.3, 28.5] | Critical→Critical | PASS |
| HO-011 | heldout | CCC_Ward_03 | 2024-07-01 | 4 | 14 | 11.34 [6.3, 26.8] | Critical→Critical | PASS |
| HO-012 | heldout | CCC_Ward_03 | 2024-07-22 | 2 | 17 | 11.28 [7.6, 23.6] | Critical→Critical | PASS |
| HO-013 | heldout | CCC_Ward_02 | 2024-07-22 | 3 | 9 | 4.69 [2.4, 10.6] | High→Medium | PASS |
| HO-014 | heldout | DSCC_Ward_12 | 2024-07-22 | 3 | 15 | 8.32 [4.9, 17.2] | Critical→Medium | FAIL |
| HO-015 | heldout | DNCC_Ward_19 | 2024-07-22 | 4 | 19 | 11.13 [6.1, 26.4] | Critical→Critical | PASS |
| HO-016 | heldout | GCC_Ward_03 | 2024-08-12 | 2 | 29 | 14.43 [9.9, 29.4] | Critical→Critical | PASS |
| HO-017 | heldout | DSCC_Ward_04 | 2024-08-05 | 4 | 11 | 20.64 [12.1, 46.7] | High→Critical | FAIL |
| HO-018 | heldout | GCC_Ward_03 | 2024-08-12 | 3 | 18 | 14.53 [9.2, 28.3] | Critical→Critical | PASS |
| HO-019 | heldout | NCC_Ward_05 | 2024-08-26 | 2 | 12 | 10.86 [7.3, 22.9] | High→Critical | PASS |
| HO-020 | heldout | NCC_Ward_05 | 2024-08-19 | 4 | 18 | 12.45 [7.0, 29.2] | Critical→Critical | PASS |
| HO-021 | heldout | DNCC_Ward_09 | 2024-09-09 | 2 | 14 | 8.61 [5.6, 18.7] | Critical→Critical | PASS |
| HO-022 | heldout | NCC_Ward_01 | 2024-09-09 | 2 | 4 | 7.64 [4.9, 16.9] | Medium→High | FAIL |
| HO-023 | heldout | GCC_Ward_03 | 2024-09-16 | 3 | 8 | 5.65 [3.1, 12.4] | High→Medium | PASS |
| HO-024 | heldout | DSCC_Ward_07 | 2025-03-31 | 3 | 1 | 0.30 [0.0, 1.5] | Low→Low | PASS |
| HO-025 | heldout | DNCC_Ward_10 | 2025-04-14 | 4 | 1 | 1.14 [0.1, 4.2] | Low→Low | PASS |
| HO-026 | heldout | DSCC_Ward_10 | 2025-05-26 | 3 | 3 | 1.40 [0.3, 4.2] | Medium→Low | PASS |
| HO-027 | heldout | CCC_Ward_03 | 2025-05-26 | 4 | 10 | 4.44 [2.0, 11.9] | High→Medium | PASS |
| HO-028 | heldout | DNCC_Ward_12 | 2025-06-02 | 3 | 20 | 9.86 [6.0, 20.0] | Critical→High | FAIL |
| HO-029 | heldout | DNCC_Ward_12 | 2025-06-02 | 4 | 23 | 14.55 [8.3, 33.7] | Critical→Critical | PASS |
| HO-030 | heldout | DSCC_Ward_03 | 2025-06-16 | 2 | 12 | 17.45 [12.2, 34.9] | High→Critical | FAIL |
| HO-031 | heldout | DSCC_Ward_12 | 2025-06-23 | 2 | 16 | 16.96 [11.8, 34.0] | Critical→Critical | PASS |
| HO-032 | heldout | CCC_Ward_03 | 2025-06-23 | 3 | 21 | 10.33 [6.3, 20.8] | Critical→Critical | FAIL |
| HO-033 | heldout | DNCC_Ward_09 | 2025-06-16 | 4 | 6 | 14.70 [8.4, 34.0] | Medium→Critical | FAIL |
| HO-034 | heldout | DSCC_Ward_10 | 2025-06-23 | 4 | 14 | 10.45 [5.7, 24.9] | Critical→Critical | PASS |
| HO-035 | heldout | GCC_Ward_01 | 2025-07-14 | 2 | 15 | 7.71 [4.9, 17.0] | Critical→Medium | FAIL |
| HO-036 | heldout | DNCC_Ward_18 | 2025-07-14 | 3 | 8 | 10.20 [6.2, 20.6] | High→High | PASS |
| HO-037 | heldout | DNCC_Ward_09 | 2025-07-28 | 3 | 16 | 9.59 [5.8, 19.5] | Critical→High | PASS |
| HO-038 | heldout | GCC_Ward_04 | 2025-08-04 | 2 | 7 | 6.23 [3.8, 14.2] | Medium→Medium | PASS |
| HO-039 | heldout | DSCC_Ward_12 | 2025-07-28 | 4 | 17 | 10.61 [5.8, 25.3] | Critical→Critical | PASS |
| HO-040 | heldout | DNCC_Ward_19 | 2025-08-18 | 2 | 18 | 12.17 [8.2, 25.3] | Critical→Critical | PASS |
| HO-041 | heldout | NCC_Ward_01 | 2025-08-04 | 4 | 9 | 8.59 [4.6, 20.9] | High→High | PASS |
| HO-042 | heldout | CCC_Ward_10 | 2025-08-18 | 3 | 7 | 6.14 [3.4, 13.3] | Medium→High | PASS |
| HO-043 | heldout | DNCC_Ward_05 | 2025-08-18 | 3 | 18 | 8.69 [5.1, 17.9] | Critical→High | FAIL |
| HO-044 | heldout | GCC_Ward_05 | 2025-08-25 | 2 | 11 | 9.65 [6.4, 20.6] | High→Critical | PASS |
| HO-045 | heldout | CCC_Ward_03 | 2025-08-18 | 4 | 14 | 11.77 [6.5, 27.8] | Critical→Critical | PASS |
| HO-046 | heldout | DSCC_Ward_04 | 2025-09-15 | 2 | 16 | 9.14 [6.0, 19.7] | Critical→High | PASS |
| HO-047 | heldout | CCC_Ward_07 | 2025-10-06 | 2 | 1 | 0.62 [0.0, 2.7] | Low→Low | PASS |
| HO-048 | heldout | GCC_Ward_02 | 2025-09-29 | 3 | 1 | 0.28 [0.0, 1.5] | Low→Low | PASS |
