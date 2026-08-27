import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { CircuitMetadataSchema } from "../src/catalog/metadata-schema.js";
import { resolveContext, type ServerContext } from "../src/context.js";
import { buildCircuitTool, validateMetadataTool } from "../src/tools/authoring.js";
import type { ToolResult } from "../src/tools/defs.js";
import { getCircuitTool, getExampleInputTool } from "../src/tools/discovery.js";
import { scaffoldCircuitTool } from "../src/tools/templates.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

function payload(result: ToolResult): unknown {
  expect(result.isError, result.content[0]?.text).toBeFalsy();
  return JSON.parse(result.content[0]!.text);
}

describe("discovery tools over the real repo catalog", () => {
  let ctx: ServerContext;

  beforeAll(async () => {
    ctx = await resolveContext({ repoRoot });
  });

  it("resolves the context into repo mode with all 9 tools", () => {
    expect(ctx.mode).toBe("repo");
    expect(ctx.catalog).not.toBeNull();
    expect(ctx.toolNames).toHaveLength(9);
    expect(ctx.toolNames).toContain("search_circuits");
    expect(ctx.toolNames).toContain("prove_circuit");
  });

  it("get_circuit returns the full catalog entry with howToProve", async () => {
    const result = await getCircuitTool.handler(ctx, {
      name: "age_verification",
      includeExampleInput: true,
      fetchIfMissing: true, // catalog hit — no network involved
    });
    const data = payload(result) as Record<string, unknown>;
    expect(data.source).toBe("catalog");
    expect(data.name).toBe("age_verification");
    expect(data.exampleInput).toBeTruthy();
    expect((data.howToProve as Record<string, string>).cli).toContain("0gzk prove --name age_verification");
    expect((data.howToProve as Record<string, string>).sdk).toContain("generateProof");
  });

  it("get_circuit can omit the example input", async () => {
    const result = await getCircuitTool.handler(ctx, {
      name: "age_verification",
      includeExampleInput: false,
      fetchIfMissing: true,
    });
    const data = payload(result) as Record<string, unknown>;
    expect("exampleInput" in data).toBe(false);
  });

  it("get_circuit refuses unknown names when fetchIfMissing is false (no network)", async () => {
    const result = await getCircuitTool.handler(ctx, {
      name: "definitely_not_a_circuit",
      includeExampleInput: true,
      fetchIfMissing: false,
    });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("fetchIfMissing");
  });

  it("get_example_input returns the committed example", async () => {
    const result = await getExampleInputTool.handler(ctx, { name: "range_proof_64bit" });
    const data = payload(result) as { name: string; exampleInput: Record<string, unknown> };
    expect(data.name).toBe("range_proof_64bit");
    expect(data.exampleInput).toHaveProperty("x");
    expect(data.exampleInput).toHaveProperty("commitment");
  });

  it("get_example_input rejects unknown circuits with the known-name list", async () => {
    const result = await getExampleInputTool.handler(ctx, { name: "nope" });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("age_verification");
  });
});

describe("validate_metadata", () => {
  let ctx: ServerContext;

  beforeAll(async () => {
    ctx = await resolveContext({ repoRoot });
  });

  it("accepts a committed metadata file by path", async () => {
    const result = await validateMetadataTool.handler(ctx, {
      path: path.join("circuits", "range_proof_64bit", "metadata.json"),
    });
    const data = payload(result) as { valid: boolean; errors: string[] };
    expect(data.valid).toBe(true);
    expect(data.errors).toEqual([]);
  });

  it("rejects invalid metadata with per-field errors", async () => {
    const bad = JSON.stringify({ name: "x", version: "not-semver", protocol: "stark", inputs: {}, outputs: {} });
    const result = await validateMetadataTool.handler(ctx, { metadataJson: bad });
    const data = payload(result) as { valid: boolean; errors: string[] };
    expect(data.valid).toBe(false);
    expect(data.errors.length).toBeGreaterThan(0);
    expect(data.errors.join("\n")).toMatch(/version/);
  });

  it("warns on discoverability gaps without failing validation", async () => {
    const minimal = JSON.stringify({
      name: "min",
      version: "0.1.0",
      protocol: "groth16",
      curve: "bn128",
      inputs: { x: { type: "field", visibility: "private" } },
      outputs: {},
      files: { wasm: "my.wasm", zkey: "circuit_final.zkey", vkey: "verification_key.json" },
    });
    const result = await validateMetadataTool.handler(ctx, { metadataJson: minimal });
    const data = payload(result) as { valid: boolean; warnings: string[] };
    expect(data.valid).toBe(true);
    expect(data.warnings.join("\n")).toMatch(/description/);
    expect(data.warnings.join("\n")).toMatch(/tags/);
    expect(data.warnings.join("\n")).toMatch(/circuit\.wasm/);
  });

  it("requires exactly one of metadataJson / path", async () => {
    const neither = await validateMetadataTool.handler(ctx, {});
    expect(neither.isError).toBe(true);
    const both = await validateMetadataTool.handler(ctx, { metadataJson: "{}", path: "x.json" });
    expect(both.isError).toBe(true);
  });
});

