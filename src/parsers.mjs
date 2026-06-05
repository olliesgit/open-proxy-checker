#!/usr/bin/env node

import http from "node:http";
import https from "node:https";

/**
 * Shared proxy parsing and deduplication utilities.
 *
 * @module parsers
 */

/**
 * Parse a plain ip:port text block (one per line).
 *
 * @param {string|null} text - Raw text block with ip:port entries
 * @param {string} type - Proxy type label (http, https, socks4, socks5)
 * @returns {Array<{ip: string, port: number, type: string, country: null, anonymity: null}>}
 */
export function parseIpPortList(text, type) {
  const proxies = [];
  if (!text) return proxies;
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const [ip, port] = trimmed.split(":");
    if (ip && port && /^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
      const p = parseInt(port, 10);
      if (p > 0 && p <= 65535) proxies.push({ ip, port: p, type, country: null, anonymity: null });
    }
  }
  return proxies;
}

/**
 * Parse a protocol-prefixed proxy list (e.g. http://ip:port).
 *
 * @param {string|null} text - Raw text with protocol://ip:port entries
 * @returns {Array<{ip: string, port: number, type: string, country: null, anonymity: null}>}
 */
export function parseProtocolList(text) {
  const proxies = [];
  if (!text) return proxies;
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    const m = trimmed.match(/^(https?|socks[45]):\/\/(\d{1,3}(?:\.\d{1,3}){3}):(\d+)$/);
    if (m) {
      const type = m[1] === "socks4" ? "socks4" : m[1] === "socks5" ? "socks5" : m[1];
      proxies.push({ ip: m[2], port: parseInt(m[3], 10), type, country: null, anonymity: null });
    }
  }
  return proxies;
}

/**
 * Deduplicate proxies by ip:port key, keeping the first occurrence.
 *
 * @param {Array<{ip: string, port: number}>} proxies
 * @returns {Array} Deduplicated array
 */
export function dedup(proxies) {
  const seen = new Set();
  return proxies.filter((p) => {
    const key = `${p.ip}:${p.port}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Deprecated: Use makeFromUrls() in sources.mjs instead.
 */
export function createMultiProtoSource(urlMap) {
  // Simple fetchText (no retry/cache here; use sources.mjs for that)
  const fetchText = (url) =>
    new Promise((resolve) => {
      const mod = url.startsWith("https") ? https : http;
      const req = mod.get(url, { timeout: 12000 }, (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => resolve(data));
      });
      req.on("error", () => resolve(""));
      req.on("timeout", () => { req.destroy(); resolve(""); });
    });

  return async () => {
    const entries = Object.entries(urlMap);
    const texts = await Promise.all(entries.map(([, url]) => fetchText(url)));
    return entries.flatMap(([type], i) => parseIpPortList(texts[i], type));
  };
}
