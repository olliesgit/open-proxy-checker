/**
 * Export formatters for working proxy lists.
 *
 * @module exporters
 */

/**
 * Format proxies as plain ip:port text (one per line).
 *
 * @param {Array<{ip: string, port: number}>} proxies
 * @returns {string}
 */
export function formatTxt(proxies) {
  return proxies.map((p) => `${p.ip}:${p.port}`).join("\n") + (proxies.length ? "\n" : "");
}

/**
 * Format proxies as CSV with header row.
 *
 * @param {Array<{ip: string, port: number, type: string, latency: number, country: string|null, anonymity: string|null}>} proxies
 * @returns {string}
 */
export function formatCsv(proxies) {
  const header = ["IP", "Port", "Type", "Latency (ms)", "Country", "Anonymity"].join(",");
  const rows = proxies.map((p) => [p.ip, String(p.port), p.type, String(p.latency), p.country || "??", p.anonymity || "??"].join(","));
  return [header, ...rows].join("\n") + "\n";
}

/**
 * Format proxies as a pretty-printed JSON array.
 *
 * @param {Array} proxies
 * @returns {string}
 */
export function formatJson(proxies) {
  return JSON.stringify(proxies, null, 2) + "\n";
}
