/**
 * Type declarations shared between `storage.ts` and `upload-internals.ts`.
 * Kept in its own file to avoid an import cycle.
 */

/** A coarse-grained stage during an 0G Storage upload. */
export type UploadStage =
  | "packing"
  | "submitting"
  | "streaming"
  | "finalizing"
  | "done";

export interface UploadProgress {
  stage: UploadStage;
  /** Free-form human-readable line for spinners / logs. */
  message: string;
  /** Known as soon as the upload tx has been submitted (stage = "submitting" or later). */
  rootHash?: string;
  /** 0-indexed segment count, when known. */
  uploadedSegments?: number;
  /** Total segment count, when known. */
  totalSegments?: number;
  /** True once the indexer reports finalization. */
  finalized?: boolean;
}

export interface UploadOptions {
  /**
   * Hard wall-clock timeout in milliseconds. When it elapses the call rejects
   * with an `UploadTimeoutError` whose `rootHash` field is set if the data
   * already made it on chain. The underlying 0G upload promise may keep
   * running in the background until the process exits — the SDK doesn't
   * expose a cancel handle.
   *
   * Defaults to 5 minutes. Pass `Infinity` to disable.
   */
  timeoutMs?: number;
  /**
   * Called for each stage transition and each segment / finalization update.
   * Errors thrown from `onProgress` are swallowed so a buggy listener can't
   * abort the upload.
   */
  onProgress?: (progress: UploadProgress) => void;
}
