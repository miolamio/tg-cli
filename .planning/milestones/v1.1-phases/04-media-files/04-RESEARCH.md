# Phase 4: Media & Files - Research

**Researched:** 2026-03-12
**Domain:** gramjs media download/upload, MTProto search filters, file metadata extraction
**Confidence:** HIGH

## Summary

Phase 4 adds three capabilities: downloading media/files from messages, uploading and sending files (including albums), and filtering search results by media type. All three requirements map cleanly to existing gramjs APIs: `client.downloadMedia()` for downloads, `client.sendFile()` for uploads (with automatic album handling for arrays), and `client.getMessages()` with `filter` parameter for search filtering.

The existing codebase provides strong foundations. The `detectMedia()` function in `serialize.ts` already classifies media types and can be extended to extract metadata (dimensions, duration, fileSize, mimeType, filename). The search command (`message/search.ts`) already handles both per-chat and global search, and just needs a `filter` parameter mapped to `Api.InputMessagesFilter*` classes. The command group pattern (`src/commands/{noun}/`) is well established for adding `src/commands/media/`.

**Primary recommendation:** Use gramjs `client.downloadMedia()` for downloads (handles photo vs document routing automatically), `client.sendFile()` for uploads (pass array of file paths for albums), and `new Api.InputMessagesFilterPhotos()` etc. for search filters. Extend `MessageItem` with an optional `media` object for metadata.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Download command: `tg media download <chat> <msgId>` with comma-separated batch IDs
- Output path: auto-name from Telegram metadata in current directory by default; `-o` for override
- Photos without filename: generate from type + msgId (e.g. `photo_12345.jpg`)
- Response (single): `{ path, filename, size, mediaType, messageId }`
- Response (batch): `{ files: [...], downloaded: N }`
- All paths in response are absolute
- Progress: stderr progress output (bytes/total) for large files, suppressed with `--quiet`
- Upload command: `tg media send <chat> <file...>` with variadic file arguments
- Caption: `--caption "text"` flag
- Reply: `--reply-to <msgId>` flag
- File type detection: auto-detect from extension (.jpg/.png = photo, .mp4/.mov = video, .ogg/.opus = voice, else = document)
- No `--type` override flag
- Album support: multiple file arguments sends as album
- Response (single): full MessageItem via serializeMessage()
- Response (album): `{ messages: MessageItem[], sent: N }`
- Search filter: `--filter <type>` added to existing `tg message search`
- When `--filter` provided, `--query` becomes optional
- Without `--filter`, `--query` remains required (existing behavior unchanged)
- 8 curated filters: photos, videos, documents, urls, voice, music, gifs, round
- Media metadata: nested `media` object on MessageItem when mediaType is not null
- Media object fields: filename, fileSize, mimeType, width/height (photo/video), duration (video/audio/voice)
- No thumbnails or base64
- Human-readable media annotation: `[photo 1920x1080 240KB]`, `[video 0:32 1.2MB]`, `[document report.pdf 3.4MB]`

### Claude's Discretion
- gramjs `downloadMedia()` vs `downloadFile()` API choice
- Exact progress update frequency and formatting
- File extension mapping table details
- Album grouping validation (Telegram restricts mixed photo+video albums)
- Error handling for missing media, permission denied, file too large
- Human-readable download/upload progress formatting

### Deferred Ideas (OUT OF SCOPE)
None
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| READ-07 | User can download files and media from messages to a local path | gramjs `client.downloadMedia()` accepts `Api.Message` directly, returns Buffer or writes to file path. Handles photo/document/contact routing automatically. |
| WRITE-04 | User can upload and send files (photos, videos, documents) from local path | gramjs `client.sendFile()` accepts file path strings directly, auto-detects image vs document. Pass array for album via `_sendAlbum`. |
| READ-05 | User can filter search results by media type | gramjs `getMessages()` accepts `filter` parameter with `Api.InputMessagesFilter*` instances. All 8 curated filters map to available MTProto classes. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| telegram (gramjs) | ^2.26.22 | MTProto client - download, upload, search filters | Already the project's core dependency. Provides `downloadMedia()`, `sendFile()`, and `InputMessagesFilter*` classes |
| commander | ^14.0.3 | CLI command registration | Already used for all command groups |
| picocolors | ^1.1.1 | Terminal colors for human output | Already used in format.ts |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| node:fs/promises | built-in | File existence checks, stat for file size | Validate upload paths exist before sending |
| node:path | built-in | Path resolution, basename, extension extraction | Output path handling, auto-naming |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `client.downloadMedia()` | `client.downloadFile()` (low-level) | `downloadMedia()` is higher-level: auto-detects photo vs document, handles file references, simpler API. Use it. |
| `client.sendFile()` | Raw `Api.messages.SendMedia` | `sendFile()` handles file upload, media conversion, album detection. No reason to go lower. |
| Custom MIME detection | `mime-types` npm package | Node's built-in `path.extname()` suffices since we only need extension-based detection for ~10 types. No new dependency needed. |

