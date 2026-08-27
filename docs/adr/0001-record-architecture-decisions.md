# 0001 — Record architecture decisions as ADRs, categorized by module

- Status: accepted
- Date: 2026-08-27
- Category: cross-cutting

## Context

The repository has accumulated significant architectural decisions — the
host-agnostic core extraction, the IntelliJ out-of-process bridge, the
public/private split of the shared types — whose rationale lives scattered
across GitHub issues (#920, #1060, #1293), PR descriptions, and contributors'
heads. Issues get closed and drop out of view; the code shows *what* was
chosen but not *why*, and settled questions risk being re-litigated or
deliberate trade-offs silently undone.

The repo also has a published VitePress documentation site under `docs/`
aimed at users. Decision records are contributor-facing and must not leak
into that site.

## Decision

Record architecturally significant decisions as Architecture Decision Records
in the format of [Michael Nygard](https://github.com/architecture-decision-record/architecture-decision-record/blob/main/locales/en/templates/decision-record-template-by-michael-nygard/index.md)
(Context / Decision / Consequences, plus an optional Alternatives section),
one file per decision:

- Location: `docs/adr/NNNN-short-kebab-title.md`, numbered sequentially from
  0001 in a **single flat directory** — no subfolders.
- Excluded from the published site via `srcExclude` in
  `docs/.vitepress/config.mts`.
- **Categorized by module**, not by feature: each ADR carries a `Category`
  line naming the workspace it primarily constrains (`modeler-core`,
  `bpmn-webview`, `intellij-plugin`, `vscode-plugin`, `shared`, …), with
  `cross-cutting` for repo-wide decisions. The index in `README.md` groups
  records by category.
- An accepted ADR is immutable; a change of direction gets a *new* ADR that
  marks the old one `superseded by NNNN`.
- Written at decision time. ADRs 0002–0005 were written at decision time as
  `docs/vscode/contributing/architecture/*.md` and migrated here verbatim at
  bootstrap (only headers and cross-links adapted); 0006 was retrospectively
  recorded at bootstrap — the one exception.

## Alternatives considered

**Categorize by feature** (diff, inline scripting, deployment, …). Rejected:
almost every feature here spans webview + host + core, so a feature taxonomy
gives most decisions no single home — and the decisions worth recording in
this repo are predominantly *structural* (package boundaries, transports,
build system), which map cleanly onto workspaces. Module names are also
stable and already the scope vocabulary of our Conventional Commits, while
features get added, merged, and renamed.

**Category subdirectories** (`docs/adr/modeler-core/0001-…`). Rejected: it
breaks the single global sequence, makes cross-references ambiguous, and
forces a file move (breaking links) when a decision's scope turns out wider
than first filed. A metadata line plus a grouped index gives the same
navigability without those costs.

## Consequences

- The "why" behind structural choices survives issue closure and personnel
  changes; reviewers can cite an ADR instead of re-arguing.
- Selectivity is required to keep the log trustworthy: routine bug fixes,
  refactors that keep boundaries intact, and dependency bumps do **not** get
  ADRs. If every third commit carries one, readers learn to ignore the log.
- Categories are advisory metadata, not physical structure — the index must
  be maintained by hand when an ADR is added (accepted cost of the flat
  layout).
