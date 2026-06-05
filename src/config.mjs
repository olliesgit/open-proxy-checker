/**
 * Minimal YAML config loader for proxy-checker.
 *
 * Handles the subset of YAML we need:
 *   - key: value (strings, numbers, booleans, empty arrays)
 *   - nested keys under top-level sections
 *   - comments (#)
 *   - lists as: key: [item1, item2, ...]
 *
 * Usage: const config = loadConfig();
 * Searches cwd then ~/.config/open-proxy-checker/ for proxy-checker.yaml
 */

import fs from "node:fs";
import path from "node:path";

const SEARCH_PATHS = [
  process.cwd(),
  path.join(process.cwd(), "config"),
  path.join(osHomedir(), ".config", "open-proxy-checker"),
];

const DEFAULTS = {
  cache_ttl_hours: 6,
  concurrency: 50,
  timeout_ms: 5000,
  sources: {
    enabled: [],
    disabled: [],
  },
  validation: {
    check_timeout_ms: 5000,
  },
  export: {
    default_format: "table",
  },
  server: {
    port: 3000,
    auto_refresh_minutes: 5,
  },
};

function osHomedir() {
  try {
    const home = process.env.HOME || process.env.USERPROFILE;
    return home || "~";
  } catch {
    return "~";
  }
}

function parseYaml(text) {
  const result = {};
  const currentSection = [result]; // stack of nested objects
  const currentIndent = [0]; // indent level for each section

  for (const rawLine of text.split("\n")) {
    const line = rawLine.replace(/\s*#.*$/, "").trimEnd();
    if (!line || line.trim().startsWith("#")) continue;

    const indent = line.length - line.trimStart().length;
    const trimmed = line.trim();

    // Pop sections that are less indented than current
    while (currentIndent.length > 1 && indent <= currentIndent[currentIndent.length - 1]) {
      currentSection.pop();
      currentIndent.pop();
    }

    if (trimmed.endsWith(":")) {
      // New nested section
      const key = trimmed.slice(0, -1).trim();
      const parent = currentSection[currentSection.length - 1];
      const obj = {};
      parent[key] = obj;
      currentSection.push(obj);
      currentIndent.push(indent);
    } else if (trimmed.includes(":")) {
      // key: value
      const colonIdx = trimmed.indexOf(":");
      const key = trimmed.slice(0, colonIdx).trim();
      let value = trimmed.slice(colonIdx + 1).trim();

      // Parse value
      if (value === "" || value === "[]") {
        value = [];
      } else if (value.startsWith("[") && value.endsWith("]")) {
        value = value.slice(1, -1).split(",").map((s) => s.trim().replace(/^['"]|['"]$/g, "")).filter(Boolean);
      } else if (value === "true") {
        value = true;
      } else if (value === "false") {
        value = false;
      } else if (/^\d+$/.test(value)) {
        value = parseInt(value, 10);
      } else if (/^\d+\.\d+$/.test(value)) {
        value = parseFloat(value);
      } else {
        // Strip quotes if present
        value = value.replace(/^['"]|['"]$/g, "");
      }

      const parent = currentSection[currentSection.length - 1];
      parent[key] = value;
    }
  }

  return result;
}

export function loadConfig() {
  for (const dir of SEARCH_PATHS) {
    for (const name of ["proxy-checker.yaml", "proxy-checker.yml", "proxy-checker.json"]) {
      const fp = path.join(dir, name);
      try {
        if (!fs.existsSync(fp)) continue;
        const text = fs.readFileSync(fp, "utf-8");
        let parsed;
        if (name.endsWith(".json")) {
          parsed = JSON.parse(text);
        } else {
          parsed = parseYaml(text);
        }
        return deepMerge(DEFAULTS, parsed);
      } catch (err) {
        console.error(`[config] Error reading ${fp}: ${err.message}`);
      }
    }
  }
  return { ...DEFAULTS };
}

function deepMerge(base, override) {
  const result = { ...base };
  for (const key of Object.keys(override)) {
    if (override[key] && typeof override[key] === "object" && !Array.isArray(override[key])) {
      result[key] = deepMerge(base[key] || {}, override[key]);
    } else if (override[key] !== undefined) {
      result[key] = override[key];
    }
  }
  return result;
}
