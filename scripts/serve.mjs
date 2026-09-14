import http from "node:http";
import { createReadStream } from "node:fs";
import { stat, realpath } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
// Distribute this file beside the prebuilt index.html, or invoke it with a dist path.
const root = await realpath(
  resolve(process.argv[2] ?? fileURLToPath(new URL(".", import.meta.url))),
);
const port = Number(process.env.VIDYCUT_PORT ?? 4173);
const host = process.env.VIDYCUT_HOST ?? "127.0.0.1";
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".wasm": "application/wasm",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".woff2": "font/woff2",
};
const server = http.createServer(async (req, res) => {
  try {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405);
      return res.end();
    }
    const pathname = decodeURIComponent(
      new URL(req.url, "http://localhost").pathname,
    );
    let path = resolve(root, "." + pathname);
    if (path !== root && !path.startsWith(root + sep)) {
      res.writeHead(403);
      return res.end();
    }
    let info;
    try {
      info = await stat(path);
      if (info.isDirectory()) {
        path = resolve(path, "index.html");
        info = await stat(path);
      }
    } catch {
      if (extname(path)) {
        res.writeHead(404);
        return res.end("File not found");
      }
      path = resolve(root, "index.html");
      info = await stat(path);
    }
    const real = await realpath(path);
    if (!real.startsWith(root + sep)) {
      res.writeHead(403);
      return res.end();
    }
    const headers = {
      "Content-Type": mime[extname(path)] ?? "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "credentialless",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Cache-Control":
        extname(path) === ".html" || path.endsWith("sw.js")
          ? "no-cache"
          : "public, max-age=3600",
      "Accept-Ranges": "bytes",
    };
    let start = 0,
      end = info.size - 1,
      status = 200;
    if (req.headers.range) {
      const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
      if (!range) {
        res.writeHead(416, { "Content-Range": `bytes */${info.size}` });
        return res.end();
      }
      if (!range[1]) start = Math.max(0, info.size - Number(range[2]));
      else start = Number(range[1]);
      end =
        range[1] && range[2] ? Math.min(info.size - 1, Number(range[2])) : end;
      if (start > end || start >= info.size) {
        res.writeHead(416, { "Content-Range": `bytes */${info.size}` });
        return res.end();
      }
      status = 206;
      headers["Content-Range"] = `bytes ${start}-${end}/${info.size}`;
    }
    headers["Content-Length"] = String(Math.max(0, end - start + 1));
    res.writeHead(status, headers);
    if (req.method === "HEAD") return res.end();
    const stream = createReadStream(path, { start, end });
    stream.on("error", () => res.destroy());
    stream.pipe(res);
  } catch {
    if (!res.headersSent) res.writeHead(400);
    res.end("Request could not be served.");
  }
});
server.listen(port, host, () =>
  console.log(
    `VidyCut is running at http://${host}:${port}. Keep this terminal open.`,
  ),
);
server.on("error", (error) => {
  console.error(
    error.code === "EADDRINUSE"
      ? "This port is already in use. Set VIDYCUT_PORT to another port."
      : "The local server could not start.",
  );
  process.exitCode = 1;
});
