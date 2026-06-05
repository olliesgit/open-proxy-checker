#!/usr/bin/env node

/**
 * Open Proxy Checker — Web Server
 *
 * Usage: node bin/start-server.mjs [--port 3000]
 */

import http from "node:http";
import https from "node:https";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseIpPortList, parseProtocolList, createMultiProtoSource, dedup } from "../src/parsers.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

const DEFAULT_PORT = parseInt(process.env.PORT || "3000", 10);
const USER_PORT = process.argv.find((_, i, a) => a[i - 1] === "--port");
const PORT = Math.max(1, Math.min(65535, parseInt(USER_PORT || String(DEFAULT_PORT), 10) || DEFAULT_PORT));

const CONFIG = {
  FETCH_TIMEOUT: 10000,
  HTML_FETCH_TIMEOUT: 15000,
  SOURCE_TIMEOUT: 30000,
  DEFAULT_CHECK_TIMEOUT: 5000,
  MAX_CHECK_TIMEOUT: 30000,
  DEFAULT_CONCURRENCY: 50,
  MAX_CONCURRENCY: 200,
  KEEPALIVE_INTERVAL: 10000,
  HARD_SCAN_TIMEOUT: 30 * 60 * 1000,
  CHECK_RATE_LIMIT: 100,
  MAX_CUSTOM_PAYLOAD: 1_000_000,
};

function logError(context, err) {
  const ts = new Date().toISOString();
  console.error(`[${ts}] [${context}] ${err?.message || err}`, err?.stack ? `\n${err.stack}` : "");
}

function logInfo(context, msg) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] [${context}] ${msg}`);
}

const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

function fetchJson(url) {
  return new Promise((resolve) => {
    const mod = url.startsWith("https") ? https : http;
    const req = mod.get(url, { timeout: CONFIG.FETCH_TIMEOUT }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => { try { resolve(JSON.parse(data)); } catch { resolve(null); } });
    });
    req.on("error", () => resolve(null));
    req.on("timeout", () => { req.destroy(); resolve(null); });
  });
}

function fetchText(url) {
  return new Promise((resolve) => {
    const mod = url.startsWith("https") ? https : http;
    const req = mod.get(url, { timeout: CONFIG.FETCH_TIMEOUT }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve(data));
    });
    req.on("error", () => resolve(""));
    req.on("timeout", () => { req.destroy(); resolve(""); });
  });
}

function fetchHtml(url) {
  return new Promise((resolve) => {
    const mod = url.startsWith("https") ? https : http;
    const opts = new URL(url);
    const req = mod.get({
      hostname: opts.hostname,
      port: opts.port,
      path: opts.pathname + opts.search,
      timeout: CONFIG.HTML_FETCH_TIMEOUT,
      headers: {
        "User-Agent": BROWSER_UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    }, (res) => {
      if ([301, 302, 303, 307].includes(res.statusCode) && res.headers.location) {
        fetchHtml(res.headers.location).then(resolve);
        return;
      }
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve(data));
    });
    req.on("error", () => resolve(""));
    req.on("timeout", () => { req.destroy(); resolve(""); });
  });
}

// ── Proxy Sources ───────────────────────────────────────────────────────────

async function sourceProxyScrape() {
  const proxies = [];
  for (const proto of ["http", "socks4", "socks5"]) {
    const text = await fetchText(`https://api.proxyscrape.com/v2/?request=displayproxies&protocol=${proto}&timeout=10000&country=all&ssl=all&anonymity=all`);
    if (text) {
      for (const line of text.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const [ip, port] = trimmed.split(":");
        if (ip && port) proxies.push({ ip, port: parseInt(port, 10), type: proto, country: null, anonymity: null });
      }
    }
  }
  return proxies;
}

async function sourceGeonode() {
  const proxies = [];
  const data = await fetchJson("https://proxylist.geonode.com/api/proxy-list?limit=500&page=1&sort_by=lastChecked&sort_type=desc");
  if (data?.data) {
    for (const p of data.data) {
      for (const proto of p.protocols || []) {
        proxies.push({ ip: p.ip, port: parseInt(p.port, 10), type: proto, country: p.country || null, anonymity: p.anonymityLevel || null });
      }
    }
  }
  return proxies;
}

