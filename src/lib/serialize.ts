import { Api } from 'telegram';
import type { Dialog } from 'telegram/tl/custom/dialog.js';
import { entitiesToMarkdown } from './entity-to-markdown.js';
import type {
  ChatListItem,
  MessageItem,
  SearchResultItem,
  MemberItem,
} from './types.js';

/**
 * Safely convert a BigInteger, number, or null value to a string.
 * gramjs uses big-integer library for IDs -- JSON.stringify would produce {}.
 */
export function bigIntToString(val: any): string {
  if (val == null) return '';
  return val.toString();
}

/**
 * Extract username from a dialog entity (User, Chat, or Channel).
 */
function entityUsername(entity: any): string | null {
  return entity?.username ?? null;
}

/**
 * Determine the chat type from a Dialog's helper properties.
 */
function dialogType(dialog: Dialog): ChatListItem['type'] {
  if (dialog.isUser) return 'user';
  if (dialog.isChannel) {
    const entity = dialog.entity as any;
    if (entity?.megagroup) return 'supergroup';
    return 'channel';
  }
  return 'group'; // isGroup for basic Chat
}

/**
 * Serialize a gramjs Dialog to a lean ChatListItem for list output.
 */
export function serializeDialog(dialog: Dialog): ChatListItem {
  return {
    id: bigIntToString(dialog.id),
    title: dialog.title ?? dialog.name ?? '',
    type: dialogType(dialog),
    username: entityUsername(dialog.entity),
    unreadCount: dialog.unreadCount,
  };
}

/**
 * Detect media type from a message's media object.
 * Returns the media type string and optional emoji for stickers.
 */
function detectMedia(media: any): { mediaType: string | null; emoji?: string } {
  if (!media) return { mediaType: null };

  if (media instanceof Api.MessageMediaPhoto) {
    return { mediaType: 'photo' };
  }

  if (media instanceof Api.MessageMediaDocument) {
    const doc = media.document as any;
    if (doc && doc.attributes) {
      for (const attr of doc.attributes) {
        if (attr instanceof Api.DocumentAttributeSticker) {
          return { mediaType: 'sticker', emoji: attr.alt || undefined };
        }
        if (attr instanceof Api.DocumentAttributeVideo) {
          return { mediaType: 'video' };
        }
        if (attr instanceof Api.DocumentAttributeAudio) {
          if ((attr as any).voice) {
            return { mediaType: 'voice' };
          }
          return { mediaType: 'audio' };
        }
      }
      // Document without recognized attributes
      return { mediaType: 'document' };
    }
    return { mediaType: 'document' };
  }

  // Fallback for other media types
  return { mediaType: 'other' };
}

/**
 * Build sender display name from a User/Chat/Channel entity.
 */
function senderName(entity: any): string | null {
  if (!entity) return null;
  const first = entity.firstName ?? entity.title ?? '';
  const last = entity.lastName ?? '';
  const full = last ? `${first} ${last}` : first;
  return full || null;
}

/**
 * Extract forward-from information from a message's fwdFrom field.
 */
function forwardFromName(fwdFrom: any): string | null {
  if (!fwdFrom) return null;
  return fwdFrom.fromName ?? null;
}

/**
 * Serialize a gramjs Api.Message to a MessageItem for JSON output.
 *
 * Handles: text messages, media messages (photo, video, voice, sticker, document),
 * service messages (action), entity-to-markdown conversion, date conversion,
 * BigInt ID serialization.
 */
export function serializeMessage(
  msg: Api.Message,
  senderEntity?: Api.User | Api.Chat | Api.Channel,
): MessageItem {
  const isService = !!(msg as any).action;
  const { mediaType, emoji } = detectMedia((msg as any).media);

  const text = entitiesToMarkdown(
    (msg as any).message ?? '',
    (msg as any).entities,
  );

  const item: MessageItem = {
    id: msg.id,
    text,
    date: new Date(msg.date * 1000).toISOString(),
    senderId: (msg as any).senderId ? bigIntToString((msg as any).senderId) : null,
    senderName: senderName(senderEntity),
    replyToMsgId: (msg as any).replyTo?.replyToMsgId ?? null,
    forwardFrom: forwardFromName((msg as any).fwdFrom),
    mediaType,
    type: isService ? 'service' : 'message',
  };

  if (isService) {
    const action = (msg as any).action;
    // Use the constructor name as actionText, stripping "MessageAction" prefix
    const className = action?.constructor?.name ?? action?.className ?? 'Unknown';
    item.actionText = className.replace(/^MessageAction/, '');
  }

  if (emoji) {
    item.emoji = emoji;
  }

  return item;
}

/**
 * Serialize a message as a search result with chat context.
 */
export function serializeSearchResult(
  msg: Api.Message,
  chatId: string,
  chatTitle: string,
  senderEntity?: Api.User | Api.Chat | Api.Channel,
): SearchResultItem {
  return {
    ...serializeMessage(msg, senderEntity),
    chatId,
    chatTitle,
  };
}

/**
 * Serialize a gramjs Api.User to a MemberItem.
 */
export function serializeMember(user: Api.User): MemberItem {
  return {
    id: bigIntToString((user as any).id),
    username: (user as any).username ?? null,
    firstName: (user as any).firstName ?? null,
    lastName: (user as any).lastName ?? null,
    isBot: !!(user as any).bot,
    status: (user as any).status?.className ?? null,
  };
}
