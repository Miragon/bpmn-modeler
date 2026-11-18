## Issue

<!-- Use `Part of #` instead of `Closes #` if this PR delivers only part of the issue. -->
Closes #

## Description

<!-- What changed and why. Link an ADR if this changes architecture or public API. -->

## Ships in

<!--
For a feat or fix: tick each release line whose users get this change. Judge
by wiring, not by bundled files: a line gets the change only when it offers
it. The merge view lives in libs/bpmn-merge, which three lines bundle, but
only VS Code opens it, so a merge-view feat ticks `vscode` alone.

Tick `none` when no released user gets it, such as a fix to a feature no
release shipped yet.

Nothing ticked: the lines follow the changed files, and the "Validate release
lines" check fails when they reach two or more lines.

A line can show its own changelog subject instead of the PR title:
  - [x] `bpmn-modeler` as `fix(viewer): keep the zoom when the diagram reloads`

A breaking `!` in the title must tick each line whose contract it touches.

chore, docs and refactor PRs reach no line and may leave this empty.
-->

- [ ] `bpmn-modeler`: npm package `@miragon/bpmn-modeler`
- [ ] `vscode`: VS Code extension, Open VSX, standalone app
- [ ] `intellij`: IntelliJ plugin
- [ ] `orca`: Orca plugin
- [ ] `dmn-modeler`: npm package `@miragon/dmn-modeler`
- [ ] `none`: no released user gets it

## Author checklist

- [ ] PR title follows Conventional Commits (`<type>(<scope>): <subject>`; breaking changes marked with `!`)
- [ ] Tests added or updated (or N/A)
- [ ] Docs (or N/A)
- [ ] ADR updated or added under `docs/adr/` (see the [recording rules](../docs/adr/README.md#recording-rules)) (or N/A)
- [ ] Self-reviewed the diff
- [ ] No new architecture-test violations (`architecture.spec.ts`, part of `corepack yarn test`)
- [ ] Verified in the affected hosts — VS Code / IntelliJ / standalone (or N/A)
