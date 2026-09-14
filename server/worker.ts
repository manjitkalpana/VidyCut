import "dotenv/config";
import pg from "pg";
import { randomUUID } from "node:crypto";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { createServiceClient } from "./security";
import { ExportSchema } from "../src/projects/schema";
const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 3,
  }),
  service = createServiceClient();
let running = true;
process.on("SIGTERM", () => {
  running = false;
});
process.on("SIGINT", () => {
  running = false;
});
export function ffmpegArguments(
  input: string,
  output: string,
  config: { width: number; height: number; settings: unknown },
) {
  const s = ExportSchema.parse(config.settings);
  const width = Math.round(Math.max(16, Math.min(7680, config.width)) / 2) * 2,
    height = Math.round(Math.max(16, Math.min(7680, config.height)) / 2) * 2;
  const codec =
    s.format === "webm"
      ? ["-c:v", "libvpx-vp9", "-c:a", "libopus"]
      : ["-c:v", "libx264", "-preset", "medium", "-c:a", "aac"];
  return [
    "-hide_banner",
    "-nostdin",
    "-y",
    "-i",
    input,
    "-vf",
    `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`,
    "-r",
    String(s.fps),
    ...codec,
    "-b:v",
    String(s.bitrate),
    "-b:a",
    String(s.audioBitrate),
    "-pix_fmt",
    "yuv420p",
    ...(s.format === "webm" ? [] : ["-movflags", "+faststart"]),
    "-progress",
    "pipe:1",
    output,
  ];
}
async function runJob(job: Record<string, any>) {
  if (!service) throw new Error("Storage is not configured");
  const temp = await mkdtemp(join(tmpdir(), "vidycut-job-"));
  try {
    const media = await pool.query(
      "select storage_path from media where id=$1 and user_id=$2",
      [job.media_id, job.user_id],
    );
    if (!media.rowCount) throw new Error("Missing media");
    const signed = await service.storage
      .from("media")
      .createSignedUrl(media.rows[0].storage_path, 3600);
    if (!signed.data) throw new Error("Storage unavailable");
    if (job.kind !== "transcode") {
      if (!process.env.MODEL_PROVIDER_URL) throw new Error("Model unavailable");
      const response = await fetch(process.env.MODEL_PROVIDER_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(process.env.MODEL_PROVIDER_KEY
            ? { Authorization: "Bearer " + process.env.MODEL_PROVIDER_KEY }
            : {}),
        },
        body: JSON.stringify({
          task: job.kind,
          inputUrl: signed.data.signedUrl,
          parameters: job.config.parameters ?? {},
        }),
        signal: AbortSignal.timeout(300000),
      });
      if (!response.ok) throw new Error("Model processing failed");
      const type =
        response.headers.get("content-type") ?? "application/octet-stream";
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length > 268435456) throw new Error("Model result too large");
      const resultPath = `${job.user_id}/renders/${job.id}/result`;
      const saved = await service.storage
        .from("media")
        .upload(resultPath, bytes, { contentType: type, upsert: true });
      if (saved.error) throw new Error("Storage failed");
      await pool.query(
        "update render_jobs set status='completed',progress=1,result_path=$2,updated_at=now() where id=$1 and status='running'",
        [job.id, resultPath],
      );
      return;
    }
    const response = await fetch(signed.data.signedUrl);
    if (!response.ok) throw new Error("Media download failed");
    const bytes = await response.arrayBuffer();
    const input = join(temp, "source"),
      settings = ExportSchema.parse(job.config.settings),
      output = join(temp, "output." + settings.format);
    await writeFile(input, new Uint8Array(bytes));
    let total = 1;
    await new Promise<void>((resolve, reject) => {
      const probe = spawn("ffprobe", [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        input,
      ]);
      let text = "";
      probe.stdout.on("data", (d) => (text += d));
      probe.on("error", reject);
      probe.on("close", (code) => {
        if (code === 0) {
          total = Math.max(1, Number(text) || 1);
          resolve();
        } else reject(new Error("Probe failed"));
      });
    });
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        "ffmpeg",
        ffmpegArguments(input, output, job.config),
        { stdio: ["ignore", "pipe", "pipe"] },
      );
      let buffer = "";
      const timeout = setTimeout(() => child.kill("SIGKILL"), 30 * 60000);
      const heartbeat = setInterval(() => {
        void pool
          .query(
            "update render_jobs set updated_at=now() where id=$1 and status='running' returning id",
            [job.id],
          )
          .then((r) => {
            if (!r.rowCount) child.kill("SIGTERM");
          })
          .catch(() => child.kill("SIGTERM"));
      }, 2000);
      child.stdout.on("data", (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (line.startsWith("out_time_us=")) {
            const progress = Math.max(
              0,
              Math.min(0.99, Number(line.split("=")[1]) / 1000000 / total),
            );
            void pool
              .query(
                "update render_jobs set progress=$2 where id=$1 and status='running'",
                [job.id, progress],
              )
              .catch(() => {});
          }
        }
      });
      child.stderr.on("data", () => {});
      child.on("error", (e) => {
        clearTimeout(timeout);
        clearInterval(heartbeat);
        reject(e);
      });
      child.on("close", (code) => {
        clearTimeout(timeout);
        clearInterval(heartbeat);
        code === 0 ? resolve() : reject(new Error("Render failed"));
      });
    });
    const resultPath = `${job.user_id}/renders/${job.id}/output.${settings.format}`;
    const result = await service.storage
      .from("media")
      .upload(resultPath, await readFile(output), {
        contentType:
          settings.format === "mov"
            ? "video/quicktime"
            : `video/${settings.format}`,
        upsert: true,
      });
    if (result.error) throw new Error("Storage failed");
    await pool.query(
      "update render_jobs set status='completed',progress=1,result_path=$2,updated_at=now() where id=$1 and status='running'",
      [job.id, resultPath],
    );
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}
async function main() {
  if (!service || !process.env.DATABASE_URL)
    throw new Error(
      "Configure DATABASE_URL and Supabase service credentials before starting the worker.",
    );
  while (running) {
    await pool.query(
      "update render_jobs set status=case when attempts<3 then 'queued' else 'failed' end,error_code='WORKER_INTERRUPTED',updated_at=now() where status='running' and updated_at<now()-interval '10 minutes'",
    );
    const client = await pool.connect();
    let job;
    try {
      await client.query("begin");
      const r = await client.query(
        "select * from render_jobs where status='queued' order by created_at for update skip locked limit 1",
      );
      job = r.rows[0];
      if (job)
        await client.query(
          "update render_jobs set status='running',attempts=attempts+1,worker_id=$2,updated_at=now() where id=$1",
          [job.id, randomUUID()],
        );
      await client.query("commit");
    } catch (e) {
      await client.query("rollback");
      throw e;
    } finally {
      client.release();
    }
    if (job) {
      try {
        await runJob(job);
      } catch {
        await pool.query(
          "update render_jobs set status='failed',error_code='PROCESSING_FAILED',updated_at=now() where id=$1 and status='running'",
          [job.id],
        );
      }
    } else await new Promise((r) => setTimeout(r, 1500));
  }
  await pool.end();
}
if (process.argv[1]?.endsWith("worker.ts"))
  void main().catch(() => {
    console.error(
      "Worker stopped. Check server configuration and storage connectivity.",
    );
    process.exit(1);
  });
