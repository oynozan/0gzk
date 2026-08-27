// Browser-side ZK proving against ANY 0gzk circuit, end-to-end:
//
//   1. Look up <name>@<version> in CircuitRegistry via ethers + JSON-RPC.
//   2. Fetch the bundle (.tar.gz) from 0G Storage through the Vite dev proxy.
//   3. Decompress + untar in the browser.
//   4. Render an input form from `bundle.metadata.inputs`.
//   5. Hand the user-filled inputs to @0gzk/sdk's generateProof.
//   6. Verify locally and surface results.
//
// No backend, no witness ever leaves the browser tab. The form is rebuilt
// from each circuit's metadata.json - this same page works for every 0gzk
// circuit ever published, no source edits.

import { JsonRpcProvider } from "ethers";
import {
  getRegistryContract,
  getLatest,
  getVersion,
  parseNameSpec,
  type ResolvedRecord,
} from "@0gzk/sdk/onchain";
import {
  generateProof,
  verifyLocal,
  InputValidationError,
  type BundleFiles,
  type CircuitMetadata,
  type InputSpec,
} from "@0gzk/sdk";
import { gunzipSync } from "fflate";

import { parseTar } from "./tar";

const RPC_URL = "https://evmrpc-testnet.0g.ai";
// `/0g-storage` is the dev proxy declared in vite.config.ts. In production,
// replace with whatever CORS-friendly proxy you've set up.
const STORAGE_PREFIX = "/0g-storage";

// Click-through defaults for the four published reference circuits, taken
// directly from each circuit's example_input.json. The Poseidon-derived
// values (hash, commitment, root) are precomputed - this example does NOT
// ship a Poseidon implementation, so for a circuit not on this list the user
// either supplies matching values themselves or runs a derivation script
// (e.g. circuits/poseidon_preimage/derive_input.mjs in the repo).
const DEFAULTS: Record<string, Record<string, unknown>> = {
  age_verification: {
    birthYear: "1990",
    currentYear: "2026",
    minAge: "18",
  },
  poseidon_preimage: {
    preimage: "1",
    hash: "18586133768512220936620570745912940619677854269274689475585506675881198879027",
  },
  merkle_membership: {
    leaf: "42",
    pathElements: [
      "5",
      "19419916100242727769718322657520778503680617689214632373938093157277816551712",
      "3330844108758711782672220159612173083623710937399719017074673646455206473965",
      "14888979664003708571660847718791296103112999134302095820460705268575071148941",
      "9939113045095121889354854682572652954047275641959771961210482519768730471241",
      "19282015628922127800480820555547397056353015449753758267095927079286904767653",
      "3650329808845676617764212353297381125697956474661841334799419125850451469150",
      "7051805641122928685964058716182123573006631027764007689791632256884911984669",
    ],
    pathIndices: ["1", "0", "1", "0", "0", "0", "0", "0"],
    root: "19519582416836444743729137301235125288748221689739202679275011757490027208126",
  },
  private_balance_threshold: {
    balance: "1000000",
    salt: "12345",
    commitment: "9234216329725396764564263467186562171366095637085775062683540012292486796439",
    threshold: "100000",
  },
};

const schemaForm = document.getElementById("schema-form") as HTMLFormElement;
const specInput = document.getElementById("spec") as HTMLInputElement;
const loadBtn = document.getElementById("load-btn") as HTMLButtonElement;
const proveForm = document.getElementById("prove-form") as HTMLFormElement;
const proveBtn = document.getElementById("prove-btn") as HTMLButtonElement;
const inputFields = document.getElementById("input-fields") as HTMLDivElement;
const circuitMeta = document.getElementById("circuit-meta") as HTMLDivElement;
const step2Heading = document.getElementById("step-2-heading") as HTMLElement;
const logEl = document.getElementById("log") as HTMLPreElement;

// Single source of truth for the loaded circuit. Cleared on a fresh Load.
let currentBundle: BundleFiles | null = null;
let currentRecord: ResolvedRecord | null = null;

function log(msg: string, cls?: "ok" | "warn" | "err" | "dim"): void {
  logEl.innerHTML += `\n<span${cls ? ` class="${cls}"` : ""}>${msg}</span>`;
}

function resetLog(): void {
  logEl.innerHTML = "";
}

