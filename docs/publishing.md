# Publishing Setup

Release Please maintains the release pull request, `CHANGELOG.md`, `package.json`, and the
extension manifest version. Merging that pull request creates a GitHub release and starts the
Chrome and Firefox publishing jobs in parallel. Each release includes browser-specific Chrome and
Firefox archives, the reviewer source archive, and SHA-256 checksums generated from the tagged
commit.

## GitHub

In **Settings > Actions > General**, allow GitHub Actions to create pull requests. The workflow
uses `GITHUB_TOKEN` by default. To ensure CI runs on Release Please pull requests, create a
fine-grained personal access token with repository **Contents** and **Pull requests** write access
and save it as `RELEASE_PLEASE_TOKEN`.

## Chrome Web Store

1. Register a Chrome Web Store developer account and enable two-step verification.
2. Create the extension in the Developer Dashboard and complete its listing, privacy, and
   distribution fields. Publish the initial listing manually if the dashboard requires it.
3. Enable the Chrome Web Store API in a Google Cloud project.
4. Create a service account and add its email under the Chrome Web Store Developer Dashboard's
   **Account** section.
5. Create a JSON key for that service account.
6. Add these GitHub Actions secrets:

| Secret                        | Value                                      |
| ----------------------------- | ------------------------------------------ |
| `CHROME_EXTENSION_ID`         | Store item ID                              |
| `CHROME_PUBLISHER_ID`         | Publisher ID from **Publisher > Settings** |
| `CHROME_SERVICE_ACCOUNT_JSON` | Complete service-account JSON key          |

## Firefox Add-ons

1. Create a Firefox Add-ons developer account.
2. Submit the first listed version manually using the add-on ID
   `tab-once@dkarter.dev`, and complete the listing metadata.
3. Create API credentials in the AMO Developer Hub.
4. Add these GitHub Actions secrets:

| Secret           | Value                    |
| ---------------- | ------------------------ |
| `AMO_JWT_ISSUER` | AMO API key / JWT issuer |
| `AMO_JWT_SECRET` | AMO API secret           |

Firefox submissions include `artifacts/tab-once-source.zip` for reviewer access to the original
TypeScript and build configuration. Store review and final publication remain subject to each
store's review process.
