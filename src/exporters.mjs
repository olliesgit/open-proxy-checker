/**
 * Export formatters for working proxy lists.
 */

export function formatTxt(proxies) {
  return proxies.map((p) => `${p.ip}:${p.port}`).join("\n") + (proxies.length ? "\n" : "");
}

export function formatCsv(proxies) {
  const header = ["IP", "Port", "Type", "Latency (ms)", "Country", "Anonymity"].join(",");
  const rows = proxies.map((p) => [p.ip, String(p.port), p.type, String(p.latency), p.country || "??", p.anonymity || "??"].join(","));
  return [header, ...rows].join("\n") + "\n";
}

export function formatJson(proxies) {
  return JSON.stringify(proxies, null, 2) + "\n";
}
