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
  style: document.querySelector("#style"),
  expressiveness: document.querySelector("#expressiveness"),
  format: document.querySelector("#format"),
  rateValue: document.querySelector("#rateValue"),
  pitchValue: document.querySelector("#pitchValue"),
  expressivenessValue: document.querySelector("#expressivenessValue"),
  chunkSize: document.querySelector("#chunkSize"),
  concurrency: document.querySelector("#concurrency"),
  preview: document.querySelector("#preview"),
  generate: document.querySelector("#generate"),
  stop: document.querySelector("#stop"),
  bar: document.querySelector("#bar"),
  elapsed: document.querySelector("#elapsed"),
  generatedSize: document.querySelector("#generatedSize"),
  settingsSummary: document.querySelector("#settingsSummary"),
  message: document.querySelector("#message"),
  player: document.querySelector("#player"),
  download: document.querySelector("#download")
};

const DRAFT_KEY = "audiobook-maker-fresh:draft";
const RETRY_DELAYS_MS = [700, 1400];

function setMessage(message, isError = false) {
  els.message.textContent = message;
  els.message.classList.toggle("error", isError);
}

function setProgress(done, total) {
  const percent = total ? Math.round((done / total) * 100) : 0;
  els.bar.style.width = `${percent}%`;
}

function formatBytes(bytes) {
  if (!bytes) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024)).toLocaleString()} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatElapsed(startedAt) {
  if (!startedAt) return "0s";
  const seconds = Math.max(0, Math.round((performance.now() - startedAt) / 1000));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes ? `${minutes}m ${rest}s` : `${rest}s`;
}

function updateSettingsSummary() {
  const style = els.style.options[els.style.selectedIndex]?.textContent || "Neutral";
  const quality = els.format.options[els.format.selectedIndex]?.textContent || "Standard";
  els.settingsSummary.textContent = `${style}, ${els.expressiveness.value}%, ${quality}`;
}

function updateRunStats({ startedAt = null, bytes = 0 } = {}) {
  els.elapsed.textContent = formatElapsed(startedAt);
  els.generatedSize.textContent = formatBytes(bytes);
  updateSettingsSummary();
}

function estimateMinutes(text) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 155));
}

function updateCounts() {
  state.chunks = splitIntoChunks(els.text.value, els.chunkSize.value);
  els.charCount.textContent = `${els.text.value.trim().length.toLocaleString()} characters`;
  els.chunkCount.textContent = `${state.chunks.length.toLocaleString()} chunks · about ${estimateMinutes(els.text.value)} min`;
  saveDraft();
}

function saveDraft() {
  const draft = {
    text: els.text.value,
    voice: els.voice.value,
    rate: els.rate.value,
    pitch: els.pitch.value,
    style: els.style.value,
    expressiveness: els.expressiveness.value,
    format: els.format.value,
    chunkSize: els.chunkSize.value,
    concurrency: els.concurrency.value
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
    if (draft.style != null) els.style.value = draft.style;
    if (draft.expressiveness != null) els.expressiveness.value = draft.expressiveness;
    if (draft.format != null) els.format.value = draft.format;
    if (draft.chunkSize != null) els.chunkSize.value = draft.chunkSize;
    if (draft.concurrency != null) els.concurrency.value = draft.concurrency;
    els.rateValue.textContent = `${els.rate.value}%`;
    els.pitchValue.textContent = `${els.pitch.value} Hz`;
    els.expressivenessValue.textContent = `${els.expressiveness.value}%`;
    updateSettingsSummary();
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
  let lastError;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    if (attempt > 0) {
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(resolve, RETRY_DELAYS_MS[attempt - 1]);
        signal?.addEventListener("abort", () => {
          clearTimeout(timeout);
          reject(new DOMException("Aborted", "AbortError"));
        }, { once: true });
      });
    }

    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        voice: els.voice.value,
        rate: Number(els.rate.value) / 100,
        pitch: Number(els.pitch.value),
        style: els.style.value,
        expressiveness: Number(els.expressiveness.value) / 100,
        format: els.format.value
      }),
      signal
    });

    if (res.ok) {
      const blob = await res.blob();
      if (!blob.size) throw new Error("TTS returned an empty audio file");
      return blob;
    }

    let error = `TTS failed (${res.status})`;
    try {
      const data = await res.json();
      error = data.error || error;
    } catch (_error) {}
    lastError = new Error(error);
    if (res.status < 500 && res.status !== 429) throw lastError;
  }

  throw lastError || new Error("TTS failed");
}

