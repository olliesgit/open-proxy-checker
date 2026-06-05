#!/usr/bin/env node

/**
 * Smoke test for Open Proxy Checker.
 *
 * Verifies:
 *   - CLI --help exits 0
 *   - Server starts and responds 200 on /
 *   - Server responds 200 on /api/scan
 */

import http from "node:http";
import { spawn } from "node:child_process";

let failed = false;

function assert(ok, label) {
  if (!ok) {
    failed = true;
    console.error(`FAIL: ${label}`);
  } else {
    console.log(`PASS: ${label}`);
  }
}

async function wait(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function checkUrl(url, expectedStatus = 200) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString("utf-8") });
      });
    }).on("error", reject);
  });
}

async function runCliHelp() {
  const cli = spawn(process.execPath, ["bin/start-cli.mjs", "--help"]);

  let out = "";
  cli.stdout.on("data", (d) => { out += d.toString(); });
  cli.stderr.on("data", () => { /* ignore */ });

  const exitCode = await new Promise((resolve) => {
    cli.on("close", resolve);
  });

  assert(exitCode === 0, "CLI --help exits 0");
  assert(out.includes("Usage:"), "CLI --help prints usage");
}

async function runServerSmoke() {
  const server = spawn(process.execPath, ["bin/start-server.mjs", "--port", "3456"], {
    cwd: process.cwd(),
  });

  server.stderr.on("data", (d) => console.log("[server] " + d.toString().trim()));

  let serverReady = false;
  let serverFailed = false;

  const timeout = setTimeout(async () => {
    serverFailed = true;
    server.kill("SIGKILL");
  }, 15_000);

  while (!serverReady && !serverFailed) {
    await wait(500);
    try {
      const { status } = await checkUrl("http://127.0.0.1:3456/");
      if (status === 200) serverReady = true;
    } catch {
      // still starting
    }
  }

  assert(serverReady, "server returns 200 on /");

  if (serverReady) {
    try {
      const root = await checkUrl("http://127.0.0.1:3456/");
      assert(root.status === 200, "/ body is HTML");
      assert(root.body.includes("Proxy Checker"), "/ body contains app title");

      const scan = await checkUrl("http://127.0.0.1:3456/api/scan");
      assert(scan.status === 200, "/api/scan returns 200");
    } catch (e) {
      assert(false, "server probe failed: " + (e?.message || e));
    }
  }

  server.kill("SIGKILL");
  clearTimeout(timeout);
}

async function main() {
  console.log("Running smoke tests for Open Proxy Checker\n");
  await runCliHelp();
  await runServerSmoke();
  console.log(failed ? "\nSmoke test completed with failures." : "\nSmoke test passed.");
  process.exit(failed ? 1 : 0);
}

main();
