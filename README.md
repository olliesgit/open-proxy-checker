# Open Proxy Checker

A local proxy checker with CLI and web UI. It fetches proxies from public lists, validates them in parallel, and exports working proxies.

## Features

- CLI + browser UI
- Multiple proxy sources with deduplication
- Concurrent validation with configurable timeout / concurrency
- Export CSV / JSON / TXT
- Filter by type, country, anonymity

## Quick start

Prerequisites: Node.js 18+.

```bash
npm run dev:cli
npm run dev:server
```

- CLI: `node bin/start-cli.mjs --help`
- Server: `node bin/start-server.mjs --port 3000`
- Windows shortcut: `scripts/start.cmd`
