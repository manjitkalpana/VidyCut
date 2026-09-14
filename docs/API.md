# VidyCut REST API

Base URL: `/api`. JSON request/response bodies except multipart uploads. The optional client uses `VITE_API_URL` including `/api`.

Send `Authorization: Bearer <Supabase access token>` on every API request. The server verifies the token with Supabase Auth and loads the user's account state. Missing/invalid sessions fail; disabled users are rejected. Ownership is checked in SQL, never trusted from a request's user ID. The API does not use session cookies; CSRF tokens are therefore not part of its authentication contract. CORS is restricted to configured frontend origins.

Public `GET /health` returns `{ "status": "ok", "cloudConfigured": false }` when cloud auth/storage is not configured. It does not imply database readiness.

## Projects

| Method and path                                | Request               | Response / behavior                                                                                   |
| ---------------------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------- |
| GET `/me`                                      | None                  | Current profile and role                                                                              |
| GET `/projects`                                | None                  | `{items:[...]}`; own projects, including soft-deleted rows, max 200                                   |
| GET `/projects/:id`                            | UUID                  | `{project,revision}` for an owned active project                                                      |
| PUT `/projects/:id`                            | `{project,revision?}` | Validates/migrates project; transactionally saves JSON, tracks and a version; returns `{id,revision}` |
| DELETE `/projects/:id`                         | UUID                  | Soft delete; `{deleted:true,restorable:true}`                                                         |
| POST `/projects/:id/restore`                   | UUID                  | Restores own soft-deleted project                                                                     |
| GET `/projects/:id/versions`                   | UUID                  | Version metadata for own project                                                                      |
| POST `/projects/:id/versions/:version/restore` | Version integer       | The saved definition; save it through PUT to create a new head version                                |

The project ID in the route must equal the definition's ID. Pass the revision received from GET/PUT when editing concurrently: a stale revision receives HTTP 409. Omitting revision uses last-writer-wins; the current minimal cloud UI does this. Keep portable media references separate from JSON definitions.

Example save body:

```json
{
  "project": {
    "version": 1,
    "id": "<project-uuid>",
    "name": "My film",
    "created": 0,
    "modified": 0,
    "width": 1920,
    "height": 1080,
    "fps": 30,
    "tracks": [],
    "clips": [],
    "media": []
  },
  "revision": 1
}
```

## Media and rendering

| Method and path       | Request                                           | Response / behavior                                                                                        |
| --------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| POST `/media`         | Multipart `file`, `projectId`, optional `mediaId` | Validates MIME, size, byte signature and project ownership; uploads to private storage; `{id,storagePath}` |
| GET `/media/:id`      | UUID                                              | Owned metadata plus a signed download `url`, valid for 15 minutes                                          |
| POST `/renders`       | `{mediaId,settings,width,height}`                 | Queues a native FFmpeg transcode of an owned uploaded source; HTTP 202 `{id,status:"queued"}`              |
| GET `/renders/:id`    | UUID                                              | Job status, measured progress and signed output URL when complete                                          |
| DELETE `/renders/:id` | UUID                                              | Cancels own queued/running job                                                                             |

`settings` accepts:

```json
{
  "format": "mp4",
  "resolution": "1080",
  "fps": 30,
  "bitrate": 8000000,
  "audioBitrate": 192000
}
```

Formats: mp4/webm/mov. Resolutions: strings 480/720/1080/1440/2160. FPS: 24/25/30/50/60. Video bitrate: 100,000–150,000,000 bits/sec. Audio bitrate: 128000/192000/256000/320000. Width/height must be integer 16–7680; callers should send the dimensions computed for the chosen resolution and aspect ratio.

The native job scales and encodes one source video. It does not render the complete JSON multi-track compositor. Browser exports use the actual timeline and all supported visual layers.

## Speech and model providers

POST `/ai/transcribe`: multipart `file`. An authenticated request validates the media and forwards it to the operator-configured `WHISPER_URL` with fields `file`, `model` and `response_format=srt`. The endpoint must be OpenAI-compatible and return plain SRT. The response is `{srt:"..."}`. Self-hosted Whisper is supported; there is no mandatory paid provider. Limit: five requests per minute per API process/IP. A missing provider returns 503.

POST `/ai/jobs` body:

```json
{ "mediaId": "<uuid>", "task": "background-removal", "parameters": {} }
```

Supported architecture task identifiers: `background-removal`, `object-detection`, `motion-tracking`, `reframe`, `interpolate`. A configured model adapter is required. Returns 202 with queued job ID. Poll `/renders/:id` for status/result; DELETE `/ai/jobs/:id` cancels it.

The worker calls the operator-controlled `MODEL_PROVIDER_URL` with:

```json
{
  "task": "background-removal",
  "inputUrl": "<temporary-signed-source-url>",
  "parameters": {}
}
```

If configured, it sends `Authorization: Bearer <MODEL_PROVIDER_KEY>`. The adapter fetches the source and returns result bytes with an appropriate Content-Type; the worker places those bytes in private storage and exposes a signed result URL. It must handle its model's schema, dimensions, model installation and hardware. No local segmentation/tracking weights are bundled. Output import/application for model jobs is an integration extension, not an existing automatic edit.

`src/ai/providers.ts` defines provider interfaces. `src/editor/sequences.ts` defines validated tracking points, nested-sequence references and multicam switches for later integration. The local editing assistant is a deterministic command parser, not a generative model: it creates validated undoable operations and can open the relevant tool or run local audio/scene analysis.

## Administration

All `/admin/*` requests first pass `requireAdmin`, which queries `users.role='admin'` and disabled=false server-side.

GET `/admin/:resource` reads an allowlisted resource: users, projects, templates, effects, filters, stickers, audio_assets, render_jobs or settings. At most 200 records are returned. PATCH `/admin/:resource/:id` accepts **only** `{enabled:boolean}` for templates/effects/filters/stickers/audio_assets/settings. Arbitrary table names, field writes, role changes and SQL are never accepted. Full user moderation, billing, reports and provider-secret management are not implemented in the dashboard.

## Errors and operations

Errors return `{message:"Human-readable explanation"}`. Typical statuses are 400 validation, 401 session, 403 account/admin, 404 owned resource missing, 409 save conflict, 429 rate limit and 503 unconfigured dependency. Unhandled errors return a generic 500 without a stack trace or database details.

API requests have a 20 MiB JSON body budget and a configurable upload budget (256 MiB default). Files are held in a temporary directory, checked by signature and stored under server-generated user/project/media identifiers. Names are display metadata. Temp files are removed after processing. Jobs run native FFmpeg with an argument array and no shell interpolation. Do not allow untrusted users to set provider URLs or server environment variables.

For production, add shared rate-limit state, orphan upload reconciliation, live integration tests, structured metrics and operational audit logging. These are deployment gates, not features claimed by the local editor.
