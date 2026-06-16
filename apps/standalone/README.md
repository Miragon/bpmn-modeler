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
(cd dist/apps/vscode-plugin && \
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

## Building installers

The packaging scripts produce a platform-appropriate installer for whichever
OS you run them on — DMG on macOS, NSIS `.exe` on Windows. electron-builder
defaults to the host OS; no cross-compilation.

End-to-end recipe — start from a clean `apps/standalone/` and run from the
**repo root**:

```bash
# 1. Build the .vsix
corepack yarn install
corepack yarn build
(cd dist/apps/vscode-plugin && \
 npx @vscode/vsce package --out bpmn-modeler-plugin.vsix --yarn --no-dependencies)

# 2. Unpack it into apps/standalone/plugins/
corepack yarn workspace @miragon/bpmn-modeler-standalone bundle

# 3. Rebuild native modules
corepack yarn workspace @miragon/bpmn-modeler-standalone run rebuild

# 4. Pick one packaging script:
corepack yarn workspace @miragon/bpmn-modeler-standalone run package          # unsigned (Gatekeeper warning on macOS, SmartScreen on Windows)
corepack yarn workspace @miragon/bpmn-modeler-standalone run package:signed   # macOS only: signed + notarized (no warning)
```

| Script | Use it for | Apple secrets needed |
|---|---|---|
| `package` | Local smoke testing on any OS | None |
| `package:signed` | Building a release-quality DMG locally (macOS) | Yes (see Releasing) |
| `package:release` | CI only — signs, notarizes, **publishes** to GitHub Releases | Yes |

**Output by platform:**

| Host OS | Artifact | Path |
|---|---|---|
| macOS | DMG | `apps/standalone/dist/Miragon.BPMN.Modeler-<version>-arm64.dmg` |
| Windows | NSIS installer | `apps/standalone/dist/Miragon.BPMN.Modeler-<version>-x64.exe` |

The `<version>` comes from `apps/standalone/package.json`.

`package:signed` needs `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`,
`APPLE_TEAM_ID` as env variables and a Developer ID Application cert in
the login keychain. See [Releasing](#releasing) below for the full setup.

### Windows notes

- **Build toolchain:** install [Visual Studio Build Tools](https://visualstudio.microsoft.com/downloads/) with the "Desktop development with C++" workload, plus Python 3 (required by `node-gyp` for native module rebuilds).
- **Install the app:** double-click the `.exe`; NSIS walks through the usual install flow and registers the `.bpmn` / `.dmn` file associations.
- **SmartScreen warning:** the build is unsigned, so Windows will show "Windows protected your PC" on first launch. Click *More info → Run anyway*. Production code signing is on the roadmap.

### Auto-update on Windows

Auto-update is wired via `electron-updater` on both platforms. The CI pipeline uploads `latest-mac.yml` and `latest.yml` to each GitHub Release, so existing installs find the new version on next launch. The first release that ships the Windows yml file is the starting point — anything installed from an earlier release has to be upgraded manually once.

## Releasing

The standalone shares **one version and one `v<version>` GitHub Release** with
all other hosts. release-please cuts the tag + release from `main`; the
standalone is then **published manually** against that tag — it does not have
its own version bump or tag anymore. See
[Release process](../../docs/vscode/contributing/release-process.md) for the
shared model.

Publishing is a single orchestrator that chains two sub-workflows, each
independently runnable for reruns:

- `.github/workflows/release-standalone.yml` — **single entry point**
  (`workflow_dispatch`). Takes the `version` to publish (the release tag is
  `v<version>`) and runs publish → homebrew in sequence, propagating `dry-run`.
- `.github/workflows/publish-standalone.yml` — builds the `.vsix` on
  `ubuntu-latest`, then fans out to two packaging jobs on their native runners
  (`macos-latest` for the signed + notarized DMG, `windows-latest` for the NSIS
  installer). Each job uploads its platform artifact plus its `electron-updater`
  manifest (`latest-mac.yml` / `latest.yml`) to the `v<version>` release, and a
  final job records a `standalone` deployment. Existing installs pick up updates
  on next launch.
- `.github/workflows/publish-standalone-homebrew.yml` — updates the Cask
  formula in [Miragon/homebrew-tap](https://github.com/Miragon/homebrew-tap)
  so `brew upgrade --cask miragon-bpmn-modeler` picks up the new version.

To publish a release:

1. Make sure release-please's Release PR is merged, so the `v<version>` tag and
   GitHub Release exist.
2. Go to **Actions** → **Release Standalone** → **Run workflow**.
3. Enter the `version` (e.g. `1.2.3`), toggle `dry-run` on/off (defaults to
   off), optionally tick `skip-homebrew` if you only want the installers.
4. The orchestrator runs `publish` → `homebrew` automatically. In dry-run mode
   nothing is uploaded or pushed; the installers land as workflow artifacts and
   the cask formula is only logged.

The orchestrator pauses before the Homebrew step if the `homebrew-tap`
environment has a required reviewer configured (see *Approval gate* below).

**Single-step reruns:** Each sub-workflow keeps its own `workflow_dispatch`
trigger. Use these for debugging a single phase without re-running the
whole chain.

**Required GitHub repo secrets** (one-time setup):

| Secret | Source |
|---|---|
| `CSC_LINK` | base64 of the Developer ID Application `.p12` |
| `CSC_KEY_PASSWORD` | password for the `.p12` |
| `APPLE_ID` | Apple ID email of a Miragon team member |
| `APPLE_APP_SPECIFIC_PASSWORD` | generated at appleid.apple.com |
| `APPLE_TEAM_ID` | `G5JZQ328LJ` |
| `RELEASE_PAT` | PAT with `repo` scope, used by `prepare` to push commits/tags |
| `HOMEBREW_TAP_TOKEN` | PAT with `repo` scope on `Miragon/homebrew-tap` (recommended: scope to the `homebrew-tap` environment, see below) |

### Approval gate / environment setup

The Homebrew tap update is the only step that publishes to a public
destination outside this repo. The workflow expects a GitHub environment
named `homebrew-tap`. To configure a manual approval gate before each
tap push:

1. Repo *Settings* → *Environments* → **New environment** → name it
   `homebrew-tap`.
2. *Deployment protection rules* → **Required reviewers** → add at least
   one maintainer.
3. (Recommended) move `HOMEBREW_TAP_TOKEN` from *Repository secrets* to
   the `homebrew-tap` environment's *Environment secrets* — tightens
   blast radius so the token is only usable from this gated job.

The orchestrator pauses on the Homebrew job until a reviewer approves.
Wait time is free in terms of runner minutes. If you skip step 2, the
chain runs through without a gate; dry-run remains the only safety net.

## Structure

```
apps/standalone/
├── package.json            Theia deps + scripts
├── tsconfig.json
├── electron-builder.yml    macOS / Windows build targets (unsigned)
├── scripts/
│   ├── bundle-extension.mjs   Copy .vsix from dist/apps/vscode-plugin
│   └── theia-electron-main.js Electron main entry (points at ./plugins)
├── resources/
│   ├── icon.png            App icon (macOS auto-derives .icns)
│   └── icon.ico            Windows icon (16/32/48/256, multi-resolution)
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
