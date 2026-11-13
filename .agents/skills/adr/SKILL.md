---
name: adr
description: Maintains the living architecture decision records in docs/adr/. Use when a change moves a package boundary, public API, dependency, runtime, protocol or distribution choice, or for the PR's ADR checklist item.
---

# Architecture Decision Records

The current decisions live in [docs/adr](../../../docs/adr/README.md).
That README owns the recording rules and topic index; Git preserves history.

## When to update a record

Record choices that constrain future work, are costly to reverse, or explain a
trade-off the code cannot show: package boundaries, public API, runtime,
transport, dependencies, infrastructure and distribution. Routine fixes,
renames and dependency bumps without changed constraints do not need a new
section.

Include an ADR update in the same change when its implementation embodies such
a decision, even if documentation was not explicitly requested. Identify any
rationale you inferred so the user can correct it during review.

## Choose the owning topic

The topic table in the [README](../../../docs/adr/README.md#topics) names every
record and what it owns. Read it first; it is the only list of topics, so this skill
keeps no copy that could drift.

Update the relevant section, or add a section within that topic. A feature that
spans layers can still have one owning topic; link to shared rules rather than
copying them. Create another descriptive `<topic>.md` for a distinct area that has
no coherent home, or when the owning topic is over its size budget (about 300
lines) after you cut what the code already says; then update the README index. Do
not number records.

## Write the decision, not the code

Agents read these records often, so every line has to earn its place. Keep the
decision, the constraint it puts on future changes, the reason, the alternatives
someone would otherwise re-propose, accepted costs and the test or check that
enforces it. Leave out how the code works, inventories of classes, methods or
messages, step-by-step flows, measurements and trial tables, per-PR history,
user-guide content and lists of future work (use an issue). Before adding a
paragraph, ask what an agent would get wrong without it.

## Keep the current decision coherent

Replace superseded statements and reconcile their context, alternatives and
consequences. Preserve active constraints, rationale and accepted costs; remove
obsolete limitations, completed migrations and amendment narratives. Do not
keep archive copies or superseded stubs. Check current source and tests rather
than assuming the newest prose is accurate, and do not invent an explanation
for an unexplained discrepancy.

Use Context / Decision / Consequences with topic subsections and optional
Alternatives. Add contents links when a record is long. Keep the accepted
status and update `Last reviewed: YYYY-MM-DD`; that is a review date, not a
new decision date for everything in the file. Mark proposed sections clearly.

Link the enforcing test/build check and useful driving issue or PR. Keep
headings stable where possible; repair incoming references if moving a section.
ADRs remain excluded from VitePress via `srcExclude`; do not add them to the
published sidebar.

For a "why" question, cite the owning section. If the rationale must be
reconstructed from Git history, distinguish evidence from inference before
adding it to the current record.
