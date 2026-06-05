# Add more test coverage

## Problem

Tests cover parsing and export formatting, but leave runtime proxy-check paths thin.

## Proposed solution

Add unit tests for:

- `detectAnonymity`
- `getTestConfig`
- CLI argument parsing boundaries
- Server request routing for `/api/scan`

If held back by network dependencies, prefer lightweight mocks/stubs.

## Acceptance criteria

- Coverage is increased with focused, fast tests
- `npm test` remains reliable offline

## Labels

`testing`, `enhancement`, `good first issue`
