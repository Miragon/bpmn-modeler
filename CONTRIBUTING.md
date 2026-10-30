# Contributing to BPMN VS Code Modeler

First off — thank you for taking the time to contribute! Every contribution, big
or small, helps keep this project alive and useful.

This document covers the **process** for getting involved. For a deep-dive
development guide (project structure, build system, architecture, testing), see
[`docs/development.md`](docs/development.md).

## External contributions

We're currently not accepting pull requests from outside the team. We don't have the resources to fully review and validate external contributions, so we can't guarantee that a merged change keeps the project free of bugs, free of security vulnerabilities or malicious code, and consistent with requirements that make sense for it. Pull requests opened by external contributors will be closed.

If you've found a bug or have an idea, please [open an issue](https://github.com/Miragon/bpmn-modeler/issues/new) instead. We read every one, and it's the best way to get something onto our radar.

## Table of Contents

- [External contributions](#external-contributions)
- [Code of Conduct](#code-of-conduct)
- [Ways to Contribute](#ways-to-contribute)
- [AI-Assisted Contributions](#ai-assisted-contributions)
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
- **Spot a documentation gap** — open a GitHub issue pointing to it.

## AI-Assisted Contributions

Using an AI assistant to help draft an issue is **allowed and
welcome** — the modeler itself is built with these tools. But:

- **You are accountable for everything you submit.** Read and stand behind every
  line. "The AI wrote it" is not a review, an explanation, or a defence.
- **Low-effort, unvetted AI output will be closed** — issues that restate the
  obvious without a concrete use case. This is about quality and reviewer time,
  not about the tool.
- If an issue is substantially AI-generated, a one-line note to that effect
  helps us calibrate — it is appreciated, not penalised.

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

## Development Setup

This section and the [Pull Request Process](#pull-request-process) are for the
team.

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
3. Select **"Run vscode-plugin"** and press **F5**.

Reload the host after a change with `Cmd+R` (macOS) or `Ctrl+R` (Windows/Linux).

For comprehensive guidance (standalone browser preview, testing, architecture),
see [`docs/development.md`](docs/development.md).

## Pull Request Process

1. **Create a feature branch** off `main`:
   ```bash
   git checkout -b feat/your-feature-name
   ```
2. **Make your changes**, ensuring:
    - `corepack yarn lint` passes
    - `corepack yarn test` passes
    - New features include tests
    - Code follows the project's style (Prettier-formatted, 4-space indent)
    - Changes that move a package boundary, public API, dependency, or
      protocol have an ADR updated or added in [`docs/adr/`](docs/adr/).
      Update the existing topic and replace superseded text; see the
      [recording rules](docs/adr/README.md#recording-rules). If you work
      with an AI coding agent, the repo-bundled `adr` skill
      (`.agents/skills/adr/`) applies these rules automatically.
3. **Commit** with a [semantic message](#commit-messages).
4. **Push** your branch and open a Pull Request against `main`.
5. **CI must pass** (lint → test → build) before review.
6. Address review feedback by pushing additional commits to your branch — avoid
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
extension's workspace (e.g. `apps/vscode-plugin/`):

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
cd dist/apps/vscode-plugin
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
