import pc from 'picocolors';
import type { SuccessEnvelope, ErrorEnvelope } from './types.js';
import { formatData } from './format.js';
import { pickFields, applyFieldSelection, extractListItems } from './fields.js';

/** Current output mode: false = JSON (default), true = human-readable. */
let _humanMode = false;

/** JSONL streaming mode: one JSON object per line, no envelope. */
let _jsonlMode = false;

/** Field selection: comma-separated field names parsed into array. */
let _fieldSelection: string[] | null = null;

/**
 * Set the output mode for all subsequent output calls.
 * Called by the preAction hook in tg.ts based on --human / --no-json flags.
 */
export function setOutputMode(human: boolean): void {
  _humanMode = human;
}

/**
 * Get the current output mode.
 */
export function getOutputMode(): boolean {
  return _humanMode;
}

/**
 * Enable or disable JSONL streaming mode.
 * In JSONL mode, list commands output one JSON object per line without envelope.
 */
export function setJsonlMode(enabled: boolean): void {
  _jsonlMode = enabled;
}

/**
 * Set the field selection filter.
 * Fields are applied to output data to reduce noise.
 */
export function setFieldSelection(fields: string[] | null): void {
  _fieldSelection = fields;
}

/**
 * Write a success response to stdout.
 * Priority: JSONL mode > human mode > JSON mode.
 *
 * - JSONL mode: extracts list items, writes one JSON object per line (no envelope).
 *   Composes with field selection. Falls through to JSON for non-list data.
 * - Human mode: writes formatted text. --fields silently ignored.
 * - JSON mode: writes envelope, applying field selection if set.
 */
export function outputSuccess<T>(data: T): void {
  // JSONL mode: one object per line, no envelope
  if (_jsonlMode) {
    // Special case: { messages, notFound } shape from `message get`
    // Stream found messages to stdout, report notFound IDs to stderr
    const obj = data as Record<string, unknown>;
    if (obj != null && typeof obj === 'object' && Array.isArray(obj.messages) && Array.isArray(obj.notFound)) {
      for (const item of obj.messages as unknown[]) {
        const filtered = _fieldSelection ? pickFields(item, _fieldSelection) : item;
        process.stdout.write(JSON.stringify(filtered) + '\n');
      }
      if ((obj.notFound as number[]).length > 0) {
        process.stderr.write(`Not found: ${(obj.notFound as number[]).join(', ')}\n`);
      }
      return;
    }

    // Special case: DeleteResult shape { deleted[], failed[], mode }
    // Stream each deleted/failed ID as a separate JSONL line
    if (obj != null && typeof obj === 'object' && Array.isArray(obj.deleted) && Array.isArray(obj.failed) && 'mode' in obj) {
      for (const id of obj.deleted as number[]) {
        const entry = _fieldSelection ? pickFields({ id, status: 'deleted' }, _fieldSelection) : { id, status: 'deleted' };
        process.stdout.write(JSON.stringify(entry) + '\n');
      }
      for (const f of obj.failed as { id: number; reason: string }[]) {
        const entry = _fieldSelection ? pickFields({ id: f.id, status: 'failed', reason: f.reason }, _fieldSelection) : { id: f.id, status: 'failed', reason: f.reason };
        process.stdout.write(JSON.stringify(entry) + '\n');
      }
      return;
    }

    const items = extractListItems(data);
    if (items !== null) {
      for (const item of items) {
        const filtered = _fieldSelection ? pickFields(item, _fieldSelection) : item;
        process.stdout.write(JSON.stringify(filtered) + '\n');
      }
      return;
    }
    // Non-list data in JSONL mode: fall through to normal JSON output
  }

  if (_humanMode) {
    // Human mode: --fields silently ignored per design decision
    const formatted = formatData(data);
    process.stdout.write(formatted + '\n');
  } else {
    // JSON mode: apply field selection if set, preserve envelope
    const filteredData = _fieldSelection
      ? applyFieldSelection(data, _fieldSelection) as T
      : data;
    const envelope: SuccessEnvelope<T> = { ok: true, data: filteredData };
    process.stdout.write(JSON.stringify(envelope) + '\n');
  }
}

/**
 * Write an error response.
 * In JSON mode (default): writes JSON envelope { ok: false, error: ... } to stdout.
 * In human mode: writes colored error text to stderr.
 * In JSONL mode: errors always go to stderr (no envelope).
 */
export function outputError(error: string, code?: string): void {
  if (_jsonlMode) {
    // JSONL mode: errors to stderr only, no envelope
    const suffix = code ? ` [${code}]` : '';
    process.stderr.write(`Error: ${error}${suffix}\n`);
    return;
  }
  if (_humanMode) {
    const prefix = pc.red('Error: ');
    const suffix = code ? pc.dim(` [${code}]`) : '';
    process.stderr.write(prefix + error + suffix + '\n');
  } else {
    const envelope: ErrorEnvelope = { ok: false, error, ...(code && { code }) };
    process.stdout.write(JSON.stringify(envelope) + '\n');
  }
}

/**
 * Write a status/progress message to stderr.
 * Suppressed when quiet mode is enabled.
 * NEVER writes to stdout -- stdout is reserved for data output only.
 */
export function logStatus(message: string, quiet: boolean = false): void {
  if (!quiet) {
    process.stderr.write(message + '\n');
  }
}
