# CREDENTIALS.md — what the project needs (names only, NEVER values)

LEAD maintains this file (skill `credentials-gate`). Values live only in the main project folder's `.env`.

## Status
Nothing requested yet.

## Needed
| Variable | Service | Needed for | Required? | Local / mock alternative | Status |
|---|---|---|---|---|---|

Status values: `MISSING` · `PROVIDED` (envtool check = OK) · `LOCAL` (using local Docker/embedded default) ·
`MOCK` (human said skip; feature runs on mock data) · `NOT-NEEDED`.

## How the human provides them
1. Open the `.env` file in the main project folder (envtool prints the exact path).
2. Fill the values next to the variable names marked MISSING. Save.
3. Tell LEAD: `creds done` (or `skip <VAR> → mock`).
