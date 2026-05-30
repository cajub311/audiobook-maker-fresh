"use strict";

const VOICES = [
  { id: "en-US-AvaMultilingualNeural", name: "Ava", locale: "en-US", gender: "Female", description: "Expressive US narrator" },
  { id: "en-US-AndrewMultilingualNeural", name: "Andrew", locale: "en-US", gender: "Male", description: "Warm US narrator" },
  { id: "en-US-JennyNeural", name: "Jenny", locale: "en-US", gender: "Female", description: "Clear fiction narrator" },
  { id: "en-US-GuyNeural", name: "Guy", locale: "en-US", gender: "Male", description: "Steady nonfiction narrator" },
  { id: "en-GB-SoniaNeural", name: "Sonia", locale: "en-GB", gender: "Female", description: "Natural UK narrator" },
  { id: "en-GB-RyanNeural", name: "Ryan", locale: "en-GB", gender: "Male", description: "Calm UK narrator" },
  { id: "en-AU-NatashaNeural", name: "Natasha", locale: "en-AU", gender: "Female", description: "Australian narrator" },
  { id: "en-CA-ClaraNeural", name: "Clara", locale: "en-CA", gender: "Female", description: "Canadian narrator" }
];

const DEFAULT_VOICE = VOICES[0].id;
const VOICE_IDS = new Set(VOICES.map((voice) => voice.id));

function isValidVoice(id) {
  return VOICE_IDS.has(String(id || ""));
}

function listVoices() {
  return {
    default: DEFAULT_VOICE,
    voices: VOICES.map((voice) => ({
      ...voice,
      label: `${voice.name} (${voice.locale}, ${voice.gender})`
    }))
  };
}

function handleVoices(_req, res) {
  res.writeHead(200, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*"
  });
  res.end(JSON.stringify(listVoices()));
}

module.exports = handleVoices;
module.exports.DEFAULT_VOICE = DEFAULT_VOICE;
module.exports.VOICES = VOICES;
module.exports.isValidVoice = isValidVoice;
module.exports.listVoices = listVoices;
