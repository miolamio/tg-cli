/**
 * Field selection utilities for --fields CLI option.
 * Supports dot-notation for nested paths (e.g., "media.filename").
 */

/** Known array property names for list command detection. */
const LIST_KEYS = ['messages', 'chats', 'members', 'topics', 'files', 'profiles', 'users', 'contacts', 'results', 'posts'] as const;
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Pick specific fields from an object, supporting dot-notation paths.
 * Missing or invalid paths are silently omitted.
 *
 * @example
 * pickFields({ id: 1, text: "hi", date: "2026" }, ["id", "text"])
 * // => { id: 1, text: "hi" }
 *
 * pickFields({ id: 1, media: { filename: "a.jpg", fileSize: 100 } }, ["id", "media.filename"])
 * // => { id: 1, media: { filename: "a.jpg" } }
 */
export function pickFields<T>(obj: T, fields: string[]): Partial<T> {
  const result: Record<string, unknown> = {};

  for (const field of fields) {
    const parts = field.split('.');
    if (parts.some(part => !part || UNSAFE_KEYS.has(part))) continue;
    // Walk source object to find value
    let value: unknown = obj;
    let valid = true;
    for (const part of parts) {
      if (value == null || typeof value !== 'object' || !Object.hasOwn(value, part)) {
        valid = false;
        break;
      }
      value = (value as Record<string, unknown>)[part];
      if (value === undefined) {
        valid = false;
        break;
      }
    }
    if (!valid) continue;

    // Reconstruct nested path in result
    let target = result;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!Object.hasOwn(target, part) || typeof target[part] !== 'object' || target[part] == null) {
        target[part] = {};
      }
      target = target[part] as Record<string, unknown>;
    }
    target[parts[parts.length - 1]] = value;
  }

  return result as Partial<T>;
}

/**
 * Apply field selection to a data object.
 * For list data (containing arrays of objects), filters each item with pickFields
 * while preserving metadata fields (total, count, etc.).
 *
 * @example
 * applyFieldSelection({ messages: [{ id: 1, text: "hi" }], total: 5 }, ["id"])
 * // => { messages: [{ id: 1 }], total: 5 }
 */
export function applyFieldSelection(data: unknown, fields: string[]): unknown {
  if (data == null || typeof data !== 'object') return data;

  const obj = data as Record<string, unknown>;

  const isNamedListKey = (key: string) =>
    (LIST_KEYS as readonly string[]).includes(key);

  const isListShaped = Object.entries(obj).some(([key, value]) => {
    if (key === 'errors' || UNSAFE_KEYS.has(key)) return false;
    if (!Array.isArray(value)) return false;
    if (isNamedListKey(key)) return true;
    return value.length > 0 && typeof value[0] === 'object' && value[0] !== null;
  });

  // Single-object output (e.g., MessageItem from `message send`)
  if (!isListShaped) {
    const selected = pickFields(obj, fields);
    if (Array.isArray(obj.errors)) {
      selected.errors = obj.errors;
      if (typeof obj.partial === 'boolean') selected.partial = obj.partial;
    }
    return selected;
  }

  // List-shaped data: filter each array item, preserve metadata (including empty lists)
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (UNSAFE_KEYS.has(key)) continue;
    // Failures are operation metadata, not successful list items. Never
    // erase their error/code when selecting fields such as --fields id.
    if (key === 'errors' && Array.isArray(value)) {
      result[key] = value;
      continue;
    }
    if (
      Array.isArray(value) &&
      (isNamedListKey(key) || (value.length > 0 && typeof value[0] === 'object' && value[0] !== null))
    ) {
      result[key] = value.map((item) =>
        item != null && typeof item === 'object' ? pickFields(item, fields) : item,
      );
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Extract the list items array from a data object, if present.
 * Checks known array property names in order: messages, chats, members, topics, files.
 * Returns null if no list array is found.
 */
export function extractListItems(data: unknown): unknown[] | null {
  if (data == null || typeof data !== 'object') return null;

  const obj = data as Record<string, unknown>;

  for (const key of LIST_KEYS) {
    if (Array.isArray(obj[key])) {
      return obj[key] as unknown[];
    }
  }

  return null;
}
