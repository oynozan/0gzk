import * as readline from "node:readline/promises";
import { stdin, stdout } from "node:process";

import chalk from "chalk";

import { loadAgentSdk } from "./load-sdk.js";
import { buildInProcessTools } from "./mcp-wiring.js";
import { buildSystemPrompt } from "./system-prompt.js";
import { AgentRenderer, renderBanner } from "./render.js";
import type { AgentOptions } from "../commands/agent.js";

/**
 * `0gzk agent --local`: Claude Agent SDK in-process with the full tool set
 * (discovery + authoring). Needs ANTHROPIC_API_KEY or a Claude Code login.
 */
export async function runLocalAgent(promptWords: string[], opts: AgentOptions): Promise<void> {
  const sdk = await loadAgentSdk();
  const wired = await buildInProcessTools(sdk, { repoRoot: opts.repoRoot });

  const model = opts.model ?? "claude-sonnet-5";
  const baseOptions = {
    model,
    maxTurns: Number(opts.maxTurns ?? 25),
    systemPrompt: buildSystemPrompt(wired.ctx),
    mcpServers: { "0gzk": wired.server },
    allowedTools: [...wired.toolNames, "Read", "Glob", "Grep"],
    includePartialMessages: true,
    ...(opts.fullAccess
      ? { permissionMode: "acceptEdits" as const }
      : { disallowedTools: ["Bash", "Write", "Edit", "NotebookEdit", "WebSearch", "WebFetch"] }),
  };

  const auth = process.env.ANTHROPIC_API_KEY
    ? "ANTHROPIC_API_KEY"
    : chalk.yellow("Claude Code login");
  renderBanner([
    ["model", chalk.cyan(model)],
    ["mode", wired.ctx.mode === "repo" ? `repo ${chalk.dim(wired.ctx.repoRoot ?? "")}` : "discovery"],
    ["tools", `${wired.toolNames.length} 0gzk tools ${chalk.dim("+ read-only file access")}`],
    ["auth", auth],
  ]);
  console.log();

  if (promptWords.length > 0) {
    const question = promptWords.join(" ");
    console.log(`${chalk.cyan("❯")} ${question}\n`);
    await runTurn(sdk, question, baseOptions);
    return;
  }

  console.log(chalk.dim("  Ask about circuits, or describe one to build. exit/quit or Ctrl+D to leave.\n"));
  const rl = readline.createInterface({ input: stdin, output: stdout });
  let sessionId: string | undefined;

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
      const options = sessionId ? { ...baseOptions, resume: sessionId } : baseOptions;
      sessionId = (await runTurn(sdk, trimmed, options)) ?? sessionId;
      console.log();
    }
  } finally {
    rl.close();
    console.log(chalk.dim("bye"));
  }
}

type QueryOptions = Record<string, unknown>;

async function runTurn(
  sdk: Awaited<ReturnType<typeof loadAgentSdk>>,
  prompt: string,
  options: QueryOptions,
): Promise<string | undefined> {
  const renderer = new AgentRenderer();
  renderer.beginTurn();
  let sessionId: string | undefined;
  try {
    for await (const msg of sdk.query({ prompt, options: options as never })) {
      const withSession = msg as { session_id?: string };
      if (withSession.session_id) sessionId = withSession.session_id;
      renderer.render(msg);
    }
  } finally {
    renderer.finishTurn();
  }
  return sessionId;
}
