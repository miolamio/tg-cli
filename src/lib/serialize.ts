import { Api } from 'telegram';
import type { Dialog } from 'telegram/tl/custom/dialog.js';
import { entitiesToMarkdown } from './entity-to-markdown.js';
import type {
  ChatListItem,
  MediaInfo,
  MessageItem,
  PollData,
  PollOption,
  ReactionCount,
  SearchResultItem,
  MemberItem,
  TopicItem,
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
export function detectMedia(media: any): { mediaType: string | null; emoji?: string } {
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

  if (media instanceof Api.MessageMediaPoll) {
    return { mediaType: 'poll' };
  }

  // Fallback for other media types
  return { mediaType: 'other' };
}

/**
 * Safely convert a gramjs numeric value (possibly BigInteger) to a JS number.
 * gramjs uses big-integer for some fields like file sizes.
 */
function toSafeNumber(val: any): number | null {
  if (val == null) return null;
  if (typeof val === 'number') return val;
  if (typeof val.toJSNumber === 'function') return val.toJSNumber();
  const n = Number(val);
  return isNaN(n) ? null : n;
}

/**
 * Extract detailed media metadata from a message's media object.
 *
 * Supports MessageMediaPhoto (extracts largest PhotoSize dimensions/size)
 * and MessageMediaDocument (extracts doc attributes for filename, dimensions, duration).
 * Returns null for unsupported media types or null/undefined input.
 */
export function extractMediaInfo(media: any): MediaInfo | null {
  if (!media) return null;

  if (media instanceof Api.MessageMediaPhoto) {
    const photo = media.photo as any;
    if (!photo || !photo.sizes) return null;

    // Find largest PhotoSize with dimensions
    let bestSize: any = null;
    for (const s of photo.sizes) {
      if (s.w != null && s.h != null) {
        if (!bestSize || (s.w * s.h > bestSize.w * bestSize.h)) {
          bestSize = s;
        }
      }
    }

    return {
      filename: null,
      fileSize: toSafeNumber(bestSize?.size),
      mimeType: 'image/jpeg',
      width: bestSize?.w ?? null,
      height: bestSize?.h ?? null,
      duration: null,
    };
  }

  if (media instanceof Api.MessageMediaDocument) {
    const doc = media.document as any;
    if (!doc) return null;

    let filename: string | null = null;
    let width: number | null = null;
    let height: number | null = null;
    let duration: number | null = null;

    if (doc.attributes) {
      for (const attr of doc.attributes) {
        if (attr instanceof Api.DocumentAttributeFilename) {
          filename = attr.fileName;
        }
        if (attr instanceof Api.DocumentAttributeVideo) {
          width = attr.w ?? null;
          height = attr.h ?? null;
          duration = attr.duration ?? null;
        }
        if (attr instanceof Api.DocumentAttributeAudio) {
          duration = attr.duration ?? null;
        }
        if (attr instanceof Api.DocumentAttributeImageSize) {
          width = attr.w ?? null;
          height = attr.h ?? null;
        }
      }
    }

    return {
      filename,
      fileSize: toSafeNumber(doc.size),
      mimeType: doc.mimeType ?? null,
      width,
      height,
      duration,
    };
  }

  return null;
}

/**
 * Extract structured poll data from a MessageMediaPoll.
 *
 * Returns null if the media is not a MessageMediaPoll.
 * Maps poll answers to PollOption[] with vote counts matched via Buffer.equals
 * on option bytes. Derives correctOption as 1-based index from the first
 * option where correct === true.
 */
export function extractPollData(media: any): PollData | null {
  if (!(media instanceof Api.MessageMediaPoll)) return null;

  const poll = media.poll;
  const results = (media as any).results;

  const options: PollOption[] = (poll as any).answers.map((answer: any) => {
    const optionBytes = Buffer.from(answer.option);
    // Find matching voter result
    const voterResult = results?.results?.find(
      (r: any) => Buffer.from(r.option).equals(optionBytes),
    );
    return {
      text: answer.text?.text ?? answer.text ?? '',
      voters: voterResult?.voters ?? 0,
      chosen: voterResult?.chosen ?? false,
      correct: voterResult?.correct ?? false,
    };
  });

  // Derive correctOption: 1-based index of first correct option
  let correctOption: number | null = null;
  for (let i = 0; i < options.length; i++) {
    if (options[i].correct) {
      correctOption = i + 1;
      break;
    }
  }

  return {
    question: (poll as any).question?.text ?? '',
    options,
    isQuiz: !!(poll as any).quiz,
    isPublic: !!(poll as any).publicVoters,
    isMultiple: !!(poll as any).multipleChoice,
    isClosed: !!(poll as any).closed,
    closePeriod: (poll as any).closePeriod ?? null,
    closeDate: (poll as any).closeDate
      ? new Date((poll as any).closeDate * 1000).toISOString()
      : null,
    totalVoters: results?.totalVoters ?? 0,
    correctOption,
    solution: results?.solution ?? null,
  };
}

/**
 * Extract reaction counts from a message's reactions object.
 */
function extractReactions(reactions: any): ReactionCount[] {
  if (!reactions?.results) return [];
  return reactions.results
    .filter((r: any) => r.count > 0)
    .map((r: any) => ({
      emoji: r.reaction?.emoticon ?? r.reaction?.documentId?.toString() ?? '?',
      count: r.count,
    }));
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

  // Extract reaction counts
  const reactions = extractReactions((msg as any).reactions);

  const item: MessageItem = {
    id: msg.id,
    text,
    date: msg.date ? new Date(msg.date * 1000).toISOString() : new Date().toISOString(),
    senderId: (msg as any).senderId ? bigIntToString((msg as any).senderId) : null,
    senderName: senderName(senderEntity),
    replyToMsgId: (msg as any).replyTo?.replyToMsgId ?? null,
    forwardFrom: forwardFromName((msg as any).fwdFrom),
    mediaType,
    type: isService ? 'service' : 'message',
    views: (msg as any).views ?? null,
    forwards: (msg as any).forwards ?? null,
    ...(reactions.length > 0 && { reactions }),
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

  // Populate editDate when message has been edited (gramjs stores as Unix timestamp)
  if ((msg as any).editDate) {
    item.editDate = new Date((msg as any).editDate * 1000).toISOString();
  }

  // Populate media metadata when message has media
  if (mediaType) {
    const mediaInfo = extractMediaInfo((msg as any).media);
    if (mediaInfo) {
      item.media = mediaInfo;
    }
  }

  // Populate poll data when message contains a poll
  const pollData = extractPollData((msg as any).media);
  if (pollData) {
    item.poll = pollData;
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
 * Extract the peer ID from a gramjs fromId peer object.
 * Handles PeerUser (userId), PeerChannel (channelId), and PeerChat (chatId).
 */
function extractPeerId(fromId: any): string {
  if (!fromId) return '';
  return bigIntToString(fromId.userId ?? fromId.channelId ?? fromId.chatId ?? '');
}

/**
 * Serialize a gramjs ForumTopic to a TopicItem for JSON output.
 *
 * Maps gramjs fields: topMessage -> messageCount, closed -> isClosed, pinned -> isPinned.
 * iconEmojiId is converted to string representation if present, null otherwise.
 */
export function serializeTopic(topic: any): TopicItem {
  return {
    id: topic.id,
    title: topic.title ?? '',
    iconEmoji: topic.iconEmojiId != null ? topic.iconEmojiId.toString() : null,
    creationDate: topic.date ? new Date(topic.date * 1000).toISOString() : new Date().toISOString(),
    creatorId: extractPeerId(topic.fromId),
    messageCount: topic.topMessage ?? 0,
    isClosed: !!topic.closed,
    isPinned: !!topic.pinned,
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
