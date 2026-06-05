# Issue Draft -- Add More Test Coverage

**Title:** Expand unit and integration test coverage

**Labels:** `testing`, `enhancement`

## Problem

Current unit tests cover proxy parsing, deduplication, and export formatting. There are no tests for:

- Proxy validation logic (`checkProxy`)
- Source fetching (with mocked HTTP)
- Filtering logic (type, country, anonymity)
- CLI argument parsing
- Web UI HTTP endpoints
- Edge cases (empty lists, malformed data, timeouts)

## Proposed solution

- Add unit tests for `checkProxy` with mocked HTTP responses
- Add tests for filtering by type, country, and anonymity
- Add tests for CLI argument parsing
- Add tests for the web server endpoints
- Add edge case tests (empty input, invalid data, boundary values)
- Use `node:test` and `node:assert` (no external test framework)

## Acceptance criteria

- [ ] All existing tests still pass
- [ ] Test coverage includes proxy validation (mocked)
- [ ] Test coverage includes all filter types
- [ ] Test coverage includes CLI arg parsing
- [ ] Edge cases are covered
