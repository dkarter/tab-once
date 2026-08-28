# TabOnce

TabOnce is a Manifest V3 browser extension that focuses an existing matching tab instead of
leaving a duplicate open. It is opt-in: URLs are only deduplicated when they match a rule you
define.

## Rules

Each rule has a base URL and a path pattern. Pattern segments work as follows:

- Literal segments match themselves.
- `:name` or `*` matches one segment and keeps its value as part of the URL identity.
- A final `/**` matches deeper paths but excludes them from the URL identity.
- Query strings and fragments can be included or ignored independently.

For GitHub pull requests, use:

```text
Base URL:    https://github.com
Path pattern: /:owner/:repo/pull/:number/**
```

With query strings and fragments ignored, opening
`https://github.com/dkarter/dotfiles/pull/1` focuses an existing tab at
`https://github.com/dkarter/dotfiles/pull/1/files#comment_123`.

For an observability service where each dashboard is identified by its first segment, use a rule
like:

```text
Base URL:    https://grafana.example.com/dashboards
Path pattern: /:dashboard/**
```

Rules are checked in displayed order. The first matching rule determines a URL's identity.

Enabled rules can also intercept ordinary same-tab link clicks on their base site. When the
destination is already open, TabOnce leaves the current page untouched and focuses the existing
tab. If no matching tab exists, navigation proceeds normally. Site access is optional and
requested separately for each configured origin.

Tabs opened as new tabs are handled separately: when a matching tab already exists, TabOnce closes
the new duplicate and focuses the existing tab. Automatic duplicate closure never applies to a
navigation in an established tab.

## Development

Install the pinned tools and dependencies, then run the checks:

```sh
mise install
aube install
mise run check
```

To load the extension in Helium, Chrome, or another Chromium browser:

1. Run `mise run build`.
2. Open `chrome://extensions` in Helium.
3. Enable Developer mode.
4. Choose **Load unpacked** and select the generated `dist` directory.
5. Open the extension's details and choose **Extension options** to add rules.

The toolbar button opens the quick rule toggle popup, which links to the full options page.

To regenerate the committed PNG icons after changing `public/icon.svg`, run:

```sh
mise run icons:generate
```

To load the extension temporarily in Firefox or Zen:

1. Run `mise run build`.
2. Open `about:debugging#/runtime/this-firefox`.
3. Choose **Load Temporary Add-on**.
4. Select `dist/manifest.json`.

Firefox and Zen remove temporary add-ons when the browser restarts. A signed package is required
for permanent installation.

## Testing changes

Source changes are not automatically reflected in a loaded extension. After making changes:

1. Run `mise run build` to regenerate `dist`.
2. In Helium or Chromium, choose **Reload** for TabOnce on `chrome://extensions`.
3. In Firefox or Zen, choose **Reload** for TabOnce on
   `about:debugging#/runtime/this-firefox`.

## Releases

Release Please manages semantic versions, changelog entries, and GitHub releases from
Conventional Commits. Store publication runs automatically after a release pull request is
merged. See [Publishing Setup](docs/publishing.md) for the required store accounts and GitHub
secrets.
