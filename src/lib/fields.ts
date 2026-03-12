/**
 * Field selection utilities for --fields CLI option.
 * Supports dot-notation for nested paths (e.g., "media.filename").
 */

/** Known array property names for list command detection. */
const LIST_KEYS = ['messages', 'chats', 'members', 'topics', 'files'] as const;

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
    // Walk source object to find value
    let value: unknown = obj;
    let valid = true;
    for (const part of parts) {
      if (value == null || typeof value !== 'object') {
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
      if (!(part in target) || typeof target[part] !== 'object' || target[part] == null) {
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

  // Check if any value is an array of objects (list-shaped data)
  const hasArrayOfObjects = Object.values(obj).some(
    (value) =>
      Array.isArray(value) &&
      value.length > 0 &&
      typeof value[0] === 'object' &&
      value[0] !== null,
  );

  // Single-object output (e.g., MessageItem from `message send`):
  // apply pickFields directly to the top-level object
  if (!hasArrayOfObjects) {
    return pickFields(obj, fields);
  }

  // List-shaped data: filter each array item, preserve metadata
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (
      Array.isArray(value) &&
      value.length > 0 &&
      typeof value[0] === 'object' &&
      value[0] !== null
    ) {
      result[key] = value.map((item) => pickFields(item, fields));
    } else {
      // Metadata or scalar — preserve as-is
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
