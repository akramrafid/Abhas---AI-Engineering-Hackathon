# Abhas Eval Report (heldout)

- **Timestamp:** 2026-11-21T20:54:59+00:00 · **Commit:** `c5200f4` · **Model:** `abhas-lgbm-1.1.2` · **Judge:** `-`
- **Golden pass rate:** 83.33% (40/48, threshold 80%) · **p95 inference:** 0.59 ms/ward
- **Global hold-out:** coverage_80=0.845 · within_one_tier=0.960 · critical_recall=0.932 · macro_f1=0.509 · floors_passed=True

## Global Metrics by Horizon
| Horizon | Model MAE | Clim MAE | Δ vs Clim | Seasonal Naive | Persistence | No-Weather | RMSE | Poisson Dev | Cov 80% |
|---|---|---|---|---|---|---|---|---|---|
| h=1 | 0.944 | 1.259 | +25.0% | 1.693 | 1.409 | 1.235 | 1.835 | 0.777 | 0.859 |
| h=2 | 0.991 | 1.259 | +21.3% | 1.693 | 1.659 | 1.242 | 1.968 | 0.816 | 0.852 |
| h=3 | 1.010 | 1.259 | +19.8% | 1.693 | 1.869 | 1.239 | 1.963 | 0.862 | 0.832 |
| h=4 | 1.193 | 1.259 | +5.2% | 1.693 | 2.056 | 1.248 | 2.295 | 1.085 | 0.839 |

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
| `golden_pass_rate_ge_threshold` | PASS |

