# Getting Started — Standalone Desktop App

The Miragon BPMN Modeler is also available as a **standalone desktop app**
built on [Eclipse Theia](https://theia-ide.org/). Same modeler as the
[VS Code extension](/vscode/getting-started), packaged as a native Electron
app for when you don't want to run a full IDE.

The standalone app currently ships for **macOS on Apple Silicon**.
Windows and Linux builds may follow.

## Download & install

### Homebrew (recommended)

```bash
brew tap miragon/tap
brew install --cask miragon-bpmn-modeler
```

To upgrade later:

```bash
brew upgrade --cask miragon-bpmn-modeler
```

### Manual download

Signed, notarized `.dmg` artefacts are published to
[GitHub Releases](https://github.com/Miragon/bpmn-modeler/releases).
Look for tags matching `standalone-v*` and download the `.dmg`. Drag it
to `/Applications` and double-click — no Gatekeeper workaround needed.

The app auto-updates from GitHub Releases on each launch.

If you'd rather build from source, see
[`apps/standalone/README.md`](https://github.com/Miragon/bpmn-modeler/blob/main/apps/standalone/README.md).

## Open a diagram

Use **File → Open…** to open any `.bpmn` or `.dmn` file, or drop it onto the
app window. The modeler opens automatically as the default editor for those
file types.

To work with a folder of diagrams, use **File → Open Folder…**.

## Opening files from the terminal

macOS already lets you open files with any installed app. To open a
`.bpmn` or `.dmn` file in the standalone modeler from a shell:

```bash
open -a "Miragon BPMN Modeler" path/to/diagram.bpmn
```

You can also open a folder of diagrams as a workspace:

```bash
open -a "Miragon BPMN Modeler" path/to/diagrams/
```

For convenience, drop a short alias into your shell config
(`~/.zshrc` or `~/.bashrc`):

```bash
alias bpmn='open -a "Miragon BPMN Modeler"'
```

Then:

```bash
bpmn diagram.bpmn
```

## Features

Feature behaviour matches the VS Code extension one-to-one — same modeler
engine, same element templates, same diff view, same deploy flow. Explore:

- [Append Menu](/vscode/features/append-menu)
- [BPMN Diff](/vscode/features/bpmn-diff)
- [Deployment](/vscode/features/deployment)
- [Element Template Chooser](/vscode/features/element-template-chooser)
- [Language Support](/vscode/features/language-support)

A few things differ from the VS Code surface — no Extensions view, no Source
Control, no Command Palette keybindings for VS Code-specific commands. The
modeler itself behaves identically.

## Building from source

A locally-built `.dmg` (without the Apple credentials the release
pipeline uses) is unsigned. macOS Gatekeeper will block the first launch —
right-click the app in `/Applications` → **Open** → confirm. After that
one-time bypass, the app launches normally.
