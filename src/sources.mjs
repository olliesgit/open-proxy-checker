/**
 * Shared proxy source fetching functions.
 *
 * @module sources
 */

import http from "node:http";
import https from "node:https";
import { parseIpPortList, parseProtocolList } from "./parsers.mjs";

// ── HTTP Helpers ──────────────────────────────────────────────────────────────

function fetchText(url, timeout = 12000) {
  return new Promise((resolve) => {
    const mod = url.startsWith("https") ? https : http;
    const req = mod.get(url, { timeout }, (res) => {
      if (
        res.statusCode >= 300 && res.statusCode < 400 &&
        res.headers.location
      ) {
        fetchText(res.headers.location, timeout).then(resolve);
        return;
      }
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve(data));
    });
    req.on("error", () => resolve(""));
    req.on("timeout", () => { req.destroy(); resolve(""); });
  });
}

function fetchJson(url, timeout = 12000) {
  return new Promise((resolve) => {
    const mod = url.startsWith("https") ? https : http;
    const req = mod.get(url, { timeout }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try { resolve(JSON.parse(data)); } catch { resolve(null); }
      });
    });
    req.on("error", () => resolve(null));
    req.on("timeout", () => { req.destroy(); resolve(null); });
  });
}

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

function fetchHtml(url, timeout = 15000) {
  return new Promise((resolve) => {
    const mod = url.startsWith("https") ? https : http;
    const opts = new URL(url);
    const req = mod.get(
      {
        hostname: opts.hostname,
        port: opts.port,
        path: opts.pathname + opts.search,
        timeout,
        headers: {
          "User-Agent": BROWSER_UA,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
      },
      (res) => {
        if (
          [301, 302, 303, 307].includes(res.statusCode) &&
          res.headers.location
        ) {
          fetchHtml(res.headers.location, timeout).then(resolve);
          return;
        }
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve(data));
      }
    );
    req.on("error", () => resolve(""));
    req.on("timeout", () => { req.destroy(); resolve(""); });
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function tagSource(proxies, name) {
  return proxies.map((p) => ({ ...p, _source: name }));
}

function sourceNameFromUrls(typeToUrlMap) {
  const firstUrl = Object.values(typeToUrlMap)[0];
  if (!firstUrl) return "unknown";
  try {
    const u = new URL(firstUrl);
    const parts = u.pathname.split("/");
    return parts[parts.length - 1] || u.hostname;
  } catch {
    return "unknown";
  }
}

function makeFromUrls(urlMap) {
  return async function () {
    const entries = Object.entries(urlMap);
    const texts = await Promise.all(entries.map(([, url]) => fetchText(url)));
    const all = entries.flatMap(([type], i) => parseIpPortList(texts[i], type));
    return tagSource(all, sourceNameFromUrls(urlMap));
  };
}

// ── Source Functions ──────────────────────────────────────────────────────────

async function sourceProxyScrape() {
  const proxies = [];
  for (const proto of ["http", "socks4", "socks5"]) {
    const text = await fetchText(
      `https://api.proxyscrape.com/v2/?request=displayproxies&protocol=${proto}&timeout=10000&country=all&ssl=all&anonymity=all`
    );
    if (!text) continue;
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const [ip, port] = trimmed.split(":");
      if (ip && port) proxies.push({ ip, port: parseInt(port, 10), type: proto, country: null, anonymity: null });
    }
  }
  return tagSource(proxies, "ProxyScrape");
}

async function sourceGeonode() {
  const proxies = [];
  const data = await fetchJson(
    "https://proxylist.geonode.com/api/proxy-list?limit=500&page=1&sort_by=lastChecked&sort_type=desc"
  );
  if (data?.data) {
    for (const p of data.data) {
      for (const proto of p.protocols || []) {
        proxies.push({
          ip: p.ip,
          port: parseInt(p.port, 10),
          type: proto,
          country: p.country || null,
          anonymity: p.anonymityLevel || null,
        });
      }
    }
  }
  return tagSource(proxies, "Geonode");
}

async function sourcePubProxy() {
  const proxies = [];
  for (let i = 0; i < 5; i++) {
    const data = await fetchJson("http://pubproxy.com/api/proxy?limit=20&format=json&type=http");
    if (!data?.data) continue;
    for (const p of data.data) {
      const [ip, port] = p.ipPort.split(":");
      proxies.push({
        ip,
        port: parseInt(port, 10),
        type: p.type?.toLowerCase() || "http",
        country: p.country || null,
        anonymity: p.proxy_level || null,
      });
    }
  }
  return tagSource(proxies, "PubProxy");
}

async function sourceFreeProxyList() {
  const proxies = [];
  const text = await fetchText(
    "https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http&timeout=5000&country=all&ssl=yes&anonymity=all"
  );
  if (text) {
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const [ip, port] = trimmed.split(":");
      if (ip && port) proxies.push({ ip, port: parseInt(port, 10), type: "https", country: null, anonymity: null });
    }
  }
  return tagSource(proxies, "FreeProxyList");
}

const sourceSpeedX = makeFromUrls({
  http: "https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt",
  socks4: "https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/socks4.txt",
  socks5: "https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/socks5.txt",
});

async function sourceProxifly() {
  const proxies = [];
  const base = "https://raw.githubusercontent.com/proxifly/free-proxy-list/main/proxies/protocols";
  const [httpData, socks4Data, socks5Data] = await Promise.all([
    fetchJson(`${base}/http/data.json`),
    fetchJson(`${base}/socks4/data.json`),
    fetchJson(`${base}/socks5/data.json`),
  ]);
  for (const [list, type] of [
    [httpData, "http"],
    [socks4Data, "socks4"],
    [socks5Data, "socks5"],
  ]) {
    if (!Array.isArray(list)) continue;
    for (const p of list) {
      if (!p.ip || !p.port) continue;
      proxies.push({
        ip: p.ip,
        port: parseInt(p.port, 10),
        type,
        country: p.geolocation?.country || null,
        anonymity: p.anonymity || null,
      });
    }
  }
  return tagSource(proxies, "Proxifly");
}

const sourceErcinDedeoglu = makeFromUrls({
  http: "https://raw.githubusercontent.com/ErcinDedeoglu/proxies/main/proxies/http.txt",
  socks4: "https://raw.githubusercontent.com/ErcinDedeoglu/proxies/main/proxies/socks4.txt",
  socks5: "https://raw.githubusercontent.com/ErcinDedeoglu/proxies/main/proxies/socks5.txt",
});

async function sourceMonosans() {
  return tagSource(
    parseProtocolList(
      await fetchText("https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/all.txt")
    ),
    "Monosans"
  );
}

async function sourceClarketm() {
  return tagSource(
    parseIpPortList(
      await fetchText("https://raw.githubusercontent.com/clarketm/proxy-list/master/proxy-list-raw.txt"),
      "http"
    ),
    "Clarketm"
  );
}

const sourceKangProxy = makeFromUrls({
  http: "https://raw.githubusercontent.com/officialputuid/KangProxy/KangProxy/http/http.txt",
  socks4: "https://raw.githubusercontent.com/officialputuid/KangProxy/KangProxy/socks4/socks4.txt",
  socks5: "https://raw.githubusercontent.com/officialputuid/KangProxy/KangProxy/socks5/socks5.txt",
});

const sourceVakhov = makeFromUrls({
  http: "https://raw.githubusercontent.com/vakhov/fresh-proxy-list/master/http.txt",
  https: "https://raw.githubusercontent.com/vakhov/fresh-proxy-list/master/https.txt",
  socks4: "https://raw.githubusercontent.com/vakhov/fresh-proxy-list/master/socks4.txt",
  socks5: "https://raw.githubusercontent.com/vakhov/fresh-proxy-list/master/socks5.txt",
});

const sourceShiftyTR = makeFromUrls({
  http: "https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/http.txt",
  https: "https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/https.txt",
  socks4: "https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/socks4.txt",
  socks5: "https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/socks5.txt",
});

const sourceJetkai = makeFromUrls({
  http: "https://raw.githubusercontent.com/jetkai/proxy-list/main/online-proxies/txt/proxies-http.txt",
  https: "https://raw.githubusercontent.com/jetkai/proxy-list/main/online-proxies/txt/proxies-https.txt",
  socks4: "https://raw.githubusercontent.com/jetkai/proxy-list/main/online-proxies/txt/proxies-socks4.txt",
  socks5: "https://raw.githubusercontent.com/jetkai/proxy-list/main/online-proxies/txt/proxies-socks5.txt",
});

const sourceIplocate = makeFromUrls({
  http: "https://raw.githubusercontent.com/iplocate/free-proxy-list/main/protocols/http.txt",
  socks4: "https://raw.githubusercontent.com/iplocate/free-proxy-list/main/protocols/socks4.txt",
  socks5: "https://raw.githubusercontent.com/iplocate/free-proxy-list/main/protocols/socks5.txt",
});

const sourceOpenProxyList = makeFromUrls({
  http: "https://api.openproxylist.xyz/http.txt",
  socks4: "https://api.openproxylist.xyz/socks4.txt",
  socks5: "https://api.openproxylist.xyz/socks5.txt",
});

const sourceSunny9577 = makeFromUrls({
  http: "https://raw.githubusercontent.com/sunny9577/proxy-scraper/master/generated/http_proxies.txt",
  socks4: "https://raw.githubusercontent.com/sunny9577/proxy-scraper/master/generated/socks4_proxies.txt",
  socks5: "https://raw.githubusercontent.com/sunny9577/proxy-scraper/master/generated/socks5_proxies.txt",
});

const sourceMuRongPIG = makeFromUrls({
  http: "https://raw.githubusercontent.com/MuRongPIG/Proxy-Master/main/http.txt",
  https: "https://raw.githubusercontent.com/MuRongPIG/Proxy-Master/main/https.txt",
  socks4: "https://raw.githubusercontent.com/MuRongPIG/Proxy-Master/main/proxies/socks4.txt",
  socks5: "https://raw.githubusercontent.com/MuRongPIG/Proxy-Master/main/proxies/socks5.txt",
});

const sourceRoosterkid = makeFromUrls({
  https: "https://raw.githubusercontent.com/roosterkid/openproxylist/main/HTTPS_RAW.txt",
  socks4: "https://raw.githubusercontent.com/roosterkid/openproxylist/main/SOCKS4_RAW.txt",
  socks5: "https://raw.githubusercontent.com/roosterkid/openproxylist/main/SOCKS5_RAW.txt",
});

// ── Source Registry ───────────────────────────────────────────────────────────

export const SOURCE_REGISTRY = new Map([
  ["ProxyScrape", sourceProxyScrape],
  ["Geonode", sourceGeonode],
  ["PubProxy", sourcePubProxy],
  ["FreeProxyList", sourceFreeProxyList],
  ["SpeedX", sourceSpeedX],
  ["Proxifly", sourceProxifly],
  ["ErcinDedeoglu", sourceErcinDedeoglu],
  ["Monosans", sourceMonosans],
  ["Clarketm", sourceClarketm],
  ["KangProxy", sourceKangProxy],
  ["Vakhov", sourceVakhov],
  ["ShiftyTR", sourceShiftyTR],
  ["Jetkai", sourceJetkai],
  ["Iplocate", sourceIplocate],
  ["OpenProxyList", sourceOpenProxyList],
  ["Sunny9577", sourceSunny9577],
  ["MuRongPIG", sourceMuRongPIG],
  ["Roosterkid", sourceRoosterkid],
]);

export { fetchText, fetchJson, fetchHtml };
