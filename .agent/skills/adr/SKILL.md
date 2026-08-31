---
name: adr
description: Create and maintain Architecture Decision Records in docs/adr/ for this repository. Use whenever a change embodies an architecturally significant decision — adding/swapping a dependency, runtime, or transport, moving a package boundary or public API surface, adopting a protocol or distribution mechanism, introducing infrastructure — even when the user only asks for the implementation and never mentions documentation. Also use when the user asks to document a decision, asks why a past architectural choice was made, or when ticking the "ADR added" box in the PR template.
---

# Architecture Decision Records (this repo's convention)

The decision log lives in **`docs/adr/`**. The rules below are themselves
recorded in [ADR 0001](../../../docs/adr/0001-record-architecture-decisions.md);
this skill is the working summary.

## When to write one

Write an ADR when the change is something a competent new contributor would
look at and ask *"why is it like this?"*:

- It constrains future work: package boundaries, public API surface,
  supported platforms, protocol/transport shapes.
- It is costly to reverse: runtime (e.g. Bun binary), framework, distribution
  mechanism, license.
- It embodies a trade-off invisible in the code (chose X *despite* Y).
- It introduces or removes a dependency, service, or infrastructure.

Do **not** write one for routine work: bug fixes, refactors that keep
boundaries intact, naming, dependency bumps without behavioral consequences.
A log where every third PR carries an ADR trains readers to ignore it —
selectivity keeps it trustworthy.

If mid-task you realize the work embodies a significant decision the user
never asked to document, write the ADR as part of the same change and point
it out in the summary. The PR template's Author checklist has an "ADR" box
for exactly this check. When you wrote the ADR on the user's behalf, flag
any rationale you *inferred* rather than were told — the user must be able
to correct the "why" before it hardens into the immutable record.

## How to write one

One file per decision: `docs/adr/NNNN-short-kebab-title.md`, numbered
sequentially (flat directory, no subfolders). Nygard format with this repo's
header:

```markdown
# NNNN — <The decision as a decision — "Ship the runtime as a Bun binary", not "Runtime">

- Status: accepted | proposed | superseded by [NNNN](NNNN-title.md)
- Date: YYYY-MM-DD
- Category: <module>

## Context
<Neutral facts: constraints, forces, what breaks if nothing is decided.>

## Decision
<What was decided, one or two paragraphs.>

## Alternatives considered / rejected
<Optional — only when there was a real contest. One block per serious
alternative: what it was, the one reason it lost.>

## Consequences
<What follows — good AND bad. Name the accepted trade-offs explicitly.>
```

Rules:

- **Category = the workspace the decision primarily constrains**
  (`modeler-core`, `modeler-bridge`, `intellij-plugin`, `vscode-plugin`,
  `bpmn-webview`, `shared`, …), or `cross-cutting` for repo-wide decisions.
  Categorization is by module, not by feature — features span webview + host
  + core and give decisions no single home (ADR 0001).
- **One ADR per decision.** A change embodying two decisions gets two files.
- **Accepted ADRs are immutable.** A change of direction gets a *new* ADR
  that marks the old one `superseded by NNNN`. Never rewrite history.
- **Update the index**: add a row in the category's table in
  `docs/adr/README.md`.
- Reference the driving issue/PR in the Status line (e.g.
  `accepted (#1061)`), matching the existing records.
- If the ADR's rule is mechanically enforced (e.g. the `vscode`-free gate in
  `libs/modeler-core/src/architecture.spec.ts`), name the enforcement in the
  ADR.
- Keep it to roughly a page; compress to what a future reader needs to *not*
  re-litigate the decision.
- `docs/adr/` is deliberately **excluded from the published VitePress site**
  (`srcExclude` in `docs/.vitepress/config.mts`) — it is contributor-facing.
  Don't add ADRs to the site sidebar.

## When asked "why is X like this?"

Check `docs/adr/` before doing git archaeology. If the answer is there, cite
the ADR. If you reconstruct it from history instead, offer to capture it as a
dated, clearly-retrospective ADR.