// Bundle fetch: pull the .tar.gz from 0G Storage, gunzip, untar, return the
// in-memory BundleFiles the SDK expects.
async function fetchBundleFromStorage(rootHash: string): Promise<BundleFiles> {
  const res = await fetch(`${STORAGE_PREFIX}/file?root=${rootHash}`);
  if (!res.ok) throw new Error(`0G Storage HTTP ${res.status}`);
  const gz = new Uint8Array(await res.arrayBuffer());
  const tar = gunzipSync(gz);
  const entries = parseTar(tar);

  const find = (name: string): Uint8Array => {
    const e = entries.find((x) => x.name === name);
    if (!e) {
      throw new Error(
        `Bundle is missing ${name} (found: ${entries.map((x) => x.name).join(", ")})`,
      );
    }
    return e.bytes;
  };

  const metadata = JSON.parse(
    new TextDecoder().decode(find("metadata.json")),
  ) as CircuitMetadata;
  const wasm = find(metadata.files.wasm);
  const zkey = find(metadata.files.zkey);
  const vkey = JSON.parse(new TextDecoder().decode(find(metadata.files.vkey)));

  return { wasm, zkey, vkey, metadata };
}

async function resolveOnChain(
  spec: { name: string; version?: string },
): Promise<ResolvedRecord> {
  const provider = new JsonRpcProvider(RPC_URL);
  const registry = getRegistryContract(provider);
  const lookup = spec.version
    ? {
        version: spec.version,
        record: await getVersion(registry, spec.name, spec.version),
      }
    : await getLatest(registry, spec.name);
  return { name: spec.name, version: lookup.version, ...lookup.record };
}

// Schema-driven form: rebuild the input fields from bundle.metadata.inputs
// every time a different circuit is loaded.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function widgetFor(name: string, spec: InputSpec, defaultValue: unknown): string {
  const isArray = spec.type.endsWith("[]");
  const baseType = isArray ? spec.type.slice(0, -2) : spec.type;
  const id = `field--${name}`;

  if (isArray) {
    const value =
      defaultValue === undefined
        ? ""
        : JSON.stringify(defaultValue, null, 2);
    const lengthHint = spec.length !== undefined ? ` (length ${spec.length})` : "";
    return (
      `<textarea id="${id}" data-name="${name}" data-type="${spec.type}" ` +
      `placeholder='JSON array of ${baseType}${lengthHint}, e.g. ["1", "2", "3"]'>` +
      escapeHtml(value) +
      `</textarea>`
    );
  }

  if (baseType === "bool") {
    const value = defaultValue === undefined ? "" : String(defaultValue);
    return (
      `<select id="${id}" data-name="${name}" data-type="${spec.type}">` +
      `<option value="" ${value === "" ? "selected" : ""}>(pick one)</option>` +
      `<option value="true" ${value === "true" || value === "1" ? "selected" : ""}>true</option>` +
      `<option value="false" ${value === "false" || value === "0" ? "selected" : ""}>false</option>` +
      `</select>`
    );
  }

  // uint, field, or any forward-compatible scalar type.
  const value = defaultValue === undefined ? "" : String(defaultValue);
  const placeholder =
    baseType === "field"
      ? "decimal integer or 0x...; 0 <= n < bn128 modulus"
      : baseType === "uint"
        ? "non-negative integer"
        : baseType;
  return (
    `<input type="text" id="${id}" data-name="${name}" data-type="${spec.type}" ` +
    `value="${escapeHtml(value)}" placeholder="${placeholder}">`
  );
}

function renderCircuitMeta(): void {
  if (!currentBundle || !currentRecord) {
    circuitMeta.innerHTML = "";
    return;
  }
  const m = currentBundle.metadata;
  const inputCount = Object.keys(m.inputs).length;
  const publicCount = Object.values(m.inputs).filter(
    (i) => i.visibility === "public",
  ).length;
  const privateCount = inputCount - publicCount;
  const outputCount = Object.keys(m.outputs ?? {}).length;

  circuitMeta.innerHTML = `
    <p class="meta-line"><strong>${escapeHtml(m.name)}</strong> v${escapeHtml(m.version)} - ${escapeHtml(m.protocol)} on ${escapeHtml(m.curve)}</p>
    ${m.description ? `<p class="meta-line dim">${escapeHtml(m.description)}</p>` : ""}
    <p class="meta-line dim">${privateCount} private + ${publicCount} public input${inputCount === 1 ? "" : "s"}; ${outputCount} output${outputCount === 1 ? "" : "s"}.</p>
    <p class="meta-line dim">rootHash <code>${escapeHtml(currentRecord.rootHash.slice(0, 14))}...</code> | <a href="https://chainscan-galileo.0g.ai/address/${escapeHtml(currentRecord.publisher)}" target="_blank" rel="noopener">publisher</a></p>
  `;
}

