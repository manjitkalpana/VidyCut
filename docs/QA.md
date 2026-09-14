# Verification record — 13 September 2026

## Automated checks

`npm test`: **46 tests passed** across six suites. Coverage includes clip move/lock, trim, reverse trim/split source continuity, split/duplicate inside Immer commands, ripple-delete track isolation, speed source span, snapping, undo/redo, project JSON migration, duplicate-ID rejection, unique IDs on project duplication, numeric/ease/Bezier keyframes, trimmed keyframe boundaries, newly animated grade values, SRT/VTT round trips, MIME/signature/empty-file rejection, export dimensions/ranges, IndexedDB save/load plus blobs, bearer verification, admin authorization and safe backend errors.

`npm run build`: **passed** strict TypeScript checking and Vite production compilation. Some modules are imported both statically and dynamically; Vite reports that they stay in the main graph. Main JS is approximately 680 kB before gzip, with the media codec library lazy-loaded separately. FFmpeg's WASM core is a separate local asset.

The authorization tests mock Supabase and the database; they verify the guards but do not constitute a live Supabase integration test.

The zero-dependency static launcher also passed a local process test: index and worker scripts returned HTTP 200 with correct MIME types; WASM and sample MP4 byte-range requests returned HTTP 206 with exactly the requested bytes.

## Observed browser checks

Environment: the provided Chromium browser at the internal HTTP development origin, desktop viewport about 1364 × 940. This origin does not expose secure-context WebCodecs encoders, so export exercises the actual FFmpeg WASM fallback.

| Check                                   | Observed result                                                               |
| --------------------------------------- | ----------------------------------------------------------------------------- |
| Load editor without login               | Pass                                                                          |
| Original sample MP4 import and metadata | Pass; actual video source, not an image-only preview mock                     |
| Video preview with text/filter/fade     | Pass; shared renderer draws sample and animated text                          |
| Drag clip                               | Pass; moved one second; timeline left offset changed 0 → 65px at 65px/sec     |
| Trim right                              | Pass; source clip width changed 520 → 455px, retaining one-second start       |
| Undo trim and move                      | Pass; returned to start 0 and width 520px                                     |
| Split                                   | Pass; one source clip becomes two at playhead                                 |
| Undo / redo split                       | Pass; counts 2 → 1 → 2                                                        |
| Manual save and reload                  | Pass; project name and media/clip references restored from IndexedDB          |
| WebM export                             | Pass in browser; 0.5s test completed with 15/15 frames at 1080p               |
| MP4 export                              | Pass in browser; 3s test completed with 90/90 frames at 1080p                 |
| Cancellation and retry                  | Pass; canceled stalled worker initialization, then retried                    |
| No subscription/watermark               | No account gate; no watermark layer is added by either compositor/export path |

Independent ffprobe inspection of the browser-downloaded final MP4 passed: **1920 × 1080, H.264, exactly 30/1 fps, 90 decoded video frames, exactly 3.000000 seconds**, with **48 kHz stereo AAC** also exactly 3 seconds. File size: 5,135,134 bytes. Decoded audio is non-silent; the synthesized sample is intentionally quiet. A frame extracted at 2 seconds contains the expected source image and text with no added watermark. See `export-probe.json` and `export-proof.mp4` in this folder.

The browser automation download-event hook timed out, but both download actions did create files in the shared download directory. The output above was inspected from the downloaded file, not from progress estimates.

## Bugs found and corrected

- Split/duplicate originally cloned an Immer draft; they now clone its plain current value.
- Paused preview repeatedly rendered; it now renders on invalidation and yields during export.
- Real-time recording fallback dropped frames; it was replaced with frame-addressed PNG batches and FFmpeg encoding.
- Vite dependency optimization lost the FFmpeg worker path; runtime worker files now have explicit same-origin paths and initialization has a timeout.
- The installed WASM Opus encoder raised a memory error with the test audio; the WASM WebM path now uses Vorbis. The native worker and WebCodecs path retain their supported audio encoders.
- Final muxing now rebuilds constant-frame-rate timestamps, removing millisecond rounding drift between encoded batches.
- Reverse trims now preserve surviving source frames and forbid negative timeline time.
- Relink uses immutable new media IDs so undo can restore original sources.
- Copied projects regenerate track/clip IDs, preventing cloud table key collisions.
- Sparse grade fields now accept numeric keyframe evaluation.

## Design fidelity

The original generated design reference and the implemented desktop screenshot were inspected side by side. Preserved: navy/charcoal panels, mint controls, original V mark, vertical tool rail, media browser, central canvas, inspector and multitrack timeline. Deliberate differences: real recording/account controls, extra transform fields and visible project tracks; preview is sized to preserve canvas aspect ratio. Corrected a narrow rail that clipped tool names. A few longer labels still rely on compact layout at this viewport. The result is a functional editor workspace, not a reproduction of CapCut.

![VidyCut desktop workspace](workspace.jpg)

## Not verified / remaining release gates

- Live OAuth email/Google/GitHub, Supabase tables/RLS/storage, concurrent cloud saves and native queued rendering: implementation supplied, no credentials/deployment provided.
- Secure-context WebCodecs export, physical camera/microphone/screen capture, Safari/Firefox/mobile devices, long-project performance and true offline disconnection: require target-device testing.
- GPU effects, masks, chroma key, audio processing and caption editing have executable implementations, but not every parameter combination has received a browser integration test.
- WebMCP registrations are feature-detected; the test browser reported that modelContext was unavailable. Their live tool validation is unavailable.
- No public hosting URL exists: the hosting service refused site creation because of its account usage limit.

This is a working, tested editor foundation with a substantial implemented toolset. It is not yet a production-audited, feature-complete equivalent of the full requested commercial-editor scope. See FEATURES.md for individual gaps.

## Continuation verification

Portable backup round trips, media restoration, ID remapping, preservation of existing projects, checksum damage, truncated archives, invalid paths, missing media and cancellation are covered by automated tests. Insert/overwrite tests cover source intervals, reverse playback, track isolation, locking and single-command undo/redo. Strict TypeScript and the production build pass. The new backup and destination-track controls have not been manually exercised in the browser; the browser export evidence above is from the preceding build.
