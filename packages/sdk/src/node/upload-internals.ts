/**
 * Internal helpers for `uploadBundle`. Not part of the public `@0gzk/sdk/node`
 * surface — they exist so the timeout + progress-event behavior can be unit
 * tested without standing up real 0G Storage. Treat the shapes here as
 * implementation details: don't import them from outside the SDK.
 */

import type { UploadOptions, UploadProgress } from "./storage-types.js";

export type LogLevel = "log" | "err";

const ROOT_HASH_LOG_RE = /dataMerkleRoot:\s*['"]?(0x[0-9a-fA-F]{64})['"]?/;
const NOT_FINALIZED_LOG_RE = /Log entry is available,\s*but not finalized yet/i;
const FINALIZED_LOG_RE = /(?:Log entry is finalized|already finalized|uploaded successfully)/i;
const SEGMENT_LOG_RE = /uploadedSegNum[":\s]*(\d+)/i;

export interface ProgressTracker {
  lastProgress: UploadProgress | undefined;
  rootHash: string | undefined;
}

export function makeEmitter(
  onProgress: UploadOptions["onProgress"],
): (p: UploadProgress) => void {
  return (progress: UploadProgress): void => {
    if (!onProgress) return;
    try {
      onProgress(progress);
    } catch {
      // Swallow listener errors so they can't poison the upload.
    }
  };
}

/**
 * Decide whether a flattened log line corresponds to a known SDK progress
 * milestone. Returns the structured event (if any) and whether the original
 * line should be forwarded to the real console.
 *
 * Exported so the parsing rules can be exercised in isolation.
 */
export function parseUploadLogLine(
  flat: string,
  tracker: ProgressTracker,
  seenNotFinalized: { value: boolean },
): { event?: UploadProgress; suppress: boolean } {
  const rootMatch = flat.match(ROOT_HASH_LOG_RE);
  let rootEvent: UploadProgress | undefined;
  if (rootMatch && !tracker.rootHash) {
    tracker.rootHash = rootMatch[1]!;
    rootEvent = {
      stage: "streaming",
      message: `Root hash assigned: ${tracker.rootHash}`,
      rootHash: tracker.rootHash,
    };
    tracker.lastProgress = rootEvent;
  }

  const segMatch = flat.match(SEGMENT_LOG_RE);
  if (segMatch) {
    const uploaded = Number(segMatch[1]);
    const event: UploadProgress = {
      stage: "streaming",
      message: `Streamed ${uploaded} segment${uploaded === 1 ? "" : "s"}`,
      rootHash: tracker.rootHash,
      uploadedSegments: uploaded,
    };
    tracker.lastProgress = event;
    return { event, suppress: true };
  }

  if (NOT_FINALIZED_LOG_RE.test(flat)) {
    if (seenNotFinalized.value) {
      // Suppress repeated "not finalized yet" spam.
      return { suppress: true };
    }
    seenNotFinalized.value = true;
    const event: UploadProgress = {
      stage: "finalizing",
      message: "Waiting for storage finalization quorum",
      rootHash: tracker.rootHash,
      finalized: false,
    };
    tracker.lastProgress = event;
    return { event, suppress: true };
  }

  if (FINALIZED_LOG_RE.test(flat)) {
    const event: UploadProgress = {
      stage: "finalizing",
      message: "Storage finalization reached",
      rootHash: tracker.rootHash,
      finalized: true,
    };
    tracker.lastProgress = event;
    return { event, suppress: true };
  }

  // Unrecognised. If we observed a rootHash on this line, still emit it.
  return { event: rootEvent, suppress: Boolean(rootEvent) };
}

/**
 * Install temporary `console.log` + `console.error` wrappers that translate
 * the 0G SDK's free-form progress lines into structured `UploadProgress`
 * events. Returns a restore function.
 */
export function interceptUploadLogs(
  emit: (p: UploadProgress) => void,
  tracker: ProgressTracker,
): () => void {
  const realLog = console.log;
  const realErr = console.error;
  const seenNotFinalized = { value: false };

  const wrap = (kind: LogLevel) =>
    function (...args: unknown[]) {
      const flat = flatten(args);
      const { event, suppress } = parseUploadLogLine(flat, tracker, seenNotFinalized);

      if (event) emit(event);

      if (!suppress) {
        if (kind === "log") realLog.apply(console, args);
        else realErr.apply(console, args);
      }
    };

  console.log = wrap("log");
  console.error = wrap("err");

  return () => {
    console.log = realLog;
    console.error = realErr;
  };
}

function flatten(args: unknown[]): string {
  return args
    .map((a) => {
      if (typeof a === "string") return a;
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    })
    .join(" ");
}

export interface TimeoutSettled<T> {
  kind: "timeout" | "value";
  value: T;
}

export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<TimeoutSettled<T>> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    const value = await promise;
    return { kind: "value", value };
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timedOut: Promise<TimeoutSettled<T>> = new Promise((resolve) => {
      timer = setTimeout(() => {
        resolve({ kind: "timeout", value: undefined as unknown as T });
      }, timeoutMs);
      timer.unref?.();
    });
    return await Promise.race<TimeoutSettled<T>>([
      promise.then((value): TimeoutSettled<T> => ({ kind: "value", value })),
      timedOut,
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
