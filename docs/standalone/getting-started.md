# Getting Started — Standalone Desktop App

The Miragon BPMN Modeler is also available as a **standalone desktop app**
built on [Eclipse Theia](https://theia-ide.org/). Same modeler as the
[VS Code extension](/vscode/getting-started), packaged as a native Electron
app for when you don't want to run a full IDE.

The standalone app currently ships for **macOS on Apple Silicon**.
Windows and Linux builds may follow.

## Install

Head to the [**Download** page](/download) for the latest macOS `.dmg` and the
Homebrew tap snippet. Both options install the same signed and notarized
build; the app auto-updates from GitHub Releases on each launch, regardless
of how it was installed.

### Upgrade later

If you installed via Homebrew:

```bash
brew upgrade --cask miragon-bpmn-modeler
```

For the manual install, the in-app auto-updater handles new versions on
launch — there's nothing to do.

### Build from source

If you'd rather build it yourself, see
[`apps/standalone/README.md`](https://github.com/Miragon/bpmn-modeler/blob/main/apps/standalone/README.md).
A locally-built `.dmg` (without the Apple credentials the release pipeline
uses) is unsigned. macOS Gatekeeper will block the first launch —
right-click the app in `/Applications` → **Open** → confirm. After that
one-time bypass, the app launches normally.

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

A few things differ from the VS Code surface — no Extensions view and no
Command Palette keybindings for VS Code-specific commands. The modeler
itself behaves identically.

## Auto-save

The standalone saves every change ~1 second after the last edit, so the file
on disk always matches what you see in the canvas and the Source Control
view reflects modifications immediately. Disable or change the delay in
**Settings → Files: Auto Save**.

## Source Control

The standalone ships with the same VS Code Git extension that powers the
Source Control view in VS Code, including BPMN-aware diffs for modified
diagrams. Git operations rely on the system `git` binary:

- **macOS** — install Xcode Command Line Tools (`xcode-select --install`)
  or [git-scm.com](https://git-scm.com/).
- **Windows** — [git-scm.com](https://git-scm.com/).

If `git --version` works in your terminal, the standalone app will pick it
up on launch.