function renderInputFields(): void {
  if (!currentBundle) {
    inputFields.innerHTML = "";
    return;
  }
  const meta = currentBundle.metadata;
  const defaults = DEFAULTS[meta.name] ?? {};

  const rows = Object.entries(meta.inputs).map(([name, spec]) => {
    const tag = `<span class="visibility-tag ${spec.visibility}">${spec.visibility}</span>`;
    const widget = widgetFor(name, spec, defaults[name]);
    const hint = spec.description
      ? `<div class="field-hint">${tag} <code>${escapeHtml(spec.type)}</code> - ${escapeHtml(spec.description)}</div>`
      : `<div class="field-hint">${tag} <code>${escapeHtml(spec.type)}</code></div>`;
    return `
      <label for="field--${escapeHtml(name)}">${escapeHtml(name)}</label>
      ${widget}
      ${hint}
    `;
  });

  inputFields.innerHTML = rows.join("");
}

// Read the user-filled form back into an object the SDK can validate.
interface CollectedInputs {
  inputs: Record<string, unknown>;
  parseErrors: string[];
}

function collectInputs(meta: CircuitMetadata): CollectedInputs {
  const inputs: Record<string, unknown> = {};
  const parseErrors: string[] = [];

  for (const [name, spec] of Object.entries(meta.inputs)) {
    const el = inputFields.querySelector<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >(`[data-name="${name}"]`);
    if (!el) {
      parseErrors.push(`${name}: no widget rendered`);
      continue;
    }

    const raw = el.value.trim();

    if (spec.type.endsWith("[]")) {
      if (raw === "") {
        parseErrors.push(`${name}: array is empty`);
        continue;
      }
      try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
          parseErrors.push(`${name}: expected JSON array, got ${typeof parsed}`);
          continue;
        }
        // Stringify each element so the SDK's coercion handles them
        // uniformly (avoids JS number precision issues for big field values).
        inputs[name] = parsed.map((v) =>
          typeof v === "string" || typeof v === "number" ? String(v) : v,
        );
      } catch (err) {
        parseErrors.push(
          `${name}: JSON parse failed (${err instanceof Error ? err.message : String(err)})`,
        );
      }
      continue;
    }

    if (raw === "") {
      parseErrors.push(`${name}: required`);
      continue;
    }
    inputs[name] = raw;
  }

  return { inputs, parseErrors };
}

// Result rendering: name the public signals, show validity, plus a built-in
// dApp-gate verdict for age_verification (the only reference circuit with a
// non-trivial output).
function namePublicSignals(
  metadata: CircuitMetadata,
  values: string[],
): Array<{ name: string; value: string; kind: "output" | "public-input" }> {
  // snarkjs lays public signals out in metadata declaration order: outputs
  // first, then every input marked `visibility: "public"`. Pair each value
  // with its declared name so the result panel says "isAdult = 0" instead
  // of an opaque ["0", ...].
  const names: Array<{ name: string; kind: "output" | "public-input" }> = [
    ...Object.keys(metadata.outputs ?? {}).map((n) => ({
      name: n,
      kind: "output" as const,
    })),
    ...Object.entries(metadata.inputs)
      .filter(([, v]) => v.visibility === "public")
      .map(([n]) => ({ name: n, kind: "public-input" as const })),
  ];
  return values.map((value, i) => ({
    name: names[i]?.name ?? `signal[${i}]`,
    kind: names[i]?.kind ?? "output",
    value,
  }));
}

function renderResult(
  bundle: BundleFiles,
  proof: { proof: unknown; publicSignals: string[] },
  verified: boolean,
): void {
  // verifyLocal answers a cryptographic question: "is this proof internally
  // consistent with this verification key?" It does NOT answer the policy
  // question: "does the statement the proof attests to mean my dApp should
  // grant access?" That's the consumer's job - see ../03-verify-on-chain.
  log("\n=== proof validity ===", verified ? "ok" : "err");
  log(`proof is ${verified ? "VALID" : "INVALID"} (cryptographic check only)`);

  const named = namePublicSignals(bundle.metadata, proof.publicSignals);
  if (named.length > 0) {
    log("\n=== public signals (by metadata name) ===");
    for (const sig of named) {
      log(`  ${sig.name.padEnd(14)} = ${sig.value}    `, "dim");
      log(`(${sig.kind})`, "dim");
    }
  }

  // Built-in policy verdict for age_verification, since that's the only
  // reference circuit with a non-trivial output. For other circuits the
  // proof is shown, the policy interpretation just isn't hard-coded.
  if (bundle.metadata.name === "age_verification" && verified) {
    const isAdult = named.find((s) => s.name === "isAdult")?.value;
    log(
      "\n=== dApp gate verdict (age_verification) ===",
      isAdult === "1" ? "ok" : "warn",
    );
    if (isAdult === "1") {
      log("PASS - a real gate (e.g. AgeGate.sol) would accept this proof:");
      log("  verifyProof(...) -> true");
      log("  pubSignals[isAdult] == 1");
    } else {
      log("REJECT - the proof is valid, but the policy fails:");
      log("  verifyProof(...) -> true");
      log("  pubSignals[isAdult] == 0  // would revert NotAnAdult()");
      log(
        "\nTry birthYear <= 2008 (older than 18 in 2026) to see the PASS path. " +
          "See ../03-verify-on-chain/src/AgeGate.sol for the on-chain check.",
      );
    }
  }
}

