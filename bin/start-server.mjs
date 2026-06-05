#!/usr/bin/env node

/**
 * Open Proxy Checker -- Web Server
 *
 * Integrated with: check-chain (fallback validation), cache, smartDedup,
 *                  circuit breaker (adaptive concurrency)
 *
 * Usage: node bin/start-server.mjs [--port 3000]
 */

import http from "node:http";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseIpPortList, parseProtocolList } from "../src/parsers.mjs";
import { SOURCE_REGISTRY } from "../src/sources.mjs";
import { checkProxy } from "../src/check-chain.mjs";
import { buildProbes } from "../src/check-chain.mjs";
import { smartDedup } from "../src/smart-sources.mjs";
import { createCircuitBreaker } from "../src/pool.mjs";
import { loadProxyCache, resultsToCache, saveProxyCache, CACHE_TTL } from "../src/cache.mjs";
import { formatCsv, formatJson, formatTxt } from "../src/exporters.mjs";
import { loadConfig } from "../src/config.mjs";
import { getSourceStats } from "../src/source-stats.mjs";
import { startScan, finishScan, recordProxyResults, getRecentScans, getProxyHistory, getReliableProxies } from "../src/history.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

const CFG = loadConfig();

const DEFAULT_PORT = parseInt(process.env.PORT || String(CFG.server?.port || "3000"), 10);
const USER_PORT = process.argv.find((_, i, a) => a[i - 1] === "--port");
const PORT = Math.max(1, Math.min(65535, parseInt(USER_PORT || String(DEFAULT_PORT), 10) || DEFAULT_PORT));

const CONFIG = {
  DEFAULT_CHECK_TIMEOUT: CFG.validation?.check_timeout_ms || 5000,
  DEFAULT_CONCURRENCY: CFG.concurrency || 50,
  PROBES: buildProbes(CFG.validation?.probes),
};

function logError(context, err) {
  const ts = new Date().toISOString();
  console.error(`[${ts}] [${context}] ${err?.message || err}`, err?.stack ? `\n${err.stack}` : "");
}

