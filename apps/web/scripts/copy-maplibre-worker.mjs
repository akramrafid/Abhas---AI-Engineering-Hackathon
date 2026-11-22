#!/usr/bin/env node
// MapLibre loads its web worker relative to its own module URL, which bundling breaks.
// Serve the worker from /vendor/maplibre/ instead; WardRiskMap points setWorkerUrl at it.
// Runs on postinstall/predev/prebuild so the copy always matches the installed version.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(web, "node_modules", "maplibre-gl", "dist", "maplibre-gl-worker.mjs");
const targetDir = path.join(web, "public", "vendor", "maplibre");

if (!existsSync(source)) {
  console.warn("maplibre-gl is not installed yet; skipping worker copy.");
  process.exit(0);
}
mkdirSync(targetDir, { recursive: true });
copyFileSync(source, path.join(targetDir, "maplibre-gl-worker.mjs"));
