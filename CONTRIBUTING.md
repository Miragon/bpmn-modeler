# Contributing to BPMN VS Code Modeler

First off — thank you for taking the time to contribute! Every contribution, big
or small, helps keep this project alive and useful.

This document covers the **process** for getting involved. For a deep-dive
development guide (project structure, build system, architecture, testing), see
[`docs/development.md`](docs/development.md).

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Ways to Contribute](#ways-to-contribute)
- [The Acceptance Gate (Triage)](#the-acceptance-gate-triage)
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
- **Improve documentation** — docs live in [`docs/`](docs/) and inline in the
  code; PRs are welcome.
- **Submit code** — see [Development Setup](#development-setup) and
  [Pull Request Process](#pull-request-process) below.

## The Acceptance Gate (Triage)

We decide **whether** a change should happen *before* looking at **how** it is
implemented. This keeps the decision on the idea's merits — an already-written
diff should never bias us into merging something we didn't actually want.

The flow for any non-trivial change:

1. **Open an issue.** It is automatically labelled `needs-triage`.
2. **A maintainer triages it.** We discuss scope and fit with you and either
   mark it `accepted` (green light) or close it with a short reason.
3. **Only then is an implementation PR reviewed.** A PR must link an `accepted`
   issue (`Closes #123`). PRs whose linked issue is still `needs-triage` are
   labelled `blocked: awaiting-acceptance` and put on hold until the issue is accepted.

Please **do not open a PR before the issue is accepted.** Doing so wastes your
effort if we decide the change isn't a fit. Trivial, obviously-correct fixes
(typos, a broken link) may skip the wait — add the `no-issue` label if there is
genuinely nothing to discuss.

## AI-Assisted Contributions

Using an AI assistant to help draft an issue, a PR, or code is **allowed and
welcome** — the modeler itself is built with these tools. But:

- **You are accountable for everything you submit.** Read and stand behind every
  line. "The AI wrote it" is not a review, an explanation, or a defence.
- **The acceptance gate applies fully.** An AI can generate a plausible-looking
  issue *and* its PR in minutes; that is exactly the pattern the gate exists to
  slow down. Propose the *problem* first, let it be accepted, *then* implement.
- **Low-effort, unvetted AI output will be closed** — issues that restate the
  obvious without a concrete use case, or PRs whose author cannot explain their
  own diff. This is about quality and reviewer time, not about the tool.
- If a change is substantially AI-generated, a one-line note to that effect in
  the issue or PR helps reviewers calibrate — it is appreciated, not penalised.

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

Discussing scope in an issue *before* writing code saves everyone time — and is
required here: implementation PRs are only reviewed once the issue is `accepted`
(see [The Acceptance Gate](#the-acceptance-gate-triage)).

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
3. Select **"Run vscode-plugin"** and press **F5**.

Reload the host after a change with `Cmd+R` (macOS) or `Ctrl+R` (Windows/Linux).

For comprehensive guidance (standalone browser preview, testing, architecture),
see [`docs/development.md`](docs/development.md).

## Pull Request Process

1. **Open an issue first and wait for it to be `accepted`.** A maintainer marks a
   triaged issue with the `accepted` label — that label is the go-ahead. PRs
   whose linked issue is not `accepted` are put on hold and not reviewed (see
   [The Acceptance Gate](#the-acceptance-gate-triage)).
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
    - Changes that move a package boundary, public API, dependency, or
      protocol come with an ADR in [`docs/adr/`](docs/adr/) — see the rules in
      [ADR 0001](docs/adr/0001-record-architecture-decisions.md). If you work
      with an AI coding agent, the repo-bundled `adr` skill
      (`.agents/skills/adr/`) applies these rules automatically.
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