## Golden Cases
| ID | Split | Ward | Origin | h | Actual | Expected [P10, P90] | Tier (Act→Pred) | Pass |
|---|---|---|---|---|---|---|---|---|
| HO-001 | heldout | DNCC_Ward_04 | 2023-12-18 | 2 | 0 | 0.01 [0.0, 0.3] | Low→Low | PASS |
| HO-002 | heldout | CCC_Ward_08 | 2023-12-18 | 3 | 0 | 0.01 [0.0, 0.3] | Low→Low | PASS |
| HO-003 | heldout | DSCC_Ward_09 | 2023-12-18 | 4 | 0 | 0.03 [0.0, 0.5] | Low→Low | PASS |
| HO-004 | heldout | NCC_Ward_02 | 2024-01-29 | 2 | 0 | 0.07 [0.0, 0.9] | Low→Low | PASS |
| HO-005 | heldout | DNCC_Ward_10 | 2024-04-08 | 2 | 4 | 0.94 [0.2, 4.0] | Medium→Low | FAIL |
| HO-006 | heldout | CCC_Ward_05 | 2024-06-17 | 3 | 7 | 3.69 [2.0, 10.6] | Medium→Medium | PASS |
| HO-007 | heldout | DSCC_Ward_12 | 2024-06-10 | 4 | 7 | 6.72 [3.6, 18.4] | Medium→High | PASS |
| HO-008 | heldout | DNCC_Ward_04 | 2024-07-01 | 2 | 8 | 4.73 [2.7, 12.7] | High→Medium | PASS |
| HO-009 | heldout | DNCC_Ward_19 | 2024-07-01 | 2 | 15 | 7.49 [4.8, 18.4] | Critical→High | PASS |
| HO-010 | heldout | DSCC_Ward_04 | 2024-07-01 | 3 | 18 | 14.65 [9.9, 33.5] | Critical→Critical | PASS |
| HO-011 | heldout | CCC_Ward_03 | 2024-07-01 | 4 | 14 | 11.34 [6.6, 29.2] | Critical→Critical | PASS |
| HO-012 | heldout | CCC_Ward_03 | 2024-07-22 | 2 | 17 | 11.28 [7.6, 26.1] | Critical→Critical | PASS |
| HO-013 | heldout | CCC_Ward_02 | 2024-07-22 | 3 | 9 | 4.69 [2.7, 12.8] | High→High | PASS |
| HO-014 | heldout | DSCC_Ward_12 | 2024-07-22 | 3 | 15 | 8.32 [5.3, 20.4] | Critical→Medium | FAIL |
| HO-015 | heldout | DNCC_Ward_19 | 2024-07-22 | 4 | 19 | 11.13 [6.4, 28.7] | Critical→Critical | PASS |
| HO-016 | heldout | GCC_Ward_03 | 2024-08-12 | 2 | 29 | 14.43 [9.9, 32.4] | Critical→Critical | PASS |
| HO-017 | heldout | DSCC_Ward_04 | 2024-08-05 | 4 | 11 | 20.64 [12.6, 50.8] | High→Critical | FAIL |
| HO-018 | heldout | GCC_Ward_03 | 2024-08-12 | 3 | 18 | 14.53 [9.9, 33.3] | Critical→Critical | PASS |
| HO-019 | heldout | NCC_Ward_05 | 2024-08-26 | 2 | 12 | 10.86 [7.3, 25.2] | High→Critical | PASS |
| HO-020 | heldout | NCC_Ward_05 | 2024-08-19 | 4 | 18 | 12.45 [7.3, 31.8] | Critical→Critical | PASS |
| HO-021 | heldout | DNCC_Ward_09 | 2024-09-09 | 2 | 14 | 8.61 [5.6, 20.7] | Critical→High | PASS |
| HO-022 | heldout | NCC_Ward_01 | 2024-09-09 | 2 | 4 | 7.64 [4.9, 18.7] | Medium→High | FAIL |
| HO-023 | heldout | GCC_Ward_03 | 2024-09-16 | 3 | 8 | 5.65 [3.4, 14.8] | High→Medium | PASS |
| HO-024 | heldout | DSCC_Ward_07 | 2025-03-31 | 3 | 1 | 0.30 [0.0, 2.0] | Low→Low | PASS |
| HO-025 | heldout | DNCC_Ward_10 | 2025-04-14 | 4 | 1 | 1.14 [0.2, 4.7] | Low→Low | PASS |
| HO-026 | heldout | DSCC_Ward_10 | 2025-05-26 | 3 | 3 | 1.40 [0.4, 5.2] | Medium→Low | PASS |
| HO-027 | heldout | CCC_Ward_03 | 2025-05-26 | 4 | 10 | 4.44 [2.2, 13.0] | High→Low | FAIL |
| HO-028 | heldout | DNCC_Ward_12 | 2025-06-02 | 3 | 20 | 9.86 [6.4, 23.6] | Critical→Critical | PASS |
| HO-029 | heldout | DNCC_Ward_12 | 2025-06-02 | 4 | 23 | 14.55 [8.7, 36.7] | Critical→Critical | PASS |
| HO-030 | heldout | DSCC_Ward_03 | 2025-06-16 | 2 | 12 | 17.45 [12.2, 38.4] | High→Critical | FAIL |
| HO-031 | heldout | DSCC_Ward_12 | 2025-06-23 | 2 | 16 | 16.96 [11.8, 37.4] | Critical→Critical | PASS |
| HO-032 | heldout | CCC_Ward_03 | 2025-06-23 | 3 | 21 | 10.33 [6.8, 24.6] | Critical→Critical | PASS |
| HO-033 | heldout | DNCC_Ward_09 | 2025-06-16 | 4 | 6 | 14.70 [8.7, 37.0] | Medium→Critical | FAIL |
| HO-034 | heldout | DSCC_Ward_10 | 2025-06-23 | 4 | 14 | 10.45 [6.0, 27.1] | Critical→Critical | PASS |
| HO-035 | heldout | GCC_Ward_01 | 2025-07-14 | 2 | 15 | 7.71 [4.9, 18.9] | Critical→Medium | FAIL |
| HO-036 | heldout | DNCC_Ward_18 | 2025-07-14 | 3 | 8 | 10.20 [6.7, 24.3] | High→High | PASS |
| HO-037 | heldout | DNCC_Ward_09 | 2025-07-28 | 3 | 16 | 9.59 [6.2, 23.1] | Critical→High | PASS |
| HO-038 | heldout | GCC_Ward_04 | 2025-08-04 | 2 | 7 | 6.23 [3.8, 15.8] | Medium→Medium | PASS |
| HO-039 | heldout | DSCC_Ward_12 | 2025-07-28 | 4 | 17 | 10.61 [6.1, 27.5] | Critical→Critical | PASS |
| HO-040 | heldout | DNCC_Ward_19 | 2025-08-18 | 2 | 18 | 12.17 [8.2, 27.9] | Critical→Critical | PASS |
| HO-041 | heldout | NCC_Ward_01 | 2025-08-04 | 4 | 9 | 8.59 [4.8, 22.8] | High→Medium | PASS |
| HO-042 | heldout | CCC_Ward_10 | 2025-08-18 | 3 | 7 | 6.14 [3.7, 15.9] | Medium→High | PASS |
| HO-043 | heldout | DNCC_Ward_05 | 2025-08-18 | 3 | 18 | 8.69 [5.6, 21.2] | Critical→High | PASS |
| HO-044 | heldout | GCC_Ward_05 | 2025-08-25 | 2 | 11 | 9.65 [6.4, 22.8] | High→Critical | PASS |
| HO-045 | heldout | CCC_Ward_03 | 2025-08-18 | 4 | 14 | 11.77 [6.8, 30.2] | Critical→Critical | PASS |
| HO-046 | heldout | DSCC_Ward_04 | 2025-09-15 | 2 | 16 | 9.14 [6.0, 21.8] | Critical→High | PASS |
| HO-047 | heldout | CCC_Ward_07 | 2025-10-06 | 2 | 1 | 0.62 [0.0, 3.1] | Low→Low | PASS |
| HO-048 | heldout | GCC_Ward_02 | 2025-09-29 | 3 | 1 | 0.28 [0.0, 1.9] | Low→Low | PASS |
