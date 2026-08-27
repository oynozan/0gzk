import chalk from "chalk";

/**
 * Render one SDK message from query()'s async iterator. Kept schema-loose on
 * purpose: the agent SDK is pre-1.0 and reached through a dynamic import, so
 * we duck-type instead of binding to its exact message types.
 */
export function renderMessage(msg: unknown): void {
  const m = msg as {
    type?: string;
    message?: { content?: Array<{ type: string; text?: string; name?: string; input?: unknown }> };
    result?: string;
    total_cost_usd?: number;
    num_turns?: number;
    is_error?: boolean;
  };

  if (m.type === "assistant" && Array.isArray(m.message?.content)) {
    for (const block of m.message.content) {
      if (block.type === "text" && block.text) {
        process.stdout.write(`${block.text}\n`);
      } else if (block.type === "tool_use") {
        const args = block.input === undefined ? "" : ` ${JSON.stringify(block.input)}`;
        console.log(chalk.dim(`  → ${block.name}${args.length > 120 ? `${args.slice(0, 120)}…` : args}`));
      }
    }
    return;
  }

  if (m.type === "result") {
    const cost = typeof m.total_cost_usd === "number" ? ` · $${m.total_cost_usd.toFixed(4)}` : "";
    const turns = typeof m.num_turns === "number" ? `${m.num_turns} turn(s)` : "done";
    console.log(chalk.dim(`\n[${turns}${cost}]`));
    if (m.is_error && m.result) {
      console.error(chalk.red(m.result));
    }
  }
}
