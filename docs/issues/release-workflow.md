# Add GitHub Actions release workflow

## Problem

Releases are manual and incomplete.

## Proposed solution

Add a workflow on tag push.

- Build/changelog note trigger on tag
- Publish GitHub Release notes from `CHANGELOG.md`
- Optionally attach artifacts if applicable

## Acceptance criteria

- Pushing `v*` creates a draft or published release
- Release notes contain the changelog section for that version

## Labels

`enhancement`, `ci/cd`, `good first issue`
