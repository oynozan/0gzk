import type { CircuitMetadata, InputSpec } from "./types.js";

export type ValidatedScalar = string | number | bigint;
export type ValidatedValue = ValidatedScalar | ValidatedScalar[];
export type ValidatedInputs = Record<string, ValidatedValue>;

/**
 * The bn128 (alt_bn128) scalar field modulus used by Groth16 / circom by
 * default. `field`-typed inputs must be strictly less than this value.
 */
export const BN128_FIELD_MODULUS =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

export class InputValidationError extends Error {
  readonly issues: string[];
  constructor(issues: string[]) {
    super(`Input validation failed:\n  - ${issues.join("\n  - ")}`);
    this.name = "InputValidationError";
    this.issues = issues;
  }
}

function coerceUint(name: string, value: unknown, issues: string[]): bigint | null {
  if (typeof value === "bigint") {
    if (value < 0n) {
      issues.push(`${name}: uint cannot be negative (got ${value.toString()})`);
      return null;
    }
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || !Number.isInteger(value)) {
      issues.push(`${name}: uint must be a finite integer (got ${value})`);
      return null;
    }
    if (value < 0) {
      issues.push(`${name}: uint cannot be negative (got ${value})`);
      return null;
    }
    return BigInt(value);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!/^\d+$/.test(trimmed)) {
      issues.push(`${name}: uint string must be digits only (got "${value}")`);
      return null;
    }
    return BigInt(trimmed);
  }
  issues.push(
    `${name}: expected uint (number | bigint | digit string), got ${typeof value}`,
  );
  return null;
}

function coerceBool(name: string, value: unknown, issues: string[]): bigint | null {
  if (typeof value === "boolean") return value ? 1n : 0n;
  if (value === 0 || value === 1) return BigInt(value);
  if (value === "0" || value === "1") return BigInt(value);
  issues.push(`${name}: expected bool (true/false/0/1), got ${JSON.stringify(value)}`);
  return null;
}

/**
 * Field elements: any non-negative integer strictly less than the bn128
 * scalar field modulus. Accepts bigint, finite non-negative integer numbers,
 * decimal strings, and 0x-prefixed hex strings.
 */
function coerceField(name: string, value: unknown, issues: string[]): bigint | null {
  let big: bigint | null = null;

  if (typeof value === "bigint") {
    big = value;
  } else if (typeof value === "number") {
    if (!Number.isFinite(value) || !Number.isInteger(value)) {
      issues.push(`${name}: field number must be a finite integer (got ${value})`);
      return null;
    }
    big = BigInt(value);
  } else if (typeof value === "string") {
    const trimmed = value.trim();
    try {
      if (/^0x[0-9a-fA-F]+$/.test(trimmed)) {
        big = BigInt(trimmed);
      } else if (/^-?\d+$/.test(trimmed)) {
        big = BigInt(trimmed);
      } else {
        issues.push(`${name}: field string must be decimal or 0x-hex digits (got "${value}")`);
        return null;
      }
    } catch {
      issues.push(`${name}: could not parse field value "${value}"`);
      return null;
    }
  } else {
    issues.push(
      `${name}: expected field (number | bigint | decimal/hex string), got ${typeof value}`,
    );
    return null;
  }

  if (big < 0n) {
    issues.push(`${name}: field cannot be negative (got ${big.toString()})`);
    return null;
  }
  if (big >= BN128_FIELD_MODULUS) {
    issues.push(`${name}: field value exceeds bn128 modulus (got ${big.toString()})`);
    return null;
  }
  return big;
}

function parseTypeShape(rawType: string): { base: string; isArray: boolean } {
  if (rawType.endsWith("[]")) {
    return { base: rawType.slice(0, -2), isArray: true };
  }
  return { base: rawType, isArray: false };
}

function coerceScalar(
  baseType: string,
  name: string,
  value: unknown,
  issues: string[],
): ValidatedScalar | null {
  switch (baseType) {
    case "uint": {
      const out = coerceUint(name, value, issues);
      return out === null ? null : out.toString();
    }
    case "bool": {
      const out = coerceBool(name, value, issues);
      return out === null ? null : out.toString();
    }
    case "field": {
      const out = coerceField(name, value, issues);
      return out === null ? null : out.toString();
    }
    default: {
      // Unknown scalar type — pass through if it already looks scalar-shaped.
      if (
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "bigint"
      ) {
        return value as ValidatedScalar;
      }
      issues.push(
        `${name}: unsupported type "${baseType}" with non-scalar value ${JSON.stringify(value)}`,
      );
      return null;
    }
  }
}

function coerceArray(
  spec: InputSpec,
  baseType: string,
  name: string,
  value: unknown,
  issues: string[],
): ValidatedScalar[] | null {
  if (!Array.isArray(value)) {
    issues.push(`${name}: expected array of ${baseType}, got ${typeof value}`);
    return null;
  }
  if (spec.length !== undefined && value.length !== spec.length) {
    issues.push(
      `${name}: expected array of length ${spec.length}, got length ${value.length}`,
    );
    return null;
  }
  const out: ValidatedScalar[] = [];
  let hadIssue = false;
  for (let i = 0; i < value.length; i++) {
    const elementName = `${name}[${i}]`;
    const element = coerceScalar(baseType, elementName, value[i], issues);
    if (element === null) {
      hadIssue = true;
      continue;
    }
    out.push(element);
  }
  return hadIssue ? null : out;
}

export function validateInputs(
  raw: Record<string, unknown>,
  metadata: CircuitMetadata,
): ValidatedInputs {
  const issues: string[] = [];
  const result: ValidatedInputs = {};
  const expectedKeys = new Set(Object.keys(metadata.inputs));
  const providedKeys = new Set(Object.keys(raw));

  for (const key of expectedKeys) {
    if (!providedKeys.has(key)) {
      issues.push(`Missing required input: ${key}`);
    }
  }

  for (const key of providedKeys) {
    if (!expectedKeys.has(key)) {
      issues.push(`Unknown input: ${key} (not in circuit schema)`);
    }
  }

  for (const [key, spec] of Object.entries(metadata.inputs)) {
    if (!providedKeys.has(key)) continue;
    const value = raw[key];

    const { base, isArray } = parseTypeShape(spec.type);

    if (isArray) {
      const arr = coerceArray(spec, base, key, value, issues);
      if (arr !== null) result[key] = arr;
    } else {
      const scalar = coerceScalar(base, key, value, issues);
      if (scalar !== null) result[key] = scalar;
    }
  }

  if (issues.length > 0) throw new InputValidationError(issues);
  return result;
}
