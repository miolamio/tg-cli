# Phase 4: Media & Files - Context

**Gathered:** 2026-03-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Download media/files from messages to local paths, upload and send files (photos, videos, documents) to any chat with album support, and filter search results by media type. This phase adds the `media` command group and extends the existing `message search` command with `--filter`. No forum topics, no multi-chat search, no field selection.

</domain>

<decisions>
## Implementation Decisions

### Download command design
- Command: `tg media download <chat> <msgId>` — targets media by chat + message ID
- Batch download: comma-separated IDs `tg media download @ch 123,456,789`
- Output path: auto-name from Telegram metadata in current directory by default
- Photos without filename: generate from type + msgId (e.g. `photo_12345.jpg`)
- `-o` flag overrides: file path for single download, directory for batch
- Response (single): `{ path, filename, size, mediaType, messageId }`
- Response (batch): `{ files: [...], downloaded: N }`
- All paths in response are absolute
- Progress: stderr progress output (bytes/total) for large files, suppressed with `--quiet`

### Upload/send command design
- Command: `tg media send <chat> <file...>` — new command under `media` group
- Caption: `--caption "text"` flag for attaching text to the media
- Reply: `--reply-to <msgId>` flag for replying with media
- File type detection: auto-detect from file extension (.jpg/.png = photo, .mp4/.mov = video, .ogg/.opus = voice, everything else = document)
- No `--type` override flag — auto-detection only
- Album support: multiple file arguments sends as album (`tg media send @user ./a.jpg ./b.jpg ./c.jpg`)
- Response (single): full MessageItem via serializeMessage() — consistent with `tg message send`
- Response (album): `{ messages: MessageItem[], sent: N }`

### Search filter integration
- Add `--filter <type>` to existing `tg message search` command
- When `--filter` is provided, `--query` becomes optional (enables media-type browsing without text search)
- Without `--filter`, `--query` remains required (existing behavior unchanged)
- Curated filter set (8 filters mapped to MTProto classes):
  - `photos` → InputMessagesFilterPhotos
  - `videos` → InputMessagesFilterVideo
  - `documents` → InputMessagesFilterDocument
  - `urls` → InputMessagesFilterUrl
  - `voice` → InputMessagesFilterVoice
  - `music` → InputMessagesFilterMusic
  - `gifs` → InputMessagesFilterGif
  - `round` → InputMessagesFilterRoundVideo
- Works with per-chat search (`--chat`) and global search

### Media metadata in output
- Add nested `media` object to MessageItem when mediaType is not null
- Text-only messages: no `media` field (keeps existing output unchanged)
- Media object fields: `filename`, `fileSize`, `mimeType`, `width`/`height` (photo/video), `duration` (video/audio/voice)
- No thumbnails or base64 — just metadata fields
- Applies to all commands that return messages (history, search, send, forward)
- Human-readable mode: inline annotation with key info — `[photo 1920x1080 240KB]`, `[video 0:32 1.2MB]`, `[document report.pdf 3.4MB]`

### Claude's Discretion
- gramjs `downloadMedia()` vs `downloadFile()` API choice
- Exact progress update frequency and formatting
- File extension mapping table details
- Album grouping validation (Telegram restricts mixed photo+video albums)
- Error handling for missing media, permission denied, file too large
- Human-readable download/upload progress formatting

</decisions>

<specifics>
## Specific Ideas

- Download response includes absolute paths so agents can reliably reference the file
- Auto-naming convention: original Telegram filename when available, fallback to `{mediaType}_{msgId}.{ext}`
- Album upload uses variadic file arguments (not comma-separated), consistent with shell conventions
- Media metadata enriches existing MessageItem without breaking backward compatibility (new optional field)
- Search filter makes `--query` conditionally optional — smart validation based on which flags are present

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `detectMedia()` (`src/lib/serialize.ts`): Already classifies media types (photo, video, voice, sticker, audio, document) — extend to extract metadata
- `serializeMessage()` (`src/lib/serialize.ts`): Message serialization — extend with optional `media` object
- `resolveEntity()` (`src/lib/peer.ts`): Peer resolution for chat targeting — used by download/send
- `withClient()` (`src/lib/client.ts`): Connect-per-command pattern — all Phase 4 commands use this
- `outputSuccess()`/`outputError()` (`src/lib/output.ts`): JSON/human output — already mode-aware
- `formatData()` (`src/lib/format.ts`): Auto-detect formatter — extend with download/upload result formatters
- `logStatus()` (`src/lib/output.ts`): stderr progress messages — use for download progress
- `bigIntToString()` (`src/lib/serialize.ts`): Safe BigInt serialization for IDs

### Established Patterns
- Command grouping: `src/commands/{noun}/` — add `src/commands/media/` directory
- Commander.js subcommands with `.argument()`, `.option()`, `.action()`
- JSON envelope: `{ ok: true, data: {...} }` on stdout, progress on stderr
- preAction hook sets output mode globally — no per-command changes needed
- Message search action in `src/commands/message/search.ts` — extend with filter parameter

### Integration Points
- New command group: `src/commands/media/` with `download.ts`, `send.ts`
- `src/commands/message/search.ts`: Add `--filter` option and MTProto filter mapping
- `src/lib/types.ts`: Add MediaInfo interface, DownloadResult, extend MessageItem
- `src/lib/serialize.ts`: Extend `detectMedia()` to return MediaInfo object
- `src/lib/format.ts`: Update `formatSingleMessage()` for richer media annotations
- `src/bin/tg.ts`: Register `media` command group

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 04-media-files*
*Context gathered: 2026-03-12*
