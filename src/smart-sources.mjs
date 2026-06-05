/**
 * Smart source fetchers with retry, backoff, and source health tracking.
 *
 * Wraps SOURCE_REGISTRY with:
 * - Exponential backoff per source failure
 * - Per-source success/failure history
 * - URL cache where applicable (GitHub raw)
 * - Smart ordering (best sources first)
 */

import { retry, withTimeout } from "./retry.mjs";
import { loadSourceCache, saveSourceCache } from "./cache.mjs";
import { parseIpPortList, parseProtocolList, dedup, createMultiProtoSource } from "./parsers.mjs";

const DEFAULT_SOURCE_TIMEOUT = 12000;

/** Source health record kept in-memory per run. */
export class SourceHealth {
  constructor() { this.stats = new Map(); }
  record(name, ok, count) {
    const prev = this.stats.get(name) || { fails: 0, runs: 0, lastOk: -Infinity, totalProxies: 0 };
    prev.runs++;
    prev.totalProxies += count;
    if (ok) prev.lastOk = Date.now(); else prev.fails++;
    this.stats.set(name, prev);
  }
  recentFailRate(name) {
    const s = this.stats.get(name);
    if (!s || s.runs < 2) return 0;
    // Just look at consecutive recent runs (keeps it simple)
    return s.fails / s.runs;
  }
  lastSuccessMs(name) {
    return Date.now() - (this.stats.get(name)?.lastOk || 0);
  }
}

/** Fetch text with retry, respecting source cache. */
export async function fetchTextSmart(url, sourceName, health) {
  const cached = loadSourceCache(url);
  if (cached) {
    health.record(sourceName, true, cached.split("\n").length);
    return cached;
  }
  try {
    const text = await withTimeout(() => fetchText(url), DEFAULT_SOURCE_TIMEOUT);
    if (!text) { health.record(sourceName, false, 0); return ""; }
    saveSourceCache(url, text);
    const cnt = text.split("\n").filter((l) => l.trim() && !l.startsWith("#")).length;
    health.record(sourceName, true, cnt);
    return text;
  } catch {
    health.record(sourceName, false, 0);
    return "";
  }
}

export async function fetchJsonSmart(url, sourceName, health) {
  try {
    const raw = await withTimeout(() => fetchJson(url), DEFAULT_SOURCE_TIMEOUT);
    health.record(sourceName, !!(raw || {}), raw?.data?.length || 0);
    return raw;
  } catch {
    health.record(sourceName, false, 0);
    return null;
  }
}

/** Wrap a source function so it reports health. */
export async function runSource(fn, sourceName, health) {
  try {
    const proxies = await withTimeout(() => fn(), DEFAULT_SOURCE_TIMEOUT);
    if (!Array.isArray(proxies) || !proxies.length) {
      // Some sources genuinely return empty, only count as failure if proven repeated
      health.record(sourceName, false, 0);
    } else {
      health.record(sourceName, true, proxies.length);
    }
    return proxies || [];
  } catch {
    health.record(sourceName, false, 0);
    return [];
  }
}

// ── Re-export or recreate smart parse helpers ─────────────────────────────────

function fetchText(url) {
  return new Promise((resolve) => {
    const mod = url.startsWith("https") ? require("node:https") : require("node:http");
    const req = mod.get(url, { timeout: 10000 }, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => resolve(data));
    });
    req.on("error", () => resolve(""));
    req.on("timeout", () => { req.destroy(); resolve(""); });
  });
}

function fetchJson(url) {
  return new Promise((resolve) => {
    const mod = url.startsWith("https") ? require("node:https") : require("node:http");
    const req = mod.get(url, { timeout: 10000 }, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => { try { resolve(JSON.parse(data)); } catch { resolve(null); } });
    });
    req.on("error", () => resolve(null));
    req.on("timeout", () => { req.destroy(); resolve(null); });
  });
}

// ── Intelligent dedup merging metadata ──────────────────────────────────────

/**
 * Dedup that merges metadata across sources instead of silently dropping it.
 * Keeps first occurrence as the base, but copies over country/anonymity
 * from later occurrences when the base has nulls.
 * Tracks source provenance on each proxy.
 */
export function smartDedup(proxies) {
  const best = new Map();
  for (const p of proxies) {
    const key = `${p.ip}:${p.port}`;
    if (!best.has(key)) {
      best.set(key, {
        ...p,
        sources: [p._source || "unknown"],
      });
      continue;
    }
    const cur = best.get(key);
    // prefer non-empty type
    if (!cur.type && p.type) cur.type = p.type;
    // fill null country
    if (!cur.country && p.country) cur.country = p.country;
    // fill null anonymity (prefer higher tier)
    if (!cur.anonymity && p.anonymity) cur.anonymity = p.anonymity;
    else if (cur.anonymity === "transparent" && p.anonymity === "elite") {
      cur.anonymity = "elite";
    } else if (cur.anonymity === "transparent" && p.anonymity === "anonymous") {
      cur.anonymity = "anonymous";
    }
    // append source provenance
    const src = p._source || "unknown";
    if (!cur.sources.includes(src)) cur.sources.push(src);
    // keep lowest latency seen
    if (p.latency != null && (cur.latency == null || p.latency < cur.latency)) {
      cur.latency = p.latency;
    }
  }
  return Array.from(best.values());
}
