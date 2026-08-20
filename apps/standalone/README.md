# `apps/standalone/` — Theia Electron shell

Standalone desktop app version of the BPMN/DMN modeler — same modeling and
deployment features as the VS Code extension, no VS Code required. Built on
[Eclipse Theia](https://theia-ide.org/) and packaged with Electron, loading
the same `.vsix` that ships to the VS Code Marketplace.

![BPMN Modeler Preview](https://raw.githubusercontent.com/Miragon/bpmn-modeler/main/images/modeler-preview.png)

> Same modeling surface as the VS Code extension — the screenshot above is
> the modeler running in VS Code; the standalone app shows the exact same
> editor inside a Theia/Electron window.

> Release packages for macOS, Windows, and Linux are available from the
> [Download page](https://miragon.github.io/bpmn-modeler/download).

This workspace is **opt-in**. It is intentionally *not* included in the root
`build` / `test` / `lint` scripts. Run its scripts explicitly.

## Requirements

- Node.js **>= 22** (matches Theia Blueprint)
- Yarn 4 via corepack (repo-wide `packageManager` setting)
- macOS, Linux, or Windows with native-module build toolchain
  (Xcode Command Line Tools / build-essential / MSVC Build Tools)

## Local workflow (dev mode)

```bash
# 1. Build the extension from the repo root
corepack yarn install
corepack yarn build

# 2. Download the built-in plugins, package the .vsix, and populate plugins/
corepack yarn workspace @miragon/bpmn-modeler-standalone prepare-plugin

# 3. Rebuild Theia's native modules against Electron's Node ABI
corepack yarn workspace @miragon/bpmn-modeler-standalone run rebuild

# 4. Build Theia (webpack frontend + backend bundles)
corepack yarn workspace @miragon/bpmn-modeler-standalone build

# 5. Launch the Electron app in dev mode
corepack yarn workspace @miragon/bpmn-modeler-standalone start
```

On Linux systems where Electron's setuid sandbox helper cannot be configured,
use the dedicated local-development command instead of running the app as root:

```bash
corepack yarn workspace @miragon/bpmn-modeler-standalone dev:no-sandbox
```

This disables Chromium's sandbox only for the local Electron process. Packaged
applications and the normal `start` command keep their existing sandbox behavior.

> **Note:** step 3 must be invoked as `yarn ... run rebuild`, not `yarn ...
> rebuild` — Yarn 4 reserves `rebuild` as a built-in command and won't dispatch
> to our script otherwise.

## Detaching editors

BPMN and DMN editors can run in native secondary windows for multi-monitor
workflows. Click the window icon in the editor toolbar (`Move View to Secondary
Window`), then move or resize the resulting window like any other desktop
window.

Closing the secondary window moves its editor back into the main application
window without closing the document. Closing the editor tab inside the
secondary window closes the document normally, including the usual unsaved-file
handling.

Dragging a tab out of the main window and restoring detached windows after an
application restart are not currently supported by Theia. The Linux Flatpak
runs through X11/XWayland, so mixed-DPI behavior should be verified in that
environment rather than native Wayland.

## Building installers

The packaging scripts produce a platform-appropriate installer for whichever
OS you run them on — DMG on macOS, NSIS `.exe` on Windows, and a Flatpak bundle
on Linux. electron-builder defaults to the host OS; no cross-compilation.

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
corepack yarn workspace @miragon/bpmn-modeler-standalone run package:flatpak  # Linux only: local .flatpak bundle
corepack yarn workspace @miragon/bpmn-modeler-standalone run package:signed   # macOS only: signed + notarized (no warning)
```

| Script | Use it for | Apple secrets needed |
|---|---|---|
| `package` | Local smoke testing on any OS (Linux produces an unpacked dir) | None |
| `package:flatpak` | Building a local Linux `.flatpak` bundle | None |
| `package:signed` | Building a release-quality DMG locally (macOS) | Yes (see Releasing) |
| `package:release` | CI only — builds the signed + notarized DMG before the workflow uploads it | Yes |

**Output by platform:**

| Host OS | Artifact | Path |
|---|---|---|
| macOS | DMG | `apps/standalone/dist/Miragon.BPMN.Modeler-<version>-arm64.dmg` |
| Windows | NSIS installer | `apps/standalone/dist/Miragon.BPMN.Modeler-<version>-x64.exe` |
| Linux | Flatpak bundle | `apps/standalone/dist/Miragon.BPMN.Modeler-<version>-x86_64.flatpak` |

The `<version>` comes from `apps/standalone/package.json`.

`package:signed` needs `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`,
`APPLE_TEAM_ID` as env variables and a Developer ID Application cert in
the login keychain. See [Releasing](#releasing) below for the full setup.

### Windows notes

- **Build toolchain:** install [Visual Studio Build Tools](https://visualstudio.microsoft.com/downloads/) with the "Desktop development with C++" workload, plus Python 3 (required by `node-gyp` for native module rebuilds).
- **Install the app:** double-click the `.exe`; NSIS walks through the usual install flow and registers the `.bpmn` / `.dmn` file associations.
- **SmartScreen warning:** the build is unsigned, so Windows will show "Windows protected your PC" on first launch. Click *More info → Run anyway*. Production code signing is on the roadmap.

### Linux Flatpak notes

Local Flatpak packaging wraps electron-builder's Linux `dir` output in a
single-file `.flatpak` bundle. Install the Linux build and Flatpak tooling first:

```bash
sudo apt install \
  flatpak flatpak-builder \
  build-essential python3 make g++ pkg-config \
  libx11-dev libxkbfile-dev libsecret-1-dev \
  desktop-file-utils appstream libxml2-utils

flatpak remote-add --if-not-exists --user flathub https://dl.flathub.org/repo/flathub.flatpakrepo
```

Build the local bundle from the repo root:

```bash
corepack yarn install
corepack yarn workspace @miragon/bpmn-modeler-standalone run package:flatpak
```

Install and run the generated bundle:

```bash
flatpak install --user --bundle apps/standalone/dist/Miragon.BPMN.Modeler-<version>-x86_64.flatpak
flatpak run io.miragon.BpmnModeler
```

Use `--bundle` for the generated `.flatpak` file. `--from` is only for
`.flatpakref` files and will fail by trying to parse the bundle as text.

The Flatpak launcher forces Electron onto X11/Xwayland. Native Wayland support
can be revisited later, but X11 is the stable default recommended for Electron
Flatpaks.

For packaging-only reruns after `apps/standalone/dist/linux-unpacked/` already
exists, use:

```bash
corepack yarn workspace @miragon/bpmn-modeler-standalone run package:flatpak:bundle
```

Flatpak builds disable `electron-updater`; updates should be delivered by
installing a newer Flatpak bundle or, later, through a signed Flatpak repository.
The sandbox does not expose the host's `git` executable, so Theia's Source
Control view is currently unavailable in the Flatpak package.

### Auto-update on macOS and Windows

Auto-update is wired via `electron-updater` on both platforms, using a **generic feed** at a fixed URL rather than the github provider. The github provider resolves updates from the repo-wide `/releases/latest`, which — now that IntelliJ and VS Code release on separate lines — is frequently an IntelliJ release with no `latest-mac.yml`, breaking the check. Instead each standalone publish overwrites a rolling `standalone-latest` prerelease with the newest installers and `latest-mac.yml` / `latest.yml`, and the app reads from `releases/download/standalone-latest/` (see `electron-builder.yml`). Existing installs find the new version on next launch. The first release that ships the Windows yml file is the starting point — anything installed from an earlier release has to be upgraded manually once.

## Releasing

The standalone rides the **VS Code-family release line** (`vscode-v<version>`),
sharing that version and GitHub Release with the VS Code extension and Open VSX.
release-please cuts the tag + release from `main`, then automatically publishes
the standalone against that tag. The standalone does not have its own version
bump or tag. IntelliJ releases independently on its own line
(`intellij-v<version>`).
See [Release process](../../docs/vscode/contributing/release-process.md) for the
model.

Publishing is a single orchestrator that chains two sub-workflows, each
independently runnable for reruns:

- `.github/workflows/release-standalone.yml` — **single entry point**
  (`workflow_call` or `workflow_dispatch`). Takes the `version` to publish (the
  release tag is `vscode-v<version>`) and runs publish → homebrew in sequence,
  propagating `dry-run`.
- `.github/workflows/publish-standalone.yml` — builds the `.vsix` on
  `ubuntu-latest`, then fans out to three packaging jobs on their native runners
  (`macos-latest` for the signed + notarized DMG, `windows-2022` for the NSIS
  installer, `ubuntu-latest` for the x86_64 Flatpak). All packages are uploaded
  to the `vscode-v<version>` release. The DMG and NSIS jobs also mirror their
  installers and `electron-updater` manifests (`latest-mac.yml` / `latest.yml`)
  onto the rolling `standalone-latest` prerelease that the auto-updater reads;
  Flatpak updates remain manual. A final job records a `standalone` deployment
  after all three packages publish successfully.
- `.github/workflows/publish-standalone-homebrew.yml` — updates the Cask
  formula in [Miragon/homebrew-tap](https://github.com/Miragon/homebrew-tap)
  so `brew upgrade --cask miragon-bpmn-modeler` picks up the new version.

The normal release flow is automatic:

1. Make sure release-please's Release PR is merged, so the
   `vscode-v<version>` tag and GitHub Release exist.
2. `release-please.yml` invokes the standalone orchestrator with the released
   version.
3. The orchestrator runs `publish` → `homebrew`; the protected `standalone`
   environment can require approval before the signed package build starts.

For a full manual rerun, go to **Actions** → **Release Standalone** → **Run
workflow**, enter the released version, and optionally select `dry-run` or
`skip-homebrew`. In dry-run mode nothing is uploaded or pushed; the desktop
packages land as workflow artifacts and the cask formula is only logged.

**Single-step reruns:** Each sub-workflow keeps its own `workflow_dispatch`
trigger. Use these for debugging a single phase without re-running the
whole chain. For a real `Publish Standalone` rerun, pass the release tag as
`ref`; the workflow rejects any commit that does not match that tag.

**Required GitHub repo secrets** (one-time setup):

| Secret | Source |
|---|---|
| `CSC_LINK` | base64 of the Developer ID Application `.p12` |
| `CSC_KEY_PASSWORD` | password for the `.p12` |
| `APPLE_ID` | Apple ID email of a Miragon team member |
| `APPLE_APP_SPECIFIC_PASSWORD` | generated at appleid.apple.com |
| `APPLE_TEAM_ID` | `G5JZQ328LJ` |
| `HOMEBREW_TAP_TOKEN` | Repository or organization PAT with `repo` scope on `Miragon/homebrew-tap` |

### Approval gate / environment setup

The signed macOS job targets the `standalone` GitHub environment. Configure
required reviewers on that environment to gate the release chain before any
desktop package is published. The Homebrew job deliberately reuses that
approval instead of requiring a second one, so `HOMEBREW_TAP_TOKEN` must remain
a repository or organization secret. A direct dispatch of only the Homebrew
workflow bypasses the `standalone` environment; use its dry-run mode first.

## Structure

```
apps/standalone/
├── package.json            Theia deps + scripts
├── tsconfig.json
├── electron-builder.yml    macOS / Windows / Linux build targets
├── flatpak/                Flatpak manifest and Linux desktop metadata
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
