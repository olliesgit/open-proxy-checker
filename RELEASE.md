# Release Guide

## Steps

1. Ensure you are on `main` with all changes committed and pushed.

```bash
git checkout main
git pull origin main
```

2. Verify everything is clean.

```bash
npm install
npm test
npm run smoke
git status
```

3. Tag the release.

```bash
git tag v0.1.0
git push origin v0.1.0
```

4. Create a GitHub Release.

   - Go to https://github.com/olliesgit/open-proxy-checker/releases
   - Click "Draft a new release"
   - Choose the tag: `v0.1.0`
   - Title: `v0.1.0 -- Initial open-source release`
   - Paste the relevant section from `CHANGELOG.md` as the description
   - Publish release

5. Optional: publish to npm.

```bash
npm publish
```

## Versioning

This project follows [Semantic Versioning](https://semver.org/).

- **MAJOR** -- breaking API or behaviour changes
- **MINOR** -- new features, backwards compatible
- **PATCH** -- bug fixes, documentation, internal improvements

Before each release:

- Update `CHANGELOG.md`
- Update version in `package.json`
- Run full test suite and smoke test
- Push and tag
