# Security Policy

## Scope

This repository is a local proxy validation utility intended for legitimate development, testing, and research workflows. It does not provide packet capture, traffic interception, or offensive security capabilities.

The tool fetches public proxy lists, validates them locally, and produces output files. All processing happens on your own machine -- no data is uploaded or transmitted to external services beyond the initial proxy list fetches and validation checks against httpbin.org.

## Reporting vulnerabilities

If you find a security issue, please do not open a public issue with exploit steps.

Preferred reporting method:

- Email: opensource@example.com

Include:

- A description of the issue
- Affected versions if known
- Steps to reproduce with a minimal case
- Any remediation suggestion if available

You will receive an acknowledgement within 5 business days. We aim to resolve confirmed issues within 30 days.

## In scope

- Dependency or library vulnerabilities
- Local host loop bugs, path handling risks, or unsafe default behaviour
- Privacy or credential-handling concerns in local output files
- Cross-site scripting or injection risks in the web UI

## Out of scope

- Network reliability or uptime of upstream proxy sources
- Use of this tool by third parties for unauthorised access
- Proxy availability or latency of validated proxies over time

## Responsible use

Use this software only against systems you own or where you have explicit permission to test. The intended uses are:

- Legitimate development and debugging
- QA testing with proxy configurations
- Network research and analysis
- Educational purposes

Do not use this tool for:

- Spam or abuse
- Credential stuffing or attacks
- Scraping against terms of service
- Bypassing access controls
- Any unauthorised network activity
