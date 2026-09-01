import chalk from "chalk";
import ora, { type Ora } from "ora";

/**
 * Remote mode for `0gzk agent`: the default path. The conversation goes to
 * the hosted 0gzk backend, which runs the model and the read-only discovery
 * tools — users never need an LLM API key.
 *
 * Tools that touch this machine (validating inputs, reading an input file,
 * proving) are NOT run there. The server hands them back and we execute them
 * locally, so the witness never leaves the device. That round trip is the
 * whole reason this file has a loop instead of a single POST.
 */

// Self-hosters override with `0gzk config set agentUrl <url>` / OGZK_AGENT_URL.
export const DEFAULT_AGENT_URL = "https://0gzk.com/api/agent";

/** Hard stop on client/server ping-pong within one user turn. */
const MAX_ROUNDS = 8;

export interface RemoteChatMessage {
  role: "user" | "assistant" | "tool";
  content?: string | null;
  tool_calls?: unknown[];
  tool_call_id?: string;
}

interface ClientToolCall {
  id: string;
  name: string;
  arguments: string;
}

interface RemoteTurnResponse {
  done: boolean;
  reply: string;
  trace: Array<{ tool: string; args: string; summary: string }>;
  model: string;
  clientToolCalls?: ClientToolCall[];
  messages?: RemoteChatMessage[];
  error?: string;
}

export function resolveAgentUrl(): string {
  return process.env.OGZK_AGENT_URL ?? DEFAULT_AGENT_URL;
}

function startSpinner(text: string): Ora | undefined {
  if (!process.stdout.isTTY) return undefined;
  return ora({ text: chalk.dim(text), discardStdin: false }).start();
}

function truncate(text: string, max: number): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > max ? `${oneLine.slice(0, max)}…` : oneLine;
}

function renderTrace(entries: RemoteTurnResponse["trace"], glyph = chalk.green("⏺")): void {
  for (const entry of entries ?? []) {
    console.log(`${glyph} ${chalk.bold(entry.tool)}${chalk.dim(`(${entry.args})`)}`);
    console.log(chalk.dim(`  ⎿ ${entry.summary}`));
  }
}

async function postTurn(url: string, messages: RemoteChatMessage[]): Promise<RemoteTurnResponse> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages }),
    });
  } catch (err) {
    throw new Error(
      `Could not reach the 0gzk agent backend at ${url}. ` +
        "Check your connection, or point the CLI elsewhere with " +
        "`0gzk config set agentUrl <url>` (or OGZK_AGENT_URL). " +
        `A local Claude-powered mode is available via \`0gzk agent --local\`. (${
          err instanceof Error ? err.message : String(err)
        })`,
    );
  }

  const body = (await response.json().catch(() => ({}))) as RemoteTurnResponse;
  if (!response.ok) {
    throw new Error(body.error ?? `agent backend returned ${response.status}`);
  }
  return body;
}

/**
 * Run one user turn to completion: post, run whatever local tools the model
 * asks for, post the results, repeat until the model produces its answer.
 * Returns the final assistant text.
 */
export async function runRemoteTurn(
  url: string,
  history: RemoteChatMessage[],
): Promise<string> {
  const startedAt = Date.now();
  let messages = history;
  let model = "";

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const spinner = startSpinner(round === 0 ? "thinking…" : "continuing…");
    let payload: RemoteTurnResponse;
    try {
      payload = await postTurn(url, messages);
    } finally {
      spinner?.stop();
    }
    model = payload.model || model;

    renderTrace(payload.trace);

    if (payload.done) {
      if (payload.trace?.length) console.log();
      process.stdout.write(`${payload.reply}\n`);
      const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
      console.log(chalk.dim(`\n${"─".repeat(40)}\n${model} · ${elapsed}s`));

      // Sync the caller's history for follow-up turns. Snapshot FIRST:
      // `messages` may alias `history`, so clearing before reading would
      // erase the conversation (and the server omits `messages` when done).
      const transcript = [...(payload.messages ?? messages)];
      // An empty assistant turn would be rejected by the API next request,
      // bricking the session — keep it out of the replayed history.
      if (payload.reply.trim().length > 0) {
        transcript.push({ role: "assistant", content: payload.reply });
      }
      history.length = 0;
      history.push(...transcript);
      return payload.reply;
    }

    // The model wants something run on this machine.
    if (payload.reply) process.stdout.write(`${payload.reply}\n`);
    const calls = payload.clientToolCalls ?? [];
    if (calls.length === 0) {
      throw new Error("agent backend asked to continue but sent no tool calls");
    }

    const { runClientTool } = await import("./client-tools.js");
    const nextMessages: RemoteChatMessage[] = [...(payload.messages ?? messages)];

    for (const call of calls) {
      console.log(
        `${chalk.cyan("⏺")} ${chalk.bold(call.name)}${chalk.dim(`(${truncate(call.arguments, 90)})`)} ${chalk.dim("· local")}`,
      );
      const running = startSpinner(`running ${call.name} locally…`);
      let resultText: string;
      try {
        resultText = await runClientTool(call.name, call.arguments);
      } finally {
        running?.stop();
      }
      console.log(chalk.dim(`  ⎿ ${truncate(resultText, 100)}`));
      nextMessages.push({ role: "tool", tool_call_id: call.id, content: resultText });
    }
    console.log();
    messages = nextMessages;
  }

  throw new Error(
    `The agent kept asking for local tools after ${MAX_ROUNDS} rounds — stopping to avoid a loop.`,
  );
}
