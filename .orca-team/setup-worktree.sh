#!/usr/bin/env bash
# Orca runs this in every new worktree (macOS / Linux / WSL / Git Bash).
# Orca → Onboarding checklist → Automate Workspace Setup (or the repo's setup settings):
#   bash .orca-team/setup-worktree.sh
# Never fails hard, so a setup hiccup never blocks an agent.

# .env normally arrives via .worktreeinclude; fall back to copying it from the main folder
if [ ! -f .env ]; then
  node .orca-team/tools/envtool.mjs sync >/dev/null 2>&1 || true
fi

# Root task runner (concurrently etc.)
if [ -f package.json ]; then
  echo "[setup] npm install (root)"; npm install --no-audit --no-fund || echo "[setup] root npm install failed (continuing)"
fi

# Web app
if [ -f apps/web/package.json ]; then
  echo "[setup] npm ci (apps/web)"
  ( cd apps/web && { npm ci --no-audit --no-fund || npm install --no-audit --no-fund; } ) || echo "[setup] web install failed (continuing)"
fi

# API (uv-managed Python)
if [ -f apps/api/pyproject.toml ]; then
  echo "[setup] uv sync (apps/api)"
  ( cd apps/api && uv sync ) || echo "[setup] uv sync failed (continuing) — is uv installed? run: node .orca-team/tools/doctor.mjs"
fi

# Any other package.json / pyproject.toml up to 3 levels deep (other layouts)
find . -maxdepth 3 \( -name package.json -o -name pyproject.toml \) \
  -not -path "*/node_modules/*" -not -path "./package.json" -not -path "./apps/web/*" -not -path "./apps/api/*" \
  | while read -r f; do
      d=$(dirname "$f")
      case "$f" in
        *package.json)   echo "[setup] npm install ($d)"; ( cd "$d" && npm install --no-audit --no-fund ) || true ;;
        *pyproject.toml) echo "[setup] uv sync ($d)";     ( cd "$d" && uv sync ) || true ;;
      esac
    done

echo "[setup] done"
exit 0
