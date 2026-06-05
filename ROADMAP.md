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

## v0.3.x -- Quality and Resilience

- [ ] Disk-based proxy cache (last-seen, latency, reliability score, TTL)
- [ ] Validation endpoint fallback chain (httpbin -> icanhazip -> google)
- [ ] Retry with exponential backoff on source fetching
- [ ] Circuit breaker on concurrent validation pool
- [ ] Intelligent dedup that merges metadata across sources
- [ ] Per-source health tracking and smart fetch ordering
- [ ] Error classification and observability (timeout vs refused vs SSL)
- [ ] Fix web UI source list mismatch (remove ghost sources, align with registry)
- [ ] Improve anonymity detection (transparent / anonymous / elite tiers)

## Future ideas

- Structured result formats with health check history
- Proxy rotation helper scripts
- Expand proxy source coverage
- Improve web UI with filtering and sort persistence
- Optional --daemon mode for continuous checking
- GitHub raw source caching to avoid rate limits
