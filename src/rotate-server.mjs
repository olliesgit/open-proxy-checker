/**
 * Rotating proxy server.
 *
 * Starts a local HTTP proxy that rotates through the working proxy list
 * on each connection. One request = one proxy, then moves to the next.
 *
 * Usage: node bin/start-cli.mjs --serve --serve-port 8888
 */

import http from "node:http";
import https from "node:https";
import net from "node:net";

/**
 * Start the rotating proxy server.
 * @param {Array} proxies - List of working proxy objects {ip, port, type, latency, ...}
 * @param {number} port - Local port to listen on
 * @returns {Promise} Resolves when server closes
 */
export function startRotatingProxy(proxies, port = 8888) {
  let index = 0;

  function nextProxy() {
    const p = proxies[index % proxies.length];
    index++;
    return p;
  }

  const server = http.createServer((req, res) => {
    const proxy = nextProxy();
    if (!proxy) {
      res.writeHead(502);
      res.end("No proxies available");
      return;
    }

    const targetUrl = new URL(req.url);

    // Forward the request through the selected proxy
    const options = {
      hostname: proxy.ip,
      port: proxy.port,
      path: req.url,
      method: req.method,
      headers: { ...req.headers, Host: targetUrl.host, "Proxy-Connection": "close" },
      timeout: 10000,
    };

    const pref = `${req.method} ${targetUrl.host} -> ${proxy.ip}:${proxy.port}`;

    const proxyReq = http.request(options, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    });

    proxyReq.on("error", (err) => {
      console.error(`[rotate] ${pref} FAIL: ${err.message}`);
      if (!res.headersSent) {
        res.writeHead(502);
        res.end(`Proxy error: ${err.message}`);
      }
    });

    proxyReq.on("timeout", () => {
      proxyReq.destroy();
      if (!res.headersSent) {
        res.writeHead(504);
        res.end("Proxy timeout");
      }
    });

    req.pipe(proxyReq);
  });

  // Handle CONNECT for HTTPS tunneling
  server.on("connect", (req, clientSocket, head) => {
    const proxy = nextProxy();
    if (!proxy) {
      clientSocket.end();
      return;
    }

    const [hostname, port] = req.url.split(":");
    const targetPort = parseInt(port, 10) || 443;

    // Create a TCP connection to the proxy
    const proxySocket = net.connect(proxy.port, proxy.ip, () => {
      // Send CONNECT to the proxy
      proxySocket.write(`CONNECT ${req.url} HTTP/1.1\r\nHost: ${req.url}\r\n\r\n`);
      proxySocket.once("data", (data) => {
        const response = data.toString();
        if (response.startsWith("HTTP/1.1 200") || response.startsWith("HTTP/1.0 200")) {
          clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
          // Tunnel data between client and proxy
          proxySocket.pipe(clientSocket);
          clientSocket.pipe(proxySocket);
          if (head.length > 0) proxySocket.unshift(head);
        } else {
          clientSocket.end();
          proxySocket.end();
        }
      });
    });

    proxySocket.on("error", () => {
      clientSocket.end();
    });

    clientSocket.on("error", () => {
      proxySocket.end();
    });

    proxySocket.setTimeout(15000, () => {
      proxySocket.destroy();
      clientSocket.end();
    });
  });

  return new Promise((resolve, reject) => {
    server.listen(port, "127.0.0.1", () => {
      console.log(`\n  Rotating proxy server listening on http://127.0.0.1:${port}`);
      console.log(`  ${proxies.length} proxies in rotation, round-robin`);
      console.log();
      resolve(server);
    });
    server.on("error", reject);
  });
}
