import "dotenv/config";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import multer from "multer";
import pg from "pg";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  ApiError,
  createServiceClient,
  requireAuth,
  requireAdmin,
  errorHandler,
  type AuthedRequest,
} from "./security";
import { migrateProject, ExportSchema } from "../src/projects/schema";
import { validateMedia, validateSignature } from "../src/media/validation";
export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
});
const service = createServiceClient();
const user = (req: express.Request) => (req as AuthedRequest).identity!.id;
const uuid = (v: unknown) => z.string().uuid().parse(v);
export const app = express();
app.disable("x-powered-by");
if (process.env.TRUST_PROXY === "1") app.set("trust proxy", 1);
app.use(helmet());
const origins = (process.env.ALLOWED_ORIGINS ?? "http://localhost:4173")
  .split(",")
  .map((x) => x.trim());
app.use(
  cors({
    origin(origin, callback) {
      callback(null, !origin || origins.includes(origin));
    },
    credentials: false,
  }),
);
app.use(
  rateLimit({
    windowMs: 60000,
    limit: 120,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { message: "Too many requests. Please wait a moment." },
  }),
);
app.use(express.json({ limit: "20mb" }));
app.get("/health", (_req, res) =>
  res.json({ status: "ok", cloudConfigured: !!service }),
);
app.use("/api", requireAuth(service));
app.use("/api", async (req, _res, next) => {
  const identity = (req as AuthedRequest).identity!;
  await pool.query(
    "insert into public.users(id,email) values($1,$2) on conflict(id) do nothing",
    [identity.id, identity.email],
  );
  const result = await pool.query(
    "select disabled from public.users where id=$1",
    [identity.id],
  );
  if (result.rows[0]?.disabled)
    throw new ApiError(403, "This account has been disabled.");
  next();
});
async function ownedProject(projectId: string, owner: string) {
  const r = await pool.query(
    "select * from projects where id=$1 and user_id=$2 and deleted_at is null",
    [projectId, owner],
  );
  if (!r.rowCount) throw new ApiError(404, "Project not found.");
  return r.rows[0];
}
app.get("/api/me", async (req, res) => {
  const r = await pool.query(
    "select id,name,avatar_url,role from users where id=$1",
    [user(req)],
  );
  res.json(r.rows[0] ?? { id: user(req) });
});
app.get("/api/projects", async (req, res) => {
  const result = await pool.query(
    "select id,name,updated_at,thumbnail_path,revision,deleted_at from projects where user_id=$1 order by updated_at desc limit 200",
    [user(req)],
  );
  res.json({ items: result.rows });
});
app.get("/api/projects/:id", async (req, res) => {
  const project = await ownedProject(uuid(req.params.id), user(req));
  res.json({ project: project.definition, revision: project.revision });
});
app.put("/api/projects/:id", async (req, res) => {
  const projectId = uuid(req.params.id);
  const project = migrateProject(req.body.project);
  if (project.id !== projectId)
    throw new ApiError(400, "Project IDs do not match.");
  const client = await pool.connect();
  try {
    await client.query("begin");
    const row = await client.query(
      "select user_id,revision from projects where id=$1 for update",
      [projectId],
    );
    if (row.rowCount && row.rows[0].user_id !== user(req))
      throw new ApiError(404, "Project not found.");
    if (
      req.body.revision !== undefined &&
      row.rowCount &&
      req.body.revision !== row.rows[0].revision
    )
      throw new ApiError(
        409,
        "This project changed in another session. Reload before saving.",
      );
    const revision = (row.rows[0]?.revision ?? 0) + 1;
    await client.query(
      "insert into projects(id,user_id,name,definition,revision) values($1,$2,$3,$4,$5) on conflict(id) do update set name=$3,definition=$4,revision=$5,updated_at=now()",
      [projectId, user(req), project.name, JSON.stringify(project), revision],
    );
    await client.query(
      "insert into project_versions(project_id,user_id,version,definition) values($1,$2,$3,$4)",
      [projectId, user(req), revision, JSON.stringify(project)],
    );
    await client.query("delete from tracks where project_id=$1", [projectId]);
    for (const track of project.tracks)
      await client.query(
        "insert into tracks(id,project_id,user_id,name,kind,definition) values($1,$2,$3,$4,$5,$6)",
        [
          track.id,
          projectId,
          user(req),
          track.name,
          track.kind,
          JSON.stringify(track),
        ],
      );
    await client.query("commit");
    res.json({ id: projectId, revision });
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
});
app.delete("/api/projects/:id", async (req, res) => {
  await ownedProject(uuid(req.params.id), user(req));
  await pool.query(
    "update projects set deleted_at=now() where id=$1 and user_id=$2",
    [req.params.id, user(req)],
  );
  res.json({ deleted: true, restorable: true });
});
app.post("/api/projects/:id/restore", async (req, res) => {
  const result = await pool.query(
    "update projects set deleted_at=null where id=$1 and user_id=$2 returning id",
    [uuid(req.params.id), user(req)],
  );
  if (!result.rowCount) throw new ApiError(404, "Project not found.");
  res.json({ restored: true });
});
app.get("/api/projects/:id/versions", async (req, res) => {
  await ownedProject(uuid(req.params.id), user(req));
  const r = await pool.query(
    "select id,version,created_at from project_versions where project_id=$1 and user_id=$2 order by version desc limit 100",
    [req.params.id, user(req)],
  );
  res.json({ items: r.rows });
});
app.post("/api/projects/:id/versions/:version/restore", async (req, res) => {
  await ownedProject(uuid(req.params.id), user(req));
  const r = await pool.query(
    "select definition from project_versions where project_id=$1 and user_id=$2 and version=$3",
    [
      req.params.id,
      user(req),
      z.coerce.number().int().positive().parse(req.params.version),
    ],
  );
  if (!r.rowCount) throw new ApiError(404, "Version not found.");
  res.json({
    project: r.rows[0].definition,
    message: "Save this restored project to create a new version.",
  });
});
const upload = multer({
  dest: join(tmpdir(), "vidycut-uploads"),
  limits: {
    fileSize: Number(process.env.MAX_UPLOAD_BYTES ?? 268435456),
    files: 1,
  },
  fileFilter(_req, file, callback) {
    try {
      validateMedia({ name: file.originalname, type: file.mimetype, size: 1 });
      callback(null, true);
    } catch {
      callback(new ApiError(400, "This file type is not supported."));
    }
  },
});
app.post("/api/media", upload.single("file"), async (req, res) => {
  if (!req.file) throw new ApiError(400, "Choose a media file.");
  try {
    const projectId = uuid(req.body.projectId);
    await ownedProject(projectId, user(req));
    const bytes = await readFile(req.file.path);
    await validateSignature(new Blob([bytes], { type: req.file.mimetype }));
    const mediaId = req.body.mediaId ? uuid(req.body.mediaId) : randomUUID();
    const path = `${user(req)}/${projectId}/${mediaId}`;
    const { error } = await service!.storage
      .from("media")
      .upload(path, bytes, { contentType: req.file.mimetype, upsert: false });
    if (error) throw new ApiError(502, "Media could not be stored. Try again.");
    await pool.query(
      "insert into media(id,project_id,user_id,name,mime,size_bytes,storage_path) values($1,$2,$3,$4,$5,$6,$7)",
      [
        mediaId,
        projectId,
        user(req),
        req.file.originalname.slice(0, 256),
        req.file.mimetype,
        req.file.size,
        path,
      ],
    );
    res.status(201).json({ id: mediaId, storagePath: path });
  } finally {
    await rm(req.file.path, { force: true });
  }
});
app.get("/api/media/:id", async (req, res) => {
  const r = await pool.query("select * from media where id=$1 and user_id=$2", [
    uuid(req.params.id),
    user(req),
  ]);
  if (!r.rowCount) throw new ApiError(404, "Media not found.");
  const { data, error } = await service!.storage
    .from("media")
    .createSignedUrl(r.rows[0].storage_path, 900);
  if (error) throw new ApiError(502, "Media could not be opened.");
  res.json({ media: r.rows[0], url: data.signedUrl });
});
app.post("/api/renders", async (req, res) => {
  const body = z
    .object({
      mediaId: z.string().uuid(),
      settings: ExportSchema,
      width: z.number().int().min(16).max(7680),
      height: z.number().int().min(16).max(7680),
    })
    .parse(req.body);
  const media = await pool.query(
    "select id from media where id=$1 and user_id=$2",
    [body.mediaId, user(req)],
  );
  if (!media.rowCount) throw new ApiError(404, "Media not found.");
  const jobId = randomUUID();
  await pool.query(
    "insert into render_jobs(id,user_id,media_id,kind,config) values($1,$2,$3,$4,$5)",
    [jobId, user(req), body.mediaId, "transcode", JSON.stringify(body)],
  );
  res.status(202).json({ id: jobId, status: "queued" });
});
app.get("/api/renders/:id", async (req, res) => {
  const r = await pool.query(
    "select id,status,progress,config,error_code,result_path,created_at from render_jobs where id=$1 and user_id=$2",
    [uuid(req.params.id), user(req)],
  );
  if (!r.rowCount) throw new ApiError(404, "Render job not found.");
  const job = r.rows[0];
  let url = null;
  if (job.status === "completed" && job.result_path) {
    const result = await service!.storage
      .from("media")
      .createSignedUrl(job.result_path, 900);
    url = result.data?.signedUrl;
  }
  res.json({
    ...job,
    url,
    message: job.status === "failed" ? "Export failed. Try again." : undefined,
  });
});
app.delete("/api/renders/:id", async (req, res) => {
  const r = await pool.query(
    "update render_jobs set status='canceled',updated_at=now() where id=$1 and user_id=$2 and status in ('queued','running') returning id",
    [uuid(req.params.id), user(req)],
  );
  if (!r.rowCount) throw new ApiError(404, "Active render job not found.");
  res.json({ canceled: true });
});
app.post(
  "/api/ai/transcribe",
  rateLimit({ windowMs: 60000, limit: 5 }),
  upload.single("file"),
  async (req, res) => {
    if (!req.file) throw new ApiError(400, "Choose an audio file.");
    try {
      if (!process.env.WHISPER_URL)
        throw new ApiError(503, "Whisper transcription is not configured.");
      const bytes = await readFile(req.file.path);
      await validateSignature(new Blob([bytes], { type: req.file.mimetype }));
      const body = new FormData();
      body.append(
        "file",
        new Blob([bytes], { type: req.file.mimetype }),
        "audio.wav",
      );
      body.append("model", process.env.WHISPER_MODEL ?? "whisper-1");
      body.append("response_format", "srt");
      const response = await fetch(process.env.WHISPER_URL, {
        method: "POST",
        body,
        headers: process.env.WHISPER_API_KEY
          ? { Authorization: "Bearer " + process.env.WHISPER_API_KEY }
          : {},
        signal: AbortSignal.timeout(120000),
      });
      if (!response.ok)
        throw new ApiError(502, "Transcription failed. Try again.");
      res.json({ srt: await response.text() });
    } finally {
      await rm(req.file.path, { force: true });
    }
  },
);
app.post("/api/ai/jobs", async (req, res) => {
  const body = z
    .object({
      mediaId: z.string().uuid(),
      task: z.enum([
        "background-removal",
        "object-detection",
        "motion-tracking",
        "reframe",
        "interpolate",
      ]),
      parameters: z.record(z.unknown()),
    })
    .parse(req.body);
  if (!process.env.MODEL_PROVIDER_URL)
    throw new ApiError(503, "This model provider is not configured.");
  const owned = await pool.query(
    "select id from media where id=$1 and user_id=$2",
    [body.mediaId, user(req)],
  );
  if (!owned.rowCount) throw new ApiError(404, "Media not found.");
  const id = randomUUID();
  await pool.query(
    "insert into render_jobs(id,user_id,media_id,kind,config) values($1,$2,$3,$4,$5)",
    [id, user(req), body.mediaId, body.task, JSON.stringify(body)],
  );
  res.status(202).json({ id, state: "queued", task: body.task, progress: 0 });
});
app.delete("/api/ai/jobs/:id", async (req, res) => {
  const r = await pool.query(
    "update render_jobs set status='canceled' where id=$1 and user_id=$2 returning id",
    [uuid(req.params.id), user(req)],
  );
  if (!r.rowCount) throw new ApiError(404, "Job not found.");
  res.json({ canceled: true });
});
app.use("/api/admin", requireAdmin(pool));
const ADMIN_TABLES = new Set([
  "users",
  "projects",
  "templates",
  "effects",
  "filters",
  "stickers",
  "audio_assets",
  "render_jobs",
  "settings",
]);
app.get("/api/admin/:resource", async (req, res) => {
  const resource = String(req.params.resource);
  if (!ADMIN_TABLES.has(resource))
    throw new ApiError(404, "Resource not found.");
  const fields =
    resource === "users"
      ? "id,name,email,role,disabled,created_at"
      : resource === "projects"
        ? "id,user_id,name,revision,updated_at,deleted_at"
        : resource === "render_jobs"
          ? "id,kind,status,progress,created_at"
          : resource === "settings"
            ? "id,name,enabled,created_at"
            : "id,name,enabled,created_at";
  const r = await pool.query(
    `select ${fields} from ${resource} order by created_at desc limit 200`,
  );
  res.json({ items: r.rows });
});
app.patch("/api/admin/:resource/:id", async (req, res) => {
  const resource = String(req.params.resource);
  if (
    ![
      "templates",
      "effects",
      "filters",
      "stickers",
      "audio_assets",
      "settings",
    ].includes(resource)
  )
    throw new ApiError(400, "This record cannot be changed with this action.");
  const body = z.object({ enabled: z.boolean() }).strict().parse(req.body);
  const r = await pool.query(
    `update ${resource} set enabled=$1 where id=$2 returning id`,
    [body.enabled, uuid(req.params.id)],
  );
  if (!r.rowCount) throw new ApiError(404, "Record not found.");
  res.json({ updated: true });
});
app.use(errorHandler);
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  if (!process.env.DATABASE_URL)
    console.warn(
      "DATABASE_URL is missing. Cloud endpoints will be unavailable.",
    );
  const port = Number(process.env.PORT ?? 8787);
  const listener = app.listen(port, () =>
    console.log("VidyCut API listening on " + port),
  );
  const close = () => {
    listener.close(() => {
      void pool.end().then(() => process.exit(0));
    });
  };
  process.on("SIGTERM", close);
  process.on("SIGINT", close);
}