// Step 1: resolve + fetch the bundle, then render its input form.
async function loadSchema(): Promise<void> {
  resetLog();
  loadBtn.disabled = true;
  proveForm.hidden = true;
  step2Heading.hidden = true;
  inputFields.innerHTML = "";
  currentBundle = null;
  currentRecord = null;
  renderCircuitMeta();

  try {
    const spec = parseNameSpec(specInput.value.trim());
    if (!spec.name) throw new Error("circuit name is required");

    log(`[1/2] Resolving ${spec.name}${spec.version ? `@${spec.version}` : ""} on Galileo...`);
    const t0 = performance.now();
    const record = await resolveOnChain(spec);
    log(
      `      version=${record.version} rootHash=${record.rootHash.slice(0, 14)}... ` +
        `(${Math.round(performance.now() - t0)} ms)`,
    );

    log("[2/2] Downloading bundle from 0G Storage + untarring...");
    const t1 = performance.now();
    const bundle = await fetchBundleFromStorage(record.rootHash);
    log(
      `      ${bundle.wasm.byteLength} B wasm + ${bundle.zkey.byteLength} B zkey ` +
        `(${Math.round(performance.now() - t1)} ms)`,
    );

    currentBundle = bundle;
    currentRecord = record;
    renderCircuitMeta();
    renderInputFields();
    step2Heading.hidden = false;
    proveForm.hidden = false;

    if (!DEFAULTS[bundle.metadata.name]) {
      log(
        "\nNo built-in defaults for this circuit. Fill the inputs yourself; " +
          "any Poseidon-derived public commitments need to be precomputed.",
        "dim",
      );
    }
  } catch (err) {
    log(`\nload failed: ${err instanceof Error ? err.message : String(err)}`, "err");
    console.error(err);
  } finally {
    loadBtn.disabled = false;
  }
}

// Step 2: collect inputs, prove, verify, render results.
async function prove(): Promise<void> {
  if (!currentBundle) {
    log("\nload a circuit first.", "err");
    return;
  }
  resetLog();
  proveBtn.disabled = true;

  try {
    const { inputs, parseErrors } = collectInputs(currentBundle.metadata);
    if (parseErrors.length > 0) {
      log("\nform input issues:", "err");
      for (const issue of parseErrors) log(`  - ${issue}`, "err");
      return;
    }

    log("[1/2] Generating Groth16 proof in this browser tab...");
    const t0 = performance.now();
    let proof;
    try {
      proof = await generateProof(currentBundle, inputs);
    } catch (err) {
      if (err instanceof InputValidationError) {
        log("\nthe SDK rejected the inputs against the circuit schema:", "err");
        for (const issue of err.issues) log(`  - ${issue}`, "err");
        return;
      }
      throw err;
    }
    log(`      done (${Math.round(performance.now() - t0)} ms)`);

    log("[2/2] Verifying locally...");
    const t1 = performance.now();
    const verified = await verifyLocal(currentBundle, proof);
    log(`      verified=${verified} (${Math.round(performance.now() - t1)} ms)`);

    renderResult(currentBundle, proof, verified);
  } catch (err) {
    log(`\nprove failed: ${err instanceof Error ? err.message : String(err)}`, "err");
    console.error(err);
  } finally {
    proveBtn.disabled = false;
  }
}

// Event wiring.
schemaForm.addEventListener("submit", (e) => {
  e.preventDefault();
  void loadSchema();
});

proveForm.addEventListener("submit", (e) => {
  e.preventDefault();
  void prove();
});

// Preset buttons just rewrite the spec input. The user still clicks LOAD,
// so a typo on the spec field is recoverable without an accidental fetch.
for (const btn of document.querySelectorAll<HTMLButtonElement>("[data-preset]")) {
  btn.addEventListener("click", () => {
    specInput.value = btn.dataset.preset ?? "";
    specInput.focus();
  });
}
