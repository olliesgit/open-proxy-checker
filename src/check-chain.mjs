import http from "node:http";
import https from "node:https";

/**
 * Validation endpoint fallback chain.
 * Tries multiple endpoints via the proxy; sequentially falls back on failure.
 *
 * Default probes (hardcoded) can be overridden via proxy-checker.yaml:
 *
 *   validation:
 *     probes:
 *       - url: "http://httpbin.org/ip"
 *         expect: "origin"
 *       - url: "http://icanhazip.com"
 *       - url: "http://google.com/generate_204"
 *         expect_status: 204
 *     check_timeout_ms: 5000
 */

const DEFAULT_ENDPOINTS = [
  {
    name: "httpbin",
    url: "http://httpbin.org/ip",
    validate(body, status) {
      return status === 200 && '"origin"' in JSON.parse(body);
    },
    extractIp(body) {
      try { return JSON.parse(body).origin; } catch { return null; }
    },
  },
  {
    name: "icanhazip",
    url: "http://icanhazip.com",
    validate(body, status) {
      return status === 200 && /^\d{1,3}(?:\.\d{1,3}){3}$/.test(body.trim());
    },
    extractIp(body) { return body.trim(); },
  },
  {
    name: "google",
    url: "http://google.com/generate_204",
    validate(_body, status) {
      return status === 204 || status === 200;
    },
    headers: { Host: "www.google.com" },
  },
];

const LEAK_HEADERS = ["forwarded", "x-forwarded-for", "via", "x-real-ip"];

/**
 * Build probe endpoints from config or use defaults.
 * Config format:
 *   probes:
 *     - url: "http://httpbin.org/ip"
 *       expect: "origin"           # string to find in body
 *       expect_status: 200          # expected status code (default 200)
 */
export function buildProbes(configProbes) {
  if (!configProbes || !configProbes.length) return DEFAULT_ENDPOINTS;
  return configProbes.map((p, i) => {
    const url = new URL(p.url);
    const name = p.name || `${url.hostname}:${url.port || 80}`;
    const expectStatus = p.expect_status ?? 200;
    const expectBody = p.expect || null;
    return {
      name,
      url: p.url,
      headers: p.headers || {},
      validate(body, status) {
        if (status !== expectStatus) return false;
        if (expectBody && !body.includes(expectBody)) return false;
        return true;
      },
      extractIp(body) {
        try {
          if (url.hostname === "icanhazip.com") return body.trim();
          const parsed = JSON.parse(body);
          return parsed.origin || parsed.ip || null;
        } catch { return null; }
      },
    };
  });
}

export async function checkProxy(proxy, timeout = 5000, probes) {
  const endpoints = probes || DEFAULT_ENDPOINTS;
  const start = Date.now();
  let lastHeaders = {};
  let lastBody = "";
  for (const ep of endpoints) {
    const remaining = timeout - (Date.now() - start);
    if (remaining <= 200) break;
    try {
      const result = await probe(proxy, ep, Math.min(remaining, 4000));
      if (!result) continue;
      lastHeaders = result.headers;
      lastBody = result.body;
      const latency = Date.now() - start;
      const anonymity = classifyAnonymity(result.headers, result.body);
      return {
        alive: true,
        latency,
        anonymity,
        endpoint: ep.name,
        ip: result.ip ?? proxy.ip,
      };
    } catch {
      // continue to next endpoint
    }
  }
  return { alive: false };
}

function probe(proxy, endpoint, timeout) {
  return new Promise((resolve) => {
    const req = http.request({
      hostname: proxy.ip,
      port: proxy.port,
      path: new URL(endpoint.url).pathname + new URL(endpoint.url).search,
      method: "GET",
      timeout,
      headers: {
        Host: new URL(endpoint.url).host,
        Accept: "*/*",
        ...(endpoint.headers || {}),
      },
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const body = Buffer.concat(chunks).toString();
        try {
          if (endpoint.validate(body, res.statusCode)) {
            return resolve({
              body,
              headers: res.headers,
              ip: endpoint.extractIp ? endpoint.extractIp(body) : null,
            });
          }
        } catch { /* validation threw */ }
        resolve(null);
      });
    });
    req.on("error", () => resolve(null));
    req.on("timeout", () => { req.destroy(); resolve(null); });
    req.end();
  });
}

function classifyAnonymity(headers, body) {
  const lc = (s) => String(s).toLowerCase();
  const has = (h) => Object.keys(headers).some((k) => lc(k) === lc(h));
  if (has("via") && !has("x-forwarded-for") && !has("forwarded")) return "anonymous";
  if (has("forwarded") || has("x-forwarded-for") || has("x-real-ip")) return "transparent";
  if (body && (body.includes("X-Forwarded-For") || body.includes("Via:"))) return "transparent";
  return "elite";
}
