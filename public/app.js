import { splitIntoChunks } from "./chunker.mjs";

const state = {
  controller: null,
  voices: [],
  chunks: []
};

const els = {
  health: document.querySelector("#health"),
  text: document.querySelector("#bookText"),
  fileInput: document.querySelector("#fileInput"),
  charCount: document.querySelector("#charCount"),
  chunkCount: document.querySelector("#chunkCount"),
  voice: document.querySelector("#voice"),
  rate: document.querySelector("#rate"),
  pitch: document.querySelector("#pitch"),
  rateValue: document.querySelector("#rateValue"),
  pitchValue: document.querySelector("#pitchValue"),
  chunkSize: document.querySelector("#chunkSize"),
  preview: document.querySelector("#preview"),
  generate: document.querySelector("#generate"),
  stop: document.querySelector("#stop"),
  bar: document.querySelector("#bar"),
  message: document.querySelector("#message"),
  player: document.querySelector("#player"),
  download: document.querySelector("#download")
};

const DRAFT_KEY = "audiobook-maker-fresh:draft";

function setMessage(message, isError = false) {
  els.message.textContent = message;
  els.message.classList.toggle("error", isError);
}

function setProgress(done, total) {
  const percent = total ? Math.round((done / total) * 100) : 0;
  els.bar.style.width = `${percent}%`;
}

function updateCounts() {
  state.chunks = splitIntoChunks(els.text.value, els.chunkSize.value);
  els.charCount.textContent = `${els.text.value.trim().length.toLocaleString()} characters`;
  els.chunkCount.textContent = `${state.chunks.length.toLocaleString()} chunks`;
  saveDraft();
}

function saveDraft() {
  const draft = {
    text: els.text.value,
    voice: els.voice.value,
    rate: els.rate.value,
    pitch: els.pitch.value,
    chunkSize: els.chunkSize.value
  };
  localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
}

function restoreDraft() {
  try {
    const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
    if (!draft) return;
    if (typeof draft.text === "string") els.text.value = draft.text;
    if (draft.rate != null) els.rate.value = draft.rate;
    if (draft.pitch != null) els.pitch.value = draft.pitch;
    if (draft.chunkSize != null) els.chunkSize.value = draft.chunkSize;
    els.rateValue.textContent = `${els.rate.value}%`;
    els.pitchValue.textContent = `${els.pitch.value} Hz`;
  } catch (_error) {
    localStorage.removeItem(DRAFT_KEY);
  }
}

async function loadVoices() {
  const [healthRes, voicesRes] = await Promise.all([
    fetch("/api/health"),
    fetch("/api/voices")
  ]);
  if (!healthRes.ok) throw new Error("Health check failed");
  if (!voicesRes.ok) throw new Error("Voices failed to load");

  const data = await voicesRes.json();
  state.voices = data.voices || [];
  els.voice.replaceChildren(...state.voices.map((voice) => {
    const option = document.createElement("option");
    option.value = voice.id;
    option.textContent = `${voice.label} - ${voice.description}`;
    return option;
  }));
  els.voice.value = data.default || state.voices[0]?.id || "";
  try {
    const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
    if (draft?.voice && state.voices.some((voice) => voice.id === draft.voice)) {
      els.voice.value = draft.voice;
    }
  } catch (_error) {}
  els.health.textContent = "Ready";
}

async function synthesizeChunk(text, signal) {
  const res = await fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      voice: els.voice.value,
      rate: Number(els.rate.value) / 100,
      pitch: Number(els.pitch.value),
      format: "mp3"
    }),
    signal
  });

  if (!res.ok) {
    let error = `TTS failed (${res.status})`;
    try {
      const data = await res.json();
      error = data.error || error;
    } catch (_error) {}
    throw new Error(error);
  }

  const blob = await res.blob();
  if (!blob.size) throw new Error("TTS returned an empty audio file");
  return blob;
}

async function generate() {
  updateCounts();
  if (!state.chunks.length) {
    setMessage("Paste text before generating.", true);
    return;
  }

  state.controller = new AbortController();
  els.generate.disabled = true;
  els.stop.disabled = false;
  els.download.hidden = true;
  els.player.removeAttribute("src");
  setProgress(0, state.chunks.length);
  setMessage(`Generating ${state.chunks.length} chunk${state.chunks.length === 1 ? "" : "s"}...`);

  const parts = [];
  try {
    for (let index = 0; index < state.chunks.length; index += 1) {
      setMessage(`Generating chunk ${index + 1} of ${state.chunks.length}...`);
      parts.push(await synthesizeChunk(state.chunks[index], state.controller.signal));
      setProgress(index + 1, state.chunks.length);
    }

    const audiobook = new Blob(parts, { type: "audio/mpeg" });
    const url = URL.createObjectURL(audiobook);
    els.player.src = url;
    els.download.href = url;
    els.download.hidden = false;
    setMessage(`Done. ${Math.round(audiobook.size / 1024).toLocaleString()} KB generated.`);
  } catch (error) {
    if (error.name === "AbortError") {
      setMessage("Generation stopped.");
    } else {
      setMessage(error.message, true);
    }
  } finally {
    state.controller = null;
    els.generate.disabled = false;
    els.stop.disabled = true;
  }
}

async function preview() {
  updateCounts();
  if (!state.chunks.length) {
    setMessage("Paste text before previewing.", true);
    return;
  }

  state.controller = new AbortController();
  els.preview.disabled = true;
  els.generate.disabled = true;
  els.stop.disabled = false;
  els.download.hidden = true;
  setProgress(0, 1);
  setMessage("Generating preview...");

  try {
    const blob = await synthesizeChunk(state.chunks[0], state.controller.signal);
    const url = URL.createObjectURL(blob);
    els.player.src = url;
    setProgress(1, 1);
    setMessage("Preview ready.");
  } catch (error) {
    setMessage(error.name === "AbortError" ? "Preview stopped." : error.message, error.name !== "AbortError");
  } finally {
    state.controller = null;
    els.preview.disabled = false;
    els.generate.disabled = false;
    els.stop.disabled = true;
  }
}

async function importFile(file) {
  if (!file) return;
  if (file.size > 2_000_000) {
    setMessage("File is too large for this first rebuild. Use a .txt file under 2 MB.", true);
    return;
  }
  els.text.value = await file.text();
  updateCounts();
  setMessage(`Imported ${file.name}.`);
}

restoreDraft();
els.text.addEventListener("input", updateCounts);
els.chunkSize.addEventListener("input", updateCounts);
els.fileInput.addEventListener("change", () => importFile(els.fileInput.files?.[0]));
els.voice.addEventListener("change", saveDraft);
els.rate.addEventListener("input", () => {
  els.rateValue.textContent = `${els.rate.value}%`;
  saveDraft();
});
els.pitch.addEventListener("input", () => {
  els.pitchValue.textContent = `${els.pitch.value} Hz`;
  saveDraft();
});
els.preview.addEventListener("click", preview);
els.generate.addEventListener("click", generate);
els.stop.addEventListener("click", () => state.controller?.abort());

updateCounts();
loadVoices().catch((error) => {
  els.health.textContent = "Error";
  setMessage(error.message, true);
});
