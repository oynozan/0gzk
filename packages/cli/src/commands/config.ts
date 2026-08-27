import chalk from "chalk";

import {
  CONFIG_KEYS,
  CONFIG_TO_ENV,
  type ConfigKey,
  envWasSetByShell,
  getConfigPath,
  isValidConfigKey,
  loadGlobalConfig,
  maskPrivateKey,
  saveGlobalConfig,
  validateConfigValue,
} from "../config-store.js";

function assertKnownKey(key: string): asserts key is ConfigKey {
  if (!isValidConfigKey(key)) {
    throw new Error(
      `Unknown config key "${key}". Allowed: ${CONFIG_KEYS.join(", ")}.`,
    );
  }
}

const SECRET_KEYS: ConfigKey[] = ["privateKey", "ipfsApiToken", "anthropicApiKey"];

function displayValue(key: ConfigKey, value: string | undefined, reveal: boolean): string {
  if (value === undefined) return chalk.dim("(unset)");
  if (SECRET_KEYS.includes(key) && !reveal) return chalk.green(maskPrivateKey(value) ?? "");
  return chalk.green(value);
}

export async function runConfigSet(key: string, value: string): Promise<void> {
  assertKnownKey(key);
  validateConfigValue(key, value);

  const cfg = await loadGlobalConfig();
  cfg[key] = value as never;
  await saveGlobalConfig(cfg);

  console.log(
    `${chalk.green("✓")} set ${chalk.bold(key)} = ${displayValue(key, value, false)}`,
  );
  console.log(chalk.dim(`  ${getConfigPath()}`));
  if (SECRET_KEYS.includes(key)) {
    console.log(
      chalk.dim(
        "  stored in plain text with mode 0600. Anyone with read access to your home directory can read this file.",
      ),
    );
  }
}

export async function runConfigUnset(key: string): Promise<void> {
  assertKnownKey(key);
  const cfg = await loadGlobalConfig();
  if (!(key in cfg)) {
    console.log(chalk.dim(`(no-op) ${key} was not set.`));
    return;
  }
  delete cfg[key];
  await saveGlobalConfig(cfg);
  console.log(`${chalk.green("✓")} unset ${chalk.bold(key)}`);
}

export async function runConfigGet(
  key: string | undefined,
  options: { reveal?: boolean } = {},
): Promise<void> {
  const cfg = await loadGlobalConfig();
  const reveal = Boolean(options.reveal);

  if (key) {
    assertKnownKey(key);
    const value = cfg[key];
    console.log(displayValue(key, value, reveal));
    return;
  }

  console.log(chalk.bold(`config: ${getConfigPath()}`));
  console.log();
  for (const k of CONFIG_KEYS) {
    const fromConfig = cfg[k];
    const envKey = CONFIG_TO_ENV[k];
    const shellEnv = envWasSetByShell(envKey) ? process.env[envKey] : undefined;
    // Resolution: shell env > config file > nothing (network preset is
    // resolved later by the SDK, not visible here).
    const effective = shellEnv ?? fromConfig;
    const source = shellEnv
      ? chalk.yellow(`env:${envKey}`)
      : fromConfig
        ? chalk.cyan("config")
        : chalk.dim("(default)");
    console.log(
      `  ${chalk.bold(k.padEnd(16))} ${displayValue(k, effective, reveal)}  ${source}`,
    );
  }
  console.log();
  console.log(
    chalk.dim(
      "Resolution: CLI flag > shell env > ~/.0gzk/config.json > built-in network preset.",
    ),
  );
  if (!reveal && SECRET_KEYS.some((k) => cfg[k])) {
    console.log(chalk.dim("Re-run with --show to reveal secret values."));
  }
}

export async function runConfigPath(): Promise<void> {
  console.log(getConfigPath());
}

// Shortcut for `0gzk config set privateKey <hex>`. Most users only ever need
// to set the key once, so giving them a top-level command saves typing and
// makes the docs example a one-liner.
export async function runSetKey(value: string): Promise<void> {
  await runConfigSet("privateKey", value);
}