## Architecture Patterns

### Recommended Project Structure
```
src/
├── commands/
│   ├── media/
│   │   ├── index.ts        # createMediaCommand() - register download + send subcommands
│   │   ├── download.ts     # mediaDownloadAction handler
│   │   └── send.ts         # mediaSendAction handler
│   └── message/
│       └── search.ts       # Extend with --filter option (modify existing)
├── lib/
│   ├── types.ts            # Add MediaInfo, DownloadResult, UploadResult interfaces; extend MessageItem
│   ├── serialize.ts        # Extend detectMedia() to return MediaInfo; add extractMediaInfo()
│   ├── format.ts           # Add formatDownloadResult(), formatUploadResult(); enhance formatSingleMessage() with media metadata
│   └── media-utils.ts      # NEW: filter mapping, file extension helpers, auto-naming logic
├── bin/
│   └── tg.ts               # Register media command group
```

### Pattern 1: Download via gramjs `downloadMedia()`
**What:** Use `client.downloadMedia()` which accepts an `Api.Message` or `Api.TypeMessageMedia` and returns a `Buffer` or writes to a file path.
**When to use:** Always for downloads -- it handles photo vs document routing, file reference renewal for large files, and DC selection automatically.
**Example:**
```typescript
// Source: gramjs client/downloads.d.ts + downloads.js analysis
import { Api } from 'telegram';

// Get the message first
const messages = await client.getMessages(entity, { ids: [msgId] });
const msg = messages[0];
if (!msg || !msg.media) {
  throw new TgError('Message has no media', 'NO_MEDIA');
}

// Download to buffer (no outputFile arg)
const buffer = await client.downloadMedia(msg, {
  progressCallback: (downloaded, total) => {
    // downloaded and total are BigInteger objects
    logStatus(`${downloaded.toString()}/${total.toString()} bytes`);
  },
});

// Or download to file path (pass outputFile)
const result = await client.downloadMedia(msg, {
  outputFile: '/path/to/save/file.jpg',
});
// result is the file path string when outputFile is a path
```

### Pattern 2: Upload via gramjs `sendFile()`
**What:** Use `client.sendFile()` which accepts file paths directly and handles upload + send in one call. For albums, pass an array of file paths.
**When to use:** Always for file uploads. It handles `CustomFile` creation internally when given a string path.
**Example:**
```typescript
// Source: gramjs client/uploads.d.ts + uploads.js analysis

// Single file
const msg = await client.sendFile(entity, {
  file: '/path/to/photo.jpg',      // string path - auto-detected as image
  caption: 'Check this out',
  replyTo: replyToMsgId,            // optional
});

// Album (array of files)
const msg = await client.sendFile(entity, {
  file: ['/path/a.jpg', '/path/b.jpg', '/path/c.jpg'],
  caption: ['Caption for a', '', ''],  // per-file captions, or single string
});
// NOTE: _sendAlbum returns a single Api.Message (the last one)
// For album results, we need to re-fetch the group of messages

// Force as document (disable image auto-detection)
const msg = await client.sendFile(entity, {
  file: '/path/to/file.pdf',
  forceDocument: true,
});
```

