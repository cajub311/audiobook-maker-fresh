"use strict";

const assert = require("node:assert/strict");
const { pathToFileURL } = require("node:url");
const { test } = require("node:test");

async function loadChunker() {
  return import(pathToFileURL(`${process.cwd()}/public/chunker.mjs`).href);
}

test("chunker returns empty array for blank text", async () => {
  const { splitIntoChunks } = await loadChunker();
  assert.deepEqual(splitIntoChunks("   "), []);
});

test("chunker respects max size and preserves sentence order", async () => {
  const { splitIntoChunks } = await loadChunker();
  const input = `${"One ".repeat(90)}. ${"Two ".repeat(90)}. ${"Tri ".repeat(90)}.`;
  const chunks = splitIntoChunks(input, 400);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((chunk) => chunk.length <= 400));
  assert.equal(chunks.join(" "), input.trim());
});

test("chunker hard-splits a very long sentence", async () => {
  const { splitIntoChunks } = await loadChunker();
  const chunks = splitIntoChunks("x".repeat(1200), 400);
  assert.equal(chunks.length, 3);
  assert.ok(chunks.every((chunk) => chunk.length <= 400));
});
