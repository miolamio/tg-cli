# Phase 4 External Validation 04-01

## Summary

The latest Phase 4 fixes materially improved the implementation quality. The previously reported runtime issues around partial album reporting, media-size conversion, and single-download `-o` filename/path consistency now look addressed in code and targeted tests. The main remaining concerns are no longer core execution bugs, but requirement alignment and stale verification artifacts.

## Verification Snapshot

- `npm test`: 316/316 tests passing
- `npx tsc --noEmit`: passing
- No new critical runtime defects were found in the reviewed fix set

## Remaining Issues

### 1. `READ-05` is still not formally closed against the written requirement

**Status:** Open  
**Severity:** Important

### Problem

The implementation now supports 16 media/search filters, which is a major improvement over the earlier 8-filter state. However, the formal requirement in `REQUIREMENTS.md` still says the user can filter using **any of the 17 MTProto search filters**.

### Code snippet

```ts
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
  phone_calls: () => new Api.InputMessagesFilterPhoneCalls({} as any),
  mentions: () => new Api.InputMessagesFilterMyMentions(),
  geo: () => new Api.InputMessagesFilterGeo(),
  contacts: () => new Api.InputMessagesFilterContacts(),
  pinned: () => new Api.InputMessagesFilterPinned(),
};
```

### Why this is still a problem

- The code has improved substantially, but the formal contract still does not exactly match the implementation.
- Until the requirement is narrowed or the missing filter is added, Phase 4 is not perfectly aligned on paper.

### Possible solution methods

- Add the remaining missing MTProto search filter to `FILTER_MAP`.
- Or update `REQUIREMENTS.md`, roadmap text, and verification artifacts to match the implemented 16-filter scope.

### 2. Phase 4 verification artifacts are stale

**Status:** Open  
**Severity:** Important

### Problem

The runtime code and tests have evolved, but the Phase 4 verification and summary documents still describe the earlier state.

### Why this is a problem

- `04-VERIFICATION.md` still references an 8-entry filter map and claims “No gaps found”.
- `04-01-SUMMARY.md` still describes the feature as “8 search filters”.
- This makes the code more trustworthy than the documentation, which is the wrong way around for planning/verification artifacts.

### Possible solution methods

- Update `04-VERIFICATION.md` to reflect the current 16-filter implementation and current residual gap.
- Update `04-01-SUMMARY.md` to match the actual code state.
- Reword “No gaps found” to reflect the remaining formal requirement mismatch if it remains unresolved.

## Resolved Since Previous Review

### 1. Album partial-result behavior is no longer silent

The album send flow now emits a warning when only a subset of album messages can be re-fetched.

### 2. Media size conversion is safer

`extractMediaInfo()` now uses a safe numeric conversion helper that supports `toJSNumber()` when available.

### 3. Single-download `-o` now aligns filename with the saved path

For single downloads with a custom output path, the returned `filename` now reflects the actual saved file.

## Current Position

Phase 4 is now in a much better state technically. The main remaining work is:

1. Decide whether `READ-05` should remain a 17-filter requirement or be aligned to the implemented 16-filter scope.
2. Update the verification and summary artifacts so they accurately describe the current implementation.
