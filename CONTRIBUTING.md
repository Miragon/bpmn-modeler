# Contributing to BPMN VS Code Modeler

First off — thank you for taking the time to contribute! Every contribution, big
or small, helps keep this project alive and useful.

This document covers the **process** for getting involved. For a deep-dive
development guide (project structure, build system, architecture, testing), see
[`docs/development.md`](docs/development.md).

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Ways to Contribute](#ways-to-contribute)
- [Reporting Bugs](#reporting-bugs)
- [Suggesting Enhancements](#suggesting-enhancements)
- [Development Setup](#development-setup)
- [Pull Request Process](#pull-request-process)
- [Commit Messages](#commit-messages)
- [License](#license)

## Code of Conduct

This project and everyone participating in it is governed by our
[Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to
uphold this code.

## Ways to Contribute

- **Report a bug** — open a GitHub issue with the `Bug` type.
- **Suggest a feature** — open a GitHub issue with the `Feature` type.
- **Improve documentation** — docs live in [`docs/`](docs/) and inline in the
  code; PRs are welcome.
- **Submit code** — see [Development Setup](#development-setup) and
  [Pull Request Process](#pull-request-process) below.

## Reporting Bugs

Before opening a bug report, please:

1. Search [existing issues](https://github.com/Miragon/bpmn-vscode-modeler/issues)
   to avoid duplicates.
2. Verify you are running the latest version of the extension from the
   Marketplace.
3. Include the following in your report:
    - VS Code version and operating system
    - Extension version
    - Minimal steps to reproduce
    - Expected vs. actual behavior
    - A minimal `.bpmn` / `.dmn` file if the bug is diagram-specific

## Suggesting Enhancements

Open an issue with the `Feature` type describing:

- The problem you are trying to solve
- Why it matters (use case)
- A proposed solution, if you have one

Discussing scope in an issue *before* writing code saves everyone time.

## Development Setup

### Prerequisites

- **Node.js** v20 or later
- [`corepack`](https://nodejs.org/api/corepack.html) enabled: `corepack enable`
- **VS Code**

### Clone and install

```bash
git clone https://github.com/Miragon/bpmn-vscode-modeler.git
cd bpmn-vscode-modeler
corepack yarn install
```

### Testing the extension locally

VS Code extensions can't be tested by simply running a script in a terminal —
VS Code itself needs to load the extension. There are two ways to do this,
each suited to a different stage of your work.

---

#### Option A: Extension Development Host *(use while actively coding)*

This is the standard VS Code development loop. It opens a **second VS Code
window** with your local build loaded inside it. You can make code changes
and reload that window in seconds — your real VS Code is never touched.

**Step 1 — Open this repository in VS Code** (the folder containing this
`CONTRIBUTING.md`). If you are working in another tool like Conductor, you
still need to do this separately.

**Step 2 — Start the build watcher** in a terminal inside VS Code:

```bash
corepack yarn watch
```

Wait until you see the first successful build in the terminal output before
continuing.

**Step 3 — Press F5** (or open the **Run and Debug** panel in the left
sidebar, select **"Run modeler-plugin"** from the dropdown, and click the
green play button).

A second VS Code window opens — this is the **Extension Development Host**.
Open any `.bpmn` or `.dmn` file inside it to use the modeler.

**After each code change:** the watcher rebuilds automatically. Press
**Cmd+R** (macOS) or **Ctrl+R** (Windows/Linux) inside the Extension
Development Host window to reload and pick up the new build.

---

#### Option B: Open in your real VS Code *(use before opening a PR)*

This opens a new VS Code window with the dev build of the modeler loaded
alongside your real settings, themes, and other extensions — without touching
your installed Marketplace version at all. When you close the window,
everything is back to normal.

```bash
corepack yarn dev:open
```

This builds the full project and then opens VS Code pointing at the sample
diagrams in `resources/example-process/`. Your existing installation of the
extension is untouched; the dev version is active only in that window.

---

### Troubleshooting

**Unexpected features showing in the extension (e.g. unreleased UI from another branch)**

If you previously ran an older `dev:install` command from a feature branch, that
dev build may have been force-installed into your real VS Code and replaced your
Marketplace version. To restore the clean Marketplace version:

```bash
code --uninstall-extension miragon-gmbh.vs-code-bpmn-modeler
```

Then reinstall from the Extensions panel in VS Code. The current `yarn dev:open`
workflow avoids this problem entirely — it never modifies your installed extension.

---

For deeper guidance — standalone browser preview of the webview UI, build
system internals, and architecture — see
[`docs/vscode/contributing/development.md`](docs/vscode/contributing/development.md).

## Pull Request Process

1. **Open an issue** first so the proposed change can be discussed before you
   invest significant effort.
2. **Fork** the repository and clone your fork locally.
3. **Create a feature branch** off `main`:
   ```bash
   git checkout -b feat/your-feature-name
   ```
4. **Make your changes**, ensuring:
    - `corepack yarn lint` passes
    - `corepack yarn test` passes
    - New features include tests
    - Code follows the project's style (Prettier-formatted, 4-space indent)
5. **Commit** with a [semantic message](#commit-messages).
6. **Push** your branch and open a Pull Request against `main`.
7. **CI must pass** (lint → test → build) before review.
8. Address review feedback by pushing additional commits to your branch — avoid
   force-pushing over published commits unless a maintainer asks.

## Commit Messages

We use [semantic commit messages](https://gist.github.com/joshbuchea/6f47e86d2510bce28f8e7f42ae84c716)
scoped to the affected workspace:

```
feat(bpmn): add token simulation toolbar
fix(dmn): correct decision table rendering
chore(shared): update message type definitions
docs: clarify element template discovery
```

Common types: `feat`, `fix`, `refactor`, `chore`, `docs`, `test`, `ci`.

## License

By contributing, you agree that your contributions will be licensed under the
[Apache License 2.0](LICENSE) that covers the project.
