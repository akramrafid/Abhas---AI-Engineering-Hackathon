#!/usr/bin/env node
// Prepare an isolated SQLite database (data/abhas-test.db) for APP_ENV=test / Playwright E2E
// so test runs never pollute data/abhas.db with test plans (QA Q12).
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(root, "data");
const devDb = path.join(dataDir, "abhas.db");
const testDb = path.join(dataDir, "abhas-test.db");

fs.mkdirSync(dataDir, { recursive: true });

// Remove stale test DB & WAL sidecars for a clean slate.
for (const suffix of ["", "-wal", "-shm", "-journal"]) {
  const p = `${testDb}${suffix}`;
  if (fs.existsSync(p)) {
    try {
      fs.unlinkSync(p);
    } catch {
      // Ignore if locked on retry; migration step below will still run cleanly.
    }
  }
}

const testDbUrl = `sqlite:///${testDb.replaceAll("\\", "/")}`;
const env = { ...process.env, DATABASE_URL: testDbUrl, APP_ENV: "test" };

function runPy(args) {
  const r = spawnSync("node", [path.join(root, "scripts", "py.mjs"), ...args], {
    cwd: root,
    env,
    stdio: "inherit",
  });
  if (r.status !== 0) {
    process.exit(r.status ?? 1);
  }
}

if (fs.existsSync(devDb)) {
  // Fast path: copy seeded dev DB, run migrations, and clear user/test plans from the test copy.
  fs.copyFileSync(devDb, testDb);
  runPy(["-m", "alembic", "upgrade", "head"]);
  runPy([
    "-c",
    "import sqlite3, sys; c = sqlite3.connect(sys.argv[1]); c.execute('DELETE FROM plans'); c.execute('DELETE FROM dispatch_log'); c.execute('DELETE FROM ambulance_requests'); c.execute('DELETE FROM bed_updates'); c.execute('DELETE FROM hospitals'); c.commit(); c.close()",
    testDb,
  ]);
  runPy(["-c", "from app.adapters.db.engine import create_db_engine; from app.adapters.db.facilities_repo import seed_hospitals_from_geojson; import os; seed_hospitals_from_geojson(create_db_engine(os.environ['DATABASE_URL']))"]);
} else {
  // Fresh clone without data/abhas.db yet: migrate and seed test DB directly.
  runPy(["-m", "alembic", "upgrade", "head"]);
  runPy(["-m", "scripts.seed"]);
}
