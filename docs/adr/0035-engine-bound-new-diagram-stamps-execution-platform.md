# 0035 — Engine-bound `newDiagram()` stamps the execution platform

- Status: accepted (#1502)
- Date: 2026-09-14
- Category: bpmn-webview
- Amends: [ADR 0020](0020-untagged-documents-first-class-in-hosts.md)

## Context

`createModeler({ engine })` binds an instance to Camunda 7 or 8, but its
`newDiagram()` delegated to bpmn-js's built-in `createDiagram()`, whose template
is engine-neutral (`isExecutable="false"`, no `modeler:executionPlatform*`).
Every host derives engine and mode availability from the saved XML
([ADR 0020](0020-untagged-documents-first-class-in-hosts.md) /
[ADR 0021](0021-mode-session-subpath.md)), so a diagram created as C7 in one
session reopened as *neutral*: Implement mode disappeared, engine property
groups hid, lint fell back to the neutral rule set. camunda-bpmn-js ships no
platform-specific initial diagram (verified — its Modeler subclasses inherit
the neutral bpmn-js template), so the package must own the stamped template.

This surfaced as review gap R3 during the mode-story work: the package's own
engine-bound creation path did not produce a diagram the same package could
re-detect.

## Decision

The engine-bound `newDiagram()` imports a package-owned template that stamps
`modeler:executionPlatform`, `modeler:executionPlatformVersion`, and
`isExecutable="true"`. The version comes from a new optional
`ModelerOptions.engineVersion` (stamped verbatim — the host owns the value),
defaulting to the latest known version for the engine.

The version registry (`C7_VERSIONS`, `C8_VERSIONS`, `getLatestVersion`,
`getVersions`) moved from `libs/modeler-core` to `@miragon/bpmn-modeler-types`,
because `architecture.spec.ts` forbids the package importing modeler-core. The
old core module re-exports from modeler-types, so core/app consumers are
untouched.

The stamp is minimal: no `exporter`, no `camunda:historyTimeToLive`, no
`xmlns:camunda`/`xmlns:zeebe` — those are host scaffold policy
(`BpmnDocument.empty`), out of scope here. `loadDiagram` never stamps, and the
Design-mode designer's `newDiagram()` stays engine-neutral.

## Alternatives considered

**Host-only stamping.** Leave the package neutral and let each host stamp. Rejected:
external embedders of `@miragon/bpmn-modeler` get no engine metadata, and it
duplicates the same policy across every host.

**Opt-in stamping flag.** Rejected: an engine-bound instance producing a diagram
its own host cannot re-detect as that engine is a bug, not a mode to opt into.

**Mutating `definitions.$attrs` after `createDiagram()`.** Rejected: fragile
serializer coupling, two separate mutations, and the in-memory tree would differ
from a re-imported export.

**Upstream camunda-bpmn-js template.** Rejected: it ships none (verified).

## Consequences

- Fresh C8 diagrams now feed `elementTemplates.setEngines` from creation, and
  fresh diagrams of either engine reopen with the full mode set.
- The version registry is now a public modeler-types export.
- The browser Vitest project gained aliases for the full modeler/designer's
  workspace libs and a CodeMirror/preact `dedupe` list, since a stamped
  round-trip needs a real bpmn-js import/export ([ADR 0032](0032-vitest-browser-mode-for-bpmn-modeler.md)).
- The hosts are unaffected in practice: VS Code and IntelliJ scaffold new files
  via `BpmnDocument.forNewModel()` before the webview runs. Sharing the package
  template with the host scaffold is a possible follow-up.

## Relationship to ADR 0020

[ADR 0020](0020-untagged-documents-first-class-in-hosts.md)'s rule is
never-stamp-on-*open*: an untagged document the user opens stays untagged.
Explicitly creating an engine-bound diagram is not an open — the user chose the
engine — so stamping it does not violate that rule. This ADR amends 0020 only to
record that the package's creation path stamps.