async function sourcePubProxy() {
  const proxies = [];
  for (let i = 0; i < 5; i++) {
    const data = await fetchJson("http://pubproxy.com/api/proxy?limit=20&format=json&type=http");
    if (data?.data) {
      for (const p of data.data) {
        const [ip, port] = p.ipPort.split(":");
        proxies.push({ ip, port: parseInt(port, 10), type: p.type?.toLowerCase() || "http", country: p.country || null, anonymity: p.proxy_level || null });
      }
    }
  }
  return proxies;
}

async function sourceFreeProxyList() {
  const proxies = [];
  const text = await fetchText("https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http&timeout=5000&country=all&ssl=yes&anonymity=all");
  if (text) {
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const [ip, port] = trimmed.split(":");
      if (ip && port) proxies.push({ ip, port: parseInt(port, 10), type: "https", country: null, anonymity: null });
    }
  }
  return proxies;
}

const sourceSpeedX = createMultiProtoSource({
  http: "https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt",
  socks4: "https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/socks4.txt",
  socks5: "https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/socks5.txt",
});

async function sourceProxifly() {
  const proxies = [];
  const base = "https://raw.githubusercontent.com/proxifly/free-proxy-list/main/proxies/protocols";
  const [httpData, socks4Data, socks5Data] = await Promise.all([
    fetchJson(`${base}/http/data.json`),
    fetchJson(`${base}/socks4/data.json`),
    fetchJson(`${base}/socks5/data.json`),
  ]);
  for (const [list, type] of [[httpData, "http"], [socks4Data, "socks4"], [socks5Data, "socks5"]]) {
    if (!Array.isArray(list)) continue;
    for (const p of list) {
      if (!p.ip || !p.port) continue;
      proxies.push({ ip: p.ip, port: parseInt(p.port, 10), type, country: p.geolocation?.country || null, anonymity: p.anonymity || null });
    }
  }
  return proxies;
}

const sourceErcinDedeoglu = createMultiProtoSource({
  http: "https://raw.githubusercontent.com/ErcinDedeoglu/proxies/main/proxies/http.txt",
  socks4: "https://raw.githubusercontent.com/ErcinDedeoglu/proxies/main/proxies/socks4.txt",
  socks5: "https://raw.githubusercontent.com/ErcinDedeoglu/proxies/main/proxies/socks5.txt",
});

async function sourceMonosans() {
  return parseProtocolList(await fetchText("https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/all.txt"));
}

async function sourceClarketm() {
  return parseIpPortList(await fetchText("https://raw.githubusercontent.com/clarketm/proxy-list/master/proxy-list-raw.txt"), "http");
}

const sourceKangProxy = createMultiProtoSource({
  http: "https://raw.githubusercontent.com/officialputuid/KangProxy/KangProxy/http/http.txt",
  socks4: "https://raw.githubusercontent.com/officialputuid/KangProxy/KangProxy/socks4/socks4.txt",
  socks5: "https://raw.githubusercontent.com/officialputuid/KangProxy/KangProxy/socks5/socks5.txt",
});

const sourceVakhov = createMultiProtoSource({
  http: "https://raw.githubusercontent.com/vakhov/fresh-proxy-list/master/http.txt",
  https: "https://raw.githubusercontent.com/vakhov/fresh-proxy-list/master/https.txt",
  socks4: "https://raw.githubusercontent.com/vakhov/fresh-proxy-list/master/socks4.txt",
  socks5: "https://raw.githubusercontent.com/vakhov/fresh-proxy-list/master/socks5.txt",
});

const sourceShiftyTR = createMultiProtoSource({
  http: "https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/http.txt",
  https: "https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/https.txt",
  socks4: "https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/socks4.txt",
  socks5: "https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/socks5.txt",
});

