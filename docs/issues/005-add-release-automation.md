# Issue Draft -- Add Release Automation

**Title:** Automate releases with GitHub Actions

**Labels:** `enhancement`, `ci`

## Problem

Releases are currently manual: tag, push, create GitHub Release. This is error-prone and inconsistent. An automated release workflow would ensure every tag follows the same process.

## Proposed solution

- Add a GitHub Actions workflow triggered on `v*` tag pushes
- Workflow steps:
  1. Check out code
  2. Install dependencies
  3. Run tests
  4. Run smoke tests
  5. Build (if needed for Docker)
  6. Create GitHub Release with changelog notes
  7. Optionally publish to npm
- Use `softprops/action-gh-release` or `ncipollo/release-action` for release creation
- Pull release notes from `CHANGELOG.md` matching the tag version

## Acceptance criteria

- [ ] Pushing `v0.2.0` triggers the workflow
- [ ] Tests and smoke test run before release is created
- [ ] GitHub Release is created with correct tag and notes
- [ ] Workflow fails gracefully if tests fail
