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
 * Skips blank lines and lines starting with #.
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
 * Create a source function that fetches multiple URLs in parallel,
 * each mapped to a proxy type, and parses each as ip:port text.
 *
 * @param {Object<string, string>} urlMap - Map of type -> URL
 * @returns {function(): Promise<Array>} Async function that returns parsed proxies
 */
export function createMultiProtoSource(urlMap) {
  return async () => {
    const entries = Object.entries(urlMap);
    const texts = await Promise.all(entries.map(([, url]) => fetchText(url)));
    return entries.flatMap(([type], i) => parseIpPortList(texts[i], type));
  };
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
 * Fetch text content from a URL (internal helper).
 *
 * @param {string} url
 * @returns {Promise<string>}
 */
function fetchText(url) {
  const mod = url.startsWith("https") ? https : http;
  return new Promise((resolve) => {
    const req = mod.get(url, { timeout: 10000 }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve(data));
    });
    req.on("error", () => resolve(""));
    req.on("timeout", () => { req.destroy(); resolve(""); });
  });
}
