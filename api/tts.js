"use strict";

const { DEFAULT_VOICE, isValidVoice } = require("./voices");

const MAX_CHARS = 4500;
const FAKE_MP3 = Buffer.from("ID3\u0004\u0000\u0000\u0000\u0000\u0000\u000fAudiobook Maker test audio\n", "binary");
const STYLE_PRESETS = {
  neutral: { label: "Neutral", rate: 0, pitch: 0 },
  warm: { label: "Warm", rate: -0.03, pitch: -2 },
  storyteller: { label: "Storyteller", rate: -0.06, pitch: 1 },
  dramatic: { label: "Dramatic", rate: -0.08, pitch: 4 },
  bright: { label: "Bright", rate: 0.04, pitch: 5 },
  calm: { label: "Calm", rate: -0.1, pitch: -5 }
};

function clampNumber(value, min, max, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(Object.assign(new Error("Invalid JSON body"), { statusCode: 400, cause: error }));
      }
    });
    req.on("error", reject);
  });
}

function json(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*"
  });
  res.end(JSON.stringify(payload));
}

function toProsodyPercent(rate) {
  const pct = Math.round(clampNumber(rate, -0.5, 0.5) * 100);
  return pct >= 0 ? `+${pct}%` : `${pct}%`;
}

function normalizeStyle(style) {
  const key = String(style || "neutral").toLowerCase();
  return STYLE_PRESETS[key] ? key : "neutral";
}

function resolveNarrationSettings({ rate = 0, pitch = 0, style = "neutral", expressiveness = 0.5 } = {}) {
  const styleKey = normalizeStyle(style);
  const preset = STYLE_PRESETS[styleKey];
  const intensity = clampNumber(expressiveness, 0, 1, 0.5);
  return {
    style: styleKey,
    expressiveness: intensity,
    rate: clampNumber(Number(rate) + preset.rate * intensity, -0.5, 0.5),
    pitch: clampNumber(Number(pitch) + preset.pitch * intensity, -50, 50)
  };
}

function outputFormat(formatName) {
  const { OUTPUT_FORMAT } = require("msedge-tts");
  return formatName === "mp3-high"
    ? OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3
    : OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3;
}

async function synthesize({ text, voice, rate, pitch, format }) {
  if (process.env.ABM_FAKE_TTS === "1") {
    return Buffer.concat([FAKE_MP3, Buffer.from(String(text))]);
  }

  const { MsEdgeTTS } = require("msedge-tts");
  const tts = new MsEdgeTTS();
  await tts.setMetadata(voice, outputFormat(format));

  const prosody = { rate: toProsodyPercent(rate), pitch: `${Math.round(clampNumber(pitch, -50, 50))}Hz` };
  const { audioStream } = await tts.toStream(text, prosody);

  return await new Promise((resolve, reject) => {
    const chunks = [];
    let settled = false;
    const timeout = setTimeout(() => done(new Error("TTS timed out after 30 seconds")), 30000);
    if (typeof timeout.unref === "function") timeout.unref();

    function done(error, buffer) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      try { tts.close(); } catch (_error) {}
      if (error) reject(error);
      else resolve(buffer);
    }

    audioStream.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    audioStream.on("end", () => done(null, Buffer.concat(chunks)));
    audioStream.on("close", () => done(null, Buffer.concat(chunks)));
    audioStream.on("error", done);
  });
}

async function handleTts(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");

  if (req.method === "OPTIONS") {
    res.writeHead(204).end();
    return;
  }
  if (req.method !== "POST") {
    json(res, 405, { error: "Use POST /api/tts with JSON { text, voice, rate, pitch }." });
    return;
  }

  let body;
  try {
    body = await parseJsonBody(req);
  } catch (error) {
    json(res, error.statusCode || 400, { error: error.message });
    return;
  }

  const text = String(body.text || "").trim();
  if (!text) {
    json(res, 400, { error: "Text is required." });
    return;
  }
  if (text.length > MAX_CHARS) {
    json(res, 413, { error: `Chunk is too large. Keep chunks under ${MAX_CHARS} characters.`, maxChars: MAX_CHARS });
    return;
  }

  const voice = isValidVoice(body.voice) ? String(body.voice) : DEFAULT_VOICE;
  const narration = resolveNarrationSettings({
    rate: body.rate,
    pitch: body.pitch,
    style: body.style,
    expressiveness: body.expressiveness
  });
  const format = String(body.format || "mp3").toLowerCase();

  try {
    const buffer = await synthesize({ text, voice, rate: narration.rate, pitch: narration.pitch, format });
    if (!buffer || buffer.length === 0) {
      json(res, 502, { error: "TTS returned empty audio." });
      return;
    }
    res.writeHead(200, {
      "Content-Type": "audio/mpeg",
      "Content-Length": String(buffer.length),
      "Cache-Control": "no-store",
      "X-Voice": voice,
      "X-Narration-Style": narration.style,
      "X-Expressiveness": String(narration.expressiveness)
    });
    res.end(buffer);
  } catch (error) {
    json(res, 502, { error: `TTS failed: ${error.message}` });
  }
}

module.exports = handleTts;
module.exports.MAX_CHARS = MAX_CHARS;
module.exports.clampNumber = clampNumber;
module.exports.handleTts = handleTts;
module.exports.synthesize = synthesize;
module.exports.toProsodyPercent = toProsodyPercent;
module.exports.resolveNarrationSettings = resolveNarrationSettings;
module.exports.STYLE_PRESETS = STYLE_PRESETS;
