# VidyCut

An original, free local-first video editor built with React, TypeScript, Vite, Zustand, Canvas/WebGL, Web Audio, WebCodecs and FFmpeg. It opens directly into a dark editing workspace. No login, subscription, watermark or paid API is needed for core editing.

**Delivery status:** a working editor with a tested core and optional cloud/worker implementation. This is not yet feature-equivalent to a mature commercial editor, and it has not undergone a production security audit or large-project soak testing. See [the exact feature checklist](docs/FEATURES.md) and [verification record](docs/QA.md); architecture interfaces are distinguished from working user features.

All VidyCut application code, branding, icon paths, presets and sample artwork were created for this project. Third-party open-source libraries retain their own licenses. No CapCut code, logo or template is included.

## Start locally

Install Node.js **22.12 or later**, with npm. Extract the source archive, open a terminal in the `vidycut` directory, then run:

```sh
npm ci
npm run dev
```

Open **http://localhost:4173**. Keep the terminal running. On Windows, `START-WINDOWS.cmd` runs these steps and opens the browser. On macOS/Linux, run `sh start-local.sh`.

For the prebuilt package, no npm installation is needed: run `node serve.mjs` inside that package and open http://localhost:4173. Do not double-click `index.html`: media workers and IndexedDB need a web origin.

## Make a first edit

1. Click **Try sample project** or import a video. The sample is original artwork animated into a real MP4 with an audio track.
2. Double-click a media thumbnail or drag it onto a compatible timeline track.
3. Select a clip. Drag the body to move it, or drag its left/right handles to trim. Place the playhead and press **S** to split.
4. Add a text layer, choose a filter, or adjust a selected clip in the inspector. Diamond controls add numeric keyframes at the playhead.
5. Choose a canvas ratio below the preview. Use **Export**, select MP4 or WebM, resolution and frame rate, then download the rendered video.

Space plays/pauses; Delete removes; Ctrl/Cmd+Z undoes; Ctrl/Cmd+Shift+Z redoes; Ctrl/Cmd+S saves. The settings dialog includes customizable shortcuts.

## Saving your work

Edits and media blobs are stored in this browser's IndexedDB and auto-saved. Projects opens previous local projects. Save writes immediately. Use **Projects → Download backup with media** for a portable ZIP that includes source files. Open that ZIP through **Open JSON or backup** to restore a separate project with fresh identifiers. Backups have a 2 GB browser memory budget, support cancellation, and omit regenerable proxies. Project JSON downloads store edit decisions and media references, **not the media bytes**: keep originals alongside your JSON backup and use Relink after moving to another browser/device. Clearing browser data removes local media and projects. Uploaded custom fonts currently last for the browser session and must be reloaded when reopening a project that uses them.

The first visit needs the app assets to load. On a secure origin, the service worker caches the shell and previously requested assets for offline use. Import local media before disconnecting. Optional cloud and AI calls need connectivity.

## Export engines

- **WebCodecs + Mediabunny:** frame-addressed local composition and audio mixing on browsers exposing compatible encoders.
- **FFmpeg WASM worker:** frame-addressed fallback when WebCodecs is unavailable. It renders every frame into bounded batches, encodes them and muxes continuous mixed audio. It is slower, but it does not substitute a screen recording or fake frame counts.
- **Native FFmpeg worker:** optional server jobs transcode an uploaded, flattened video. The backend does not yet reconstruct an arbitrary multi-track JSON project; composition happens in the browser first.

1080p and 4K are available without product locks. Processing capacity is bounded by device memory, codec support and browser canvas limits. WASM currently holds compressed output plus mixed audio in memory; long/4K projects may require a stronger device or a future streaming export target. See troubleshooting.

## Development

```sh
npm test          # engine and API authorization tests
npm run build    # strict TypeScript checks and production Vite build
npm run preview  # serve dist for local testing
npm run server   # optional authorized REST API on port 8787
npm run worker   # optional Postgres job consumer; needs native ffmpeg + ffprobe
npm run format   # source formatting
```

`npm ci` copies the installed FFmpeg core into `public/ffmpeg`; no CDN or API key is needed at render time. The lockfile pins dependency versions. Check and update dependencies before an internet-facing release.

## Optional cloud setup

The local editor does not require this section. Create a dedicated Supabase project, apply `db/schema.sql`, then `db/storage.sql`. Configure `.env` from `.env.example`. The browser gets only the project URL, public anon key and API URL. The API and worker get the database and service-role credentials. Enable email, Google and/or GitHub in Supabase Auth and configure redirect URLs for your domain. Run the API and worker separately.

The Node API validates bearer tokens with Supabase and enforces ownership for every project/media/job. Admin routes also verify the database role server-side. There is no public admin-registration mechanism. To grant administrator access after a user signs up, an operator runs `update public.users set role='admin' where id='<verified-user-uuid>';` in the database.

The current cloud UI syncs project JSON. Upload/download endpoints and versioning are implemented; automatic cross-device media sync is an integration task, not an invisible background promise.

## Documentation

- [Folder structure and engine architecture](docs/ARCHITECTURE.md)
- [REST API and model-provider contracts](docs/API.md)
- [Production deployment](docs/DEPLOYMENT.md)
- [Browser support and troubleshooting](docs/TROUBLESHOOTING.md)
- [Feature checklist](docs/FEATURES.md)
- [Tests and observed browser results](docs/QA.md)
- [Third-party notices](THIRD_PARTY_NOTICES.md)
