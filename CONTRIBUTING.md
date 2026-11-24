# Contributing

Thanks for improving IRIS Explorer.

## Before opening a pull request

1. Keep all archive processing browser-only; do not add telemetry, uploads, or external application APIs without a documented privacy review.
2. Never commit customer archives, credentials, browser storage exports, or other proprietary data. Archive extensions and common key-store formats are ignored deliberately.
3. Add or update focused tests for parsing, safety, storage, or packaging behavior.
4. Run `npm test` and `npm run build` locally.
5. Describe user-visible behavior and any privacy or security effect in the pull request.

## Scope

Changes should preserve support for static hosting, including GitHub Pages. Do not rely on a server, server-side rendering, or runtime environment secrets.

## Reporting bugs

Use a GitHub issue with the browser version, a minimal reproducible archive or synthetic fixture that you are allowed to share, the expected result, and the actual result. Remove credentials, internal hostnames, customer names, and proprietary route content before attaching anything.
