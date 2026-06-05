/**
 * Scan history with SQLite.
 *
 * Tracks every scan run and each proxy result so you can query:
 *   - "Which proxies have been alive for 3+ consecutive scans?"
 *   - "Show me proxies with <100ms latency found by multiple sources"
 *   - "Export the 50 most reliable proxies sorted by uptime"
 *
 * DB: .cache/history.db (auto-created)
 */

import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const DB_DIR = path.resolve(process.cwd(), ".cache");
const DB_PATH = path.join(DB_DIR, "history.db");

let db = null;

function getDb() {
  if (db) return db;
  fs.mkdirSync(DB_DIR, { recursive: true });
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  migrate();
  return db;
}

function migrate() {
  const d = getDb();
  d.exec(`
    CREATE TABLE IF NOT EXISTS scans (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at  INTEGER NOT NULL,
      finished_at INTEGER,
      total_sources INTEGER DEFAULT 0,
      total_fetched  INTEGER DEFAULT 0,
      proxies_checked INTEGER DEFAULT 0,
      proxies_found   INTEGER DEFAULT 0,
      cache_hits      INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS proxy_results (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      scan_id     INTEGER NOT NULL REFERENCES scans(id),
      ip          TEXT NOT NULL,
      port        INTEGER NOT NULL,
      type        TEXT DEFAULT 'http',
      alive       INTEGER NOT NULL DEFAULT 0,
      latency_ms  REAL,
      anonymity   TEXT,
      country     TEXT,
      source      TEXT,
      checked_at  INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_proxy_results_ip_port ON proxy_results(ip, port);
    CREATE INDEX IF NOT EXISTS idx_proxy_results_scan_id ON proxy_results(scan_id);
    CREATE INDEX IF NOT EXISTS idx_proxy_results_checked_at ON proxy_results(checked_at);
    CREATE INDEX IF NOT EXISTS idx_proxy_results_alive ON proxy_results(alive);
  `);
}

// ── Scan Lifecycle ─────────────────────────────────────────────────────────

export function startScan(opts = {}) {
  const d = getDb();
  const stmt = d.prepare(
    "INSERT INTO scans (started_at, total_sources, total_fetched) VALUES (?, ?, ?)"
  );
  const info = stmt.run(Date.now(), opts.totalSources || 0, opts.totalFetched || 0);
  return info.lastInsertRowid;
}

export function finishScan(scanId, opts = {}) {
  const d = getDb();
  const stmt = d.prepare(
    "UPDATE scans SET finished_at = ?, proxies_checked = ?, proxies_found = ?, cache_hits = ? WHERE id = ?"
  );
  stmt.run(
    Date.now(),
    opts.proxiesChecked || 0,
    opts.proxiesFound || 0,
    opts.cacheHits || 0,
    scanId
  );
}

// ── Record Proxy Results ──────────────────────────────────────────────────

export function recordProxyResults(scanId, proxies) {
  if (!proxies.length) return;
  const d = getDb();
  const stmt = d.prepare(
    "INSERT INTO proxy_results (scan_id, ip, port, type, alive, latency_ms, anonymity, country, source, checked_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  );
  const now = Date.now();
  const insertMany = d.transaction((rows) => {
    for (const p of rows) {
      const sources = p.sources || [p._source || ""];
      const sourceStr = Array.isArray(sources) ? sources.join(",") : String(sources);
      stmt.run(
        scanId,
        p.ip,
        p.port,
        p.type || "http",
        p.alive ? 1 : 0,
        p.latency ?? null,
        p.anonymity || null,
        p.country || null,
        sourceStr,
        now
      );
    }
  });
  insertMany(proxies);
}

// ── Queries ────────────────────────────────────────────────────────────────

/** Get the last N scans with summary stats. */
export function getRecentScans(limit = 20) {
  const d = getDb();
  return d.prepare(
    `SELECT id, started_at, finished_at, total_sources, total_fetched,
            proxies_checked, proxies_found, cache_hits
     FROM scans ORDER BY id DESC LIMIT ?`
  ).all(limit);
}

/** Get full proxy history for a specific IP:port. */
export function getProxyHistory(ip, port, limit = 50) {
  const d = getDb();
  return d.prepare(
    `SELECT pr.*, s.started_at as scan_started
     FROM proxy_results pr
     JOIN scans s ON pr.scan_id = s.id
     WHERE pr.ip = ? AND pr.port = ?
     ORDER BY pr.checked_at DESC
     LIMIT ?`
  ).all(ip, port, limit);
}

/** Get the most reliable proxies across all scans. */
export function getReliableProxies(minScans = 2, minAliveRatio = 0.8, limit = 100) {
  const d = getDb();
  return d.prepare(
    `SELECT ip, port,
            COUNT(*) as total_checks,
            SUM(alive) as alive_count,
            ROUND(CAST(SUM(alive) AS REAL) / COUNT(*) * 100, 1) as alive_pct,
            ROUND(AVG(CASE WHEN alive = 1 THEN latency_ms END), 0) as avg_latency,
            MAX(checked_at) as last_seen
     FROM proxy_results
     GROUP BY ip, port
     HAVING total_checks >= ? AND alive_pct >= ?
     ORDER BY alive_pct DESC, avg_latency ASC
     LIMIT ?`
  ).all(minScans, minAliveRatio, limit);
}

/** Close the DB connection. */
export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}
