# Open Proxy Checker

A local, open-source proxy checker with a CLI and a lightweight web UI. It fetches public proxy lists, validates working proxies concurrently, and exports the results in common formats.

![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)

## Features

- **CLI first**: run scans from the terminal with filters for type, country, and anonymity
- **Web UI**: scan and manage results in a browser-friendly interface
- **Multiple sources**: aggregates proxies from several public lists, with deduplication
- **Concurrent validation**: configurable timeout and concurrency
- **Export options**: CSV, JSON, and TXT output
- **Local by default**: validation is performed from your machine; results are not uploaded by this tool

## Quick start

### Prerequisites

- Node.js 18+
- npm (or pnpm/yarn)

### Install

```bash
git clone https://github.com/olliesgit/open-proxy-checker.git
cd open-proxy-checker
npm install
```

### CLI usage

```bash
npm run start:cli -- --type http --country US --limit 20 --output proxies.txt
```

Options:
- `--timeout <ms>` connection timeout in milliseconds
- `--concurrency <n>` max concurrent checks
- `--output <file>` save working proxies to file
- `--type <type>` http, https, socks4, socks5, or all
- `--country <code>` two-letter country code, e.g. `US`
- `--anonymous` keep only anonymous/elite results
- `--limit <n>` stop after finding N working proxies
- `--quiet` suppress progress output

### Web UI

```bash
npm run start:server -- --port 3000
```

Then open `http://localhost:3000` in your browser.

### Windows shortcut

Double-click `scripts/start.cmd` to launch the local server and open the UI.

## Output formats

| Format      | Flag / action          | Example file       |
|-------------|------------------------|--------------------|
| CSV         | Export CSV in UI       | `proxies.csv`      |
| JSON        | Export JSON in UI      | `proxies.json`     |
| TXT         | `--output proxies.txt` | `proxies.txt`      |

## Safety and responsible use

This tool is intended for legitimate development, testing, and research workflows.

- Use it only against systems you own or where you have explicit permission to test.
- Respect the terms of service for any upstream proxy lists and target services.
- This software is provided as-is. It is not a traffic interception or offensive security tool.

See `SECURITY.md` for more detail.

## Screenshots

Add screenshots under `docs/screenshots/` and reference them here.

Recommended captures:
- `docs/screenshots/cli-output.png` - terminal output after a short scan
- `docs/screenshots/web-ui.png` - main web UI showing scan results

Example image reference:
![CLI preview](docs/screenshots/cli-output.png)

If you add screenshots, update these links and remove this notice.

## Roadmap

See `ROADMAP.md` for planned improvements. Short term plans include automated tests, Docker support, and expanded source configuration.

## Contributing

See `CONTRIBUTING.md` for guidance.

## License

MIT - see `LICENSE`.
