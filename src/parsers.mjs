#!/usr/bin/env node

/**
 * Shared proxy parsing utilities.
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

export function createMultiProtoSource(urlMap) {
  return async () => {
    const entries = Object.entries(urlMap);
    const texts = await Promise.all(entries.map(([, url]) => fetchText(url)));
    return entries.flatMap(([type], i) => parseIpPortList(texts[i], type));
  };
}

export function dedup(proxies) {
  const seen = new Set();
  return proxies.filter((p) => {
    const key = `${p.ip}:${p.port}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
