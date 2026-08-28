import chalk from "chalk";
import ora, { type Ora } from "ora";

/**
 * Remote mode for `0gzk agent`: the default path. The conversation goes to
 * the hosted 0gzk backend (web/app/api/agent), which runs the model and the
 * discovery tools server-side — users never need an LLM API key.
 */

// ponytail: placeholder until the production domain is settled — users can
// override any time with `0gzk config set agentUrl <url>` / OGZK_AGENT_URL.
export const DEFAULT_AGENT_URL = "https://0gzk.vercel.app/api/agent";

export interface RemoteChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface RemoteTurnResponse {
  reply: string;
  trace: Array<{ tool: string; args: string; summary: string }>;
  model: string;
  error?: string;
}

export function resolveAgentUrl(): string {
  return process.env.OGZK_AGENT_URL ?? DEFAULT_AGENT_URL;
}

function startSpinner(text: string): Ora | undefined {
  if (!process.stdout.isTTY) return undefined;
  return ora({ text: chalk.dim(text), discardStdin: false }).start();
}

/** POST one turn, render the tool trace + reply, return the assistant text. */
export async function runRemoteTurn(
  url: string,
  history: RemoteChatMessage[],
): Promise<string> {
  const spinner = startSpinner("thinking…");
  const startedAt = Date.now();

  let payload: RemoteTurnResponse;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: history }),
    });
    const body = (await response.json().catch(() => ({}))) as RemoteTurnResponse;
    if (!response.ok) {
      throw new Error(
        body.error ??
          `agent backend returned ${response.status}. ` +
            "If you self-host, point the CLI at it: 0gzk config set agentUrl <url>",
      );
    }
    payload = body;
  } catch (err) {
    spinner?.stop();
    if (err instanceof TypeError) {
      // fetch network failure
      throw new Error(
        `Could not reach the 0gzk agent backend at ${url}. ` +
          "Check your connection, or set a different endpoint with " +
          "`0gzk config set agentUrl <url>` (or OGZK_AGENT_URL). " +
          "A local Claude-powered mode is available via `0gzk agent --local`.",
      );
    }
    throw err;
  }
  spinner?.stop();

  for (const entry of payload.trace ?? []) {
    console.log(`${chalk.green("⏺")} ${chalk.bold(entry.tool)}${chalk.dim(`(${entry.args})`)}`);
    console.log(chalk.dim(`  ⎿ ${entry.summary}`));
  }
  if (payload.trace?.length) console.log();

  process.stdout.write(`${payload.reply}\n`);

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(chalk.dim(`\n${"─".repeat(40)}\n${payload.model} · ${elapsed}s`));
  return payload.reply;
}