function logInfo(context, msg) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] [${context}] ${msg}`);
}

async function handleScan(req, res) {
  // Parse query params for source filtering
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const enabledParam = url.searchParams.get("sources");
  const enabledSources = enabledParam
    ? new Set(enabledParam.split(",").filter(Boolean))
    : null;

  let activeSources = [...SOURCE_REGISTRY.entries()];
  if (enabledSources && enabledSources.size > 0) {
    activeSources = activeSources.filter(([name]) => enabledSources.has(name));
  }

  if (!activeSources.length) {
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Access-Control-Allow-Origin": "*" });
    res.write(`event: done\ndata: ${JSON.stringify({ message: "No sources enabled.", checked: 0, working: 0 })}\n\n`);
    res.end();
    return;
  }

  const send = (event, data) => {
    if (res.writableEnded) return;
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });

  req.on("close", () => res.end());

  try {
    send("status", { message: `Fetching proxy lists from ${activeSources.length} sources...` });

    const sourceNames = activeSources.map(([name]) => name);
    const sourcePromises = activeSources.map(([, fn]) => fn());
    const tracked = sourcePromises.map((p, i) =>
      p.then((proxies) => {
        const got = Array.isArray(proxies) ? proxies.length : 0;
        send("status", { message: `Fetching proxy lists... -- ${sourceNames[i]}: ${got} proxies`, sourceDone: sourceNames[i], sourceCount: got });
        return proxies;
      }).catch(() => {
        send("status", { message: `Fetching proxy lists... -- ${sourceNames[i]}: error`, sourceDone: sourceNames[i], sourceCount: 0 });
        return [];
      })
    );

    const results = await Promise.allSettled(tracked);

    let allProxies = [];
    for (const r of results) {
      if (r.status === "fulfilled" && r.value) allProxies.push(...r.value);
    }

    if (!allProxies.length) {
      send("done", { total: 0, checked: 0, message: "No proxies found." });
      return;
    }

    // Use smart dedup to merge metadata across sources
    allProxies = smartDedup(allProxies);

    // Load cache, split known from unknown
    const cache = loadProxyCache() || { version: 1, proxies: {} };
    const { preloaded, toCheck } = splitServerCache(allProxies, cache);

    const total = allProxies.length;
    const preloadedCount = preloaded.length;
    const toCheckCount = toCheck.length;

    if (preloadedCount > 0) {
      send("status", { message: `Cache hit: ${preloadedCount} proxies preloaded, checking ${toCheckCount} new/expired...`, total, preloaded: preloadedCount });
    } else {
      send("status", { message: `Validating ${total} proxies...`, total });
    }

    // Circuit breaker for adaptive concurrency
    const cb = createCircuitBreaker({ initialConcurrency: CONFIG.DEFAULT_CONCURRENCY });
    // Start scan history
    const scanId = startScan({ totalSources: activeSources.length, totalFetched: allProxies.length });

    const working = [...preloaded]; // preloaded are already known-good
    let index = 0;
    let checked = 0;

    async function worker() {
      while (index < toCheck.length) {
        const i = index++;
        const proxy = toCheck[i];
        const result = await checkProxy(proxy, CONFIG.DEFAULT_CHECK_TIMEOUT, CONFIG.PROBES);
        checked++;

        if (result.alive) {
          cb.recordSuccess();
          proxy.latency = result.latency;
          proxy.anonymity = result.anonymity || proxy.anonymity || null;
          working.push(proxy);
          send("found", proxy);
        } else {
          cb.recordFailure();
        }

        if (checked % 10 === 0 || checked === toCheck.length) {
          const totalChecked = preloadedCount + checked;
          send("status", { message: `Checked ${totalChecked}/${total}...`, checked: totalChecked, total, found: working.length });
        }
      }
    }

    const workerCount = Math.min(toCheck.length || 1, cb.getConcurrency());
    const workers = Array.from({ length: Math.max(1, workerCount) }, () => worker());
    await Promise.all(workers);

    // Merge results back into cache
    const aliveProxies = working.filter((p) => !p.cached);
    if (aliveProxies.length > 0) {
      resultsToCache(cache, aliveProxies);
      saveProxyCache(cache);
    }

    // Record scan history
    if (scanId != null) {
      recordProxyResults(scanId, working);
      finishScan(scanId, { proxiesChecked: preloadedCount + checked, proxiesFound: working.length, cacheHits: preloadedCount });
    }

    send("done", { total: working.length, checked: preloadedCount + checked, message: `Done. Found ${working.length} working proxies (${preloadedCount} from cache) out of ${total} total.` });
  } catch (err) {
    logError("scan", err);
    if (!res.writableEnded) {
      send("done", { total: 0, checked: 0, message: `Scan failed: ${err?.message || err}` });
    }
  } finally {
    if (!res.writableEnded) res.end();
  }
}

/** Lightweight cache split for in-memory cache object (works with loadProxyCache format). */
function splitServerCache(proxies, cache) {
  const preloaded = [];
  const toCheck = [];
  if (!cache?.proxies) return { preloaded, toCheck: proxies };
  const now = Date.now();
  for (const p of proxies) {
    const key = `${p.ip}:${p.port}`;
    const entry = cache.proxies[key];
    if (entry && (now - entry.lastSeen) < CACHE_TTL && entry.alive) {
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

/** Source quality stats from cache: /api/sources */
function handleSourceStats(req, res) {
  const stats = getSourceStats();
  const body = JSON.stringify(stats || [], null, 2);
  res.writeHead(200, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(body);
}

/** Scan history endpoints: /api/history/scans, /api/history/proxy, /api/history/reliable */
function handleHistory(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const sub = url.pathname.replace("/api/history/", "");
  res.writeHead(200, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  });
  if (sub === "scans") {
    const limit = parseInt(url.searchParams.get("limit") || "20", 10);
    res.end(JSON.stringify(getRecentScans(limit), null, 2));
  } else if (sub === "proxy") {
    const ip = url.searchParams.get("ip");
    const port = parseInt(url.searchParams.get("port") || "0", 10);
    if (!ip || !port) { res.end(JSON.stringify([])); return; }
    const limit = parseInt(url.searchParams.get("limit") || "50", 10);
    res.end(JSON.stringify(getProxyHistory(ip, port, limit), null, 2));
  } else if (sub === "reliable") {
    const minScans = parseInt(url.searchParams.get("minScans") || "2", 10);
    const minRatio = parseInt(url.searchParams.get("minRatio") || "80", 10);
    const limit = parseInt(url.searchParams.get("limit") || "100", 10);
    res.end(JSON.stringify(getReliableProxies(minScans, minRatio / 100, limit), null, 2));
  } else {
    res.end("[]");
  }
}

/** Export from cache: /api/export?format=csv|json|txt */
function handleExport(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const format = url.searchParams.get("format") || "csv";
  const minLatency = parseInt(url.searchParams.get("minLatency") || "0", 10);
  const maxLatency = parseInt(url.searchParams.get("maxLatency") || "99999", 10);
  const anonymity = url.searchParams.get("anonymity") || "";
  const country = url.searchParams.get("country") || "";

  const cache = loadProxyCache();
  if (!cache || !cache.proxies || !Object.keys(cache.proxies).length) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("No cache data found. Run a scan first.");
    return;
  }

  // Convert cache entries to proxy list format, filtering by criteria
  let proxies = [];
  for (const [key, entry] of Object.entries(cache.proxies)) {
    if (!entry.alive) continue;
    const [ip, port] = key.split(":");
    const proxy = {
      ip,
      port: parseInt(port, 10),
      type: entry.type || "http",
      latency: entry.latency || 9999,
      country: entry.country || null,
      anonymity: entry.anonymity || null,
      sources: entry.sources || [],
    };
    if (proxy.latency < minLatency || proxy.latency > maxLatency) continue;
    if (anonymity && proxy.anonymity !== anonymity) continue;
    if (country && proxy.country?.toLowerCase() !== country.toLowerCase()) continue;
    proxies.push(proxy);
  }

  // Sort by latency
  proxies.sort((a, b) => (a.latency || 9999) - (b.latency || 9999));

  let body, contentType, filename;
  if (format === "json") {
    body = formatJson(proxies);
    contentType = "application/json";
    filename = "proxies.json";
  } else if (format === "txt") {
    body = formatTxt(proxies);
    contentType = "text/plain";
    filename = "proxies.txt";
  } else {
    body = formatCsv(proxies);
    contentType = "text/csv";
    filename = "proxies.csv";
  }

  res.writeHead(200, {
    "Content-Type": contentType,
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Access-Control-Allow-Origin": "*",
  });
  res.end(body);
}

const server = http.createServer((req, res) => {
  const urlPath = req.url.split("?")[0];

  if (urlPath === "/" || urlPath === "/index.html") {
    try {
      const html = readFileSync(join(__dirname, "..", "public", "index.html"), "utf-8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
    } catch {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("Could not read index.html");
    }
    return;
  }

  if (urlPath === "/api/scan" && req.method === "GET") {
    handleScan(req, res).catch((err) => {
      logError("scan", err);
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("Internal server error");
      } else if (!res.writableEnded) res.end();
    });
    return;
  }

  if (urlPath === "/api/sources" && req.method === "GET") {
    handleSourceStats(req, res);
    return;
  }

  if (urlPath.startsWith("/api/history/") && req.method === "GET") {
    handleHistory(req, res);
    return;
  }

  if (urlPath === "/api/export" && req.method === "GET") {
    handleExport(req, res);
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not found");
});

server.listen(PORT, () => {
  logInfo("server", `Open Proxy Checker running at http://localhost:${PORT}`);
});