### Pattern 3: Search Filter Mapping
**What:** Map user-friendly filter names to `Api.InputMessagesFilter*` class instances.
**When to use:** When `--filter` is provided on the search command.
**Example:**
```typescript
// Source: gramjs tl/api.d.ts InputMessagesFilter* classes
import { Api } from 'telegram';

const FILTER_MAP: Record<string, Api.TypeMessagesFilter> = {
  photos:    new Api.InputMessagesFilterPhotos(),
  videos:    new Api.InputMessagesFilterVideo(),
  documents: new Api.InputMessagesFilterDocument(),
  urls:      new Api.InputMessagesFilterUrl(),
  voice:     new Api.InputMessagesFilterVoice(),
  music:     new Api.InputMessagesFilterMusic(),
  gifs:      new Api.InputMessagesFilterGif(),
  round:     new Api.InputMessagesFilterRoundVideo(),
};

// Usage in getMessages:
const searchParams: Record<string, any> = {
  search: opts.query || '',
  limit,
  addOffset: offset,
};
if (opts.filter) {
  searchParams.filter = FILTER_MAP[opts.filter];
}
// When filter is set and no search query, gramjs uses
// Api.messages.Search with empty string q, which works correctly
```

### Pattern 4: Media Metadata Extraction
**What:** Extend `detectMedia()` to also extract filename, fileSize, mimeType, dimensions, and duration from the message's media object.
**When to use:** During message serialization to populate the `media` field on `MessageItem`.
**Example:**
```typescript
// Source: gramjs tl/api.d.ts Document, Photo, PhotoSize types

interface MediaInfo {
  filename: string | null;
  fileSize: number | null;
  mimeType: string | null;
  width: number | null;
  height: number | null;
  duration: number | null;
}

function extractMediaInfo(media: any): MediaInfo | null {
  if (!media) return null;

  if (media instanceof Api.MessageMediaPhoto) {
    const photo = media.photo;
    if (!(photo instanceof Api.Photo)) return null;
    // Get largest photo size for dimensions
    const sizes = photo.sizes?.filter(
      (s: any) => s instanceof Api.PhotoSize
    ) ?? [];
    const largest = sizes[sizes.length - 1] as any;
    return {
      filename: null,  // photos don't have filenames
      fileSize: largest?.size ?? null,
      mimeType: 'image/jpeg',  // Telegram always compresses to JPEG
      width: largest?.w ?? null,
      height: largest?.h ?? null,
      duration: null,
    };
  }

  if (media instanceof Api.MessageMediaDocument) {
    const doc = media.document;
    if (!(doc instanceof Api.Document)) return null;
    const info: MediaInfo = {
      filename: null,
      fileSize: Number(doc.size),  // doc.size is BigInt/long
      mimeType: doc.mimeType,
      width: null,
      height: null,
      duration: null,
    };
    for (const attr of doc.attributes) {
      if (attr instanceof Api.DocumentAttributeFilename) {
        info.filename = attr.fileName;
      }
      if (attr instanceof Api.DocumentAttributeVideo) {
        info.width = attr.w;
        info.height = attr.h;
        info.duration = attr.duration;
      }
      if (attr instanceof Api.DocumentAttributeAudio) {
        info.duration = attr.duration;
      }
      if (attr instanceof Api.DocumentAttributeImageSize) {
        info.width = attr.w;
        info.height = attr.h;
      }
    }
    return info;
  }

  return null;
}
```

### Pattern 5: Auto-Naming for Downloads
**What:** Generate filenames for downloaded files when Telegram metadata doesn't provide one.
**When to use:** When downloading photos (no filename in metadata) or documents without a filename attribute.
**Example:**
```typescript
function generateFilename(mediaType: string, msgId: number, mimeType: string | null): string {
  const extMap: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'video/mp4': '.mp4',
    'audio/ogg': '.ogg',
    'audio/mpeg': '.mp3',
  };
  const ext = (mimeType && extMap[mimeType]) || '.bin';
  return `${mediaType}_${msgId}${ext}`;
}
// photo_12345.jpg, video_67890.mp4, document_111.bin
```

