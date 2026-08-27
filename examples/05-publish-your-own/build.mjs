#!/usr/bin/env node
// Same end goal as build.sh, but the middle steps go through @0gzk/sdk/build
// instead of `npx snarkjs`. The only shellout left is `circom` itself (no JS
// bindings). Output is a circuit_bundle/ identical to what build.sh produces.
//
// After building, this also runs `0gzk publish --register` so a single
// `node build.mjs` takes you from .circom to a CircuitRegistry entry.
// Pass --no-publish to stop after the bundle.

import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { buildCircuitBundle } from "@0gzk/sdk/build";

const here = path.dirname(fileURLToPath(import.meta.url));
const CIRCUIT_NAME = "private_multiply";
const CIRCUIT_VERSION = "0.1.0";
const PTAU_SIZE = 12;

const buildDir = path.join(here, "build");
const bundleDir = path.join(here, "circuit_bundle");
const skipPublish = process.argv.includes("--no-publish");

await loadDotenv(path.join(here, ".env"));
await fs.mkdir(buildDir, { recursive: true });

// 1. circom -> r1cs + wasm. The SDK does not shell out to non-npm tools by
// design, so the example does it explicitly. If circom isn't on PATH this is
// the line you'll see fail.
await runCircom([
  path.join(here, `${CIRCUIT_NAME}.circom`),
  "--r1cs",
  "--wasm",
  "--sym",
  "-o",
  buildDir,
]);

// 2-6. Powers of Tau download/cache, groth16 setup + contribution, vkey/
// verifier export, bundle assembly. All in one SDK call.
const result = await buildCircuitBundle({
  r1csPath: path.join(buildDir, `${CIRCUIT_NAME}.r1cs`),
  wasmPath: path.join(buildDir, `${CIRCUIT_NAME}_js`, `${CIRCUIT_NAME}.wasm`),
  metadataPath: path.join(here, "metadata.json"),
  outputDir: bundleDir,
  ptauSize: PTAU_SIZE,
  contributionName: `0gzk-example-${CIRCUIT_NAME}`,
  onProgress: (e) => console.log(`==> [${e.stage}] ${e.message}`),
});

console.log("");
console.log(`Build done. Bundle ready at ${result.bundleDir}`);
console.log(`vkeyHash: ${result.vkeyHash}`);
console.log("");

if (skipPublish) {
  console.log("Skipping publish (--no-publish). Run when ready:");
  console.log("  npx @0gzk/cli@^0.2.1 publish circuit_bundle --register \\");
  console.log(`    --metadata-uri "0gzk://${CIRCUIT_NAME}@${CIRCUIT_VERSION}" --wait 10m`);
  process.exit(0);
}

if (!process.env.OG_PRIVATE_KEY) {
  console.error("error: OG_PRIVATE_KEY is not set.");
  console.error("       Copy .env.example to .env and fill it in, or pass --no-publish");
  console.error("       to stop after the bundle build.");
  process.exit(1);
}

// 7. Publish. Inherits stdio so the CLI's progress logs (rootHash, segment
// counts, finalization, registry tx hashes) stream straight to this terminal.
console.log("==> [publish] handing the bundle to @0gzk/cli...");
console.log("");
const exitCode = await runPublish();
if (exitCode !== 0) process.exit(exitCode);

function runCircom(args) {
  return new Promise((resolve, reject) => {
    console.log(`==> [compile] circom ${args.join(" ")}`);
    const child = spawn("circom", args, { stdio: "inherit", shell: process.platform === "win32" });
    child.on("error", (err) => {
      if (err.code === "ENOENT") {
        reject(
          new Error(
            "circom not on PATH. Install: https://docs.circom.io/getting-started/installation/",
          ),
        );
      } else {
        reject(err);
      }
    });
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`circom exited with code ${code}`)),
    );
  });
}

function runPublish() {
  return new Promise((resolve, reject) => {
    const args = [
      "--yes",
      "@0gzk/cli@^0.2.1",
      "publish",
      "circuit_bundle",
      "--register",
      "--metadata-uri",
      `0gzk://${CIRCUIT_NAME}@${CIRCUIT_VERSION}`,
      "--wait",
      "10m",
    ];
    const child = spawn("npx", args, {
      stdio: "inherit",
      cwd: here,
      env: process.env,
      shell: process.platform === "win32",
    });
    child.on("error", reject);
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

// Tiny .env loader. Avoids adding `dotenv` as a dep just for the example.
// Format: KEY=VALUE, one per line. `#` starts a comment. Surrounding single
// or double quotes are stripped. Existing process.env values win.
async function loadDotenv(envPath) {
  let raw;
  try {
    raw = await fs.readFile(envPath, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return;
    throw err;
  }
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}
