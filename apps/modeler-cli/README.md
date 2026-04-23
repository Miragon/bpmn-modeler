# @miragon/bpmn-modeler-cli

Standalone CLI that opens the same bpmn-js / dmn-js modeler used by the VS Code
extension as a local web app. Edits save back to the source file. Intended for
**IntelliJ IDEA**, WebStorm, Rider, PyCharm, Vim, Emacs, and the bare terminal —
no JetBrains plugin required.

Requires Node.js 20+.

> **Status:** MVP. Not yet published to npm. Install locally from the repo
> (see below).

## Install

### Local install (current state — CLI is not on npm yet)

Clone the repo, build once, then symlink the CLI entry onto your `PATH`.

```bash
git clone https://github.com/Miragon/bpmn-vscode-modeler.git
cd apps/bpmn-vscode-modeler
corepack enable
corepack yarn install
corepack yarn build
```

Then pick **one** of the following:

**A) Run directly (no install step):**

```bash
node <repo>/apps/modeler-cli/dist/index.js my-diagram.bpmn
```

**B) Add a symlink to your `PATH`:**

```bash
ln -s "$(pwd)/apps/modeler-cli/dist/index.js" /usr/local/bin/bpmn-modeler
# now:
bpmn-modeler my-diagram.bpmn
```

**C) Use `npm link` from inside the CLI workspace:**

```bash
cd apps/modeler-cli
npm link
# now:
bpmn-modeler my-diagram.bpmn
```

### Once published to npm (not yet available)

```bash
npm install -g @miragon/bpmn-modeler-cli
# or ad-hoc:
npx @miragon/bpmn-modeler-cli my-diagram.bpmn
```

## Use

```bash
bpmn-modeler my-diagram.bpmn      # BPMN editor in the default browser
bpmn-modeler my-decisions.dmn     # DMN editor
bpmn-modeler --port 7391 foo.bpmn # bind a fixed port
bpmn-modeler --no-open foo.bpmn   # print URL but don't launch a browser
```

Edits in the browser save back to the source file. External edits to the file
(e.g. from the IDE's text editor) are detected and reload the canvas.

## Wire it up in IntelliJ IDEA

### 1. Add an External Tool

`Settings → Tools → External Tools → +`

| Field       | Value                  |
|-------------|------------------------|
| Name        | `Open in BPMN Modeler` |
| Program     | `bpmn-modeler`         |
| Arguments   | `$FilePath$`           |
| Working dir | `$ProjectFileDir$`     |

If you're running directly via `node` instead of a symlink, set:

| Field     | Value                                          |
|-----------|------------------------------------------------|
| Program   | `node`                                         |
| Arguments | `/abs/path/to/apps/modeler-cli/dist/index.js $FilePath$` |

Once published to npm, `npx` also works:

| Field     | Value                                   |
|-----------|-----------------------------------------|
| Program   | `npx`                                   |
| Arguments | `@miragon/bpmn-modeler-cli $FilePath$`  |

### 2. (Optional) Bind a keyboard shortcut

`Settings → Keymap → External Tools → External Tools → Open in BPMN Modeler →`
right-click → **Add Keyboard Shortcut** (e.g. `⌘⇧B`).

### 3. Use it

Right-click any `.bpmn` or `.dmn` file in the Project tool window →
**External Tools → Open in BPMN Modeler**. Your default browser opens with
the modeler loaded; edits save back to the file on disk, and IntelliJ's
editor picks them up via its file-watcher.

## Limitations (current MVP)

The CLI ships the core editor only. Features tied to VS Code infrastructure
are not yet available:

- Element templates (hard-coded empty list)
- Deployment sidebar
- Diff viewer
- Configurable settings (theme/language are fixed at light/English)

These are tracked for later phases of
[issue #920](https://github.com/Miragon/bpmn-vscode-modeler/issues/920).
