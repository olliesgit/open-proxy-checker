# Roadmap

## v0.1.x -- Stability

- [x] Basic CLI with proxy fetching, validation, and output
- [x] Basic web UI with real-time scan results
- [x] Unit tests for proxy parsing, deduplication, and export
- [x] GitHub Actions CI
- [ ] Add more test coverage
- [ ] Improve error handling and source timeout behaviour
- [ ] Improve timeout and concurrency documentation
- [ ] Add screenshot examples to docs

## v0.2.x -- Testing and CI

- [ ] Add unit tests for proxy validation logic
- [ ] Add integration tests for source fetching (with mocks)
- [ ] Improve proxy source configuration (enable/disable per source via CLI)
- [ ] Add security review notes and dependency audit

## v0.3.x -- Packaging and Docker

- [ ] Add Docker image with multi-arch support (linux/amd64, linux/arm64)
- [ ] Add Docker Compose example
- [ ] Add release automation (GitHub Actions release workflow)
- [ ] Add npm/packaging improvements (shebang, executable path)

## Future ideas

- Structured result formats with health check history
- Proxy rotation helper scripts
- Expand proxy source coverage
- Improve web UI with filtering and sort persistence
- Rate-limit aware source fetching with backoff
- Optional --daemon mode for continuous checking
