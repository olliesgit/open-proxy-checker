# Issue Draft -- Docker Support

**Title:** Add Docker support

**Labels:** `enhancement`, `docker`

## Problem

Users who want to run the proxy checker in containerised environments or CI pipelines currently need Node.js installed manually. A Docker image would simplify setup and make the tool more portable.

## Proposed solution

- Create a `Dockerfile` based on `node:20-alpine`
- Copy source, install dependencies, expose port for web UI
- Provide `ENTRYPOINT` for CLI and `CMD` for web server
- Add `docker-compose.yml` with port mapping
- Update docs with Docker usage instructions
- Build for `linux/amd64` and `linux/arm64`

## Acceptance criteria

- [ ] `docker build -t proxy-checker .` succeeds
- [ ] `docker run proxy-checker --help` works
- [ ] `docker run proxy-checker` runs the web server on port 3000
- [ ] `docker-compose up` starts everything
- [ ] Docs cover Docker usage
