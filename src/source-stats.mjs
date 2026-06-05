/**
 * Source quality dashboard.
 *
 * Computes per-source statistics from the proxy cache:
 *   - total proxies found
 *   - alive count / ratio
 *   - avg latency
 *   - elite / anonymous / transparent breakdown
 *   - average alive streak
 */

import { loadProxyCache } from "./cache.mjs";

export function getSourceStats() {
  const cache = loadProxyCache();
  if (!cache?.proxies) return null;

  const stats = {};

  for (const [key, entry] of Object.entries(cache.proxies)) {
    const sources = entry.sources || ["unknown"];
    const [ip, port] = key.split(":");

    for (const source of sources) {
      if (!stats[source]) {
        stats[source] = {
          source,
          total: 0,
          alive: 0,
          dead: 0,
          latencies: [],
          elite: 0,
          anonymous: 0,
          transparent: 0,
          unknownAnon: 0,
          aliveStreaks: [],
          checks: 0,
        };
      }
      const s = stats[source];
      s.total++;
      s.checks += entry.checks || 1;
      if (entry.alive) {
        s.alive++;
        if (entry.latency != null && entry.latency > 0) s.latencies.push(entry.latency);
        if (entry.aliveStreak != null) s.aliveStreaks.push(entry.aliveStreak);
        const anon = entry.anonymity || "unknown";
        if (anon === "elite") s.elite++;
        else if (anon === "anonymous") s.anonymous++;
        else if (anon === "transparent") s.transparent++;
        else s.unknownAnon++;
      } else {
        s.dead++;
      }
    }
  }

  // Compute derived stats
  for (const s of Object.values(stats)) {
    s.aliveRatio = s.total > 0 ? Math.round((s.alive / s.total) * 100) : 0;
    s.avgLatency = s.latencies.length > 0 ? Math.round(s.latencies.reduce((a, b) => a + b, 0) / s.latencies.length) : null;
    s.medianLatency = s.latencies.length > 0 ? median(s.latencies) : null;
    s.minLatency = s.latencies.length > 0 ? Math.min(...s.latencies) : null;
    s.maxLatency = s.latencies.length > 0 ? Math.max(...s.latencies) : null;
    s.avgAliveStreak = s.aliveStreaks.length > 0 ? Math.round(s.aliveStreaks.reduce((a, b) => a + b, 0) / s.aliveStreaks.length) : null;
  }

  // Sort by alive ratio descending, then by total descending
  return Object.values(stats).sort((a, b) => {
    if (b.aliveRatio !== a.aliveRatio) return b.aliveRatio - a.aliveRatio;
    return b.total - a.total;
  });
}

function median(arr) {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}
