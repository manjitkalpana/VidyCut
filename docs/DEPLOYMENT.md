# Deployment

## Static editor

Build with Node 22.12+ using `npm ci && npm run build`. Upload the **contents** of `dist/` to an HTTPS static host at the domain root. Do not omit `ffmpeg/`, `sample/` or `sw.js`. Configure SPA fallback to `/index.html`, except missing `/assets/` and `/ffmpeg/` resources should return 404 rather than HTML. See `deploy/nginx.conf` for a working Nginx example.

The prebuilt package includes a zero-dependency Node static server for local use. It binds to localhost by default. For an internet-facing release, use an HTTPS reverse proxy, monitoring and a deployment-specific backup/rollback procedure. The provided Docker web target runs Nginx as a non-root user.

Set public Vite variables **before building** if cloud authentication is required. Vite embeds them in client JavaScript. Never prefix service credentials, database passwords or model keys with `VITE_`.

The headers in `public/_headers` are for hosts supporting that format. On other hosts configure equivalent headers: Content-Security-Policy, X-Content-Type-Options, Referrer-Policy, Cross-Origin-Opener-Policy and Cross-Origin-Embedder-Policy. Keep worker-src and media-src compatible with local blob URLs, and permit WebAssembly compilation. Configure a narrower connect-src for your actual API/Supabase domains when deploying cloud mode. OAuth uses redirects.

Serve index.html and sw.js with revalidation. Hashed `/assets/` may be immutable. Roll out a new service-worker cache name when changing the offline cache contract. Keep older assets available during deploys so a running edit can finish exporting.

## Database and API

1. Create a **dedicated** Supabase project. `db/schema.sql` changes public-schema grants and should not be run against an unrelated application database.
2. Apply `db/schema.sql` and `db/storage.sql` through the SQL editor or an operator-controlled migration process. The schema includes owner indexes, row-level security and a private `media` bucket.
3. Enable your chosen Supabase Auth providers. Configure site/redirect URLs to your editor's HTTPS origin. Add Google/GitHub OAuth client credentials through Supabase's provider settings, not through the frontend.
4. Provide `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ALLOWED_ORIGINS` and `PORT` to the Node API. Use the Supabase-recommended TLS connection string for the chosen pooler; do not disable certificate verification.
5. Run `npm run server`. `/health` is public and reports whether auth/storage configuration exists. `/api/*` requires verified bearer authentication. The database account used by this API must be able to operate the service tables; it must never be sent to the browser.
6. Place the API behind HTTPS. Set `TRUST_PROXY=1` only when requests pass through exactly one trusted proxy. Match allowed origins to your frontend. Cookie authentication is not used; requests use an explicit bearer token.
7. Set reverse-proxy body limits, `MAX_UPLOAD_BYTES`, the Supabase bucket limit and storage budgets consistently. The default server upload budget is 256 MiB. The default local import safety limit is 2 GiB. These are operational resource limits, not paid tiers or export locks.

For a multi-instance API, move rate-limit state from process memory to a shared store or enforce limits at the gateway. Capture structured server/worker logs without credentials. Add metrics for queue depth, stale jobs, failed uploads and storage use. Implement an operator-controlled orphan-media cleanup task before unattended high-volume operation.

## Worker

Install native FFmpeg and ffprobe. The `api` Docker target includes both. Start `npm run worker` with the same database and private storage credentials as the API. Separate worker processes claim jobs using `FOR UPDATE SKIP LOCKED`, report actual FFmpeg progress, heartbeat jobs, and recover interrupted jobs up to three attempts. Cancellation terminates a running FFmpeg process. Use container CPU/memory/temp-disk limits.

The transcode worker consumes a single uploaded media object and validated output settings. It **does not** implement server-side Canvas/WebGL composition of the full project JSON. Upload the browser-composed output to use server transcoding. Background removal, tracking, reframing and frame interpolation require your configured model service; see the API contract. There is no bundled model.

## Docker

```sh
docker build --target web -t vidycut-web .
docker run --rm -p 4173:8080 vidycut-web

docker build --target api -t vidycut-api .
docker run --rm --env-file .env -p 8787:8787 vidycut-api
docker run --rm --env-file .env vidycut-api npm run worker
```

Compose is provided for a configured external Supabase deployment. Create `.env`, then run `docker compose up --build`. It does not create Supabase accounts or inject credentials for you. Docker images and live infrastructure were not started during this delivery; validate them in your deployment environment.

## Release gates remaining

The unit tests and local browser QA in `docs/QA.md` are not a production audit. Before calling a deployment production-ready, exercise real OAuth redirects, ownership isolation, uploads, storage policies, concurrent saves, native worker cancellation and provider failures in a staging deployment. Load-test representative long projects and verify target browsers, mobile recording and offline recovery. Add backup/restore drills, dependency vulnerability review and abuse/storage monitoring.

No live site was created in this session because the hosting service returned an account usage limit. The source and static build are deployable independently.
