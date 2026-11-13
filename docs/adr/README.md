# Architecture Decision Records

These living records describe the current architectural decisions of the BPMN
modeler monorepo: the constraints, rationale, rejected alternatives and accepted
costs a contributor needs before changing the design. Coding agents read them
often, so every topic stays small and holds only what the code cannot say. Git
preserves earlier decisions and their evolution.

## Topics

| Record | Owns |
| --- | --- |
| [Architecture and hosts](architecture-and-hosts.md) | Package boundaries, core contexts, the host/core split (core-built text, features built once, listings, focus), shared host caches |
| [Webview protocol and sync](webview-protocol-and-sync.md) | The host/webview seam: private protocol and closed command lists, document sync and the flush reply table, webview bundle and CSP |
| [Role folders](role-folders.md) | Hexagonal role folders, workspace kinds and the rules that read them |
| [IntelliJ bridge](intellij-bridge.md) | Bun binary, stdio JSON-RPC and protocol contract, process lifecycle and recovery, document causation, host-replicated state |
| [BPMN modeler](bpmn-modeler.md) | Public API and capabilities, surfaces and modes, document identity, mode session and lifecycle |
| [BPMN modeler features](bpmn-modeler-features.md) | Properties panel, themes and locale, linked form previews, transaction boundaries, formatting and cleanup |
| [BPMN linting](bpmn-linting.md) | The lint injection contract and tiers, host linting, workspace rule packages: the gate, updates without a reload, asking only when needed |
| [Diff](diff.md) | BPMN and DMN model diff: data libraries, navigation order, shared vocabulary and legend, diff panes |
| [BPMN plugins](bpmn-plugins.md) | bpmn-js plugin format, the `/plugins` loader, discovery, serving from the content-addressed cache, what a plugin can reach |
| [Workspace code allowance](code-allowance.md) | When workspace code may run: the allowance per repository and add-on, approval store, the question flow, host trust |
| [Add-ons](add-ons.md) | The add-on catalog and its view: allow and revoke, page protocol and reveals, brand look, VS Code and IntelliJ placement |
| [Element templates](element-templates.md) | Template preview, template editor and builder, marketplaces, per-user template switches |
| [DMN modeler](dmn-modeler.md) | Separate embeddable package, public API, themes, locale |
| [Form editor](form-editor.md) | Forms inside the VS Code extension, engine version selection, metadata-only edits |
| [Deployment](deployment.md) | Targets, credentials, environment references, execution, freshness ledger, engine reconciliation |
| [Release and publishing](release-and-publishing.md) | Release components, source markers, release PR, npm/Marketplace/Open VSX/Orca publishing |
| [Standalone app](standalone-app.md) | Theia and Electron runtime, dependency security overrides, Flatpak Git, built-in languages, Windows packages |
| [Dependencies](dependencies.md) | Private upstream APIs, identity-sensitive bpmn-io pins, TypeScript compilers |
| [Testing](testing.md) | Test environments, fakes and contract suites, test-first for rules, coverage, mutation testing, CI test targets |
| [Architecture enforcement](architecture-enforcement.md) | Architecture tests, guarded values, the fitness function report and its functions, architecture review |

## Recording rules

Update or add an ADR in the same change as a significant architectural decision:
package boundaries, public APIs, runtimes, transports, dependencies,
distribution, infrastructure, or a consequential trade-off not apparent from
the code. Routine fixes, naming changes, and dependency bumps without changed
constraints do not need a new decision section.

- **Write the decision, not the code.** A record holds the decision, the
  constraint it puts on future changes, why, the alternatives someone would
  otherwise re-propose, accepted costs and residual risks, and the test or check
  that enforces it. It does not hold how the code works (the code, its specs and
  the skills say that), inventories of classes, methods, messages or files,
  step-by-step flows, measurements, trial results or benchmark tables, per-PR
  history, user-guide content, or lists of proposed future work (use an issue).
  A named type or file is a fine anchor; a paragraph that restates it is not.
  Before adding text, ask what an agent would get wrong without it.
- **Keep topics small.** A topic stays around 300 lines. When a section pushes it
  past that, first cut what the code already says; if the topic still outgrows
  the budget, split off the area that became its own topic and update the table
  above. Update the owning topic rather than adding a file for one feature, but a
  coherent new area, or a topic over budget, gets a file of its own.
- **Keep only the current decision.** Replace superseded text in place, including
  affected context and consequences. Remove completed migration plans and
  obsolete limitations; retain the rationale and alternatives that still explain
  the current choice. Do not append amendment histories or keep superseded
  records alongside their replacements.
- **Give each decision one home.** A change can update several topics. Put
  cross-cutting rules in their owning topic and link to the relevant section
  rather than repeating the rule in every module's record.
- **Use descriptive filenames and section links.** Files live directly under
  `docs/adr/` as `<topic>.md`, without sequence numbers or category directories.
  Keep headings stable where possible, repair incoming links when moving a
  section, and update the table above when adding or changing a topic.
- **Use Context / Decision / Consequences**, with optional Alternatives and topic
  subsections. A topic with more than four sections needs a short contents list.
- **State status and last review date.** `Status: accepted` describes the current
  record; `Last reviewed: YYYY-MM-DD` records the review, not a new decision date
  for all its contents. Clearly mark a proposed section if a choice is still
  pending.
- **Check source and enforcement.** Link the architecture tests or build checks
  that hold the decision. Resolve partial amendments against the current
  implementation; do not invent intent when code and the recorded rationale
  disagree. Identify inferred rationale for review. Retain issue/PR references
  when they provide useful evidence, without making readers reconstruct the
  decision from them.

Consult Git history for superseded choices; the working tree is the current
reference.

## Publication

ADRs are contributor documentation. `docs/.vitepress/config.ts` excludes
`adr/**` from the published site. Do not add these records to its sidebar;
published contributor guides can link to their GitHub source.
