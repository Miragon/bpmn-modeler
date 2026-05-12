<div align="center">
    <img src="https://raw.githubusercontent.com/Miragon/bpmn-vscode-modeler/main/images/miragon-logo.png" alt="Miragon" height="140">
    <h3>BPMN IQ</h3>
    <p>Bring your BPMN landscape into your AI assistant — straight from VS Code.</p>
    <p>
        <a href="https://github.com/Miragon/bpmn-iq">bpmn-iq on GitHub</a>
        ·
        <a href="https://github.com/Miragon/bpmn-vscode-modeler/issues">Report Bug</a>
        ·
        <a href="https://github.com/Miragon/bpmn-vscode-modeler/pulls">Request Feature</a>
    </p>
</div>

## Why this extension

Process diagrams are the architectural drawings of your software, and they
are some of the highest-leverage context an LLM can have. **BPMN IQ** keeps a
running [bpmn-iq](https://github.com/Miragon/bpmn-iq) daemon in lockstep with
the `.bpmn` files in your workspace and tells it which model — and which
element on the canvas — you are currently looking at, so MCP-aware AI
assistants always reason about *the same picture you do*.

> **Companion to [Camunda Modeler by Miragon](https://marketplace.visualstudio.com/items?itemName=miragon-gmbh.vs-code-bpmn-modeler).** The modeler is a hard requirement and is auto-installed alongside this extension.

## Features

- **Live workspace sync** — every save of a `.bpmn` file is pushed to a local
  or hosted bpmn-iq daemon; remote changes are pulled back into the
  workspace.
- **Editor bridge** — your active model and the element you currently have
  selected on the canvas are streamed to the daemon, so MCP tools like
  `analyze_active_model` always see what you see.
- **Branch-aware workspaces** — inside a git repo, the daemon-side workspace
  id is derived deterministically from `(repo, branch)`. Peers on the same
  branch share a workspace automatically, and switching branches
  re-registers under the new key.
- **Status-bar quick-pick** — start, stop, switch between local and Miragon
  Cloud daemons, and grab the Web UI link without leaving the editor.
- **Web UI deep-link** — one-click jump from the status bar into the
  workspace's bpmn-iq Web UI with the right `?ws=` query already filled in.

## Activation

The extension activates automatically when the open folder contains either:

- any `*.bpmn` file, or
- a previously-saved `.bpmn-iq/workspace.json` config.

A status-bar item appears in the bottom-right; click it to start syncing.

## Getting started

1. Install **BPMN IQ** from the VS Code Marketplace. The required
   [Camunda Modeler by Miragon](https://marketplace.visualstudio.com/items?itemName=miragon-gmbh.vs-code-bpmn-modeler)
   is installed automatically.
2. Run a bpmn-iq daemon — locally or use the Miragon Cloud daemon (switch
   from the status-bar quick-pick).
3. Open a folder with `.bpmn` files and click the bpmn-iq status-bar item.

> **Local VSIX install (developers)**: VS Code does not auto-resolve
> extension dependencies for VSIX-from-disk installs. Install the modeler
> VSIX **first**, then the bpmn-iq VSIX. The repo's `dev:install` script
> handles the order for you.

### Settings

Search for "BPMN IQ" in Settings (`Ctrl+,` / `Cmd+,`).

| Setting                              | Default                  | Description                                                                                                                       |
|--------------------------------------|--------------------------|-----------------------------------------------------------------------------------------------------------------------------------|
| `miragon.bpmnIq.daemonUrl`           | `http://localhost:4000`  | Base URL of the bpmn-iq daemon (REST + SSE endpoints).                                                                            |
| `miragon.bpmnIq.hydrateOnStart`      | `true`                   | On start, pull every model from the daemon and overwrite local files. Turn off if your local files should be the source of truth. |
| `miragon.bpmnIq.workspaceName`       | `""`                     | Display name for this workspace on the daemon. Empty = use the folder basename.                                                   |
| `miragon.bpmnIq.cloudDaemonUrl`      | `""`                     | URL of the Miragon Cloud bpmn-iq daemon, used by the status-bar **Switch to Miragon Cloud** action. Enterprise feature — empty in OSS builds (action hidden). Set to a self-hosted daemon URL to enable.                              |

### Commands

All commands are also reachable via the status-bar quick-pick.

| Command                          | Description                                                  |
|----------------------------------|--------------------------------------------------------------|
| `bpmn-iq: Toggle Sync`           | Start sync if stopped, stop if running                       |
| `bpmn-iq: Start Sync`            | Register the workspace with the daemon and begin syncing     |
| `bpmn-iq: Stop Sync`             | Unregister and tear down the SSE connection                  |
| `bpmn-iq: Show Status Menu`      | Open the state-aware quick-pick of bpmn-iq actions           |
| `bpmn-iq: Join Workspace…`       | Pull every model from an existing workspace by id            |
| `bpmn-iq: Open Web UI`           | Open the bpmn-iq Web UI deep-linked to the active workspace  |
| `bpmn-iq: Copy Web UI Link`      | Copy that deep-link to the clipboard                         |

## On-disk format

Workspace metadata is persisted at `<repo>/.bpmn-iq/workspace.json`. The
shape matches the upstream `bpmn-iq` CLI agent, so the same workspace can be
used interchangeably from CLI and from this extension.

## Support and feedback

- bpmn-iq daemon / MCP tools: <https://github.com/Miragon/bpmn-iq>
- Bugs / feature requests: <https://github.com/Miragon/bpmn-vscode-modeler/issues>
- Contact: [info@miragon.io](mailto:info@miragon.io)

## License

Distributed under the [Apache License 2.0](https://github.com/Miragon/bpmn-vscode-modeler/blob/main/LICENSE).
