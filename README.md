# Open Proxy Checker

Open Proxy Checker is a local CLI and browser-based tool for collecting, deduplicating, validating, filtering, and exporting public proxy lists.

## Features

- CLI and local web UI
- Aggregate proxies from multiple public sources with deduplication
- Validate working proxies concurrently
- Filter by type, country, and anonymity
- Export results as CSV, JSON, or TXT
- No result upload by default

## Requirements

- Node.js 18+
- npm

## Installation

```bash
git clone https://github.com/olliesgit/open-proxy-checker.git
cd open-proxy-checker
npm install
```

## CLI usage

```bash
npm run start:cli -- --help
```

Common flags:
- `--timeout <ms>`
- `--concurrency <n>`
- `--output <file>`
- `--type http|https|socks4|socks5|all`
- `--country <code>`
- `--anonymous`
- `--limit <n>`
- `--quiet`
- `--no-banner`

## Web UI usage

```bash
npm run start:server -- --port 3000
```

Open `http://localhost:3000`.

## Example commands

```bash
npm run start:cli -- --type http --country US --limit 20 --output proxies.txt
```

## Export formats

- CSV via UI export
- JSON via UI export
- TXT via `--output`

## Responsible use

This tool is intended for legitimate development, testing, and research workflows. Use it only against systems you own or where you have explicit permission to test.

## Roadmap

See `ROADMAP.md`.

## Contributing

See `CONTRIBUTING.md`.

## Security

See `SECURITY.md`.

## License

MIT


