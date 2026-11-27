# Abhas Phase 2 — Operational Dispatch Exports

Generated deterministically and offline (`ABHAS_OFFLINE=1`) from the running Abhas API.

## Provenance

- **Git commit:** `96f982dd9d8e1a85815c802c572bcee11200c9b3` (`96f982d`)
- **API reported `git_sha`:** `96f982d`
- **Model version:** `abhas-lgbm-1.1.2`
- **Data as of:** `2025-12-29`
- **Offline mode:** `true`
- **Generated at (UTC):** `2026-11-27T10:47:41.631657Z`
- **Command:** `npm run exports` (`node scripts/export_samples.mjs`)

## Pinned Scenario Inputs

- `origin_week`: `2024-08-05`
- `scope`: `Dhaka South`
- `brief_ward_id`: `DSCC_Ward_04`
- `stock_pct`: `60`
- `total_crews`: `10`
- `channels`: `["sms", "whatsapp", "brief"]`

## Files

| File | Description | Size (bytes) |
|---|---|---:|
| `sms_en.txt` | 20 English GSM-7 SMS notices (max 1 segment) | 3511 |
| `sms_bn.txt` | 20 Bangla UCS-2 SMS notices (max 3 segments) | 8310 |
| `whatsapp_en.txt` | 20 English structured WhatsApp operational alerts | 9737 |
| `whatsapp_bn.txt` | 20 Bangla structured WhatsApp operational alerts | 24466 |
| `brief_DSCC_Ward_04_en.html` | Self-contained A4 portrait English commissioner brief for DSCC_Ward_04 | 8828 |
| `brief_DSCC_Ward_04_bn.html` | Self-contained A4 portrait Bangla commissioner brief for DSCC_Ward_04 | 10164 |
| `brief_DSCC_Ward_04_en.pdf` | Playwright A4 PDF rendered offline from brief_DSCC_Ward_04_en.html | 85388 |
| `brief_DSCC_Ward_04_bn.pdf` | Playwright A4 PDF rendered offline from brief_DSCC_Ward_04_bn.html | 109129 |
