#!/usr/bin/env node

/**
 * Open Proxy Checker -- CLI
 *
 * Fetches free HTTP/HTTPS/SOCKS proxies from public sources, validates them,
 * and outputs a list of working proxies.
 *
 * Usage: node bin/start-cli.mjs [options]
 */

import http from "node:http";
import https from "node:https";
import { writeFileSync } from "node:fs";
import { BANNER, shouldShowBanner } from "../src/banner.mjs";
import { formatTxt, formatCsv, formatJson } from "../src/exporters.mjs";

// ── Config ───────────────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT = 5000;
const DEFAULT_CONCURRENCY = 50;

// ── CLI Args ──────────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    timeout: DEFAULT_TIMEOUT,
    concurrency: DEFAULT_CONCURRENCY,
    output: null,
    type: "all",
    country: null,
    anonymous: false,
    limit: Infinity,
    quiet: false,
    noBanner: false,
    format: null,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--timeout":
        opts.timeout = Math.max(100, parseInt(args[++i], 10) || DEFAULT_TIMEOUT);
        break;
      case "--concurrency":
        opts.concurrency = Math.max(1, parseInt(args[++i], 10) || DEFAULT_CONCURRENCY);
        break;
      case "--output":
        opts.output = args[++i];
        break;
      case "--type":
        opts.type = String(args[++i] || "all").toLowerCase();
        break;
      case "--country":
        opts.country = String(args[++i] || "").toUpperCase() || null;
        break;
      case "--anonymous":
        opts.anonymous = true;
        break;
      case "--limit":
        opts.limit = Math.max(1, parseInt(args[++i], 10) || Infinity);
        break;
      case "--quiet":
        opts.quiet = true;
        break;
      case "--no-banner":
        opts.noBanner = true;
        break;
      case "--format":
        opts.format = String(args[++i] || "txt").toLowerCase();
        if (!["json", "csv", "txt"].includes(opts.format)) opts.format = null;
        break;
      case "--help":
        showHelp();
        process.exit(0);
    }
  }
  return opts;
}

function showHelp() {
  if (shouldShowBanner({ noBanner: false })) {
    console.error(BANNER);
  }
  console.log([
    "Open Proxy Checker",
    "",
    "Usage: node bin/start-cli.mjs [options]",
    "",
    "Options:",
    "  --timeout <ms>      Connection timeout per proxy (default: 5000)",
    "  --concurrency <n>   Max concurrent checks (default: 50)",
    "  --output <file>     Save results to file",
    "  --type <type>       http | https | socks4 | socks5 | all (default: all)",
    "  --country <code>    Filter by country code (e.g. US)",
    "  --anonymous         Only anonymous/elite proxies",
    "  --limit <n>         Stop after N working proxies (default: unlimited)",
    "  --format <fmt>      Output format: json | csv | txt (default: human table)",
    "  --quiet             Suppress progress output to stderr",
    "  --no-banner         Suppress the startup ASCII banner",
    "  --help              Show this help message",
    "",
    "Examples:",
    "  npm run start:cli",
    "  npm run start:cli -- --timeout 8000 --concurrency 50",
    "  npm run start:cli -- --type http --country US --limit 20",
    "  npm run start:cli -- --format json",
    "  npm run start:cli -- --format csv --output proxies.csv",
    "  npm run start:cli -- --no-banner",
    "",
    "Responsible use:",
    "  Only test proxies against systems you own or have permission to test.",
    "",
  ].join("\n"));
}

// ── Logging ───────────────────────────────────────────────────────────────────

let QUIET = false;
function log(...args) {
  if (!QUIET) console.error(...args);
}

// ── HTTP Helpers ──────────────────────────────────────────────────────────────

function fetchJson(url) {
  return new Promise((resolve) => {
    const mod = url.startsWith("https") ? https : http;
    const req = mod.get(url, { timeout: 10000 }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try { resolve(JSON.parse(data)); } catch { resolve(null); }
      });
    });
    req.on("error", () => resolve(null));
    req.on("timeout", () => { req.destroy(); resolve(null); });
  });
}

function fetchText(url) {
  return new Promise((resolve) => {
    const mod = url.startsWith("https") ? https : http;
    const req = mod.get(url, { timeout: 10000 }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve(data));
    });
    req.on("error", () => resolve(""));
    req.on("timeout", () => { req.destroy(); resolve(""); });
  });
}

