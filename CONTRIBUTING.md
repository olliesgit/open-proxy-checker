# Contributing

Thanks for improving this project. All contributions are welcome.

## Local setup

```bash
git clone https://github.com/olliesgit/open-proxy-checker.git
cd open-proxy-checker
npm install
```

## Running the CLI

```bash
npm run start:cli
```

Use `--help` to see all available options:

```bash
npm run start:cli -- --help
```

## Running the web UI

```bash
npm run start:server -- --port 3000
```

Open http://localhost:3000 in your browser.

## Running tests

```bash
npm test
npm run smoke
```

Both must pass before submitting changes.

## Opening issues

- Use the provided issue templates when possible
- Include your Node.js version and operating system
- Include steps to reproduce for bug reports
- Be specific about what you expect vs what happens

## Opening pull requests

1. Create a feature branch from `main`
2. Make your changes with clear commit messages
3. Include context and rationale in the PR description
4. Keep changes focused and reviewable
5. Update docs if behaviour changes
6. Ensure tests pass and the smoke test passes

## Code style

- Node.js ESM (`.mjs` extensions)
- Small, focused, testable utilities
- No personal data, local paths, or credentials in shipped files
- Use `node:test` for unit tests (no external test framework)

## Responsible use expectations

This tool is intended for legitimate development, QA, research, and network testing. Only use it against systems you own or are authorised to test. Contributions that encourage or facilitate abuse will not be accepted.
