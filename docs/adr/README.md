# Architecture Decision Records

These living records describe the current architectural decisions of the BPMN
modeler monorepo: the constraints, rationale, alternatives, and trade-offs a
contributor needs to understand before changing the design. Related decisions
share a topic document. Git preserves earlier decisions and their evolution.

## Topics

| Record | Owns |
| --- | --- |
| [Architecture and hosts](architecture-and-hosts.md) | Package boundaries, host ports, IntelliJ runtime and transport, state mirrors, host integration |
| [BPMN modeler](bpmn-modeler.md) | Public API, capabilities, surfaces and modes, properties panel, themes, lint, diff, layout, lifecycle |
| [DMN modeler](dmn-modeler.md) | Separate embeddable package, public API, themes, locale |
| [Deployment](deployment.md) | Targets, credentials, execution, freshness ledger, engine reconciliation |
| [Release and publishing](release-and-publishing.md) | Release components, source markers, npm packing, authentication and consumer checks |
| [Engineering practices](engineering-practices.md) | Test environments, private upstream APIs, dependency compatibility and security |

## Recording rules

Update or add an ADR in the same change as a significant architectural decision:
package boundaries, public APIs, runtimes, transports, dependencies,
distribution, infrastructure, or a consequential trade-off not apparent from
the code. Routine fixes, naming changes, and dependency bumps without changed
constraints do not need a new decision section.

- **Update the existing topic first.** Add a file only for a distinct
  architectural area that has no coherent home. A new feature or PR does not
  automatically need a new file.
- **Keep only the current decision.** Replace superseded text in place,
  including affected context and consequences. Remove completed migration
  plans and obsolete limitations; retain the rationale and alternatives that
  still explain the current choice. Do not append amendment histories or keep
  superseded records alongside their replacements.
- **Give each decision one home.** A change can update several topics. Put
  cross-cutting rules in their owning topic and link to the relevant section
  rather than repeating the rule in every module's record.
- **Use descriptive filenames and section links.** Files live directly under
  `docs/adr/` as `<topic>.md`, without sequence numbers or category directories.
  Keep headings stable where possible and repair incoming links when moving a
  section. Update the table above when adding or changing a topic.
- **Use Context / Decision / Consequences**, with optional Alternatives and
  topic subsections. Longer records need a short contents list. Be concise,
  but preserve constraints and accepted costs instead of imposing a page limit.
- **State status and last review date.** `Status: accepted` describes the
  current record; `Last reviewed: YYYY-MM-DD` records the review, not a new
  decision date for all its contents. Clearly mark a proposed section if a
  choice is still pending.
- **Check source and enforcement.** Link relevant architecture tests or build
  checks. Resolve partial amendments against current implementation; do not
  invent intent when code and the recorded rationale disagree. Identify
  inferred rationale for review. Retain issue/PR references when they provide
  useful evidence, without making readers reconstruct the decision from them.

This replaces the chronological, one-file-per-decision convention. Consult Git
history for superseded choices; the working tree is the current reference.

## Publication

ADRs are contributor documentation. `docs/.vitepress/config.mts` excludes
`adr/**` from the published site. Do not add these records to its sidebar;
published contributor guides can link to their GitHub source.
