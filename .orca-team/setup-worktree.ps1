# Orca runs this in every new worktree (Windows PowerShell).
# Orca → Onboarding checklist → Automate Workspace Setup (or the repo's setup settings):
#   powershell -ExecutionPolicy Bypass -File .orca-team/setup-worktree.ps1
# Never fails hard, so a setup hiccup never blocks an agent.
$ErrorActionPreference = "Continue"

# .env normally arrives via .worktreeinclude; fall back to copying it from the main folder
if (-not (Test-Path ".env")) {
  try { node .orca-team/tools/envtool.mjs sync | Out-Null } catch { }
}

# Root task runner (concurrently etc.)
if (Test-Path "package.json") {
  Write-Host "[setup] npm install (root)"
  npm install --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { Write-Host "[setup] root npm install failed (continuing)" }
}

# Web app
if (Test-Path "apps/web/package.json") {
  Write-Host "[setup] npm ci (apps/web)"
  Push-Location "apps/web"
  npm ci --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { npm install --no-audit --no-fund }
  Pop-Location
}

# API (uv-managed Python)
if (Test-Path "apps/api/pyproject.toml") {
  Write-Host "[setup] uv sync (apps/api)"
  Push-Location "apps/api"
  try { uv sync } catch { Write-Host "[setup] uv sync failed (continuing) - is uv installed? run: node .orca-team/tools/doctor.mjs" }
  Pop-Location
}

# Any other package.json / pyproject.toml up to 3 levels deep (other layouts)
Get-ChildItem -Path . -Recurse -Depth 2 -File -Include package.json, pyproject.toml -ErrorAction SilentlyContinue |
  Where-Object { $_.FullName -notmatch "node_modules" -and $_.DirectoryName -ne (Get-Location).Path `
                 -and $_.FullName -notmatch "[\\/]apps[\\/](web|api)[\\/]" } |
  ForEach-Object {
    Push-Location $_.DirectoryName
    if ($_.Name -eq "package.json") { Write-Host "[setup] npm install ($($_.DirectoryName))"; npm install --no-audit --no-fund }
    else { Write-Host "[setup] uv sync ($($_.DirectoryName))"; try { uv sync } catch { } }
    Pop-Location
  }

Write-Host "[setup] done"
exit 0
