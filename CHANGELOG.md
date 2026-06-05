# Changelog

## v0.1.0 -- Initial open-source release

- Added local CLI proxy checker with concurrent validation
- Added local web UI with real-time scan results via SSE
- Added public proxy source fetching from 18+ sources
- Added proxy deduplication across all sources
- Added filtering by type, country, and anonymity
- Added export support for JSON, CSV, and TXT formats
- Added sortable results table with latency bars in web UI
- Added light/dark theme toggle in web UI
- Added keyboard shortcuts for common actions in web UI
- Added unit tests for proxy parsing, deduplication, and export formatting
- Added smoke test for CLI and server startup
- Added GitHub Actions CI workflow
- Added ASCII banner for CLI with `--no-banner` flag
- Added colorized terminal output with latency-based coloring
- Added progress bar during proxy validation
- Added `--version` CLI flag
- Added anonymity detection (transparent vs elite) in both CLI and server
- Added source fetching from 18 public sources in the CLI (previously 4)
- Added shared source module used by both CLI and server
- Added JSDoc annotations to all source modules
- Added CODE_OF_CONDUCT, SUPPORT, FUNDING, .editorconfig
- Added release guide and issue templates
- Added MIT license
- Added initial documentation, contributing guide, security policy, and roadmap
