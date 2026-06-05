import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  parseIpPortList,
  parseProtocolList,
  dedup,
} from "../src/parsers.mjs";
import { smartDedup } from "../src/smart-sources.mjs";
import { formatCsv, formatJson, formatTxt } from "../src/exporters.mjs";
import { BANNER, shouldShowBanner } from "../src/banner.mjs";
import { SourceHealth, fetchTextSmart, fetchJsonSmart, runSource, smartDedup as smartDedupFn } from "../src/smart-sources.mjs";
import { retry, withTimeout } from "../src/retry.mjs";
import { checkProxy } from "../src/check-chain.mjs";
import { createCircuitBreaker } from "../src/pool.mjs";
import { loadProxyCache, saveProxyCache, resultsToCache, splitByCache, CACHE_TTL } from "../src/cache.mjs";

// ── parseIpPortList ────────────────────────────────────────────────────

test("parseIpPortList parses valid lines", () => {
  const text = "1.2.3.4:8080\n5.6.7.8:3128\n";
  const r = parseIpPortList(text, "http");
  assert.deepEqual(r, [
    { ip: "1.2.3.4", port: 8080, type: "http", country: null, anonymity: null },
    { ip: "5.6.7.8", port: 3128, type: "http", country: null, anonymity: null },
  ]);
});

test("parseIpPortList skips comments and blanks", () => {
  const r = parseIpPortList("# comment\n\n9.9.9.9:9999\n", "socks5");
  assert.deepEqual(r, [
    { ip: "9.9.9.9", port: 9999, type: "socks5", country: null, anonymity: null },
  ]);
});

test("parseIpPortList returns empty for null", () => {
  assert.deepEqual(parseIpPortList(null, "http"), []);
});

test("parseIpPortList clamps port range", () => {
  const r = parseIpPortList("1.2.3.4:0\n5.6.7.8:70000\n10.0.0.1:443\n", "http");
  assert.deepEqual(r, [
    { ip: "10.0.0.1", port: 443, type: "http", country: null, anonymity: null },
  ]);
});

// ── parseProtocolList ─────────────────────────────────────────────────

test("parseProtocolList parses protocol-prefixed proxies", () => {
  const text = "http://1.2.3.4:8080\nsocks5://9.9.9.9:1080\ninvalid\n";
  const result = parseProtocolList(text);
  assert.deepEqual(result, [
    { ip: "1.2.3.4", port: 8080, type: "http", country: null, anonymity: null },
    { ip: "9.9.9.9", port: 1080, type: "socks5", country: null, anonymity: null },
  ]);
});

// ── smartDedup merges metadata ─────────────────────────────────────────

test("smartDedup fills null country/anonymity from later sources", () => {
  const input = [
    { ip: "1.1.1.1", port: 1, type: "http", country: null, anonymity: null, _source: "A", latency: 200 },
    { ip: "1.1.1.1", port: 1, type: "http", country: "US", anonymity: "elite", _source: "B", latency: 300 },
  ];
  const result = smartDedup(input);
  assert.equal(result.length, 1);
  assert.equal(result[0].country, "US");
  assert.equal(result[0].anonymity, "elite");
  assert.deepEqual(result[0].sources, ["A", "B"]);
});

test("smartDedup prefers elite over transparent", () => {
  const input = [
    { ip: "2.2.2.2", port: 2, type: "http", country: null, anonymity: "transparent", _source: "A" },
    { ip: "2.2.2.2", port: 2, type: "http", country: null, anonymity: "elite", _source: "B" },
  ];
  const result = smartDedup(input);
  assert.equal(result[0].anonymity, "elite");
});

// ── SourceHealth ──────────────────────────────────────────────────────

test("SourceHealth tracks fail rate", () => {
  const sh = new SourceHealth();
  sh.record("Geo", true, 50);
  sh.record("Geo", false, 0);
  sh.record("Geo", false, 0);
  assert.equal(sh.recentFailRate("Geo"), 2 / 3);
  assert.ok(sh.lastSuccessMs("Geo") >= 0);
});

// ── Circuit Breaker ───────────────────────────────────────────────────

test("circuit breaker reduces concurrency on high failures", () => {
  const cb = createCircuitBreaker({ initialConcurrency: 50 });
  assert.equal(cb.getConcurrency(), 50);
  for (let i = 0; i < 35; i++) cb.recordFailure();
  // Should throttle
  assert.ok(cb.getConcurrency() < 50);
});

