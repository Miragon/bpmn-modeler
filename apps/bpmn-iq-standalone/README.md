# Miragon BPMN-IQ — Standalone (Theia/Electron)

A Theia-based Electron desktop app that ships the Miragon BPMN-IQ VS Code
extension (`apps/bpmn-iq-vscode`) pre-installed, plus the Miragon
Light/Dark themes, splash screen, and hidden built-in views from
`libs/standalone-extension`.

This is the desktop counterpart of the bundled `.vsix`: same cloud-only
behaviour, same baked-in daemon URL, same git-branch-derived workspace
identity. Aimed at users who want one downloadable app instead of a
VS Code extension to install.

## Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│ Electron shell  (apps/bpmn-iq-standalone/)                         │
│ ┌──────────────────────────────────────────────────────────────┐   │
│ │ Theia frontend                                                 │ │
│ │   + libs/standalone-extension  (Miragon themes, splash, etc.)  │ │
│ │   + plugin: bpmn-iq-vscode  (unpacked from .vsix)      │ │
│ │       ├── modeler-plugin source (compiled into the .vsix)      │ │
│ │       └── bpmn-iq cloud-only source (compiled into the .vsix)  │ │
│ └──────────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────┘
```

The Miragon shell and splash come from the **same** `libs/standalone-extension`
that the OSS standalone uses. There is no fork.

## Configure `.env`

Same as Variant B: the cloud daemon URL is baked at build time.

```bash
cp .env.example .env       # at the repo root
# then edit .env and fill in:
#   MIRAGON_CLOUD_DAEMON_URL=https://bpmn-iq.your-tenant.miragon-cloud.example
```

If the variable is missing, the build still succeeds but the bundled
extension refuses to start sync at runtime with a clear error.

## Build locally

From the **repository root**:

```bash
corepack yarn install
corepack yarn workspace @miragon/bpmn-iq-standalone dev
```

The `dev` script runs the full chain:

1. `build:repo` — repo-wide build, producing `dist/apps/bpmn-iq-vscode/`.
2. `prepare-plugin` — downloads `vscode.git` (Theia builtin), packages the
   bundle as a `.vsix`, unpacks it into `plugins/bpmn-iq-vscode/`.
3. `build` — Theia frontend build for Electron (development mode).
4. `start` — launches the Electron window with the splash + themes.

For a release-style production build (no signing):

```bash
corepack yarn workspace @miragon/bpmn-iq-standalone package
```

Outputs an unsigned `.dmg` under `apps/bpmn-iq-standalone/dist/`.

## Run locally

The `dev` script above ends with an `electron …` invocation that opens the
window. Open a folder containing `.bpmn` files; the status bar shows the
**BPMN-IQ** item exactly as it does in the VS Code extension.

If you've already built once and just want to relaunch fast:

```bash
corepack yarn workspace @miragon/bpmn-iq-standalone dev:fast
```

This skips `build:repo` and `prepare-plugin` and reuses the cached
plugin + Theia build.

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| `ERROR: dist/apps/bpmn-iq-vscode/bpmn-iq-vscode.vsix not found` from `bundle` | The repo-wide build hasn't run yet. `corepack yarn build` at the root first, or rely on the `dev` script. |
| Native modules complain on launch | Run `corepack yarn workspace @miragon/bpmn-iq-standalone rebuild`. |
| Splash hangs, app never appears | Likely a Theia plugin discovery failure. Check `apps/bpmn-iq-standalone/plugins/bpmn-iq-vscode/extension/package.json` exists. If not, rerun `prepare-plugin`. |
| Status bar says "this build was not configured with a daemon URL" | `MIRAGON_CLOUD_DAEMON_URL` was unset at build time. Set it in `.env`, then rebuild via `dev`. |
| Wanted different branding/icon | The icon, logo, and splash come from this app's `resources/` directory. Replace them; the Miragon themes themselves are in `libs/standalone-extension` and shared with the OSS standalone. |

## See also

- `apps/bpmn-iq-vscode/README.md` — the VS Code extension variant
  (same plugin, different host).
- `apps/standalone/README.md` — the OSS standalone (modeler only, no
  bpmn-iq sync).
- `libs/standalone-extension/README.md` — Theia frontend extension that
  contributes the Miragon themes/splash/hidden-views. Reused unchanged
  here.
