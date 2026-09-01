import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runClientTool } from "../src/agent/client-tools.js";

/**
 * The model choosing these arguments is driven by a public endpoint whose
 * context includes strings from a permissionless registry, so the guard has
 * to hold even when the arguments are hostile.
 */

let tmpDir: string;
let savedConfigDir: string | undefined;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "0gzk-guard-"));
  savedConfigDir = process.env.OGZK_CONFIG_DIR;
});

afterEach(async () => {
  if (savedConfigDir === undefined) delete process.env.OGZK_CONFIG_DIR;
  else process.env.OGZK_CONFIG_DIR = savedConfigDir;
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("client tool path guard", () => {
  it("refuses to read the 0gzk config directory (holds the private key)", async () => {
    process.env.OGZK_CONFIG_DIR = tmpDir;
    const result = await runClientTool(
      "read_input_file",
      JSON.stringify({ path: path.join(tmpDir, "config.json") }),
    );
    expect(result).toMatch(/config directory/i);
    expect(result).toMatch(/^Tool error/);
  });

  it("refuses to read ssh keys", async () => {
    const result = await runClientTool(
      "read_input_file",
      JSON.stringify({ path: path.join(os.homedir(), ".ssh", "id_rsa") }),
    );
    expect(result).toMatch(/sensitive path/i);
  });

  it("refuses to write proofs into a .git directory", async () => {
    const result = await runClientTool(
      "prove_circuit",
      JSON.stringify({ name: "age_verification", inputs: {}, outDir: path.join(tmpDir, ".git") }),
    );
    expect(result).toMatch(/sensitive path/i);
  });

  it("refuses to overwrite dotfiles via inputFile traversal", async () => {
    const result = await runClientTool(
      "prove_circuit",
      JSON.stringify({ name: "age_verification", inputFile: path.join(tmpDir, "..", ".env") }),
    );
    expect(result).toMatch(/sensitive path/i);
  });

  it("still allows the default proofs directory inside the config dir", async () => {
    process.env.OGZK_CONFIG_DIR = tmpDir;
    // A path under <config>/proofs must NOT be rejected by the config guard.
    const result = await runClientTool(
      "prove_circuit",
      JSON.stringify({
        name: "definitely_not_a_circuit",
        inputs: {},
        outDir: path.join(tmpDir, "proofs", "x"),
      }),
    );
    expect(result).not.toMatch(/config directory/i);
  });

  it("rejects unknown tools and malformed arguments", async () => {
    expect(await runClientTool("rm_rf", "{}")).toMatch(/not a client-side tool/);
    expect(await runClientTool("read_input_file", "{not json")).toMatch(/valid JSON/);
  });
});