// ── Proxy Sources ─────────────────────────────────────────────────────────────

async function sourceProxyScrape() {
  log("  [1/4] Fetching from ProxyScrape...");
  const proxies = [];
  for (const proto of ["http", "socks4", "socks5"]) {
    const text = await fetchText(
      `https://api.proxyscrape.com/v2/?request=displayproxies&protocol=${proto}&timeout=10000&country=all&ssl=all&anonymity=all`
    );
    if (text) {
      for (const line of text.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const [ip, port] = trimmed.split(":");
        if (ip && port) {
          proxies.push({
            ip,
            port: parseInt(port, 10),
            type: proto,
            country: null,
            anonymity: null,
          });
        }
      }
    }
  }
  return proxies;
}

async function sourceGeonode() {
  log("  [2/4] Fetching from Geonode...");
  const proxies = [];
  const data = await fetchJson(
    "https://proxylist.geonode.com/api/proxy-list?limit=500&page=1&sort_by=lastChecked&sort_type=desc"
  );
  if (data?.data) {
    for (const p of data.data) {
      for (const proto of p.protocols || []) {
        proxies.push({
          ip: p.ip,
          port: parseInt(p.port, 10),
          type: proto,
          country: p.country || null,
          anonymity: p.anonymityLevel || null,
        });
      }
    }
  }
  return proxies;
}

async function sourcePubProxy() {
  log("  [3/4] Fetching from PubProxy...");
  const proxies = [];
  for (let i = 0; i < 5; i++) {
    const data = await fetchJson(
      "http://pubproxy.com/api/proxy?limit=20&format=json&type=http"
    );
    if (data?.data) {
      for (const p of data.data) {
        const [ip, port] = p.ipPort.split(":");
        proxies.push({
          ip,
          port: parseInt(port, 10),
          type: p.type?.toLowerCase() || "http",
          country: p.country || null,
          anonymity: p.proxy_level || null,
        });
      }
    }
  }
  return proxies;
}

async function sourceFreeProxyList() {
  log("  [4/4] Fetching from free-proxy-list.net (via ProxyScrape TXT)...");
  const proxies = [];
  const text = await fetchText(
    "https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http&timeout=5000&country=all&ssl=yes&anonymity=all"
  );
  if (text) {
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const [ip, port] = trimmed.split(":");
      if (ip && port) {
        proxies.push({
          ip,
          port: parseInt(port, 10),
          type: "https",
          country: null,
          anonymity: null,
        });
      }
    }
  }
  return proxies;
}

// ── Proxy Validation ──────────────────────────────────────────────────────────

