# Get started with the desktop app

Install the Miragon BPMN Modeler as a desktop app for macOS, Windows or Linux when you do not want to run an IDE. It
runs the same modeler as the [VS Code extension](/vscode/getting-started) in an [Eclipse Theia](https://theia-ide.org/)
shell.

## Install

Get the package for your system from the [Download page](/download):

| System | Package | Updates |
|---|---|---|
| macOS | Signed and notarized `.dmg` | In-app updater |
| Windows | `.exe` installer | In-app updater |
| Linux x86_64 | Flatpak from the Miragon repository, or a `.flatpak` bundle | `flatpak update` |

All files are also on [GitHub Releases](https://github.com/Miragon/bpmn-modeler/releases).

### macOS with Homebrew

```bash
brew tap miragon/tap
brew install --cask miragon-bpmn-modeler
```

Update with `brew upgrade --cask miragon-bpmn-modeler`.

### Linux with Flatpak

Install [Flatpak](https://flatpak.org/setup/) first. Miragon publishes the app in its
[own Flatpak repository](https://miragon.github.io/bpmn-modeler-flatpak-repo/), because the
[Flathub policy on generative AI](https://docs.flathub.org/docs/for-app-authors/requirements#generative-ai-policy)
does not accept apps with AI-assisted code or documentation.

Install for your user (no root needed):

```bash
flatpak remote-add --user --if-not-exists miragon https://miragon.github.io/bpmn-modeler-flatpak-repo/miragon.flatpakrepo
flatpak install --user miragon io.miragon.BpmnModeler
flatpak run io.miragon.BpmnModeler
```

For all users, run the same two install commands with `sudo` and `--system` instead of `--user`. Update with
`flatpak update --user io.miragon.BpmnModeler` (or `--system`).

The `.flatpak` bundle from the Download page does not update itself. To update it, download the newer bundle and run
`flatpak install --user --bundle Miragon.BPMN.Modeler-<version>-x86_64.flatpak`. Prefer the repository.

### Build from source

See [`apps/standalone/README.md`](https://github.com/Miragon/bpmn-modeler/blob/main/apps/standalone/README.md). A
`.dmg` you build yourself is unsigned: on first launch, right-click the app in `/Applications`, choose **Open** and
confirm.

## Open a file

Use **File ▸ Open…** for a `.bpmn`, `.dmn` or `.form` file, or drop it onto the window. Use **File ▸ Open Folder…**
to work with a folder of models.

On macOS you can open files from the terminal:

```bash
open -a "Miragon BPMN Modeler" path/to/diagram.bpmn
open -a "Miragon BPMN Modeler" path/to/diagrams/
```

## How it differs from VS Code

- **Auto-save** is on: every change is saved one second after the last edit. Change it under
  **Settings ▸ Files: Auto Save**.
- **Source Control** uses the VS Code Git extension, including the [BPMN diff](/vscode/features/bpmn-diff). On macOS
  and Windows, install and configure `git` on the system. The Flatpak app brings its own `git` and forwards the
  ssh-agent.
- There is no Extensions view.

Everything else (modes, element templates, diff, deployment) works as in VS Code.

## Next steps

- [Features](/vscode/features/): what the modeler can do.
- [Configuration](/vscode/configuration): the settings, also available in the app.
- [Deployment](/vscode/features/deployment): deploy to Camunda 7 or Camunda 8.