describe("scaffold_circuit into a temp repo", () => {
  let tmpRoot: string;
  let ctx: ServerContext;

  beforeAll(async () => {
    tmpRoot = await mkdtemp(path.join(os.tmpdir(), "ogzk-mcp-scaffold-"));
    await mkdir(path.join(tmpRoot, "circuits", "_lib"), { recursive: true });
    await writeFile(path.join(tmpRoot, "circuits", "_lib", "build_lib.sh"), "# stub build lib\n", "utf8");
    await writeFile(
      path.join(tmpRoot, "circuits", "index.json"),
      JSON.stringify({ schemaVersion: 1, circuits: [] }, null, 2) + "\n",
      "utf8",
    );
    ctx = await resolveContext({ repoRoot: tmpRoot });
  });

  afterAll(async () => {
    await rm(tmpRoot, { recursive: true, force: true });
  });

  it("creates the four files and valid metadata", async () => {
    const result = await scaffoldCircuitTool.handler(ctx, {
      name: "test_scaffold",
      description: "A scaffolded test circuit",
      ptauSize: 12,
      inputs: [
        { name: "x", type: "field", visibility: "private", description: "secret value" },
        { name: "commitment", type: "field", visibility: "public", description: "public anchor" },
        { name: "pathElements", type: "field[]", visibility: "private", length: 8 },
      ],
      outputs: [{ name: "out", type: "field", description: "derived output" }],
      tags: ["test"],
    });
    const data = payload(result) as { created: string[] };
    expect(data.created).toHaveLength(4);

    const dir = path.join(tmpRoot, "circuits", "test_scaffold");
    for (const file of ["test_scaffold.circom", "metadata.json", "build.sh", "example_input.json"]) {
      expect(existsSync(path.join(dir, file)), `${file} missing`).toBe(true);
    }

    const metadata = JSON.parse(await readFile(path.join(dir, "metadata.json"), "utf8"));
    const parsed = CircuitMetadataSchema.safeParse(metadata);
    expect(parsed.success).toBe(true);

    const circom = await readFile(path.join(dir, "test_scaffold.circom"), "utf8");
    expect(circom).toContain("pragma circom 2.1.6;");
    expect(circom).toContain("template TestScaffold()");
    expect(circom).toContain("signal input pathElements[8];");
    expect(circom).toContain("signal output out;");
    expect(circom).toContain("component main { public [commitment] } = TestScaffold();");

    const buildSh = await readFile(path.join(dir, "build.sh"), "utf8");
    expect(buildSh).toContain('CIRCUIT_NAME="test_scaffold"');
    expect(buildSh).toContain("PTAU_SIZE=12");

    // Validate the scaffolded metadata through the tool as well.
    const validated = await validateMetadataTool.handler(ctx, { path: path.join(dir, "metadata.json") });
    const validation = payload(validated) as { valid: boolean };
    expect(validation.valid).toBe(true);
  });

  it("refuses to overwrite an existing circuit directory", async () => {
    const result = await scaffoldCircuitTool.handler(ctx, {
      name: "test_scaffold",
      description: "again",
      ptauSize: 12,
      inputs: [{ name: "x", type: "field", visibility: "private" }],
      outputs: [],
    });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("already exists");
  });

  it("build_circuit returns a clear error when circom is not on PATH", async () => {
    const oldPath = process.env.PATH;
    process.env.PATH = tmpRoot; // a dir guaranteed to contain no circom binary
    try {
      const result = await buildCircuitTool.handler(ctx, { name: "test_scaffold" });
      expect(result.isError).toBe(true);
      expect(result.content[0]!.text).toMatch(/circom/i);
      expect(result.content[0]!.text).toContain("docs.circom.io");
    } finally {
      process.env.PATH = oldPath;
    }
  });

  it("build_circuit requires exactly one of name / dir", async () => {
    const result = await buildCircuitTool.handler(ctx, {});
    expect(result.isError).toBe(true);
  });
});
