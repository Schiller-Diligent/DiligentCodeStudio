# Diligent Code Studio v0.6.10 Lockfile Registry Fix

This hotfix corrects `package-lock.json` entries that still pointed to an internal/private npm registry even though npm was configured to use the public registry.

## Problem

GitHub Actions showed npm using `https://registry.npmjs.org/`, but `npm ci` still tried to download packages from:

```text
https://packages.applied-caas-gateway1.internal.api.openai.org/artifactory/api/npm/npm-public/
```

That happened because `npm ci` follows the `resolved` tarball URLs stored in `package-lock.json`.

## Fix

The lockfile tarball URLs were changed to use:

```text
https://registry.npmjs.org/
```

The CI install script now also checks `package-lock.json` before running `npm ci` and stops early if an internal/private registry URL is accidentally reintroduced.

## Validation

Before publishing a release, run:

```powershell
npm ci
npm run validate
npm run build
npm run audit:npm
```

Then run the GitHub Actions quality workflow again.