### Anti-Patterns to Avoid
- **Using `downloadFile()` directly:** Low-level API requires knowing dcId, file location objects, etc. Use `downloadMedia()` which handles all routing.
- **Building custom upload logic:** gramjs `sendFile()` handles `CustomFile` creation, chunked upload, and media type detection internally. Don't re-implement.
- **Hardcoding MIME types for upload detection:** gramjs `utils.isImage()` already checks `.png`, `.jpg`, `.jpeg` extensions. The `sendFile()` function auto-routes to photo or document. Only override with `forceDocument: true` if needed.
- **Instantiating filter classes with arguments:** `InputMessagesFilterPhotos` etc. take no constructor arguments (they are parameterless MTProto types). Just `new Api.InputMessagesFilterPhotos()`.
- **Using `requiredOption` for `--query` when `--filter` is added:** The search command currently uses `requiredOption('--query')` via Commander. This must be changed to a regular `option('--query')` with manual validation in the action handler (require query when no filter is provided).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Photo/Document download routing | Switch on media types manually | `client.downloadMedia(message)` | Handles photo sizes, document types, file reference renewal, DC migration |
| File upload + media type detection | Manual file reading + `Api.messages.SendMedia` | `client.sendFile(entity, { file: path })` | Handles CustomFile creation, chunked upload, MIME detection, album grouping |
| Album sending | Manual `messages.SendMultiMedia` | `client.sendFile(entity, { file: [paths] })` | Internally calls `_sendAlbum` which handles per-file UploadMedia + SendMultiMedia |
| Search filter construction | Raw `Api.messages.Search` invocation | `client.getMessages(entity, { filter: filterInstance })` | Existing `getMessages` already routes to `Search` vs `SearchGlobal` based on entity |
| Progress callback formatting | Custom streaming progress | gramjs `progressCallback` + `logStatus()` | gramjs provides `(downloaded, total)` BigInteger values; format and emit via logStatus |

**Key insight:** gramjs provides high-level wrappers (`downloadMedia`, `sendFile`, `getMessages` with filter) that handle all the MTProto complexity. Every piece of Phase 4 maps directly to these existing APIs.

## Common Pitfalls

### Pitfall 1: BigInteger File Sizes
**What goes wrong:** `doc.size` and progress callback values are `big-integer` library objects, not JavaScript numbers. Calling `JSON.stringify()` produces `{}`.
**Why it happens:** gramjs uses `big-integer` for all 64-bit values (IDs, file sizes).
**How to avoid:** Always convert with `.toJSNumber()` for sizes that fit in JS Number range (safe up to 9 PB), or use `.toString()` for display.
**Warning signs:** Empty `{}` in JSON output for size fields.

### Pitfall 2: `_sendAlbum` Returns Single Message
**What goes wrong:** When sending an album (array of files), `_sendAlbum` returns only one `Api.Message` (the last), not an array.
**Why it happens:** The gramjs implementation returns the result of `SendMultiMedia` which is a single Updates object, then extracts a single message.
**How to avoid:** After sending an album, re-fetch the messages by their grouped ID or by the message IDs from the Updates result to get all album messages.
**Warning signs:** Album response only contains one message instead of N.

### Pitfall 3: `--query` Required vs Optional Transition
**What goes wrong:** The search command currently uses Commander's `requiredOption('--query')` which enforces query presence at the Commander level. Adding `--filter` that makes query optional requires changing this to `option('--query')` with manual validation.
**Why it happens:** Commander's `requiredOption` throws before the action handler runs, preventing custom validation logic.
**How to avoid:** Change `requiredOption('--query', ...)` to `option('--query', ...)` and add validation in the action handler: if neither `--query` nor `--filter` is provided, output error.
**Warning signs:** Commander throws "required option '--query' not specified" even when `--filter` is present.

### Pitfall 4: Photos Always Compressed to JPEG
**What goes wrong:** Attempting to preserve original format for photos. Telegram always compresses photos to JPEG server-side.
**Why it happens:** Telegram's photo pipeline converts all uploaded photos to JPEG. Original files are only preserved when sent as documents (`forceDocument: true`).
**How to avoid:** For photo downloads, always use `.jpg` extension. For uploads, if the user sends `.png` it will still arrive as JPEG unless forced as document.
**Warning signs:** Downloaded photo files have wrong extension or corrupted headers.

