import * as readline from "node:readline/promises";
import { stdin, stdout } from "node:process";

import chalk from "chalk";

import { renderBanner, scrollToBottom } from "../agent/render.js";
import {
  resolveAgentUrl,
  runRemoteTurn,
  type RemoteChatMessage,
} from "../agent/remote.js";
import { loadConfig } from "@0gzk/sdk/node";

export interface AgentOptions {
  model?: string;
  maxTurns?: string;
  fullAccess?: boolean;
  repoRoot?: string;
  local?: boolean;
}

/**
 * `0gzk agent` — two modes:
 * - default: hosted backend (gpt-5-nano server-side, no user API key at all)
 * - --local: Claude Agent SDK in-process with the full tool set, including
 *   authoring tools; needs ANTHROPIC_API_KEY or a Claude Code login.
 */
export async function runAgent(promptWords: string[], opts: AgentOptions = {}): Promise<void> {
  if (opts.local) {
    const { runLocalAgent } = await import("../agent/local.js");
    await runLocalAgent(promptWords, opts);
    return;
  }

  const url = resolveAgentUrl();
  const network = (() => {
    try {
      return loadConfig({}).network;
    } catch {
      return "base";
    }
  })();

  scrollToBottom();
  renderBanner(
    [
      ["model", chalk.cyan("gpt-5-nano") + chalk.dim("  hosted, no API key")],
      ["network", chalk.cyan(network) + chalk.dim("  registry + bundles")],
      ["proving", chalk.green("on this machine") + chalk.dim("  witness never uploaded")],
      ["server", chalk.dim(new URL(url).host)],
    ],
    { tagline: "Find a circuit, hand me your values, get a proof." },
  );
  console.log();

  const history: RemoteChatMessage[] = [];

  // One-shot: `0gzk agent "which circuit proves age over 18?"`
  if (promptWords.length > 0) {
    const question = promptWords.join(" ");
    console.log(`${chalk.cyan("❯")} ${question}\n`);
    history.push({ role: "user", content: question });
    await runRemoteTurn(url, history);
    return;
  }

  // Interactive chat with local history.
  console.log(
    chalk.dim('  Try: "prove I am over 18, I was born in 1990". exit/quit or Ctrl+D to leave.\n'),
  );
  const rl = readline.createInterface({ input: stdin, output: stdout });
  try {
    for (;;) {
      let line: string;
      try {
        line = await rl.question(chalk.cyan("❯ "));
      } catch {
        break; // Ctrl+D closes the stream
      }
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (trimmed === "exit" || trimmed === "quit" || trimmed === "/exit") break;

      console.log();
      const restore = [...history];
      history.push({ role: "user", content: trimmed });
      try {
        // runRemoteTurn rewrites `history` in place with the full transcript
        // (assistant tool calls and local tool results included).
        await runRemoteTurn(url, history);
      } catch (err) {
        history.length = 0;
        history.push(...restore); // keep history consistent after a failed turn
        console.error(chalk.red(`error: ${err instanceof Error ? err.message : String(err)}`));
      }
      console.log();
    }
  } finally {
    rl.close();
    console.log(chalk.dim("bye"));
  }
}
