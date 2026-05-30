"use strict";

const fs = require("fs");
const http = require("http");
const path = require("path");
const handleHealth = require("../api/health");
const handleVoices = require("../api/voices");
const handleTts = require("../api/tts");

const ROOT = path.resolve(__dirname, "..");
const PUBLIC_DIR = path.join(ROOT, "public");
const PORT = Number(process.env.PORT || 8010);
const HOST = process.env.HOST || "127.0.0.1";

function json(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*"
  });
  res.end(JSON.stringify(payload));
}

function contentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".mjs") || filePath.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".json")) return "application/json; charset=utf-8";
  if (filePath.endsWith(".svg")) return "image/svg+xml";
  return "application/octet-stream";
}

function sendFile(res, filePath) {
  fs.stat(filePath, (error, stat) => {
    if (error || !stat.isFile()) {
      json(res, 404, { error: "Not found" });
      return;
    }
    res.writeHead(200, {
      "Content-Type": contentType(filePath),
      "Content-Length": stat.size,
      "Cache-Control": "no-store"
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || `${HOST}:${PORT}`}`);

  if (url.pathname === "/api/health") {
    handleHealth(req, res);
    return;
  }
  if (url.pathname === "/api/voices") {
    handleVoices(req, res);
    return;
  }
  if (url.pathname === "/api/tts") {
    handleTts(req, res);
    return;
  }

  const relativePath = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname.slice(1));
  const filePath = path.resolve(PUBLIC_DIR, relativePath);
  if (!filePath.startsWith(PUBLIC_DIR + path.sep) && filePath !== path.join(PUBLIC_DIR, "index.html")) {
    json(res, 403, { error: "Forbidden" });
    return;
  }
  sendFile(res, filePath);
});

if (require.main === module) {
  server.listen(PORT, HOST, () => {
    console.log(`[audiobook-maker-fresh] http://${HOST}:${PORT}`);
  });
}

module.exports = { server };