test("circuit breaker restores concurrency after successes", () => {
  const cb = createCircuitBreaker({ initialConcurrency: 50 });
  for (let i = 0; i < 30; i++) cb.recordFailure();
  // need enough successes to bring the recent failure rate below threshold
  for (let i = 0; i < 8; i++) cb.recordSuccess();
  // concurrency should have been partially restored
  assert.ok(cb.getConcurrency() >= 5);
});

// ── Cache ─────────────────────────────────────────────────────────────

test("splitByCache separates cached from new", () => {
  const cache = {
    proxies: {
      "1.1.1.1:80": { lastSeen: Date.now(), alive: true, latency: 300, anonymity: "elite", country: "US", sources: ["SpeedX"] },
      "2.2.2.2:80": { lastSeen: Date.now() - CACHE_TTL - 1000, alive: true, latency: 400, sources: ["Geo"] },
    },
  };
  const incoming = [
    { ip: "1.1.1.1", port: 80, type: "http", country: null, anonymity: null },
    { ip: "2.2.2.2", port: 80, type: "http", country: null, anonymity: null },
    { ip: "3.3.3.3", port: 80, type: "http", country: null, anonymity: null },
  ];
  const { preloaded, toCheck } = splitByCache(incoming, cache);
  assert.equal(preloaded.length, 1);
  assert.equal(preloaded[0].ip, "1.1.1.1");
  assert.equal(preloaded[0].latency, 300);
  assert.equal(toCheck.length, 2);
});

test("splitByCache is empty when cache is null", () => {
  const { preloaded, toCheck } = splitByCache([{ ip: "1.1.1.1", port: 80, type: "http", country: null, anonymity: null }], null);
  assert.equal(preloaded.length, 0);
  assert.equal(toCheck.length, 1);
});

test("saveProxyCache + loadProxyCache roundtrip", () => {
  const cache = { version: 1, proxies: { "4.4.4.4:8080": { lastSeen: Date.now(), latency: 600, alive: true } } };
  saveProxyCache(cache);
  const loaded = loadProxyCache();
  assert.ok(loaded);
  assert.ok(loaded.proxies["4.4.4.4:8080"]);
  assert.equal(loaded.proxies["4.4.4.4:8080"].latency, 600);
});

test("loadProxyCache returns null for missing file", () => {
  // remove cache file left by previous test
  const cachePath = path.resolve(".cache", "proxies.json");
  try { fs.unlinkSync(cachePath); } catch {}
  assert.equal(loadProxyCache(), null);
});

// ── check-chain ───────────────────────────────────────────────────────

test("checkProxy returns alive=false for unreachable proxy", async () => {
  const result = await checkProxy({ ip: "192.0.2.1", port: 1 }, 1500);
  assert.equal(result.alive, false);
});

// ── retry.mjs ──────────────────────────────────────────────────────────

test("retry fails after max attempts", async () => {
  let calls = 0;
  try {
    await retry(async () => { calls++; throw new Error("always fail"); }, { maxAttempts: 3, baseMs: 10 });
    assert.fail("should have thrown");
  } catch (e) {
    assert.equal(calls, 3);
    assert.equal(e.message, "always fail");
  }
});

test("retry recovers on transient failure", async () => {
  let calls = 0;
  const val = await retry(
    async () => {
      calls++;
      if (calls < 2) throw new Error("transient");
      return "ok";
    },
    { maxAttempts: 3, baseMs: 10 }
  );
  assert.equal(val, "ok");
  assert.equal(calls, 2);
});

test("retry respects code-based skip", async () => {
  let calls = 0;
  try {
    await retry(
      async () => { calls++; const e = new Error("nope"); e.code = "ECONNREFUSED"; throw e; },
      { maxAttempts: 3, baseMs: 10, shouldRetry: (e) => e.code !== "ECONNREFUSED" }
    );
    assert.fail("should have thrown");
  } catch (e) {
    assert.equal(calls, 1); // ECONNREFUSED is not retried
  }
});

test("withTimeout rejects on timeout", async () => {
  try {
    await withTimeout(() => new Promise((resolve) => setTimeout(resolve, 500)), 100);
    assert.fail("should have thrown");
  } catch (e) {
    assert.equal(e.code, "ETIMEDOUT");
  }
});

test("withTimeout passes through on success", async () => {
  const val = await withTimeout(() => Promise.resolve(42), 5000);
  assert.equal(val, 42);
});
