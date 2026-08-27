import * as readline from "node:readline/promises";
import { stdin, stdout } from "node:process";

import chalk from "chalk";

import { loadAgentSdk } from "../agent/load-sdk.js";
import { buildInProcessTools } from "../agent/mcp-wiring.js";
import { buildSystemPrompt } from "../agent/system-prompt.js";
import { renderMessage } from "../agent/render.js";

export interface AgentOptions {
  model?: string;
  maxTurns?: string;
  fullAccess?: boolean;
  repoRoot?: string;
}

export async function runAgent(promptWords: string[], opts: AgentOptions = {}): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    // The Agent SDK can also authenticate through a local Claude Code login;
    // only warn here and let it fail with its own message if neither exists.
    console.log(
      chalk.dim(
        "note: ANTHROPIC_API_KEY is not set — falling back to your Claude Code " +
          "login if present. (`0gzk config set anthropicApiKey sk-ant-...` to pin a key.)",
      ),
    );
  }

  const sdk = await loadAgentSdk();
  const wired = await buildInProcessTools(sdk, { repoRoot: opts.repoRoot });

  const baseOptions = {
    model: opts.model ?? "claude-sonnet-5",
    maxTurns: Number(opts.maxTurns ?? 25),
    systemPrompt: buildSystemPrompt(wired.ctx),
    mcpServers: { "0gzk": wired.server },
    allowedTools: [...wired.toolNames, "Read", "Glob", "Grep"],
    ...(opts.fullAccess
      ? { permissionMode: "acceptEdits" as const }
      : { disallowedTools: ["Bash", "Write", "Edit", "NotebookEdit", "WebSearch", "WebFetch"] }),
  };

  console.log(chalk.dim(`mode:  ${wired.ctx.mode}`));
  console.log(chalk.dim(`model: ${baseOptions.model}`));
  console.log(chalk.dim(`tools: ${wired.toolNames.length} 0gzk tools + read-only file access`));
  console.log();

  // One-shot: `0gzk agent "which circuit proves age over 18?"`
  if (promptWords.length > 0) {
    await runTurn(sdk, promptWords.join(" "), baseOptions);
    return;
  }

  // Interactive REPL: one query() per line, chained via session resume.
  console.log(chalk.bold("0gzk agent") + chalk.dim("  (exit/quit or Ctrl+D to leave)"));
  const rl = readline.createInterface({ input: stdin, output: stdout });
  let sessionId: string | undefined;

  try {
    for (;;) {
      let line: string;
      try {
        line = await rl.question(chalk.cyan("0gzk> "));
      } catch {
        break; // Ctrl+D closes the stream
      }
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (trimmed === "exit" || trimmed === "quit") break;

      const options = sessionId ? { ...baseOptions, resume: sessionId } : baseOptions;
      sessionId = (await runTurn(sdk, trimmed, options)) ?? sessionId;
      console.log();
    }
  } finally {
    rl.close();
  }
}

type QueryOptions = Record<string, unknown>;

/** Run one query, render its stream, return the session id for resuming. */
async function runTurn(
  sdk: Awaited<ReturnType<typeof loadAgentSdk>>,
  prompt: string,
  options: QueryOptions,
): Promise<string | undefined> {
  let sessionId: string | undefined;
  for await (const msg of sdk.query({ prompt, options: options as never })) {
    const withSession = msg as { session_id?: string };
    if (withSession.session_id) sessionId = withSession.session_id;
    renderMessage(msg);
  }
  return sessionId;
}
