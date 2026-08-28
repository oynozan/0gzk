import chalk from "chalk";
import ora, { type Ora } from "ora";

/**
 * Streaming terminal renderer for Agent SDK messages, styled after Claude
 * Code: a thinking spinner until the first token, live-streamed text, dimmed
 * `⏺ tool(args)` lines with `⎿ result` follow-ups, and a cost footer.
 *
 * Kept schema-loose on purpose: the agent SDK is pre-1.0 and reached through
 * a dynamic import, so we duck-type instead of binding to its message types.
 */

interface StreamEvent {
  type?: string;
  index?: number;
  content_block?: { type?: string; name?: string };
  delta?: { type?: string; text?: string; partial_json?: string };
}

interface SdkMessage {
  type?: string;
  event?: StreamEvent;
  message?: {
    content?: Array<{
      type: string;
      text?: string;
      name?: string;
      input?: unknown;
      content?: unknown;
      is_error?: boolean;
    }>;
  };
  result?: string;
  total_cost_usd?: number;
  num_turns?: number;
  duration_ms?: number;
  is_error?: boolean;
  session_id?: string;
}

const GLYPH_TOOL = chalk.green("⏺");
const GLYPH_RESULT = chalk.dim("  ⎿");

function shortToolName(name: string | undefined): string {
  if (!name) return "tool";
  return name.replace(/^mcp__0gzk__/, "").replace(/^mcp__/, "");
}

function truncate(text: string, max: number): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > max ? `${oneLine.slice(0, max)}…` : oneLine;
}

/** Summarize a tool_result block's content into one dim line. */
function summarizeToolResult(content: unknown, isError: boolean | undefined): string {
  let text = "";
  if (typeof content === "string") {
    text = content;
  } else if (Array.isArray(content)) {
    text = content
      .map((block) => (block && typeof block === "object" && "text" in block ? String(block.text) : ""))
      .join(" ");
  }
  const summary = truncate(text, 80) || "done";
  return isError ? chalk.red(`error: ${summary}`) : summary;
}

function startSpinner(text: string): Ora | undefined {
  if (!process.stdout.isTTY) return undefined;
  return ora({ text: chalk.dim(text), discardStdin: false }).start();
}

export class AgentRenderer {
  private spinner: Ora | undefined;
  private streamedText = false;
  private inTextBlock = false;
  private pendingTool: { name: string; json: string } | undefined;
  private startedAt = 0;

  beginTurn(): void {
    this.streamedText = false;
    this.inTextBlock = false;
    this.pendingTool = undefined;
    this.startedAt = Date.now();
    this.spinner = startSpinner("thinking…");
  }

  private stopSpinner(): void {
    if (this.spinner) {
      this.spinner.stop();
      this.spinner = undefined;
    }
  }

  /** Feed one message from query()'s async iterator. */
  render(msg: unknown): void {
    const m = msg as SdkMessage;

    switch (m.type) {
      case "stream_event":
        this.renderStreamEvent(m.event ?? {});
        return;
      case "assistant":
        // With partial messages on, the text already streamed — only pick up
        // anything if no stream events arrived (defensive fallback).
        if (!this.streamedText && Array.isArray(m.message?.content)) {
          this.stopSpinner();
          for (const block of m.message.content) {
            if (block.type === "text" && block.text) process.stdout.write(`${block.text}\n`);
          }
        }
        return;
      case "user":
        // Tool results echo back as user messages.
        if (Array.isArray(m.message?.content)) {
          for (const block of m.message.content) {
            if (block.type === "tool_result") {
              this.stopSpinner();
              this.endTextBlock();
              console.log(`${GLYPH_RESULT} ${chalk.dim(summarizeToolResult(block.content, block.is_error))}`);
              this.spinner = startSpinner("thinking…");
            }
          }
        }
        return;
      case "result": {
        this.stopSpinner();
        this.endTextBlock();
        const elapsed = this.startedAt ? ((Date.now() - this.startedAt) / 1000).toFixed(1) : undefined;
        const parts = [
          typeof m.num_turns === "number" ? `${m.num_turns} turn${m.num_turns === 1 ? "" : "s"}` : undefined,
          typeof m.total_cost_usd === "number" ? `$${m.total_cost_usd.toFixed(4)}` : undefined,
          elapsed ? `${elapsed}s` : undefined,
        ].filter(Boolean);
        console.log(chalk.dim(`\n${"─".repeat(40)}\n${parts.join(" · ")}`));
        if (m.is_error && m.result) console.error(chalk.red(m.result));
        return;
      }
      default:
        return;
    }
  }

  private renderStreamEvent(event: StreamEvent): void {
    switch (event.type) {
      case "content_block_start": {
        this.stopSpinner();
        const block = event.content_block;
        if (block?.type === "text") {
          this.inTextBlock = true;
        } else if (block?.type === "tool_use") {
          this.endTextBlock();
          this.pendingTool = { name: shortToolName(block.name), json: "" };
        }
        return;
      }
      case "content_block_delta": {
        if (event.delta?.type === "text_delta" && event.delta.text) {
          this.stopSpinner();
          this.streamedText = true;
          process.stdout.write(event.delta.text);
        } else if (event.delta?.type === "input_json_delta" && this.pendingTool) {
          this.pendingTool.json += event.delta.partial_json ?? "";
        }
        return;
      }
      case "content_block_stop": {
        if (this.pendingTool) {
          const args = this.pendingTool.json ? truncate(this.pendingTool.json, 90) : "";
          console.log(`${GLYPH_TOOL} ${chalk.bold(this.pendingTool.name)}${chalk.dim(`(${args})`)}`);
          this.pendingTool = undefined;
          this.spinner = startSpinner("running…");
        } else {
          this.endTextBlock();
        }
        return;
      }
      default:
        return;
    }
  }

  private endTextBlock(): void {
    if (this.inTextBlock) {
      process.stdout.write("\n");
      this.inTextBlock = false;
    }
  }

  finishTurn(): void {
    this.stopSpinner();
    this.endTextBlock();
  }
}

const BOX = { tl: "╭", tr: "╮", bl: "╰", br: "╯", h: "─", v: "│" };

/** Claude Code-style welcome banner. */
export function renderBanner(rows: Array<[string, string]>, width = 58): void {
  const inner = width - 2;
  const line = (content: string, visibleLength: number): string =>
    `${chalk.dim(BOX.v)} ${content}${" ".repeat(Math.max(0, inner - visibleLength - 1))}${chalk.dim(BOX.v)}`;

  console.log(chalk.dim(BOX.tl + BOX.h.repeat(inner) + BOX.tr));
  console.log(line(`${chalk.magentaBright("✳")} ${chalk.bold("0gzk agent")}`, 12));
  console.log(line("", 0));
  for (const [label, value] of rows) {
    const text = `${chalk.dim(`${label}:`)} ${value}`;
    console.log(line(text, label.length + 2 + stripAnsiLength(value)));
  }
  console.log(chalk.dim(BOX.bl + BOX.h.repeat(inner) + BOX.br));
}

// Minimal ANSI-aware length so banner padding stays aligned with chalk colors.
const ANSI_RE = new RegExp(String.fromCharCode(27) + "\\[[0-9;]*m", "g");
function stripAnsiLength(text: string): number {
  return text.replace(ANSI_RE, "").length;
}
