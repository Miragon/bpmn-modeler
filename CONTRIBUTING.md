# Contributing to the BPMN Modeler

First off — thank you for taking the time to contribute! Every contribution, big
or small, helps keep this project alive and useful.

This document is for developers: the repository layout, the setup and the
**process** for getting involved. What the modeler does for its users is in the
[README](README.md) and on the [documentation site](https://miragon.github.io/bpmn-modeler/).
For a deep-dive development guide (build system, architecture, testing), see
[`docs/vscode/contributing/development.md`](docs/vscode/contributing/development.md).

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
- [Repository Layout](#repository-layout)
- [Development Setup](#development-setup)
- [Pull Request Process](#pull-request-process)
- [Commit Messages](#commit-messages)
- [READMEs and Store Listings](#readmes-and-store-listings)
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

## Repository Layout

This is a monorepo: one modeler core, delivered by several hosts. Each host has
a `README.md` for its users and a `CONTRIBUTING.md` for its developers.

| Module | What it is | For developers |
|---|---|---|
| [`apps/vscode-plugin`](apps/vscode-plugin/README.md) | The VS Code extension, published to the Visual Studio Marketplace and Open VSX | [Development guide](docs/vscode/contributing/development.md) |
| [`apps/intellij-plugin`](apps/intellij-plugin/README.md) | The IntelliJ plugin, published to the JetBrains Marketplace | [CONTRIBUTING.md](apps/intellij-plugin/CONTRIBUTING.md) |
| [`apps/modeler-bridge`](apps/modeler-bridge/README.md) | The binary that runs the modeler core for the IntelliJ plugin over stdio JSON-RPC | [README.md](apps/modeler-bridge/README.md) |
| [`apps/standalone`](apps/standalone/README.md) | The Theia/Electron desktop app for macOS, Windows and Linux | [CONTRIBUTING.md](apps/standalone/CONTRIBUTING.md) |
| [`apps/orca-plugin`](apps/orca-plugin/README.md) | The Orca plugin for `.bpmn` and `.dmn` files, experimental, published to [Miragon/orca-modelers](https://github.com/Miragon/orca-modelers) | [CONTRIBUTING.md](apps/orca-plugin/CONTRIBUTING.md) |
| [`apps/bpmn-webview`](apps/bpmn-webview/README.md), [`dmn-webview`](apps/dmn-webview/README.md), [`form-webview`](apps/form-webview/README.md), [`deployment-webview`](apps/deployment-webview/README.md), [`add-ons-webview`](apps/add-ons-webview/README.md) | The webviews the hosts embed: the BPMN and DMN canvases, the Camunda Form editor, the deployment sidebar and the Add-ons view | Each README |
| [`packages/bpmn-modeler`](packages/bpmn-modeler/README.md), [`packages/dmn-modeler`](packages/dmn-modeler/README.md) | The modelers as npm libraries | Each README |
| [`libs/`](libs/README.md) | The building blocks the modelers and hosts share | Each README |

Internal modules are not published separately; they are bundled into the hosts.
The architecture decisions behind this layout are in [`docs/adr/`](docs/adr/).

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
see [`docs/vscode/contributing/development.md`](docs/vscode/contributing/development.md).
The IntelliJ plugin, the desktop app and the Orca plugin have their own dev loops
in their `CONTRIBUTING.md`.

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

## READMEs and Store Listings

Every README is written for one reader. A host's `README.md` (VS Code, IntelliJ,
desktop, Orca) and the root `README.md` are for its users: what it does, how to
start, what it leaves out, with screenshots. Everything a developer needs (layout,
build, tests, releases) goes into a `CONTRIBUTING.md` next to it, linked from the
README's **Contributing** section. The npm packages' READMEs are for the
developers who embed them, with the full reference on the documentation site
(`docs/embed/`). The libraries' and webviews' READMEs are for contributors.

The store pages take their text from these places:

- **Visual Studio Marketplace and Open VSX:** `apps/vscode-plugin/README.md`
  and its `package.json`, described below.
- **JetBrains Marketplace:** the `<description>` in
  `apps/intellij-plugin/src/main/resources/META-INF/plugin.xml`.
- **Orca's plugin directory:** `name`, `description` and `images` in
  `apps/orca-plugin/orca-plugin.json`, with the images in
  `apps/orca-plugin/images/`.

### Store images

The covers and screenshots of the store pages and READMEs are made with the
`product-shots` skill of the `miragon-brand` plugin
([Miragon/corporate-identity](https://github.com/Miragon/corporate-identity)),
from [`.miragon/product-shots.yaml`](.miragon/product-shots.yaml). That file
names the skill version the images were made with and, per store, the title,
claim, badge and the files to show. The demo files are in
`.miragon/product-shots/order-service/`, and
`.miragon/product-shots/bpmn-modeler-recipe.mjs` says what the VS Code gallery
shows: the properties panel, the token simulation, linting and a DMN decision
table.

| Product | Images in | Made |
|---|---|---|
| `bpmn-vscode` | `docs/public/shots/vscode/` | headless VS Code (`code serve-web`), on the Mac |
| `bpmn-intellij` | `docs/public/shots/intellij/` | IntelliJ IDEA Community in a Linux container |
| `bpmn-orca` | `apps/orca-plugin/images/` | Orca in a Linux container (Podman on the Mac) |

Build first (the VSIX for VS Code, the plugin ZIP with every platform for IntelliJ:
`compile:all` in `apps/modeler-bridge`, then `./gradlew buildPlugin -PbundleAllPlatforms`,
and `apps/orca-plugin/plugin/` for Orca), then
run the skill's `scripts/listing.mjs` from the repository root, as its
`references/listing.md` describes. `--check` checks the images against each
store's limits without taking new ones. When the skill is updated, make the
images again and raise `skillVersion`. The JetBrains Marketplace takes its images
in the plugin's **Media** section, uploaded by hand: the cover first, then the
gallery.

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
