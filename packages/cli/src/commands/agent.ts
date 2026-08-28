import * as readline from "node:readline/promises";
import { stdin, stdout } from "node:process";

import chalk from "chalk";

import { renderBanner } from "../agent/render.js";
import {
  resolveAgentUrl,
  runRemoteTurn,
  type RemoteChatMessage,
} from "../agent/remote.js";

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
 * - --local: Claude Agent SDK in-process with the full 9-tool set, including
 *   authoring tools; needs ANTHROPIC_API_KEY or a Claude Code login.
 */
export async function runAgent(promptWords: string[], opts: AgentOptions = {}): Promise<void> {
  if (opts.local) {
    const { runLocalAgent } = await import("../agent/local.js");
    await runLocalAgent(promptWords, opts);
    return;
  }

  const url = resolveAgentUrl();
  renderBanner([
    ["model", chalk.cyan("gpt-5-nano") + chalk.dim(" (hosted)")],
    ["server", new URL(url).host],
    ["tools", `5 discovery tools ${chalk.dim("(run server-side)")}`],
    ["auth", chalk.green("none needed")],
  ]);
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
  console.log(chalk.dim("  Ask about circuits in plain language. exit/quit or Ctrl+D to leave.\n"));
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
      history.push({ role: "user", content: trimmed });
      try {
        const reply = await runRemoteTurn(url, history);
        history.push({ role: "assistant", content: reply });
      } catch (err) {
        history.pop(); // keep history consistent after a failed turn
        console.error(chalk.red(`error: ${err instanceof Error ? err.message : String(err)}`));
      }
      console.log();
    }
  } finally {
    rl.close();
    console.log(chalk.dim("bye"));
  }
}