### Pitfall 5: Download Returns Buffer When No OutputFile
**What goes wrong:** Calling `downloadMedia()` without `outputFile` parameter returns a `Buffer` in memory, which for large files (videos, documents) causes OOM.
**Why it happens:** Default behavior is to return buffer for programmatic use.
**How to avoid:** Always pass `outputFile` as a file path string for downloads. The function will write directly to disk and return the path string.
**Warning signs:** High memory usage during large file downloads.

### Pitfall 6: Album Upload Restrictions
**What goes wrong:** Telegram rejects albums with mixed types or too many items. Maximum 10 items per album. Only photos and videos can be mixed; documents must be sent separately or as their own album.
**Why it happens:** Telegram API `SendMultiMedia` has restrictions on `InputSingleMedia` types.
**How to avoid:** Validate album composition before sending. If files mix photos/videos with documents, either reject with clear error or split into separate sends. Limit to 10 files max.
**Warning signs:** `MEDIA_INVALID` or `MULTI_MEDIA_TOO_LONG` errors from Telegram.

### Pitfall 7: Message Without Media on Download
**What goes wrong:** User requests download for a text-only message. `msg.media` is null.
**Why it happens:** Not all messages have media attachments.
**How to avoid:** Check `msg.media` before calling `downloadMedia()`. Return clear error: "Message {id} has no downloadable media" with code `NO_MEDIA`.
**Warning signs:** `downloadMedia()` returns empty Buffer for messages without media.

## Code Examples

### Download Media to File
```typescript
// Source: gramjs client/downloads.d.ts, downloads.js
import { resolve } from 'node:path';

async function downloadMessageMedia(
  client: TelegramClient,
  entity: any,
  msgId: number,
  outputPath?: string,
  quiet: boolean = false,
): Promise<{ path: string; filename: string; size: number; mediaType: string; messageId: number }> {
  const messages = await client.getMessages(entity, { ids: [msgId] });
  const msg = messages[0];
  if (!msg?.media) {
    throw new TgError(`Message ${msgId} has no downloadable media`, 'NO_MEDIA');
  }

  const mediaInfo = extractMediaInfo(msg.media);
  const filename = mediaInfo?.filename
    ?? generateFilename(detectMedia(msg.media).mediaType ?? 'file', msgId, mediaInfo?.mimeType);

  const targetPath = outputPath
    ? resolve(outputPath)
    : resolve(process.cwd(), filename);

  await client.downloadMedia(msg, {
    outputFile: targetPath,
    progressCallback: (downloaded, total) => {
      if (!quiet) {
        const pct = total.gt(0)
          ? Math.round(downloaded.toJSNumber() / total.toJSNumber() * 100)
          : 0;
        logStatus(`Downloading: ${pct}% (${downloaded}/${total} bytes)`, quiet);
      }
    },
  });

  return {
    path: targetPath,
    filename,
    size: mediaInfo?.fileSize ?? 0,
    mediaType: detectMedia(msg.media).mediaType ?? 'unknown',
    messageId: msgId,
  };
}
```

### Upload / Send File
```typescript
// Source: gramjs client/uploads.d.ts, uploads.js
async function sendMediaFile(
  client: TelegramClient,
  entity: any,
  filePaths: string[],
  opts: { caption?: string; replyTo?: number; quiet?: boolean },
) {
  const isAlbum = filePaths.length > 1;

  if (isAlbum && filePaths.length > 10) {
    throw new TgError('Albums support a maximum of 10 files', 'ALBUM_TOO_LARGE');
  }

  // Validate all files exist
  for (const fp of filePaths) {
    try {
      await fs.access(fp);
    } catch {
      throw new TgError(`File not found: ${fp}`, 'FILE_NOT_FOUND');
    }
  }

  const sendParams: any = {
    file: isAlbum ? filePaths : filePaths[0],
    caption: opts.caption ?? '',
    replyTo: opts.replyTo,
    progressCallback: (progress: number) => {
      if (!opts.quiet) {
        logStatus(`Uploading: ${Math.round(progress * 100)}%`);
      }
    },
  };

  // Determine if voice note based on extension
  const ext = path.extname(filePaths[0]).toLowerCase();
  if (['.ogg', '.opus'].includes(ext)) {
    sendParams.voiceNote = true;
  }

  const result = await client.sendFile(entity, sendParams);
  return result;
}
```

