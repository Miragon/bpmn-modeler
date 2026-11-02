# Agent Instructions

Rules for AI coding agents in this repository: VS Code, IntelliJ and Theia
hosts for BPMN, DMN and Camunda Form modeling, built with **Yarn 4
workspaces**. This file holds only what the code and the skills do not say.

## Skills

The skills in `.agents/skills/` carry the detail: `architecture` (where code
belongs, package boundaries, ports), `tdd`, `adr`, `commit`, `bpmn-js`,
`vscode-custom-editors`, `vscode-webviews`, `vscode-ux-guidelines`,
`intellij-plugin`, `i18n-translate` and `bpmn-browser-testing`. Invoke them
with `/skill-name` in Claude Code or `$skill-name` in Codex.

`AGENTS.md` is the only instruction file: Codex and Claude Code (2.1.277 or
later) both read it directly. `.claude/skills/` links to `.agents/skills/`
because Claude Code does not read `.agents/`. `.claude/settings.json`
configures Claude only. Browser tool setup for both clients, Conductor
included, is in `docs/vscode/contributing/development.md` (Coding agents).

## Rules

- New features and bug fixes start test-first with the `tdd` skill.
- Place code with the `architecture` skill. Workspace aliases live in
  `tsconfig.base.json`.
- A change that moves a package boundary, public API, dependency, protocol or
  another hard-to-reverse choice updates or adds an ADR in `docs/adr/` in the
  same PR. Update the existing topic first and replace superseded text; Git
  preserves history. Use the `adr` skill. ADRs are contributor-facing and not
  published on the VitePress site.
- A new Vitest workspace is listed in `.github/vitest-targets.json`;
  `.github/scripts/check-vitest-targets.mjs` fails the lint job and pre-push
  otherwise.
- VS Code settings use the `miragon.bpmnModeler` namespace (for example
  `miragon.bpmnModeler.language`), never the legacy `miragon.camundaModeler`
  prefix.

## Commands

Use `corepack yarn` as the package manager.

```bash
corepack yarn install           # Install dependencies
corepack yarn build             # Build everything (libs → webviews + plugin)
corepack yarn watch             # F5 Extension Host: webviews rebuild to disk
corepack yarn test              # Every Vitest project, no coverage
corepack yarn test:coverage     # Each workspace's `test`: coverage + thresholds as in CI
corepack yarn lint

corepack yarn test libs/modeler-core/src/kernel/domain/BpmnDocument.spec.ts  # One spec
corepack yarn workspace @miragon/bpmn-modeler-core test                      # One workspace with its coverage gate
corepack yarn workspace vs-code-bpmn-modeler build                           # One workspace build

corepack yarn intellij:run      # Build webview/bridge artefacts, launch a sandbox IntelliJ
corepack yarn intellij:build    # Refresh the artefacts only, after a webview change
corepack yarn workspace @miragon/bpmn-modeler-standalone dev   # Theia/Electron app, full chain
corepack yarn workspace vs-code-bpmn-modeler test:vscode:docker  # Packaged extension in a real VS Code, in a container; not part of `test`
```

`watch` writes bundles to disk because the extension host reads them through
`webview.asWebviewUri`; a dev server does not work there. A webview's `serve`
and `dev` scripts are browser previews (see the `bpmn-browser-testing`
skill). The IntelliJ dev loop is in `apps/intellij-plugin/README.md`.

## Commit Conventions

Commits follow [Conventional Commits](https://www.conventionalcommits.org/).
PRs are squash-merged, so the **PR title** is the commit that lands on `main`
and the line release-please reads. CI validates it (`lint-pr-title.yml`); no
local hook checks commits. Use the `commit` skill to create one.

**Format:** `<type>(<scope>): <subject>`

- **Subject:** imperative present tense, lowercase, no trailing period
  (`add`, not `added`/`adds`). Keep the header under ~72 characters.
- **Types:** a PR title uses one of `feat` (minor bump), `fix` (patch bump),
  `refactor`, `docs`, `chore`. `style`, `test`, `build`, `ci`, `perf` and
  `revert` are fine on branch commits; fold them into `chore` for the PR title.
- **Scope:** the affected workspace or feature, as in the history: for example
  `modeler-core`, `bpmn-modeler`, `modeler-bridge`, `bpmn-webview`,
  `intellij-plugin`, `vscode-plugin`, `deps`. Omit it only for a genuinely
  repo-wide change.
- **Body/footer:** optional. Explain the *why* when the subject does not.
  Reference PRs/issues in the footer (`(#1056)`). Mark a breaking change with
  `!` after the type/scope or a `BREAKING CHANGE:` footer.
- **No agent attribution.** No `Co-Authored-By` or generated-by lines in
  commits or PRs, whatever the agent or model. `.claude/settings.json`
  disables Claude's automatic attribution; it does not configure Codex.

Examples from the history:

```
fix(bpmn-webview): keep bpmn:Group transparent in dark mode (#1056)
fix(modeler-bridge): detach the dispose listener when its subscription is disposed (#2091)
chore(eslint): fail on an empty arrow function in a port adapter (#2092)
```

## Comment Style

Prefer clean code over comments. Write the minimum: no comment for what
the code already says, only a short one to *add* a non-obvious *why*: a
hidden constraint, an invariant the types can't express, the bug behind
this shape. If there's nothing to add, add nothing.

- Never restate the signature or narrate what the code does.
- When you do comment, be brief and precise, usually one line.
- Don't reference PRs, tickets, or callers; that belongs in git history.

## Deployment Webview (Single-Source Markup)

The deployment form's DOM lives only in
`apps/deployment-webview/src/app/formTemplate.ts` (`FORM_TEMPLATE`), which
`main.ts` injects into `#app`. The host shells (`apps/deployment-webview/index.html`,
`apps/vscode-plugin/src/deployment/infrastructure/DeploymentWebviewHtml.ts`,
IntelliJ's `WebviewServer.kt`) ship an empty `<div id="app"></div>`. Edit form
markup only in `formTemplate.ts`.
