#!/usr/bin/env node

/**
 * Open Proxy Checker -- CLI
 */

import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { BANNER, shouldShowBanner } from "../src/banner.mjs";
import { formatTxt, formatCsv, formatJson } from "../src/exporters.mjs";
import { SOURCE_REGISTRY } from "../src/sources.mjs";
import { parseIpPortList, parseProtocolList } from "../src/parsers.mjs";
import { checkProxy } from "../src/check-chain.mjs";
import { loadConfig } from "../src/config.mjs";
import { startScan, finishScan, recordProxyResults, closeDb } from "../src/history.mjs";
import {
  createCircuitBreaker,
  splitByCache,
  resultsToCache,
  saveProxyCache,
  loadProxyCache,
  CACHE_TTL,
} from "../src/cache.mjs";

const require = createRequire(import.meta.url);
const { version: VERSION } = require("../package.json");

// ── Color support ─────────────────────────────────────────────────────────────

const NO_COLOR = process.env.NO_COLOR || !process.stdout.isTTY;
const C = NO_COLOR
  ? { green: (s) => s, red: (s) => s, yellow: (s) => s, dim: (s) => s, bold: (s) => s, reset: "" }
  : {
      green: (s) => `\x1b[32m${s}\x1b[0m`,
      red: (s) => `\x1b[31m${s}\x1b[0m`,
      yellow: (s) => `\x1b[33m${s}\x1b[0m`,
      dim: (s) => `\x1b[2m${s}\x1b[0m`,
      bold: (s) => `\x1b[1m${s}\x1b[0m`,
      reset: "\x1b[0m",
    };

// ── Config ───────────────────────────────────────────────────────────────────

const CFG = loadConfig();
const DEFAULT_TIMEOUT = CFG.timeout_ms || 5000;
const DEFAULT_CONCURRENCY = CFG.concurrency || 50;

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
      case "--version":
        console.log(`Open Proxy Checker v${VERSION}`);
        process.exit(0);
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
    `Open Proxy Checker v${VERSION}`,
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
    "  --version           Show version number and exit",
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

// ── Progress Bar ──────────────────────────────────────────────────────────────

let PROGRESS_INTERVAL = null;

function startProgress(checked, total, found) {
  if (QUIET) return;
  const barWidth = 20;
  const pct = total > 0 ? Math.min(100, Math.round((checked / total) * 100)) : 0;
  const filled = Math.round((pct / 100) * barWidth);
  const bar =
    "=".repeat(filled) +
    ">".replace(/./, (m) => (filled < barWidth ? ">" : "")) +
    " ".repeat(Math.max(0, barWidth - filled - (filled < barWidth ? 1 : 0)));
  const info = `${String(pct).padStart(3)}% [${bar}] ${checked}/${total}  ${C.green(String(found))} working`;
  process.stderr.write(`\r\x1b[K  ${C.dim(info)}`);
}

function finishProgress() {
  if (PROGRESS_INTERVAL) clearInterval(PROGRESS_INTERVAL);
  PROGRESS_INTERVAL = null;
  if (!QUIET) process.stderr.write("\r\x1b[K");
}

// ── Anonymity Detection (uses check-chain.mjs now - done there) ───────────────

// Removed - now handled by checkProxy from check-chain.mjs

// ── Validation Pool with circuit breaker ─────────────────────────────────────────

async function poolCheck(proxies, concurrency, timeout, limit) {
  const breaker = createCircuitBreaker({ initialConcurrency: concurrency });
  const working = [];
  let index = 0;
  let checked = 0;
  const total = proxies.length;

  startProgress(0, total, 0);

  async function worker() {
    while (index < total) {
      // Check effective concurrency after each iteration
      const i = index++;
      const proxy = proxies[i];
      const result = await checkProxy(proxy, timeout);
      checked++;
      breaker.recordSuccess();

      if (result.alive) {
        proxy.latency = result.latency;
        proxy.anonymity = result.anonymity || null;
        if (working.length < limit) {
          working.push(proxy);
          if (!QUIET) {
            const latencyColor =
              result.latency < 1000 ? C.green : result.latency < 3000 ? C.yellow : C.red;
            const label = `  ${C.green("\u2713")} ${proxy.ip}:${proxy.port} (${proxy.type}) ${latencyColor(result.latency + "ms")} [${working.length} found]`;
            process.stderr.write(`\r\x1b[K${label}\n`);
          }
        }
      }
      // Occasionally back off if breaker detects high failure rate
      startProgress(checked, total, working.length);
    }
  }

  const workers = [];
  while (workers.length < Math.max(1, breaker.getConcurrency())) {
    workers.push(worker());
  }
  await Promise.all(workers);
  finishProgress();
  return working;
}

