# BPMN Modeler — IntelliJ Plugin

Opens `.bpmn` and `.dmn` files directly in IntelliJ using the same bpmn-js / dmn-js
modeler that ships in VS Code. Under the hood it spawns the
[`apps/modeler-cli`](../modeler-cli/) subprocess per file and embeds a JCEF
browser pointed at it — no External Tools configuration required.

> **Status:** MVP. Not yet published to the JetBrains Marketplace.
> Install from disk (see below).

## Prerequisites

- **IntelliJ IDEA 2023.3** or newer (any JCEF-enabled JetBrains IDE will work:
  WebStorm, PyCharm, GoLand, Rider, etc.).
- **Node.js 20+** on `PATH`. The plugin spawns `node` as a subprocess.
- JDK 17+ to build the plugin (not to run it).

## Build

From the repo root:

```bash
# 1. Build the CLI first — the plugin bundles it as a resource.
corepack yarn build:modeler-cli

# 2. Build the plugin.
corepack yarn build:intellij-plugin
```

The installable `.zip` lands at:

```
apps/intellij-plugin/build/distributions/bpmn-intellij-plugin-<version>.zip
```

## Install

In IntelliJ:

1. **Settings → Plugins → ⚙ (gear icon) → Install Plugin from Disk…**
2. Pick the `.zip` produced above.
3. Restart when prompted.

## Use

Open any `.bpmn` or `.dmn` file through the Project view, the recent-files
switcher, or the file-open dialog. The modeler replaces IntelliJ's default
text editor for these files. Edits in the canvas save back to disk; changes
to the file on disk (e.g. from another editor) reload the canvas.

## Limitations (MVP)

Same MVP caveats as the underlying CLI:

- Element templates are not loaded (webview sees an empty list).
- No deployment sidebar.
- No BPMN diff viewer.
- Theme/language are fixed at light/English.
- Plugin JAR bundles the CLI (~6 MB). Future phases may move to
  download-on-demand.

To access the raw XML of a BPMN/DMN file, either open it outside IntelliJ
or — as a workaround — rename the file to `.xml` temporarily.

## Architecture

Thin wrapper around the CLI:

```
BpmnFileEditorProvider (accepts *.bpmn, *.dmn)
    └── BpmnFileEditor
          ├── picks a free TCP port
          ├── spawns: node <bundled-cli>/index.js --port N --no-open <file>
          ├── polls http://localhost:N/ until 200 (≤ 5 s)
          └── JBCefBrowser pointed at http://localhost:N
```

On editor close the subprocess is destroyed. On IDE shutdown the plugin
disposer handles any leftovers.

## License

Apache License 2.0 — same as the rest of the repository.
