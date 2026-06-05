# Improve proxy source configuration

## Problem

Adding or disabling proxy sources currently requires code edits.

## Proposed solution

Move source registry to a configurable file or mapping.

- Add `config/sources.json` with enabled sources / timeouts
- CLI/web UI can read it or fall back to defaults
- Keep current behavior as default

## Acceptance criteria

- Source list can be overridden without editing source code
- Existing tests continue to pass

## Labels

`enhancement`, `core`, `help wanted`
