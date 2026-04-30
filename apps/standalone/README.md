# `apps/standalone/` — Theia Electron shell

Standalone desktop app version of the BPMN/DMN modeler — same modeling and
deployment features as the VS Code extension, no VS Code required. Built on
[Eclipse Theia](https://theia-ide.org/) and packaged with Electron, loading
the same `.vsix` that ships to the VS Code Marketplace.

![BPMN Modeler Preview](https://raw.githubusercontent.com/Miragon/bpmn-modeler/main/images/modeler-preview.png)

> Same modeling surface as the VS Code extension — the screenshot above is
> the modeler running in VS Code; the standalone app shows the exact same
> editor inside a Theia/Electron window.

> **Status:** build-from-source, not yet released. Distribution channels and
> a product name will be announced once the desktop target is ready for
> general availability.

This workspace is **opt-in**. It is intentionally *not* included in the root
`build` / `test` / `lint` scripts. Run its scripts explicitly.

## Requirements

- Node.js **>= 22** (matches Theia Blueprint)
- Yarn 4 via corepack (repo-wide `packageManager` setting)
- macOS, Linux, or Windows with native-module build toolchain
  (Xcode Command Line Tools / build-essential / MSVC Build Tools)

## Local workflow (dev mode)

```bash
# 1. Build the extension .vsix from the repo root
corepack yarn install
corepack yarn build
(cd dist/apps/modeler-plugin && \
 npx @vscode/vsce package --out bpmn-modeler-plugin.vsix --yarn --no-dependencies)

# 2. Unpack the .vsix into this workspace's plugins/ directory
corepack yarn workspace @miragon/bpmn-modeler-standalone bundle

# 3. Rebuild Theia's native modules against Electron's Node ABI
corepack yarn workspace @miragon/bpmn-modeler-standalone run rebuild

# 4. Build Theia (webpack frontend + backend bundles)
corepack yarn workspace @miragon/bpmn-modeler-standalone build

# 5. Launch the Electron app in dev mode
corepack yarn workspace @miragon/bpmn-modeler-standalone start
```

> **Note:** step 3 must be invoked as `yarn ... run rebuild`, not `yarn ...
> rebuild` — Yarn 4 reserves `rebuild` as a built-in command and won't dispatch
> to our script otherwise.

## Building the macOS `.dmg`

End-to-end recipe — start from a clean `apps/standalone/` and run from the
**repo root**:

```bash
# 1. Build the .vsix
corepack yarn install
corepack yarn build
(cd dist/apps/modeler-plugin && \
 npx @vscode/vsce package --out bpmn-modeler-plugin.vsix --yarn --no-dependencies)

# 2. Unpack it into apps/standalone/plugins/
corepack yarn workspace @miragon/bpmn-modeler-standalone bundle

# 3. Rebuild native modules
corepack yarn workspace @miragon/bpmn-modeler-standalone run rebuild

# 4. Pick one packaging script:
corepack yarn workspace @miragon/bpmn-modeler-standalone run package          # unsigned (Gatekeeper warning)
corepack yarn workspace @miragon/bpmn-modeler-standalone run package:signed   # signed + notarized (no warning)
```

| Script | Use it for | Apple secrets needed |
|---|---|---|
| `package` | Local smoke testing | None |
| `package:signed` | Building a release-quality DMG locally | Yes (see Releasing) |
| `package:release` | CI only — signs, notarizes, **publishes** to GitHub Releases | Yes |

**Output:** `apps/standalone/dist/Miragon BPMN Modeler-<version>-arm64.dmg`
(~150 MB on Apple Silicon). The `<version>` comes from
`apps/standalone/package.json`.

`package:signed` needs `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`,
`APPLE_TEAM_ID` as env variables and a Developer ID Application cert in
the login keychain. See [Releasing](#releasing) below for the full setup.

## Releasing

CI handles releases via two workflows:

- `.github/workflows/prepare-release-standalone.yml` — manual
  (`workflow_dispatch`). Bumps `apps/standalone/package.json`, commits,
  tags `standalone-vX.Y.Z`, creates the GitHub Release.
- `.github/workflows/publish-standalone.yml` — fires on
  `release: published` for `standalone-v*` tags. Runs on `macos-latest`,
  builds the `.vsix`, bundles it, signs with the Apple Developer ID cert,
  notarizes, and uploads the `.dmg` + `latest-mac.yml` to the release.
  Existing installs pick up updates via `electron-updater` on next launch.

To cut a release:

1. Go to **Actions** → **Prepare Release Standalone** → **Run workflow**,
   pick `patch` / `minor` / `major`. The prepare workflow tags + creates
   the release.
2. The `release: published` event auto-triggers **Publish Standalone**,
   which produces and uploads the signed DMG.

Both workflows accept a `dry-run` input. See
[Release process](../../docs/vscode/contributing/release-process.md) for
the full pipeline diagram and the equivalent flow for the VS Code
extension and the c7 npm lib.

After the release is published, `.github/workflows/standalone-homebrew.yml`
automatically updates the Cask formula in
[Miragon/homebrew-tap](https://github.com/Miragon/homebrew-tap) so that
`brew upgrade --cask miragon-bpmn-modeler` picks up the new version.

**Required GitHub repo secrets** (one-time setup):

| Secret | Source |
|---|---|
| `CSC_LINK` | base64 of the Developer ID Application `.p12` |
| `CSC_KEY_PASSWORD` | password for the `.p12` |
| `APPLE_ID` | Apple ID email of a Miragon team member |
| `APPLE_APP_SPECIFIC_PASSWORD` | generated at appleid.apple.com |
| `APPLE_TEAM_ID` | `G5JZQ328LJ` |
| `HOMEBREW_TAP_TOKEN` | PAT with `repo` scope on `Miragon/homebrew-tap` |

## Structure

```
apps/standalone/
├── package.json            Theia deps + scripts
├── tsconfig.json
├── electron-builder.yml    macOS / Windows / Linux build targets (unsigned)
├── scripts/
│   ├── bundle-extension.mjs   Copy .vsix from dist/apps/modeler-plugin
│   └── theia-electron-main.js Electron main entry (points at ./plugins)
├── resources/
│   └── icon.png            Placeholder icon (production needs .icns/.ico)
├── plugins/                Gitignored — populated by `yarn bundle`
├── src-gen/                Gitignored — Theia generates this
├── lib/                    Gitignored — Theia build output
└── dist/                   Gitignored — electron-builder output
```

## Notes for hacking locally

- **Workspace trust disabled:** `security.workspace.trust.enabled: false`
  in `package.json` is intentional for a single-purpose app. Keep it
  disabled in production.
- **`@theia/terminal` in scope:** terminal is a hard transitive dep of
  `@theia/plugin-ext`. The terminal view is hidden at runtime via
  `HideBuiltinViewsContribution`.
- **Auto-update:** active only in packaged builds (`app.isPackaged`); a
  no-op during `yarn start` in dev mode.

## Related

- Issue: [#917](https://github.com/Miragon/bpmn-modeler/issues/917)