const sourceJetkai = createMultiProtoSource({
  http: "https://raw.githubusercontent.com/jetkai/proxy-list/main/online-proxies/txt/proxies-http.txt",
  https: "https://raw.githubusercontent.com/jetkai/proxy-list/main/online-proxies/txt/proxies-https.txt",
  socks4: "https://raw.githubusercontent.com/jetkai/proxy-list/main/online-proxies/txt/proxies-socks4.txt",
  socks5: "https://raw.githubusercontent.com/jetkai/proxy-list/main/online-proxies/txt/proxies-socks5.txt",
});

const sourceIplocate = createMultiProtoSource({
  http: "https://raw.githubusercontent.com/iplocate/free-proxy-list/main/protocols/http.txt",
  socks4: "https://raw.githubusercontent.com/iplocate/free-proxy-list/main/protocols/socks4.txt",
  socks5: "https://raw.githubusercontent.com/iplocate/free-proxy-list/main/protocols/socks5.txt",
});

const sourceOpenProxyList = createMultiProtoSource({
  http: "https://api.openproxylist.xyz/http.txt",
  socks4: "https://api.openproxylist.xyz/socks4.txt",
  socks5: "https://api.openproxylist.xyz/socks5.txt",
});

const sourceSunny9577 = createMultiProtoSource({
  http: "https://raw.githubusercontent.com/sunny9577/proxy-scraper/master/generated/http_proxies.txt",
  socks4: "https://raw.githubusercontent.com/sunny9577/proxy-scraper/master/generated/socks4_proxies.txt",
  socks5: "https://raw.githubusercontent.com/sunny9577/proxy-scraper/master/generated/socks5_proxies.txt",
});

const sourceMuRongPIG = createMultiProtoSource({
  http: "https://raw.githubusercontent.com/MuRongPIG/Proxy-Master/main/http.txt",
  https: "https://raw.githubusercontent.com/MuRongPIG/Proxy-Master/main/https.txt",
  socks4: "https://raw.githubusercontent.com/MuRongPIG/Proxy-Master/main/socks4.txt",
  socks5: "https://raw.githubusercontent.com/MuRongPIG/Proxy-Master/main/socks5.txt",
});

const sourceRoosterkid = createMultiProtoSource({
  https: "https://raw.githubusercontent.com/roosterkid/openproxylist/main/HTTPS_RAW.txt",
  socks4: "https://raw.githubusercontent.com/roosterkid/openproxylist/main/SOCKS4_RAW.txt",
  socks5: "https://raw.githubusercontent.com/roosterkid/openproxylist/main/SOCKS5_RAW.txt",
});

const SOURCE_REGISTRY = new Map([
  ["ProxyScrape", sourceProxyScrape],
  ["Geonode", sourceGeonode],
  ["PubProxy", sourcePubProxy],
  ["FreeProxyList", sourceFreeProxyList],
  ["SpeedX", sourceSpeedX],
  ["Proxifly", sourceProxifly],
  ["ErcinDedeoglu", sourceErcinDedeoglu],
  ["Monosans", sourceMonosans],
  ["Clarketm", sourceClarketm],
  ["KangProxy", sourceKangProxy],
  ["Vakhov", sourceVakhov],
  ["ShiftyTR", sourceShiftyTR],
  ["Jetkai", sourceJetkai],
  ["Iplocate", sourceIplocate],
  ["OpenProxyList", sourceOpenProxyList],
  ["Sunny9577", sourceSunny9577],
  ["MuRongPIG", sourceMuRongPIG],
  ["Roosterkid", sourceRoosterkid],
]);

const TEST_URLS = {
  httpbin: { path: "http://httpbin.org/ip", host: "httpbin.org", validate: (body) => body.includes("origin") },
  icanhazip: { path: "http://icanhazip.com/", host: "icanhazip.com", validate: (body) => /\d+\.\d+\.\d+\.\d+/.test(body) },
  google: { path: "http://www.google.com/", host: "www.google.com", validate: () => true },
};

function getTestConfig(testUrl) {
  if (TEST_URLS[testUrl]) return TEST_URLS[testUrl];
  try {
    const u = new URL(testUrl);
    if (!["http:", "https:"].includes(u.protocol)) return TEST_URLS.httpbin;
    return { path: testUrl, host: u.hostname, validate: () => true };
  } catch {
    return TEST_URLS.httpbin;
  }
}

