# Miragon BPMN-IQ — VS Code Extension

A single `.vsix` that bundles the Miragon BPMN/DMN modeler with the
**bpmn-iq** live-collaboration sync, hard-wired to a Miragon Cloud daemon.

This is the "one opinionated download" flavour: there is no UI to switch
daemons, no `daemonUrl` setting, no localhost fallback. The cloud URL is
baked into the bundle at build time from `MIRAGON_CLOUD_DAEMON_URL`.

> If you want the OSS BPMN Modeler without bpmn-iq sync, use
> `apps/modeler-plugin` instead — that ships as the regular
> `vs-code-bpmn-modeler` extension on the marketplace.

## What you get

- BPMN & DMN custom editors (same as the OSS modeler).
- All Camunda 7 / 8 deployment and start-instance flows.
- A status-bar **BPMN-IQ** item that joins peers on the same
  `(repoId, branch)` to the same daemon-side workspace.
- Live multi-editor sync, git-branch-aware workspace identity, editor
  bridge that pushes the selected BPMN element to the daemon.
- Built-in exclude filter for generated files (`dist/`, `build/`, `out/`,
  `target/`, `coverage/`, `.vscode-test/`, `node_modules/`, `.git/`,
  `.bpmn-iq/`) so they never reach the daemon.

## Configure `.env`

The cloud daemon URL is **not** a runtime setting. It is read at build
time from a gitignored `.env` at the repo root.

```bash
cp .env.example .env
# then edit .env and fill in:
#   MIRAGON_CLOUD_DAEMON_URL=https://bpmn-iq.your-tenant.miragon-cloud.example
```

If the variable is missing at build time the bundle still compiles, but
the extension's `BPMN-IQ: Start Sync` command will refuse to start with
the message:

> BPMN-IQ: this build was not configured with a daemon URL.
> Contact Miragon for a properly configured build.

## Build locally

From the **repository root**:

```bash
corepack yarn install
corepack yarn workspace bpmn-iq-vscode build
```

Output: `dist/apps/bpmn-iq-vscode/`. To produce a `.vsix`:

```bash
cd dist/apps/bpmn-iq-vscode
npx @vscode/vsce package --out bpmn-iq-vscode.vsix --yarn --no-dependencies
```

The build pulls `@miragon/bpmn-iq-daemon-client` from GitHub Packages, so
your environment needs `GITHUB_TOKEN` with `read:packages` scope (the
repo-root `.yarnrc.yml` is already configured for the `@miragon` scope).

## Run locally (extension host)

1. Make sure `.env` is set (or accept the missing-URL error path).
2. Open this repository in VS Code.
3. Press **F5** to launch the Extension Development Host with this
   extension installed. The watch task rebuilds the bundle on save.
4. In the dev host, open a folder containing a `.bpmn` file.
5. The status bar should show a **BPMN-IQ** item — click it to start sync.

If the configured daemon URL is unreachable, the status bar shows the
disconnected state and the menu offers a **Retry** action.

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| Status bar says "this build was not configured with a daemon URL" | `MIRAGON_CLOUD_DAEMON_URL` was unset at build time. Set it in `.env` and rebuild. |
| Sync starts then errors with `ECONNREFUSED` / `ENOTFOUND` | The daemon at the baked URL is not reachable from this machine. Check VPN/proxy/firewall, then click **Retry** on the status-bar menu. |
| Peer on a different machine doesn't see my workspace | Workspace identity is derived from `(repoId, branch)`. Both peers must clone the same git remote *and* be on the same branch. |
| Generated `.bpmn` files (e.g. test fixtures under `dist/`) leak into the daemon | They shouldn't — `dist`, `build`, `out`, `target`, `coverage`, `.vscode-test` are in the built-in segment block list. If you have an unusual layout, add patterns to `miragon.bpmnIq.excludeGlobs` in workspace settings. |
| You want to point at a different daemon at runtime | Not supported in this build. Rebuild with a different `MIRAGON_CLOUD_DAEMON_URL`. |

## Architecture

Two activations wired in one `main.ts`:

1. `activateModeler(ctx)` — exported from `apps/modeler-plugin/src/main.ts`
   (the OSS modeler extension). Returns a `BpmnModelerApi` with
   `onDidChangeSelection`.
2. `activateBpmnIq(ctx, modelerApi)` — the cloud-only bpmn-iq wiring
   (this workspace's `src/`). Subscribes to the modeler's selection
   stream to keep the daemon session in sync.

There is no `extensionDependencies` entry: both halves live in this
single extension.

Source layout mirrors `apps/modeler-plugin/`:

- `src/controller/` — VS Code command + status-bar wiring.
- `src/service/` — sync orchestration (`BpmnIqSyncService`, puller).
- `src/infrastructure/` — VS Code wrappers, the HTTP adapter, the git
  detector, and the menu/status-bar renderers. All PascalCase classes.
- `src/domain/` — pure types, value objects, port interface, and
  framework-free helpers (`port.ts`, `syncState.ts`, `workspaceMeta.ts`,
  `repoIdentity.ts`, `workspaceModelId.ts`, `menuItems.ts`, etc.). All
  camelCase modules; testable without a vscode mock.

See the `architecture` skill for a deeper map of the modeler's internals.