function checkProxy(proxy, timeout) {
  return new Promise((resolve) => {
    const start = Date.now();
    const options = {
      hostname: proxy.ip,
      port: proxy.port,
      path: "http://httpbin.org/ip",
      method: "GET",
      timeout,
      headers: { Host: "httpbin.org" },
    };

    const req = http.request(options, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        const latency = Date.now() - start;
        if (res.statusCode === 200 && body.includes("origin")) {
          resolve({ alive: true, latency });
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

// ── Concurrency Pool ──────────────────────────────────────────────────────────

async function poolCheck(proxies, concurrency, timeout, limit) {
  const working = [];
  let index = 0;
  let checked = 0;
  const total = proxies.length;

  async function worker() {
    while (index < total && working.length < limit) {
      const i = index++;
      const proxy = proxies[i];
      checked++;
      const result = await checkProxy(proxy, timeout);
      if (result.alive && working.length < limit) {
        proxy.latency = result.latency;
        working.push(proxy);
        log(
          `  \u2713 ${proxy.ip}:${proxy.port} (${proxy.type}) - ${result.latency}ms  [${working.length} found, ${checked}/${total} checked]`
        );
      }
    }
  }

  const workers = [];
  for (let i = 0; i < concurrency; i++) {
    workers.push(worker());
  }
  await Promise.all(workers);
  return working;
}

// ── Dedup ─────────────────────────────────────────────────────────────────────

function dedup(proxies) {
  const seen = new Set();
  return proxies.filter((p) => {
    const key = `${p.ip}:${p.port}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs();
  QUIET = opts.quiet;

  const useBanner = shouldShowBanner(opts);
  if (useBanner) {
    log(BANNER);
  }

  log(`Settings: timeout=${opts.timeout}ms, concurrency=${opts.concurrency}, type=${opts.type}`);
  if (opts.country) log(`  Country filter: ${opts.country}`);
  if (opts.anonymous) log(`  Anonymous only: yes`);
  if (opts.limit < Infinity) log(`  Limit: ${opts.limit}`);
  if (opts.format) log(`  Format: ${opts.format}`);
  log("");

  log("Fetching proxy lists...");
  const results = await Promise.allSettled([
    sourceProxyScrape(),
    sourceGeonode(),
    sourcePubProxy(),
    sourceFreeProxyList(),
  ]);

  let allProxies = [];
  for (const r of results) {
    if (r.status === "fulfilled" && r.value) {
      allProxies.push(...r.value);
    }
  }

  log(`\nFetched ${allProxies.length} proxies total.`);

  if (opts.type !== "all") {
    allProxies = allProxies.filter((p) => p.type === opts.type);
    log(`After type filter (${opts.type}): ${allProxies.length}`);
  }
  if (opts.country) {
    allProxies = allProxies.filter(
      (p) => p.country && p.country.toUpperCase() === opts.country
    );
    log(`After country filter (${opts.country}): ${allProxies.length}`);
  }
  if (opts.anonymous) {
    allProxies = allProxies.filter(
      (p) =>
        p.anonymity &&
        (p.anonymity.toLowerCase().includes("elite") ||
          p.anonymity.toLowerCase().includes("anonymous"))
    );
    log(`After anonymity filter: ${allProxies.length}`);
  }

  allProxies = dedup(allProxies);
  log(`After dedup: ${allProxies.length}`);

  if (allProxies.length === 0) {
    log("\nNo proxies matched your filters.");
    process.exit(1);
  }

  log(`\nValidating proxies (this may take a moment)...\n`);
  const working = await poolCheck(
    allProxies,
    opts.concurrency,
    opts.timeout,
    opts.limit
  );

  working.sort((a, b) => a.latency - b.latency);

  log(`\n════════════════════════════════════════════`);
  log(`  Found ${working.length} working proxies`);
  log(`════════════════════════════════════════════\n`);

  if (working.length === 0) {
    log("No working proxies found. Try increasing --timeout or running again later.");
    process.exit(1);
  }

  // Output in requested format
  if (opts.format === "json") {
    const json = formatJson(working);
    if (opts.output) {
      writeFileSync(opts.output, json, "utf-8");
      log(`Saved to ${opts.output}`);
    } else {
      console.log(json.trimEnd());
    }
  } else if (opts.format === "csv") {
    const csv = formatCsv(working);
    if (opts.output) {
      writeFileSync(opts.output, csv, "utf-8");
      log(`Saved to ${opts.output}`);
    } else {
      console.log(csv.trimEnd());
    }
  } else if (opts.format === "txt") {
    const txt = formatTxt(working);
    if (opts.output) {
      writeFileSync(opts.output, txt, "utf-8");
      log(`Saved to ${opts.output}`);
    } else {
      console.log(txt.trimEnd());
    }
  } else {
    // Default: human-readable table
    const header = `${"IP".padEnd(18)} ${"PORT".padEnd(7)} ${"TYPE".padEnd(8)} ${"LATENCY".padEnd(10)} ${"COUNTRY".padEnd(8)}`;
    console.log(header);
    console.log("\u2500".repeat(header.length));
    for (const p of working) {
      console.log(
        `${p.ip.padEnd(18)} ${String(p.port).padEnd(7)} ${p.type.padEnd(8)} ${(p.latency + "ms").padEnd(10)} ${(p.country || "??").padEnd(8)}`
      );
    }

    if (opts.output) {
      const lines = working.map(
        (p) => `${p.ip}:${p.port} | ${p.type} | ${p.latency}ms | ${p.country || "??"}`
      );
      writeFileSync(opts.output, lines.join("\n") + "\n", "utf-8");
      log(`\nSaved to ${opts.output}`);
    }

    log("\n\u2015\u2015 Raw list (copy-paste) \u2015\u2015");
    for (const p of working) {
      log(`${p.ip}:${p.port}`);
    }
  }
}

main().catch((err) => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});
