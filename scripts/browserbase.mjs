#!/usr/bin/env node
// Callable Browserbase helper. The API key identifies the project;
// do not set BROWSERBASE_PROJECT_ID.
//
//   node scripts/browserbase.mjs session
//   node scripts/browserbase.mjs fetch <url>
//   node scripts/browserbase.mjs release <sessionId>
//
// A session is one cloud Chrome run. Watch it at the printed sessions URL.
// Fetch grabs page text and does not start a browser.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
loadEnv(join(root, ".env"));

const key = process.env.BROWSERBASE_API_KEY || "";
const api = "https://api.browserbase.com";

function loadEnv(path) {
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return;
  }
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const name = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[name] == null || process.env[name] === "") process.env[name] = value;
  }
}

function usage() {
  console.log(`Usage:
  node scripts/browserbase.mjs session
  node scripts/browserbase.mjs fetch <url>
  node scripts/browserbase.mjs release <sessionId>`);
}

async function bb(path, options = {}) {
  if (!key) {
    throw new Error("BROWSERBASE_API_KEY is missing. Put it in .env (gitignored).");
  }
  const res = await fetch(api + path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-BB-API-Key": key,
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text.slice(0, 300) };
  }
  if (!res.ok) {
    const message = body.message || body.error || text.slice(0, 300);
    throw new Error(`${path} ${res.status} ${message}`);
  }
  return body;
}

async function session() {
  const created = await bb("/v1/sessions", { method: "POST", body: "{}" });
  let live = "";
  try {
    const debug = await bb(`/v1/sessions/${created.id}/debug`);
    live = debug.debuggerFullscreenUrl || debug.debuggerUrl || "";
  } catch (err) {
    live = `(live view unavailable: ${err.message})`;
  }
  console.log(JSON.stringify({
    id: created.id,
    status: created.status,
    inspector: `https://www.browserbase.com/sessions/${created.id}`,
    liveView: live,
  }, null, 2));
}

async function fetchPage(url) {
  if (!url) throw new Error("fetch needs a url");
  const body = await bb("/v1/fetch", {
    method: "POST",
    body: JSON.stringify({ url, format: "markdown", allowRedirects: true }),
  });
  const content = String(body.content || "");
  console.log(JSON.stringify({
    url,
    statusCode: body.statusCode,
    chars: content.length,
  }, null, 2));
  console.log(content.slice(0, 2000));
}

async function release(id) {
  if (!id) throw new Error("release needs a session id");
  const body = await bb(`/v1/sessions/${id}`, {
    method: "POST",
    body: JSON.stringify({ status: "REQUEST_RELEASE" }),
  });
  console.log(JSON.stringify({ id: body.id || id, status: body.status || "REQUEST_RELEASE" }, null, 2));
}

const [cmd, arg] = process.argv.slice(2);
try {
  if (cmd === "session") await session();
  else if (cmd === "fetch") await fetchPage(arg);
  else if (cmd === "release") await release(arg);
  else {
    usage();
    process.exit(cmd ? 1 : 0);
  }
} catch (err) {
  console.error(err.message || err);
  process.exit(1);
}
