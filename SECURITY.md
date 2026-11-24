# Security policy

## Supported version

Security fixes are made on the latest version in the `main` branch.

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting for this repository. If private reporting is not enabled, ask a repository maintainer to enable it before sharing exploit details. Do not include customer archives, credentials, or proprietary XML in a public issue.

## Security model

The application is designed to process user-selected archives locally in the browser. It has no application backend. Archive parsing and rebuilding include limits and path validation, but untrusted archives can still consume local CPU, memory, and browser storage. Only open archives you are authorized to inspect.
