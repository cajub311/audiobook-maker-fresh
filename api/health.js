"use strict";

module.exports = function handleHealth(_req, res) {
  res.writeHead(200, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*"
  });
  res.end(JSON.stringify({ ok: true, service: "audiobook-maker-fresh" }));
};
