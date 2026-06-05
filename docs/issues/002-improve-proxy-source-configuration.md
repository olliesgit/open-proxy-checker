# Issue Draft -- Improve Proxy Source Configuration

**Title:** Make proxy sources configurable via CLI and config file

**Labels:** `enhancement`, `configuration`

## Problem

Currently, proxy sources are hardcoded in the source code. Users cannot add, remove, or customise sources without editing JavaScript files. They also cannot control individual source settings like custom timeout per source or custom validation endpoints.

## Proposed solution

- Add a config file (e.g. `proxy-sources.json` or YAML) that lists sources with URL, type, and optional timeout
- Allow `--sources <file>` CLI flag to point to a custom config
- Support enabling/disabling individual sources via CLI (e.g. `--skip-source Geonode`)
- Keep built-in defaults that load if no config file is provided
- Document the config file format in README

## Acceptance criteria

- [ ] Config file format is documented
- [ ] `--sources ./my-sources.json` loads custom sources
- [ ] Built-in sources still work without a config file
- [ ] All existing tests pass