const LEAK_HEADERS = ["x-forwarded-for", "via", "x-real-ip", "forwarded", "proxy-connection"];

function detectAnonymity(resHeaders, body) {
  const hasLeak = LEAK_HEADERS.some((h) => resHeaders[h]);
  const bodyLeaks = body && (body.includes("X-Forwarded-For") || body.includes("Via:"));
  if (hasLeak || bodyLeaks) return "transparent";
  return "elite";
}

function checkProxy(proxy, timeout, testConfig) {
  return new Promise((resolve) => {
    const start = Date.now();
    const req = http.request({
      hostname: proxy.ip,
      port: proxy.port,
      path: testConfig.path,
      method: "GET",
      timeout,
      headers: { Host: testConfig.host },
    }, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        const latency = Date.now() - start;
        if (res.statusCode === 200 && testConfig.validate(body)) {
          const anonymity = detectAnonymity(res.headers, body);
          resolve({ alive: true, latency, anonymity });
        } else {
          resolve({ alive: false });
        }
      });
    });

    req.on("error", () => resolve({ alive: false }));
    req.on("timeout", () => { req.destroy(); resolve({ alive: false }); });
    req.end();
  });
}

async function handleScan(req, res) {
  const activeSources = [...SOURCE_REGISTRY.entries()];
  const failedSources = [];

  if (!activeSources.length) {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });
    res.write(`event: status\ndata: ${JSON.stringify({ message: "No sources enabled." })}\n\n`);
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
        let label = `${got} proxies`;
        if (!got) {
          label = "0 proxies";
          failedSources.push(sourceNames[i]);
        }
        send("status", {
          message: `Fetching proxy lists... — ${sourceNames[i]}: ${label}`,
          sourceDone: sourceNames[i],
          sourceCount: got,
        });
        return proxies;
      }).catch(() => {
        failedSources.push(sourceNames[i]);
        send("status", {
          message: `Fetching proxy lists... — ${sourceNames[i]}: error`,
          sourceDone: sourceNames[i],
          sourceCount: 0,
        });
        return [];
      })
    );

    const results = await Promise.allSettled(tracked);

    if (failedSources.length) {
      send("status", { message: `Warning: ${failedSources.length} source(s) had issues: ${failedSources.join(", ")}` });
    }

    let allProxies = [];
    for (const r of results) {
      if (r.status === "fulfilled" && r.value) allProxies.push(...r.value);
    }

    if (allProxies.length === 0) {
      send("done", { total: 0, checked: 0, message: "No proxies matched your filters." });
      return;
    }

    allProxies = dedup(allProxies);
    const total = allProxies.length;
    send("status", { message: `Validating ${total} proxies...`, total });

    const working = [];
    let index = 0;
    let checked = 0;

    async function worker() {
      while (index < total) {
        const i = index++;
        const proxy = allProxies[i];
        const result = await checkProxy(proxy, CONFIG.DEFAULT_CHECK_TIMEOUT);
        checked++;

        if (checked % 10 === 0 || checked === total) {
          send("status", { message: `Checked ${checked}/${total}...`, checked, total, found: working.length });
        }

        if (result.alive) {
          proxy.latency = result.latency;
          proxy.anonymity = result.anonymity || proxy.anonymity || null;
          working.push(proxy);
          send("found", proxy);
        }
      }
    }

    const workers = [];
    for (let i = 0; i < CONFIG.DEFAULT_CONCURRENCY; i++) workers.push(worker());
    await Promise.all(workers);

    send("done", { total: working.length, checked, message: `Done. Found ${working.length} working proxies out of ${checked} checked.` });
  } catch (err) {
    logError("scan", err);
    send("done", { total: 0, checked: 0, message: `Scan failed: ${err?.message || err}` });
  } finally {
    if (!res.writableEnded) res.end();
  }
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

  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not found");
});

server.listen(PORT, () => {
  logInfo("server", `Open Proxy Checker running at http://localhost:${PORT}`);
});