async function renderChunks(chunks, signal, onChunkDone) {
  const limit = Math.max(1, Math.min(3, Number(els.concurrency.value) || 1));
  const parts = new Array(chunks.length);
  let cursor = 0;

  async function worker() {
    while (!signal?.aborted) {
      const index = cursor;
      cursor += 1;
      if (index >= chunks.length) return;
      const blob = await synthesizeChunk(chunks[index], signal);
      parts[index] = blob;
      onChunkDone(index, blob);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, chunks.length) }, worker));
  return parts;
}

async function generate() {
  updateCounts();
  if (!state.chunks.length) {
    setMessage("Paste text before generating.", true);
    return;
  }

  state.controller = new AbortController();
  const startedAt = performance.now();
  els.generate.disabled = true;
  els.stop.disabled = false;
  els.download.hidden = true;
  els.player.removeAttribute("src");
  setProgress(0, state.chunks.length);
  updateRunStats({ startedAt, bytes: 0 });
  setMessage(`Generating ${state.chunks.length} chunk${state.chunks.length === 1 ? "" : "s"}...`);

  const parts = [];
  let completed = 0;
  let bytes = 0;
  const statsTimer = setInterval(() => updateRunStats({ startedAt, bytes }), 1000);
  try {
    const rendered = await renderChunks(state.chunks, state.controller.signal, (index, blob) => {
      parts[index] = blob;
      completed += 1;
      bytes += blob.size;
      setProgress(completed, state.chunks.length);
      updateRunStats({ startedAt, bytes });
      setMessage(`Generated ${completed} of ${state.chunks.length} chunks...`);
    });

    const audiobook = new Blob(rendered, { type: "audio/mpeg" });
    const url = URL.createObjectURL(audiobook);
    els.player.src = url;
    els.download.href = url;
    els.download.hidden = false;
    updateRunStats({ startedAt, bytes: audiobook.size });
    setMessage(`Done. ${formatBytes(audiobook.size)} generated in ${formatElapsed(startedAt)}.`);
  } catch (error) {
    if (error.name === "AbortError") {
      setMessage("Generation stopped.");
    } else {
      setMessage(error.message, true);
    }
  } finally {
    clearInterval(statsTimer);
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
  const startedAt = performance.now();
  els.preview.disabled = true;
  els.generate.disabled = true;
  els.stop.disabled = false;
  els.download.hidden = true;
  setProgress(0, 1);
  updateRunStats({ startedAt, bytes: 0 });
  setMessage("Generating preview...");

  try {
    const blob = await synthesizeChunk(state.chunks[0], state.controller.signal);
    const url = URL.createObjectURL(blob);
    els.player.src = url;
    setProgress(1, 1);
    updateRunStats({ startedAt, bytes: blob.size });
    setMessage(`Preview ready. ${formatBytes(blob.size)} generated.`);
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
els.style.addEventListener("change", () => {
  updateSettingsSummary();
  saveDraft();
});
els.format.addEventListener("change", () => {
  updateSettingsSummary();
  saveDraft();
});
els.concurrency.addEventListener("change", saveDraft);
els.rate.addEventListener("input", () => {
  els.rateValue.textContent = `${els.rate.value}%`;
  saveDraft();
});
els.pitch.addEventListener("input", () => {
  els.pitchValue.textContent = `${els.pitch.value} Hz`;
  saveDraft();
});
els.expressiveness.addEventListener("input", () => {
  els.expressivenessValue.textContent = `${els.expressiveness.value}%`;
  updateSettingsSummary();
  saveDraft();
});
els.preview.addEventListener("click", preview);
els.generate.addEventListener("click", generate);
els.stop.addEventListener("click", () => state.controller?.abort());

updateCounts();
updateRunStats();
loadVoices().catch((error) => {
  els.health.textContent = "Error";
  setMessage(error.message, true);
});
