# `apps/standalone/` — Theia Electron shell

Standalone desktop app version of the BPMN/DMN modeler — same modeling and
deployment features as the VS Code extension, no VS Code required. Built on
[Eclipse Theia](https://theia-ide.org/) and packaged with Electron, loading
the same `.vsix` that ships to the VS Code Marketplace.

![BPMN Modeler Preview](https://raw.githubusercontent.com/Miragon/bpmn-vscode-modeler/main/images/modeler-preview.png)

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
corepack yarn workspace standalone bundle

# 3. Rebuild Theia's native modules against Electron's Node ABI
corepack yarn workspace standalone run rebuild

# 4. Build Theia (webpack frontend + backend bundles)
corepack yarn workspace standalone build

# 5. Launch the Electron app in dev mode
corepack yarn workspace standalone start
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
corepack yarn workspace standalone bundle

# 3. Rebuild native modules
corepack yarn workspace standalone run rebuild

# 4. Pick one packaging script:
corepack yarn workspace standalone run package          # unsigned (Gatekeeper warning)
corepack yarn workspace standalone run package:signed   # signed + notarized (no warning)
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

CI handles releases via `.github/workflows/release-standalone.yml`.

To cut a release:

1. Bump `apps/standalone/package.json` `version` to match
   `apps/modeler-plugin/package.json`.
2. Commit + push to `main`.
3. `git tag standalone-v<version> && git push --tags`.

CI runs on `macos-latest`, builds the `.vsix`, bundles it, signs with the
Apple Developer ID cert (from GitHub secrets), submits for notarization,
and publishes the `.dmg` + `latest-mac.yml` to the GitHub Release matching
the tag. Existing installs pick up updates via `electron-updater` on next
launch.

**Required GitHub repo secrets** (one-time setup):

| Secret | Source |
|---|---|
| `CSC_LINK` | base64 of the Developer ID Application `.p12` |
| `CSC_KEY_PASSWORD` | password for the `.p12` |
| `APPLE_ID` | Apple ID email of a Miragon team member |
| `APPLE_APP_SPECIFIC_PASSWORD` | generated at appleid.apple.com |
| `APPLE_TEAM_ID` | `G5JZQ328LJ` |

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

- Issue: [#917](https://github.com/Miragon/bpmn-vscode-modeler/issues/917)
