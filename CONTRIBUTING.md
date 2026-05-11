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
- [Updating a Marketplace Listing](#updating-a-marketplace-listing)
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

1. Search [existing issues](https://github.com/Miragon/bpmn-modeler/issues)
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
- [`corepack`](https://nodejs.org/api/corepack.html) **on your `PATH`** and
  enabled. This repo pins Yarn via `packageManager` in `package.json` and the
  build scripts invoke `corepack yarn …` directly, so `corepack --version` must
  resolve in the same shell you run `yarn install` from.

  Some Node version managers do not ship a `corepack` shim — Volta is a known
  example. If `corepack --version` prints `command not found`, install it
  explicitly and then enable it:

  ```bash
  npm install -g corepack@latest
  corepack enable
  ```

  Standard Node distributions already include `corepack`; running
  `corepack enable` once is enough.
- **VS Code**

### Clone and install

```bash
git clone https://github.com/Miragon/bpmn-modeler.git
cd bpmn-modeler
corepack yarn install
```

### Run the Extension Development Host

1. Start watch mode:
   ```bash
   corepack yarn watch
   ```
2. Open the **Run and Debug** panel in VS Code.
3. Select **"Run modeler-plugin"** and press **F5**.

Reload the host after a change with `Cmd+R` (macOS) or `Ctrl+R` (Windows/Linux).

For comprehensive guidance (standalone browser preview, testing, architecture),
see [`docs/development.md`](docs/development.md).

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

## Updating a Marketplace Listing

A VS Code Marketplace listing is composed from two sources inside the
extension's workspace (e.g. `apps/modeler-plugin/`):

1. **`README.md`** — rendered as the listing's main content. The
   workspace-local README is bundled into the VSIX by
   `webpack.config.js` via `CopyWebpackPlugin`. **Never** point this copy
   at the root `README.md` — the root file is a repo-level overview and
   does not belong on a product page.
2. **`package.json` fields** — listing metadata: `displayName`,
   `description`, `categories`, `keywords`, `icon`, `badges`, `repository`,
   `homepage`, `galleryBanner`.

To preview a listing locally before publishing:

```bash
corepack yarn build
cd dist/apps/modeler-plugin
npx @vscode/vsce package --no-dependencies --out preview.vsix
```

Open the `.vsix` (it is a zip): the `extension/README.md` inside is exactly
what the Marketplace will render. You can also run
`npx @vscode/vsce ls` from the same directory to list everything bundled.

When introducing a new publishable extension, follow the same pattern:
ship a workspace-local `README.md` and copy it (not the root one) into the
VSIX from that workspace's `webpack.config.js`.

## License

By contributing, you agree that your contributions will be licensed under the
[Apache License 2.0](LICENSE) that covers the project.
