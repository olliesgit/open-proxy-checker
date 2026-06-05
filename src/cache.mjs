import fs from "node:fs";
import path from "node:path";

const CACHE_DIR = path.resolve(process.cwd(), ".cache");
const CACHE_FILE = path.join(CACHE_DIR, "proxies.json");
const SOURCE_DIR = path.join(CACHE_DIR, "sources");
const TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const SOURCE_TTL_MS = 45 * 60 * 1000; // 45 minutes

// ── Proxy Cache ─────────────────────────────────────────────────────────────

export function loadProxyCache() {
  try {
    if (!fs.existsSync(CACHE_FILE)) return null;
    const raw = fs.readFileSync(CACHE_FILE, "utf-8");
    const c = JSON.parse(raw);
    if (c.version !== 1) return null;
    return c;
  } catch {
    return null;
  }
}

export function saveProxyCache(cache) {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    cache.updated = Date.now();
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache), "utf-8");
  } catch { /* non-fatal */ }
}

export const CACHE_TTL = TTL_MS;

export function splitByCache(proxies, cache) {
  const preloaded = [];
  const toCheck = [];
  if (!cache?.proxies) return { preloaded, toCheck: proxies };
  const now = Date.now();
  const seen = new Set();
  for (const p of proxies) {
    const key = `${p.ip}:${p.port}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const entry = cache.proxies[key];
    if (entry && (now - entry.lastSeen) < TTL_MS && entry.alive) {
      preloaded.push({
        ...p,
        latency: entry.latency,
        anonymity: entry.anonymity || p.anonymity,
        cached: true,
        country: p.country || entry.country || null,
        sources: [...new Set([...(p.sources || []), ...(entry.sources || [])])],
      });
    } else {
      toCheck.push(p);
    }
  }
  return { preloaded, toCheck };
}

export function resultsToCache(cache, proxies) {
  cache.proxies = cache.proxies || {};
  const now = Date.now();
  for (const p of proxies) {
    const key = `${p.ip}:${p.port}`;
    const srcs = (p.sources || []).filter((s) => s != null);
    const existing = cache.proxies[key] || {};
    cache.proxies[key] = {
      ...existing,
      lastSeen: now,
      latency: p.latency ?? existing.latency,
      anonymity: p.anonymity ?? existing.anonymity,
      alive: true,
      aliveStreak: (existing.aliveStreak || 0) + 1,
      deadStreak: 0,
      sources: [...new Set([...(existing.sources || []), ...srcs])],
      checks: (existing.checks || 0) + 1,
      aliveChecks: (existing.aliveChecks || 0) + 1,
    };
  }
}

// ── Source Response Cache ────────────────────────────────────────────────────

export function loadSourceCache(url) {
  try {
    const safe = Buffer.from(url).toString("base64url").slice(0, 80);
    const fp = path.join(SOURCE_DIR, `${safe}.json`);
    if (!fs.existsSync(fp)) return null;
    const c = JSON.parse(fs.readFileSync(fp, "utf-8"));
    if (Date.now() - c.fetched > SOURCE_TTL_MS) {
      try { fs.unlinkSync(fp); } catch {}
      return null;
    }
    return c.text;
  } catch {
    return null;
  }
}

export function saveSourceCache(url, text) {
  try {
    fs.mkdirSync(SOURCE_DIR, { recursive: true });
    const safe = Buffer.from(url).toString("base64url").slice(0, 80);
    const fp = path.join(SOURCE_DIR, `${safe}.json`);
    fs.writeFileSync(fp, JSON.stringify({ text, fetched: Date.now() }, null, 2), "utf-8");
  } catch { /* non-fatal */ }
}
