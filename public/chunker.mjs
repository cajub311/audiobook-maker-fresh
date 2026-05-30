export function splitIntoChunks(text, maxChars = 1800) {
  const limit = Math.max(400, Math.min(4500, Number(maxChars) || 1800));
  const normalized = String(text || "").replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  const paragraphs = normalized.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  const chunks = [];
  let current = "";

  function pushCurrent() {
    if (current.trim()) chunks.push(current.trim());
    current = "";
  }

  for (const paragraph of paragraphs) {
    const sentences = paragraph.match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g) || [paragraph];
    for (const sentenceRaw of sentences) {
      const sentence = sentenceRaw.trim();
      if (!sentence) continue;

      if (sentence.length > limit) {
        pushCurrent();
        for (let index = 0; index < sentence.length; index += limit) {
          const piece = sentence.slice(index, index + limit).trim();
          if (piece) chunks.push(piece);
        }
        continue;
      }

      const candidate = current ? `${current} ${sentence}` : sentence;
      if (candidate.length > limit) {
        pushCurrent();
        current = sentence;
      } else {
        current = candidate;
      }
    }
  }
  pushCurrent();
  return chunks;
}
