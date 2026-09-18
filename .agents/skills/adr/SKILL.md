---
name: adr
description: Maintain the repository's living architecture decision records in docs/adr/. Use for significant changes to package boundaries, public APIs, dependencies, runtimes, protocols, infrastructure or distribution; for documenting architectural rationale; and for the "ADR updated or added" PR checklist. Update an existing topic before creating another file.
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

- [Architecture and hosts](../../../docs/adr/architecture-and-hosts.md): shared
  boundaries, host facilities, bridge/runtime and state ownership.
- [BPMN modeler](../../../docs/adr/bpmn-modeler.md): BPMN API, surfaces, modes,
  capabilities, rendering and lifecycle.
- [DMN modeler](../../../docs/adr/dmn-modeler.md): DMN package, API, theme and locale.
- [Deployment](../../../docs/adr/deployment.md): destinations, credentials,
  execution, ledger and verification.
- [Release and publishing](../../../docs/adr/release-and-publishing.md): release
  routing, markers, packaging and publishing.
- [Engineering practices](../../../docs/adr/engineering-practices.md): test
  environments, upstream internals and dependency compatibility/security.

Update the relevant section, or add a section within that topic. A feature that
spans layers can still have one owning topic; link to shared rules rather than
copying them. Create another descriptive `<topic>.md` only for a distinct area
that has no coherent home, then update the README index. Do not number records.

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
