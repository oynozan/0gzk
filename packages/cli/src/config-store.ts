import { promises as fs, constants as fsConstants } from "node:fs";
import os from "node:os";
import path from "node:path";

// Persistent CLI config lives at ~/.0gzk/config.json (or $OGZK_CONFIG_DIR/config.json
// for tests / xdg-style overrides). It's a flat JSON of well-known keys, written
// with mode 0600 so the private key isn't world-readable on multi-user boxes.

export interface GlobalConfig {
  privateKey?: string;
  network?: "testnet" | "mainnet";
  rpcUrl?: string;
  indexerUrl?: string;
  registry?: string;
}

export type ConfigKey = keyof GlobalConfig;

export const CONFIG_KEYS: ConfigKey[] = [
  "privateKey",
  "network",
  "rpcUrl",
  "indexerUrl",
  "registry",
];

// Maps a config key to the env var it injects on startup, so SDK code that
// reads process.env.OG_* keeps working without a separate code path.
export const CONFIG_TO_ENV: Record<ConfigKey, string> = {
  privateKey: "OG_PRIVATE_KEY",
  network: "OG_NETWORK",
  rpcUrl: "OG_RPC_URL",
  indexerUrl: "OG_INDEXER_URL",
  registry: "OGZK_REGISTRY_ADDRESS",
};

export function getConfigDir(): string {
  return process.env.OGZK_CONFIG_DIR ?? path.join(os.homedir(), ".0gzk");
}

export function getConfigPath(): string {
  return path.join(getConfigDir(), "config.json");
}

export async function loadGlobalConfig(): Promise<GlobalConfig> {
  const file = getConfigPath();
  try {
    const raw = await fs.readFile(file, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const out: GlobalConfig = {};
    for (const key of CONFIG_KEYS) {
      const value = (parsed as Record<string, unknown>)[key];
      if (typeof value === "string" && value.length > 0) {
        out[key] = value as never;
      }
    }
    return out;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return {};
    // Don't crash the whole CLI just because the config file is malformed —
    // surface a one-line warning and pretend it's empty so commands can run.
    process.stderr.write(
      `warn: ignoring corrupt ${file}: ${(err as Error).message}\n`,
    );
    return {};
  }
}

async function ensureConfigDir(): Promise<void> {
  const dir = getConfigDir();
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  // mkdir's mode is masked by umask; force it explicitly so subsequent
  // re-runs on a permissive umask still end up owner-only.
  try {
    await fs.chmod(dir, 0o700);
  } catch {
    // Windows / non-POSIX: chmod is a soft no-op, ignore.
  }
}

export async function saveGlobalConfig(cfg: GlobalConfig): Promise<void> {
  await ensureConfigDir();
  const file = getConfigPath();
  const tmp = `${file}.tmp-${process.pid}`;
  const body = `${JSON.stringify(cfg, null, 2)}\n`;
  await fs.writeFile(tmp, body, { mode: 0o600 });
  try {
    await fs.chmod(tmp, 0o600);
  } catch {
    // see ensureConfigDir
  }
  await fs.rename(tmp, file);
  try {
    await fs.access(file, fsConstants.W_OK);
    await fs.chmod(file, 0o600);
  } catch {
    // see ensureConfigDir
  }
}

export function isValidConfigKey(value: string): value is ConfigKey {
  return (CONFIG_KEYS as string[]).includes(value);
}

// Throws on invalid input so the CLI can surface a single clear error message
// rather than silently writing junk that breaks later commands.
export function validateConfigValue(key: ConfigKey, value: string): void {
  switch (key) {
    case "privateKey":
      if (!/^0x[0-9a-fA-F]{64}$/.test(value)) {
        throw new Error(
          "privateKey must be 0x-prefixed hex of length 66 (32 bytes).",
        );
      }
      return;
    case "network":
      if (value !== "testnet" && value !== "mainnet") {
        throw new Error('network must be "testnet" or "mainnet".');
      }
      return;
    case "registry":
      if (!/^0x[0-9a-fA-F]{40}$/.test(value)) {
        throw new Error(
          "registry must be a 0x-prefixed Ethereum address (20 bytes).",
        );
      }
      return;
    case "rpcUrl":
    case "indexerUrl":
      try {
        const url = new URL(value);
        if (url.protocol !== "http:" && url.protocol !== "https:") {
          throw new Error("must be an http(s) URL");
        }
      } catch (err) {
        throw new Error(
          `${key} must be a valid http(s) URL (got: ${(err as Error).message}).`,
        );
      }
      return;
  }
}

// Show first 6 + last 4 hex chars so users can confirm they set the right
// thing without leaking the secret in shell history or screen recordings.
export function maskPrivateKey(value: string | undefined): string | undefined {
  if (!value) return value;
  if (value.length <= 12) return "0x********";
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

// Tracks which env vars were set by the shell vs injected by us from the
// config file, so `config get` can show an honest "source" column.
const envSetBeforeInjection = new Set<string>();

// Apply the global config to process.env, but never overwrite a value that's
// already set via the shell or CLI flag. This keeps the documented priority
// order: flag > shell env > config file > built-in default.
export function applyGlobalConfigToEnv(cfg: GlobalConfig): void {
  for (const key of CONFIG_KEYS) {
    const envKey = CONFIG_TO_ENV[key];
    if (process.env[envKey] !== undefined) {
      envSetBeforeInjection.add(envKey);
      continue;
    }
    const value = cfg[key];
    if (value) {
      process.env[envKey] = value;
    }
  }
}

// True only if the OG_* env var was already present in process.env at CLI
// startup (i.e. set by the shell). Returns false for values we injected from
// the config file ourselves.
export function envWasSetByShell(envKey: string): boolean {
  return envSetBeforeInjection.has(envKey);
}