// ── Fetch + Validation Pipeline with cache ───────────────────────────────────

async function fetchSources() {
  const sourcePromises = [...SOURCE_REGISTRY.values()].map((fn) => fn().catch(() => []));
  const results = await Promise.allSettled(sourcePromises);
  let allProxies = [];
  for (const r of results) {
    if (r.status === "fulfilled" && r.value) allProxies.push(...r.value);
  }
  return allProxies;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs();
  QUIET = opts.quiet;

  const useBanner = shouldShowBanner(opts);
  if (useBanner) log(BANNER);

  log(` ${C.dim("Settings:")} timeout=${opts.timeout}ms concurrency=${opts.concurrency} type=${opts.type}`);
  if (opts.country) log(`  ${C.dim("Country filter:")} ${opts.country}`);
  if (opts.anonymous) log(`  ${C.dim("Anonymous only:")} yes`);
  if (opts.limit < Infinity) log(`  ${C.dim("Limit:")} ${opts.limit}`);
  if (opts.format) log(`  ${C.dim("Format:")} ${opts.format}`);
  log("");

  // Load cache
  const cache = loadProxyCache();
  if (cache?.proxies && Object.keys(cache.proxies).length > 0 && !opts.quiet) {
    log(` ${C.dim("Cache:")} ${Object.keys(cache.proxies).length} entries from ${new Date(cache.updated).toLocaleString()}`);
  }

  // Fetch
  log(` ${C.dim("Fetching from")} ${SOURCE_REGISTRY.size} ${C.dim("sources...")}`);
  const allProxies = await fetchSources();
  log(` ${C.dim("Fetched")} ${allProxies.length} ${C.dim("proxies total.")}`);

  // Filters
  if (opts.type !== "all") {
    const before = allProxies.length;
    allProxies = allProxies.filter((p) => p.type === opts.type);
    log(` ${C.dim("After type filter")} (${opts.type}): ${allProxies.length} ${
      before !== allProxies.length ? C.dim(`(-${before - allProxies.length})`) : ""
    }`);
  }
  if (opts.country) {
    const before = allProxies.length;
    allProxies = allProxies.filter((p) => p.country && p.country.toUpperCase() === opts.country);
    log(` ${C.dim("After country filter")} (${opts.country}): ${allProxies.length} ${
      before !== allProxies.length ? C.dim(`(-${before - allProxies.length})`) : ""
    }`);
  }
  if (opts.anonymous) {
    const before = allProxies.length;
    allProxies = allProxies.filter(
      (p) => p.anonymity && (p.anonymity.toLowerCase().includes("elite") || p.anonymity.toLowerCase().includes("anonymous"))
    );
    log(` ${C.dim("After anonymity filter")}: ${allProxies.length} ${
      before !== allProxies.length ? C.dim(`(-${before - allProxies.length})`) : ""
    }`);
  }

  // Smart cache split
  const { preloaded, toCheck } = splitByCache(allProxies, cache);
  const preloadedWithMeta = preloaded.map((p) => ({
    ip: p.ip,
    port: p.port,
    type: p.type,
    country: p.country,
    anonymity: p.anonymity,
    latency: p.latency,
    sources: p.sources || [],
    cached: true,
  }));

  if (!opts.quiet && preloaded.length > 0) {
    log(` ${C.green("Cache hit")}: ${preloaded.length} proxies loaded from cache (TTL ${CACHE_TTL / 3600000}h)`);
    log(` ${C.dim("Validating")} ${toCheck.length} ${C.dim("new/missed proxies...")}\n`);
  } else if (!opts.quiet) {
    log(` ${C.dim("No cache or all expired. Full validation.")}\n`);
  }

  const working = await poolCheck(toCheck, opts.concurrency, opts.timeout, opts.limit);
  working.sort((a, b) => a.latency - b.latency);

  // Merge preloaded with freshly validated, respect limit
  const finalWorking = [...preloadedWithMeta, ...working]
    .sort((a, b) => (a.latency || 0) - (b.latency || 0))
    .slice(0, opts.limit);

  // Save cache
  const cacheEntry = loadProxyCache();
  resultsToCache(cacheEntry, finalWorking);
  saveProxyCache(cacheEntry);

  log(`\n ${C.bold("=".repeat(50))}`);
  log(` ${C.green(C.bold(String(finalWorking.length)))} working proxies found`);
  log(` ${C.bold("=".repeat(50))}\n`);

  if (finalWorking.length === 0) {
    log(` ${C.yellow("No working proxies found. Try increasing --timeout or running again later.")}`);
    process.exit(1);
  }

  // Output
  if (opts.format === "json") {
    const json = formatJson(finalWorking);
    if (opts.output) {
      writeFileSync(opts.output, json, "utf-8");
      log(` ${C.green("Saved")} to ${opts.output}`);
    } else {
      console.log(json.trimEnd());
    }
  } else if (opts.format === "csv") {
    const csv = formatCsv(finalWorking);
    if (opts.output) {
      writeFileSync(opts.output, csv, "utf-8");
      log(` ${C.green("Saved")} to ${opts.output}`);
    } else {
      console.log(csv.trimEnd());
    }
  } else if (opts.format === "txt") {
    const txt = formatTxt(finalWorking);
    if (opts.output) {
      writeFileSync(opts.output, txt, "utf-8");
      log(` ${C.green("Saved")} to ${opts.output}`);
    } else {
      console.log(txt.trimEnd());
    }
  } else {
    // Human-readable table
    const avgLatency = Math.round(finalWorking.reduce((s, p) => s + p.latency, 0) / finalWorking.length);
    const eliteCount = finalWorking.filter((p) => p.anonymity === "elite").length;
    const columns = [
      { label: "IP", width: 18, render: (p) => p.ip },
      { label: "PORT", width: 7, render: (p) => String(p.port) },
      { label: "TYPE", width: 8, render: (p) => p.type },
      { label: "LATENCY", width: 10, render: (p) => (p.latency < 1000 ? C.green : p.latency < 3000 ? C.yellow : C.red)(p.latency + "ms") },
      { label: "COUNTRY", width: 8, render: (p) => p.country || C.dim("??") },
      { label: "ANONYMITY", width: 12, render: (p) => p.anonymity === "elite" ? C.green(p.anonymity) : p.anonymity === "transparent" ? C.red(p.anonymity) : p.anonymity || C.dim("??") },
      { label: "SRC", width: 12, render: (p) => (p.sources || []).slice(0, 2).join("+") || C.dim("??") },
    ];

    const head = columns.map((c) => C.dim(c.label.padEnd(c.width))).join(" ");
    console.log(head);
    console.log(C.dim("\u2500".repeat(head.length)));
    for (const p of finalWorking) {
      console.log(columns.map((c) => String(c.render(p)).padEnd(c.width)).join(" "));
    }

    log(`\n ${C.dim("Average latency:")} ${avgLatency}ms  ${C.dim("Elite proxies:")} ${C.green(eliteCount)}  ${C.dim("Sources:")} ${SOURCE_REGISTRY.size}`);
    if (!opts.quiet) log(` ${C.dim("Cache:")} .cache/proxies.json (${CACHE_TTL / 3600000}h TTL)`);
  }
}

main().catch((err) => {
  console.error(`${C.red("Fatal error:")} ${err.message}`);
  process.exit(1);
});
