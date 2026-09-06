/**
 * Build entity lookup map from API result users/chats arrays.
 * Shared utility used by replies, get-by-ID, and pinned message commands.
 *
 * @param result - API response containing optional users[] and chats[] arrays
 * @returns Map keyed by marked peer ID, keeping user/chat/channel namespaces distinct
 */
export function buildEntityMap(result: any): Map<string, any> {
  const map = new Map<string, any>();
  for (const u of result.users ?? []) {
    map.set(markedPeerId(u), u);
  }
  for (const c of result.chats ?? []) {
    map.set(markedPeerId(c), c);
  }
  return map;
}
import { markedPeerId } from './serialize.js';
