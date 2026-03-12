import { Api } from 'telegram';

/**
 * Map of user-facing filter names to factory functions that create
 * gramjs InputMessagesFilter instances for search filtering.
 *
 * Factory functions ensure a fresh instance per call (gramjs mutates filter objects).
 */
export const FILTER_MAP: Record<string, () => InstanceType<any>> = {
  photos: () => new Api.InputMessagesFilterPhotos(),
  videos: () => new Api.InputMessagesFilterVideo(),
  photo_video: () => new Api.InputMessagesFilterPhotoVideo(),
  documents: () => new Api.InputMessagesFilterDocument(),
  urls: () => new Api.InputMessagesFilterUrl(),
  gifs: () => new Api.InputMessagesFilterGif(),
  voice: () => new Api.InputMessagesFilterVoice(),
  music: () => new Api.InputMessagesFilterMusic(),
  round: () => new Api.InputMessagesFilterRoundVideo(),
  round_voice: () => new Api.InputMessagesFilterRoundVoice(),
  chat_photos: () => new Api.InputMessagesFilterChatPhotos(),
  phone_calls: () => new Api.InputMessagesFilterPhoneCalls({ missed: false }),
  mentions: () => new Api.InputMessagesFilterMyMentions(),
  geo: () => new Api.InputMessagesFilterGeo(),
  contacts: () => new Api.InputMessagesFilterContacts(),
  pinned: () => new Api.InputMessagesFilterPinned(),
};

/**
 * Array of valid filter names for validation and help text.
 */
export const VALID_FILTERS: string[] = Object.keys(FILTER_MAP);

/**
 * MIME type to file extension map for auto-naming downloaded files.
 */
const MIME_EXT_MAP: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/bmp': '.bmp',
  'video/mp4': '.mp4',
  'video/quicktime': '.mov',
  'video/x-msvideo': '.avi',
  'video/x-matroska': '.mkv',
  'video/webm': '.webm',
  'audio/ogg': '.ogg',
  'audio/mpeg': '.mp3',
  'audio/opus': '.opus',
};

/**
 * Generate an auto-name for a downloaded media file.
 *
 * Format: {mediaType}_{msgId}{ext}
 * Extension derived from MIME type; falls back to .bin.
 */
export function generateFilename(
  mediaType: string,
  msgId: number,
  mimeType: string | null,
): string {
  const ext = mimeType ? (MIME_EXT_MAP[mimeType] ?? '.bin') : '.bin';
  return `${mediaType}_${msgId}${ext}`;
}

/**
 * Extension sets for file type classification.
 */
const PHOTO_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp']);
const VIDEO_EXTS = new Set(['.mp4', '.mov', '.avi', '.mkv', '.webm']);
const VOICE_EXTS = new Set(['.ogg', '.opus']);

/**
 * Classify a file by its extension for upload type detection.
 */
export function detectFileType(
  ext: string,
): 'photo' | 'video' | 'voice' | 'document' {
  const lower = ext.toLowerCase();
  if (PHOTO_EXTS.has(lower)) return 'photo';
  if (VIDEO_EXTS.has(lower)) return 'video';
  if (VOICE_EXTS.has(lower)) return 'voice';
  return 'document';
}

/**
 * Format a byte count as a human-readable string.
 *
 * <1024 -> NB, <1MB -> NKB (rounded), <1GB -> N.NMB, else N.NGB
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`;
}
