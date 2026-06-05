/**
 * Notification hooks.
 *
 * Fires configured webhooks or shell commands when proxies matching
 * criteria are found during a scan.
 *
 * Config in proxy-checker.yaml:
 *
 *   notify:
 *     on_found: 'curl -d "ip=$ip:$port" https://hooks.example.com/proxy'
 *     elite_only: true
 *     min_latency: 200
 *     debounce_ms: 60000
 */

import { execSync } from "node:child_process";

let lastNotified = 0;

/**
 * Check if a proxy matches notification criteria and fire hooks.
 * @param {Object} proxy - { ip, port, latency, anonymity, ... }
 * @param {Object} config - notify config from proxy-checker.yaml
 */
export function checkNotify(proxy, config) {
  if (!config?.on_found) return;

  // Debounce
  const debounceMs = config.debounce_ms || 60000;
  if (Date.now() - lastNotified < debounceMs) return;

  // Filter by criteria
  if (config.elite_only && proxy.anonymity !== "elite") return;
  if (config.min_latency != null && (proxy.latency || 9999) > config.min_latency) return;
  if (config.max_latency != null && (proxy.latency || 0) < config.max_latency) return;
  if (config.types && Array.isArray(config.types) && !config.types.includes(proxy.type)) return;

  lastNotified = Date.now();
  fire(config.on_found, proxy);
}

/**
 * Fire a notification. Supports shell commands (strings starting with a command)
 * and webhook URLs (http/https).
 */
function fire(hook, proxy) {
  const vars = {
    ip: proxy.ip,
    port: String(proxy.port),
    type: proxy.type || "http",
    latency: String(proxy.latency || ""),
    anonymity: proxy.anonymity || "",
    country: proxy.country || "",
    sources: (proxy.sources || []).join(","),
  };

  // Shell command
  const cmd = interpolate(hook, vars);
  try {
    execSync(cmd, { timeout: 10000, stdio: "pipe" });
  } catch (err) {
    console.error(`[notify] Hook failed: ${err.message}`);
  }
}

function interpolate(template, vars) {
  return template.replace(/\$(\w+)/g, (_, key) => vars[key] || "");
}
