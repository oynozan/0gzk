import { describe, expect, it } from "vitest";

import {
  BN128_FIELD_MODULUS,
  InputValidationError,
  validateInputs,
} from "../../src/inputs.js";
import type { CircuitMetadata } from "../../src/types.js";

const baseMetadata: CircuitMetadata = {
  name: "fixture",
  version: "0.1.0",
  protocol: "groth16",
  curve: "bn128",
  inputs: {},
  outputs: {},
  files: {
    wasm: "circuit.wasm",
    zkey: "circuit_final.zkey",
    vkey: "verification_key.json",
  },
};

const meta = (inputs: CircuitMetadata["inputs"]): CircuitMetadata => ({
  ...baseMetadata,
  inputs,
});

describe("validateInputs / uint", () => {
  const m = meta({ x: { type: "uint", visibility: "public" } });

  it("accepts non-negative number", () => {
    expect(validateInputs({ x: 42 }, m)).toEqual({ x: "42" });
  });

  it("accepts bigint", () => {
    expect(validateInputs({ x: 100n }, m)).toEqual({ x: "100" });
  });

  it("accepts digit string", () => {
    expect(validateInputs({ x: "  7 " }, m)).toEqual({ x: "7" });
  });

  it("rejects negative number", () => {
    expect(() => validateInputs({ x: -1 }, m)).toThrowError(InputValidationError);
  });

  it("rejects negative bigint", () => {
    expect(() => validateInputs({ x: -1n }, m)).toThrowError(InputValidationError);
  });

  it("rejects fractional number", () => {
    expect(() => validateInputs({ x: 1.5 }, m)).toThrowError(InputValidationError);
  });

  it("rejects non-finite number", () => {
    expect(() => validateInputs({ x: Number.POSITIVE_INFINITY }, m)).toThrowError(
      InputValidationError,
    );
  });

  it("rejects non-digit string", () => {
    expect(() => validateInputs({ x: "0x10" }, m)).toThrowError(InputValidationError);
  });

  it("rejects non-numeric type", () => {
    expect(() => validateInputs({ x: true }, m)).toThrowError(InputValidationError);
  });
});

describe("validateInputs / bool", () => {
  const m = meta({ flag: { type: "bool", visibility: "public" } });

  it.each([
    [true, "1"],
    [false, "0"],
    [0, "0"],
    [1, "1"],
    ["0", "0"],
    ["1", "1"],
  ])("accepts %p -> %p", (input, expected) => {
    expect(validateInputs({ flag: input }, m)).toEqual({ flag: expected });
  });

  it("rejects 2", () => {
    expect(() => validateInputs({ flag: 2 }, m)).toThrowError(InputValidationError);
  });

  it("rejects 'yes'", () => {
    expect(() => validateInputs({ flag: "yes" }, m)).toThrowError(InputValidationError);
  });
});

describe("validateInputs / field", () => {
  const m = meta({ x: { type: "field", visibility: "public" } });

  it("accepts decimal string below modulus", () => {
    expect(validateInputs({ x: "12345" }, m)).toEqual({ x: "12345" });
  });

  it("accepts 0x-hex string below modulus", () => {
    expect(validateInputs({ x: "0xff" }, m)).toEqual({ x: "255" });
  });

  it("accepts bigint below modulus", () => {
    const v = BN128_FIELD_MODULUS - 1n;
    expect(validateInputs({ x: v }, m)).toEqual({ x: v.toString() });
  });

  it("accepts non-negative integer number", () => {
    expect(validateInputs({ x: 7 }, m)).toEqual({ x: "7" });
  });

  it("rejects bigint at exactly modulus", () => {
    expect(() => validateInputs({ x: BN128_FIELD_MODULUS }, m)).toThrowError(
      InputValidationError,
    );
  });

  it("rejects negative bigint", () => {
    expect(() => validateInputs({ x: -1n }, m)).toThrowError(InputValidationError);
  });

  it("rejects non-numeric, non-hex string", () => {
    expect(() => validateInputs({ x: "abc" }, m)).toThrowError(InputValidationError);
  });

  it("rejects fractional number", () => {
    expect(() => validateInputs({ x: 1.1 }, m)).toThrowError(InputValidationError);
  });

  it("rejects unsupported type", () => {
    expect(() => validateInputs({ x: { foo: 1 } as unknown }, m)).toThrowError(
      InputValidationError,
    );
  });
});

describe("validateInputs / arrays", () => {
  it("accepts uint[] of correct length", () => {
    const m = meta({
      path: { type: "uint[]", visibility: "private", length: 3 },
    });
    expect(validateInputs({ path: [1, "2", 3n] }, m)).toEqual({
      path: ["1", "2", "3"],
    });
  });

  it("rejects uint[] with wrong length", () => {
    const m = meta({
      path: { type: "uint[]", visibility: "private", length: 3 },
    });
    expect(() => validateInputs({ path: [1, 2] }, m)).toThrowError(InputValidationError);
  });

  it("accepts field[] without length constraint", () => {
    const m = meta({
      path: { type: "field[]", visibility: "private" },
    });
    expect(validateInputs({ path: ["1", "0xff", 7] }, m)).toEqual({
      path: ["1", "255", "7"],
    });
  });

  it("rejects field[] containing a value above modulus", () => {
    const m = meta({
      path: { type: "field[]", visibility: "private" },
    });
    expect(() =>
      validateInputs({ path: [BN128_FIELD_MODULUS] }, m),
    ).toThrowError(InputValidationError);
  });

  it("rejects non-array passed for array type", () => {
    const m = meta({
      path: { type: "uint[]", visibility: "private", length: 2 },
    });
    expect(() => validateInputs({ path: 5 }, m)).toThrowError(InputValidationError);
  });

  it("aggregates element-level errors", () => {
    const m = meta({
      path: { type: "uint[]", visibility: "private", length: 2 },
    });
    try {
      validateInputs({ path: [-1, "x"] }, m);
      expect.fail("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(InputValidationError);
      const issues = (err as InputValidationError).issues;
      expect(issues.some((s) => s.includes("path[0]"))).toBe(true);
      expect(issues.some((s) => s.includes("path[1]"))).toBe(true);
    }
  });
});

describe("validateInputs / schema", () => {
  it("flags missing inputs", () => {
    const m = meta({
      a: { type: "uint", visibility: "public" },
      b: { type: "uint", visibility: "private" },
    });
    expect(() => validateInputs({ a: 1 }, m)).toThrowError(/Missing required input: b/);
  });

  it("flags unknown inputs", () => {
    const m = meta({ a: { type: "uint", visibility: "public" } });
    expect(() => validateInputs({ a: 1, b: 2 }, m)).toThrowError(/Unknown input: b/);
  });

  it("falls through unknown scalar type with scalar value", () => {
    const m = meta({ x: { type: "weirdType", visibility: "public" } });
    expect(validateInputs({ x: "raw" }, m)).toEqual({ x: "raw" });
  });

  it("rejects unknown scalar type with non-scalar value", () => {
    const m = meta({ x: { type: "weirdType", visibility: "public" } });
    expect(() => validateInputs({ x: { o: 1 } as unknown }, m)).toThrowError(
      InputValidationError,
    );
  });
});

describe("InputValidationError", () => {
  it("exposes issues array and joins them in the message", () => {
    const err = new InputValidationError(["one", "two"]);
    expect(err.name).toBe("InputValidationError");
    expect(err.issues).toEqual(["one", "two"]);
    expect(err.message).toContain("one");
    expect(err.message).toContain("two");
  });
});