### Search with Filter
```typescript
// Source: gramjs client/messages.js filter handling
import { Api } from 'telegram';

const FILTER_MAP: Record<string, () => Api.TypeMessagesFilter> = {
  photos:    () => new Api.InputMessagesFilterPhotos(),
  videos:    () => new Api.InputMessagesFilterVideo(),
  documents: () => new Api.InputMessagesFilterDocument(),
  urls:      () => new Api.InputMessagesFilterUrl(),
  voice:     () => new Api.InputMessagesFilterVoice(),
  music:     () => new Api.InputMessagesFilterMusic(),
  gifs:      () => new Api.InputMessagesFilterGif(),
  round:     () => new Api.InputMessagesFilterRoundVideo(),
};

// In search action handler:
const searchParams: Record<string, any> = {
  limit,
  addOffset: offset,
};

if (opts.query) {
  searchParams.search = opts.query;
}

if (opts.filter) {
  const filterFactory = FILTER_MAP[opts.filter];
  if (!filterFactory) {
    outputError(`Unknown filter: ${opts.filter}. Valid: ${Object.keys(FILTER_MAP).join(', ')}`, 'INVALID_FILTER');
    return;
  }
  searchParams.filter = filterFactory();
}

// Validation: at least one of --query or --filter required
if (!opts.query && !opts.filter) {
  outputError('Either --query or --filter is required', 'MISSING_QUERY');
  return;
}
```

### Extended MessageItem with Media Metadata
```typescript
// Types extension
interface MediaInfo {
  filename: string | null;
  fileSize: number | null;
  mimeType: string | null;
  width: number | null;
  height: number | null;
  duration: number | null;
}

// Extend existing MessageItem
interface MessageItem {
  // ... existing fields ...
  media?: MediaInfo;  // Optional, only present when mediaType is not null
}

// Human-readable media annotation
function formatMediaAnnotation(m: MessageItem): string {
  if (!m.media) return m.mediaType ? `[${m.mediaType}]` : '';

  const parts = [m.mediaType ?? 'file'];

  if (m.media.width && m.media.height) {
    parts.push(`${m.media.width}x${m.media.height}`);
  }
  if (m.media.duration != null) {
    const mins = Math.floor(m.media.duration / 60);
    const secs = Math.round(m.media.duration % 60);
    parts.push(`${mins}:${String(secs).padStart(2, '0')}`);
  }
  if (m.media.fileSize != null) {
    parts.push(formatBytes(m.media.fileSize));
  }
  if (m.media.filename) {
    parts.push(m.media.filename);
  }

  return `[${parts.join(' ')}]`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `downloadFile()` low-level API | `downloadMedia()` high-level wrapper | gramjs 2.x | Handles photo/document routing, file ref renewal automatically |
| Manual `SendMultiMedia` for albums | `sendFile()` with array file param | gramjs 2.x | Automatic album handling when file is an array |
| `getMessages()` with manual Search API | `getMessages()` with `filter` param | gramjs 2.x | Filter parameter transparently routes to `messages.Search` or `messages.SearchGlobal` |

**Deprecated/outdated:**
- `downloadFile()`: Still available but `downloadMedia()` is the recommended API (handles DC migration, file reference renewal)
- Direct `Api.messages.Search` invocation: Unnecessary since `getMessages()` with `filter` and `search` params handles the routing

## Open Questions

1. **Album send return value**
   - What we know: `_sendAlbum` returns a single `Api.Message`, not an array
   - What's unclear: Whether the returned message has a `groupedId` field to fetch siblings, or whether we need to rely on the Updates response
   - Recommendation: After album send, use the returned message's ID range (album messages are sequential) to re-fetch all messages in the group. Alternatively, the Updates result may contain all message IDs. Test during implementation.

2. **Progress callback frequency**
   - What we know: gramjs calls progress callback per chunk (default 64KB chunks)
   - What's unclear: Whether this is too frequent for stderr output
   - Recommendation: Throttle progress output to at most once per second or per 5% change to avoid stderr flooding

3. **Voice note detection for uploads**
   - What we know: gramjs `sendFile` has `voiceNote: boolean` param; user decision says auto-detect .ogg/.opus as voice
   - What's unclear: Whether all .ogg files should be voice notes (some may be regular audio)
   - Recommendation: Treat .ogg/.opus as voice notes per user decision. Users who want to send these as documents can use a different extension or we can add a future flag.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 3.2.4 |
| Config file | vitest.config.ts |
| Quick run command | `npx vitest run` |
| Full suite command | `npx vitest run` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| READ-07 | Download media from message | unit | `npx vitest run tests/unit/media-download.test.ts -x` | Wave 0 |
| READ-07 | Download batch (comma-separated IDs) | unit | `npx vitest run tests/unit/media-download.test.ts -x` | Wave 0 |
| READ-07 | Auto-naming for files without filenames | unit | `npx vitest run tests/unit/media-utils.test.ts -x` | Wave 0 |
| WRITE-04 | Upload/send single file | unit | `npx vitest run tests/unit/media-send.test.ts -x` | Wave 0 |
| WRITE-04 | Send album (multiple files) | unit | `npx vitest run tests/unit/media-send.test.ts -x` | Wave 0 |
| WRITE-04 | Voice note auto-detection | unit | `npx vitest run tests/unit/media-utils.test.ts -x` | Wave 0 |
| READ-05 | Search with --filter parameter | unit | `npx vitest run tests/unit/message-search.test.ts -x` | Exists (extend) |
| READ-05 | --query optional when --filter set | unit | `npx vitest run tests/unit/message-search.test.ts -x` | Exists (extend) |
| READ-05 | Invalid filter name error | unit | `npx vitest run tests/unit/message-search.test.ts -x` | Exists (extend) |
| ALL | Media metadata extraction | unit | `npx vitest run tests/unit/serialize.test.ts -x` | Exists (extend) |
| ALL | Human-readable media annotations | unit | `npx vitest run tests/unit/format.test.ts -x` | Exists (extend) |
| ALL | CLI --help shows media command group | integration | `npx vitest run tests/integration/cli-entry.test.ts -x` | Exists (extend) |

### Sampling Rate
- **Per task commit:** `npx vitest run`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/unit/media-download.test.ts` -- covers READ-07 (download action handler)
- [ ] `tests/unit/media-send.test.ts` -- covers WRITE-04 (upload/send action handler)
- [ ] `tests/unit/media-utils.test.ts` -- covers filter mapping, auto-naming, file type detection

