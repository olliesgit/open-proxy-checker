# Add Docker support

## Problem

Users without Node.js setup or on non-Windows systems need a simpler way to run the project.

## Proposed solution

Add a minimal container run path.

- `Dockerfile`
- `.dockerignore`
- docs notes: build and run commands
- keep runtime unchanged inside container

## Acceptance criteria

- `docker build -t open-proxy-checker .` succeeds
- `docker run --rm -p 3000:3000 open-proxy-checker` serves the web UI
- Container docs are current

## Labels

`enhancement`, `good first issue`, `infrastructure`
