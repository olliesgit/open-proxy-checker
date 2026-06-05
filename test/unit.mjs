import { test } from "node:test";
import assert from "node:assert/strict";
import { parseIpPortList, parseProtocolList, dedup } from "../src/parsers.mjs";
import { formatCsv, formatJson, formatTxt } from "../src/exporters.mjs";
import { BANNER, shouldShowBanner } from "../src/banner.mjs";

test("parseIpPortList parses valid lines and ignores blanks/comments", () => {
  const text = "# comment\n\n1.2.3.4:8080\n5.6.7.8:3128\nnot-an-ip:1\n\n";
  const result = parseIpPortList(text, "http");
  assert.deepEqual(result, [
    { ip: "1.2.3.4", port: 8080, type: "http", country: null, anonymity: null },
    { ip: "5.6.7.8", port: 3128, type: "http", country: null, anonymity: null },
  ]);
});

test("parseIpPortList returns empty array for empty input", () => {
  const result = parseIpPortList("", "http");
  assert.deepEqual(result, []);
});

test("parseIpPortList handles null input", () => {
  const result = parseIpPortList(null, "http");
  assert.deepEqual(result, []);
});

test("parseProtocolList parses protocol-prefixed proxies", () => {
  const text = "http://1.2.3.4:8080\nsocks5://9.9.9.9:1080\ninvalid\n";
  const result = parseProtocolList(text);
  assert.deepEqual(result, [
    { ip: "1.2.3.4", port: 8080, type: "http", country: null, anonymity: null },
    { ip: "9.9.9.9", port: 1080, type: "socks5", country: null, anonymity: null },
  ]);
});

test("dedup removes duplicate ip:port entries", () => {
  const input = [
    { ip: "1.1.1.1", port: 1, type: "http", country: null, anonymity: null },
    { ip: "2.2.2.2", port: 2, type: "http", country: null, anonymity: null },
    { ip: "1.1.1.1", port: 1, type: "http", country: null, anonymity: null },
  ];
  const result = dedup(input);
  assert.equal(result.length, 2);
  assert.equal(result[0].ip, "1.1.1.1");
  assert.equal(result[1].ip, "2.2.2.2");
});

test("dedup handles empty array", () => {
  const result = dedup([]);
  assert.deepEqual(result, []);
});

test("dedup preserves first occurrence by position", () => {
  const input = [
    { ip: "3.3.3.3", port: 3, type: "http", country: null, anonymity: null, latency: 100 },
    { ip: "3.3.3.3", port: 3, type: "https", country: null, anonymity: null, latency: 200 },
  ];
  const result = dedup(input);
  assert.equal(result.length, 1);
  assert.equal(result[0].type, "http");
});

test("formatTxt outputs ip:port lines", () => {
  const proxies = [
    { ip: "1.2.3.4", port: 8080, type: "http", country: null, anonymity: null, latency: 120 },
    { ip: "5.6.7.8", port: 3128, type: "http", country: null, anonymity: null, latency: 240 },
  ];
  const txt = formatTxt(proxies);
  assert.equal(txt, "1.2.3.4:8080\n5.6.7.8:3128\n");
});

test("formatTxt returns empty string for empty list", () => {
  assert.equal(formatTxt([]), "");
});

test("formatCsv outputs header plus rows", () => {
  const proxies = [
    { ip: "1.2.3.4", port: 8080, type: "http", country: "US", anonymity: "elite", latency: 120 },
  ];
  const csv = formatCsv(proxies);
  assert.ok(csv.startsWith("IP,Port,Type,Latency (ms),Country,Anonymity\n"));
  assert.ok(csv.includes("1.2.3.4,8080,http,120,US,elite\n"));
});

test("formatJson outputs parseable JSON array", () => {
  const proxies = [
    { ip: "1.2.3.4", port: 8080, type: "http", country: null, anonymity: null, latency: 120 },
  ];
  const parsed = JSON.parse(formatJson(proxies));
  assert.ok(Array.isArray(parsed));
  assert.equal(parsed[0].ip, "1.2.3.4");
});

// ── Banner tests ──────────────────────────────────────────────────────────────

test("BANNER string is defined and contains project name", () => {
  assert.ok(BANNER.length > 0);
  assert.ok(BANNER.includes("Open Proxy Checker"));
});

test("BANNER contains ASCII art characters", () => {
  assert.ok(BANNER.includes("___")); // ASCII art has underscores
  assert.ok(BANNER.includes("/"));   // ASCII art has slashes
});

test("shouldShowBanner returns true by default", () => {
  assert.equal(shouldShowBanner(), true);
});

test("shouldShowBanner returns true with empty options", () => {
  assert.equal(shouldShowBanner({}), true);
});

test("shouldShowBanner returns false with noBanner=true", () => {
  assert.equal(shouldShowBanner({ noBanner: true }), false);
});

test("shouldShowBanner returns false for json format", () => {
  assert.equal(shouldShowBanner({ format: "json" }), false);
});

test("shouldShowBanner returns false for csv format", () => {
  assert.equal(shouldShowBanner({ format: "csv" }), false);
});

test("shouldShowBanner returns false for txt format", () => {
  assert.equal(shouldShowBanner({ format: "txt" }), false);
});

test("shouldShowBanner returns true for unknown format", () => {
  assert.equal(shouldShowBanner({ format: "unknown" }), true);
});

test("shouldShowBanner respects noBanner even when format would suppress it", () => {
  assert.equal(shouldShowBanner({ noBanner: true, format: "json" }), false);
});
