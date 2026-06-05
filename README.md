# Open Proxy Checker

[![CI](https://github.com/olliesgit/open-proxy-checker/actions/workflows/ci.yml/badge.svg)](https://github.com/olliesgit/open-proxy-checker/actions/workflows/ci.yml)

Open Proxy Checker is a local CLI and browser-based tool for collecting, deduplicating, validating, filtering, and exporting public proxy lists.

It is designed for legitimate development, QA, research, and network testing workflows where transparent local proxy validation is useful.

## Features

- Local CLI with real-time output
- Local browser-based web UI with live scan results
- Fetches proxies from multiple public sources with deduplication
- Concurrent proxy validation with configurable timeout
- Filtering by type, country, and anonymity where metadata is available
- Export results as JSON, CSV, or TXT
- Saves results to file with `--output`
- All processing stays local -- no result upload
- MIT licensed

## Requirements

- Node.js 18 or newer
- npm

## Installation

```bash
git clone https://github.com/olliesgit/open-proxy-checker.git
cd open-proxy-checker
npm install
```

## CLI Usage

Run the CLI:

```bash
npm run start:cli -- --help
```

Fetch and validate proxies:

```bash
# Run with defaults
npm run start:cli

# Custom timeout and concurrency
npm run start:cli -- --timeout 8000 --concurrency 50

# Filter by type
npm run start:cli -- --type http

# Filter by country code
npm run start:cli -- --country US

# Limit results
npm run start:cli -- --limit 20 --output proxies.txt

# Export format
npm run start:cli -- --format json

# Quiet mode (no progress output)
npm run start:cli -- --quiet

# Suppress the startup banner
npm run start:cli -- --no-banner
```

### CLI Options

| Option | Description | Default |
|--------|-------------|---------|
| `--timeout <ms>` | Connection timeout per proxy | 5000 |
| `--concurrency <n>` | Max concurrent checks | 50 |
| `--output <file>` | Save results to file | stdout only |
| `--type <type>` | Proxy type filter (http, https, socks4, socks5, all) | all |
| `--country <code>` | Country code filter (e.g. US) | all |
| `--anonymous` | Only anonymous/elite proxies | off |
| `--limit <n>` | Stop after N working proxies | unlimited |
| `--format <fmt>` | Output format (json, csv, txt) | txt |
| `--quiet` | Suppress progress output | off |
| `--no-banner` | Suppress startup banner | off |
| `--help` | Show help | |

## Web UI Usage

Start the local web server:

```bash
npm run start:server -- --port 3000
```

Open http://localhost:3000 in your browser.

The web UI provides:

- Real-time scan progress with SSE streaming
- Sortable results table with latency bars
- Filter and search working proxies
- Copy individual proxy addresses
- Export results as JSON or CSV
- Light and dark theme toggle
- Keyboard shortcuts (Enter = scan, Esc = stop, F = filter, S = sources, T = theme)

## Export Formats

- **JSON**: Full structured data with all metadata
- **CSV**: Tabular format with headers (IP, Port, Type, Latency, Country, Anonymity)
- **TXT**: Simple `ip:port` per line

## Screenshots

Screenshots are being added under `docs/screenshots/`. Planned captures:

- CLI help output
- CLI validation run in progress
- Web UI homepage
- Web UI results and export view

## Proxy Sources

The tool aggregates proxies from multiple public sources:

- ProxyScrape
- Geonode
- PubProxy
- free-proxy-list.net
- TheSpeedX Proxy List
- Proxifly Free Proxy List
- ErcinDedeoglu proxies
- Monosans proxy list
- clarketm proxy list
- KangProxy
- Vakhov fresh proxy list
- ShiftyTR Proxy List
- Jetkai proxy list
- Iplocate free proxy list
- OpenProxyList
- sunny9577 proxy scraper
- MuRongPIG Proxy Master
- Roosterkid open proxy list

Sources can be individually enabled or disabled in the web UI.

## Responsible Use

This tool is intended for legitimate development, QA, research, and network testing. Do not use it for:

- Spam or abuse
- Credential attacks
- Scraping against terms of service
- Bypassing access controls
- Any unauthorised activity

Only use proxies against systems you own or have explicit permission to test. Respect the terms of service of proxy sources and target systems.

## Roadmap

See [ROADMAP.md](ROADMAP.md) for planned features and milestones.

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## Security

Report security issues per our [SECURITY.md](SECURITY.md) policy.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history.

## License

MIT