## Sources

### Primary (HIGH confidence)
- gramjs `node_modules/telegram/client/downloads.d.ts` - downloadMedia interface, DownloadMediaInterface, progressCallback types
- gramjs `node_modules/telegram/client/downloads.js` - downloadMedia implementation, photo/document routing logic
- gramjs `node_modules/telegram/client/uploads.d.ts` - sendFile interface, SendFileInterface, CustomFile class
- gramjs `node_modules/telegram/client/uploads.js` - sendFile implementation, _sendAlbum logic, _fileToMedia auto-detection
- gramjs `node_modules/telegram/client/messages.d.ts` - IterMessagesParams with filter parameter
- gramjs `node_modules/telegram/client/messages.js` - filter routing to Search/SearchGlobal, InputMessagesFilterEmpty default
- gramjs `node_modules/telegram/tl/api.d.ts` - All InputMessagesFilter* classes, Document, Photo, PhotoSize, DocumentAttribute* types
- Existing codebase: `src/lib/serialize.ts`, `src/commands/message/search.ts`, `src/lib/types.ts`, `src/lib/format.ts`

### Secondary (MEDIUM confidence)
- gramjs `node_modules/telegram/Utils.js` - isImage() checks (.png, .jpg, .jpeg), getExtension() for documents

### Tertiary (LOW confidence)
- Album send return value behavior (single Message vs array) -- needs runtime validation during implementation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all APIs verified directly from gramjs source code in node_modules
- Architecture: HIGH - follows established project patterns (command groups, serialization, formatting)
- Pitfalls: HIGH - identified from gramjs source analysis (BigInt sizes, album return value, filter instantiation)
- API surface: HIGH - all type signatures and implementations verified from gramjs d.ts and .js files

**Research date:** 2026-03-12
**Valid until:** 2026-04-12 (stable gramjs API, no breaking changes expected)
