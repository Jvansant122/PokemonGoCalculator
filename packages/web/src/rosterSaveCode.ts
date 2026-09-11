import { fromBase64Url, toBase64Url } from "@pogo-analyzer/engine";
import { deserializeRosterPoolFromJson, RosterPoolFormatError, type RosterPool } from "./rosterPool.js";

/**
 * A self-contained, copy-pasteable save code for the whole roster pool — the
 * PLAN_roster_tab.md-approved replacement for the deleted Firebase/login
 * plan. Deliberately NEVER goes in the URL (CLAUDE.md's standing decision —
 * a genuinely short server-backed code was offered and rejected precisely
 * because it would require storing rosters somewhere, the backend this whole
 * feature exists to avoid). Compressed with the platform's own
 * `CompressionStream`/`DecompressionStream` (gzip) rather than adding a
 * dependency — broadly available in every evergreen browser this project
 * targets (Chrome 80+/Firefox 113+/Safari 16.4+) and in the Node this
 * project's own vitest suite runs under, so no fallback branch is needed.
 *
 * Format: `pogo-roster-v<N>:<base64url(gzip(JSON.stringify(pool)))>` — the
 * version prefix is checked on decode and produces a legible "unsupported
 * version" error rather than a cryptic parse failure if this format ever
 * changes (see PLAN_roster_tab.md's own "version the format" requirement:
 * unlike share-link backward compatibility, which this project has dropped
 * before, a save code may be kept for months and pasted back later).
 */
export const ROSTER_SAVE_CODE_VERSION = 1;

const SAVE_CODE_PREFIX_RE = /^pogo-roster-v(\d+):/;

async function readAllChunks(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      total += value.length;
    }
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/**
 * Writes `bytes` into `writer` and closes it, WITHOUT awaiting either
 * promise before returning — the reader side (readAllChunks) is what the
 * caller actually awaits, and for a malformed/corrupt gzip stream (the
 * decode path's whole reason for existing) the write/close promises reject
 * with the SAME underlying error the reader already surfaces. Left
 * unhandled, that second rejection becomes an unhandled-promise-rejection
 * crash independent of the caller's own try/catch (confirmed empirically —
 * Node's DecompressionStream implementation rejects both sides of the
 * pipe), so both are given a no-op `.catch` here purely to suppress that
 * duplicate, never to swallow the error the caller actually needs to see.
 */
function pipeInto(writer: WritableStreamDefaultWriter<BufferSource>, bytes: Uint8Array): void {
  const bufferCopy = new Uint8Array(bytes); // the writer detaches the buffer it's given.
  writer.write(bufferCopy).catch(() => {});
  writer.close().catch(() => {});
}

async function gzip(bytes: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream("gzip");
  pipeInto(cs.writable.getWriter(), bytes);
  return readAllChunks(cs.readable);
}

async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream("gzip");
  pipeInto(ds.writable.getWriter(), bytes);
  return readAllChunks(ds.readable);
}

/**
 * Compresses a roster pool into a versioned save code. Uses compact
 * (non-pretty-printed) JSON, unlike `serializeRosterPoolToJson`'s file-export
 * format — every extra byte here is one more character the user has to copy
 * correctly.
 */
export async function encodeRosterSaveCode(pool: RosterPool): Promise<string> {
  const json = JSON.stringify(pool);
  const compressed = await gzip(new TextEncoder().encode(json));
  return `pogo-roster-v${ROSTER_SAVE_CODE_VERSION}:${toBase64Url(compressed)}`;
}

export interface RosterSaveCodeDecodeResult {
  pool: RosterPool;
  entryCount: number;
}

/**
 * Decodes a save code produced by `encodeRosterSaveCode`. Always either
 * returns a fully-valid pool or throws `RosterPoolFormatError` with a
 * legible, specific message — NEVER a half-loaded roster and never an
 * unhandled crash (PLAN_roster_tab.md's explicit requirement). Layers three
 * checks, each with its own message so a failure is diagnosable:
 *   1. the version prefix itself (missing/garbled, or a version this build
 *      doesn't know how to read),
 *   2. the base64url payload (fails on a truncated/edited paste),
 *   3. gzip decompression (also fails on truncation/edits — a corrupted
 *      compressed stream almost never decompresses to valid-looking bytes),
 * and finally reuses `deserializeRosterPoolFromJson` (the SAME validation
 * the file-import path already uses) so a save code and a JSON file export
 * can never disagree about what counts as a valid pool.
 */
export async function decodeRosterSaveCode(code: string): Promise<RosterSaveCodeDecodeResult> {
  const trimmed = code.trim();
  const match = trimmed.match(SAVE_CODE_PREFIX_RE);
  if (!match) {
    throw new RosterPoolFormatError(
      'This doesn\'t look like a roster save code — expected it to start with "pogo-roster-v<N>:". It may be truncated, edited, or pasted from something else. 0 entries restored.',
    );
  }
  const version = Number(match[1]);
  if (version !== ROSTER_SAVE_CODE_VERSION) {
    throw new RosterPoolFormatError(
      `This save code is format version ${version}, but this build of the app only reads version ${ROSTER_SAVE_CODE_VERSION}. It may be from a newer or older version of this tool. 0 entries restored.`,
    );
  }
  const payload = trimmed.slice(match[0].length);
  if (payload === "") {
    throw new RosterPoolFormatError("This save code has no data after its version prefix — it looks truncated. 0 entries restored.");
  }
  let compressed: Uint8Array;
  try {
    compressed = fromBase64Url(payload);
  } catch {
    throw new RosterPoolFormatError("This save code isn't valid — it may be truncated or edited. 0 entries restored.");
  }
  let json: string;
  try {
    const decompressed = await gunzip(compressed);
    json = new TextDecoder().decode(decompressed);
  } catch {
    throw new RosterPoolFormatError("Could not decompress this save code — it may be truncated or edited. 0 entries restored.");
  }
  const pool = deserializeRosterPoolFromJson(json);
  return { pool, entryCount: pool.entries.length };
}
