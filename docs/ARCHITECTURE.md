# Engine architecture and folder structure

The versioned project is the source of truth. React panels dispatch editing operations into a Zustand store. Immer produces forward/inverse patches for history. The timeline and preview read the same clip positions and project clock. The preview and export call the same renderer, so text, masks, grading, filters, transformations and supported effects use the same compositing code.

```text
vidycut/
  src/
    editor/          Workspace, inspector, commands, history, shortcuts, sequence contracts
    timeline/        Timeline gestures, trim/split/move operations, source-time mapping
    media/           Import validation, metadata, URL cache, proxies, recording, waveform worker
    video-engine/    Shared Canvas compositor, HTML5/WebCodecs decoding, WebGL effects
    audio-engine/    Preview routing, PCM decoding, offline mix, mixer, WAV writer
    effects/         Original effect catalog and adjustable amounts
    filters/         Original color presets and intensity
    transitions/     Time-varying boundary transitions
    keyframes/       Numeric property paths and linear/ease/Bezier interpolation
    text/            Canvas text layout and original animations
    captions/        SRT/VTT parsing, timing/editor, optional speech-provider integration
    masks/           Canvas alpha masks
    chroma-key/      Key-color helpers; GPU keying in video-engine/gpu.ts
    ai/              Validated editing plans, local analysis, provider interfaces
    export/          WebCodecs muxing, bounded frame batches, FFmpeg conversion
    projects/        Versioned Zod schema, migration, project browser, duplication
    auth/            Optional Supabase session and account UI
    admin/           Server-authorized catalog/record dashboard
    storage/         IndexedDB projects, media blobs, templates and settings
    components/      Original SVG icons and Radix/shadcn-style UI primitives
    styles.css       Dark responsive workspace and mobile layout
  server/
    index.ts         REST routes, ownership checks, upload handling, job submission
    security.ts      Token verification, server-side admin role guard, safe errors
    worker.ts        Native FFmpeg and optional model job consumer
  db/
    schema.sql       Users, projects, versions, media, tracks, catalogs, jobs, settings
    storage.sql      Private Supabase object storage bucket
  tests/             Core, regression and authorization tests
  public/
    sample/          Original coast artwork and generated sample video
    ffmpeg/          Installed WASM core and worker files, copied by postinstall
    sw.js            Offline shell/resource cache
    _headers         Static-host response headers
  deploy/            Nginx configuration
  scripts/           Packaging, static server and dependency asset preparation
  docs/              API, deployment, browser notes, feature checklist and QA
  .env.example       Public/server environment variable contract
  Dockerfile         Separate static-web and API/worker build targets
  compose.yaml       Optional services using an external Supabase installation
```

## Project data and time

Project schema version 1 contains tracks, media metadata, clips, transforms, audio settings, effects, color grade, keyframes, text, shapes, drawings, masks, chroma settings, transitions, markers and export settings. JSON validation strips unknown fields; the migration function accepts legacy version 0/missing version and rejects unsupported future versions. Blob bytes live separately in IndexedDB/object storage. IDs are UUIDs. Duplicate projects regenerate track/clip IDs while sharing immutable source-media references.

Clip `start` and `duration` are timeline seconds. `inPoint` is the low source-media bound. `speed` maps timeline seconds to source seconds; reverse uses the high bound minus elapsed source time. Trim/split preserve source continuity, including reverse clips. Text and shape clips do not need media sources. Audio tracks accept audio clips, video tracks accept visual clips.

Keyframe times are relative to the clip. Numeric paths support transform values, opacity, audio volume, numeric grade, mask controls, effect amounts and text sizes. Ease selection belongs to the destination keyframe. Splitting inserts an interpolated boundary value. True vector/color-string interpolation and spatial Bezier motion paths are not implemented.

## History and synchronization

Editing operations generate inverse patches in memory; undo does not reload a saved project. Pointer gestures use temporary visual state and commit at release. History holds the latest 200 command entries to bound memory. Media blobs are retained independently so undo can restore project references. Autosave writes a revision snapshot after a short debounce and shows save/error/offline state. Playback and selection are view state rather than undoable edits.

The renderer draws bottom video tracks first and upper tracks last. It seeks HTML5 video for preview and falls back to HTML5 seek for exact export when WebCodecs is unavailable. A compatible WebCodecs decoder uses timestamp-addressed frames. Audio scheduling uses the same clip source-time function. Reverse audio is mixed in exports but currently silent during reverse preview playback. Effects and masks are evaluated before final transformed composition.

## Performance boundaries

Paused preview is invalidation-based. Timeline clips outside the horizontal viewport are not mounted; track rows and project data remain in memory. Waveform analysis and FFmpeg encoding run in workers. Proxies are optional 640px video derivatives for preview; exports use originals. Thumbnail/blob URLs and decoders are cached and disposed. WebGL applies grade/effects/chroma in a shader; it requires browser GPU support.

WebCodecs and FFmpeg fallback export one frame at a time. The fallback frees PNG batches after encoding, but compressed output and mixed PCM audio can still be large. Offline audio mixing uses five-second output segments while source audio decoding currently decodes an entire source buffer. This is a real large-file memory limitation and a candidate for streaming AudioSampleSink integration.

There is no guarantee that 200 tracks or 20,000 clips will play at full frame rate: these are schema safety bounds, not performance promises. Decode throughput, overlapping streams, device memory and effects determine practical capacity.

## Extension points that are architecture only

`sequences.ts` validates nested-sequence references, recursion/depth and tracking/multicam data contracts. These types are not wired into the renderer as a completed nested editor. `ai/providers.ts` defines speech and model job providers; backend jobs call an operator-configured model service. The editor has no bundled background-removal weights, object tracker, optical-flow interpolator or generative editing model.

Add an effect by extending the original catalog and renderer shader, with a defined numeric amount. Add a project migration before changing persisted meanings. Model-generated editing plans must parse through the operation schema and enter command history, never write raw project database rows.
