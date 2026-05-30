"use strict";

const assert = require("node:assert/strict");
const http = require("node:http");
const { test } = require("node:test");

process.env.ABM_FAKE_TTS = "1";

const { server } = require("../scripts/dev-server");
const { clampNumber, resolveNarrationSettings, toProsodyPercent } = require("../api/tts");

function listen() {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve(`http://127.0.0.1:${port}`);
    });
  });
}

function close() {
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

function request(url, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, options, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({ statusCode: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

test("numeric helpers clamp safely", () => {
  assert.equal(clampNumber(2, -0.5, 0.5), 0.5);
  assert.equal(clampNumber("bad", -0.5, 0.5, 0.1), 0.1);
  assert.equal(toProsodyPercent(0.25), "+25%");
  assert.equal(toProsodyPercent(-0.2), "-20%");
});

test("narration settings apply style presets and clamp values", () => {
  const dramatic = resolveNarrationSettings({ rate: 0.48, pitch: 49, style: "dramatic", expressiveness: 1 });
  assert.equal(dramatic.style, "dramatic");
  assert.ok(Math.abs(dramatic.rate - 0.4) < 0.0001);
  assert.equal(dramatic.pitch, 50);

  const fallback = resolveNarrationSettings({ style: "unknown", expressiveness: 2 });
  assert.equal(fallback.style, "neutral");
  assert.equal(fallback.expressiveness, 1);
});

test("server exposes health, voices, static app, and fake tts", async () => {
  const base = await listen();
  try {
    const health = await request(`${base}/api/health`);
    assert.equal(health.statusCode, 200);
    assert.match(health.body.toString(), /audiobook-maker-fresh/);

    const voices = await request(`${base}/api/voices`);
    assert.equal(voices.statusCode, 200);
    const voicePayload = JSON.parse(voices.body.toString());
    assert.ok(Array.isArray(voicePayload.voices));
    assert.ok(voicePayload.voices.length >= 4);

    const page = await request(`${base}/`);
    assert.equal(page.statusCode, 200);
    assert.match(page.body.toString(), /Audiobook Maker/);

    const tts = await request(
      `${base}/api/tts`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      },
      JSON.stringify({ text: "Hello from the smoke test.", voice: voicePayload.default })
    );
    assert.equal(tts.statusCode, 200);
    assert.equal(tts.headers["content-type"], "audio/mpeg");
    assert.equal(tts.headers["x-narration-style"], "neutral");
    assert.ok(tts.body.length > 20);
  } finally {
    await close();
  }
});

test("tts rejects bad methods, bad json, and oversized chunks", async () => {
  const base = await listen();
  try {
    const get = await request(`${base}/api/tts`);
    assert.equal(get.statusCode, 405);

    const badJson = await request(
      `${base}/api/tts`,
      { method: "POST", headers: { "Content-Type": "application/json" } },
      "{"
    );
    assert.equal(badJson.statusCode, 400);

    const oversized = await request(
      `${base}/api/tts`,
      { method: "POST", headers: { "Content-Type": "application/json" } },
      JSON.stringify({ text: "x".repeat(4501) })
    );
    assert.equal(oversized.statusCode, 413);
  } finally {
    await close();
  }
});
