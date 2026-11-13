# Form editor

- Status: accepted
- Last reviewed: 2026-11-13

## Context

Camunda Forms (`.form` files) are edited with form-js. They share the modeling workflow, the host
infrastructure and the release lifecycle of the BPMN and DMN editors, but form-js keeps its own
schema version, serialization and engine compatibility table.

## Decision

### Inside the VS Code extension

Forms use a dedicated form-js webview and `.form` custom editor inside the VS Code extension. A
separate extension would duplicate the host infrastructure and need another install. The accepted
cost is a larger extension for users who do not model forms. IntelliJ has no Form editor.

The Form page shares the document sync of the other editors
([document sync and flush](webview-protocol-and-sync.md#document-sync-and-flush)) but posts each
change at once instead of debouncing, because its JSON export is synchronous and cheap.

### Engine version

Forms use the existing native engine-version status slot and the Change Engine Version command, not
selectors in the webview.

- The Form compatibility table is independent of BPMN's registry and default. New Forms use the
  newest version from the Form table.
- A missing or unsupported declaration stays visible and untouched until the user makes an
  explicit, complete choice. Escape, an incomplete choice and an unchanged pair do not flush, write
  or notify.
- `EngineVersionSelectionService` dispatches by the document path, and each host registers the
  formats it supports in its composition: VS Code BPMN and Form, the IntelliJ bridge only BPMN. A
  closed editor and an unregistered format are quiet no-ops, so hosts do not duplicate the routing.
- The selection captures the session, the host revision and the engine metadata before the native
  pickers open, flushes pending visual input destructively, and writes only when the flushed
  document still matches what it captured. A stale or refused selection reports one retry message,
  and only while the captured session is still current.

### Metadata-only edits

A version change patches only the two metadata fields in the source text, through the narrow
`FormTextEdits` port. Whole-schema serialization through form-js would upgrade an unrelated
`schemaVersion` and normalize custom properties and formatting. The edit goes through the ordinary
document write, so dirty tracking and undo work, and it is never an autosave.

- The adapter depends on the pinned `jsonc-parser` and applies only those two edits. The domain
  accepts plain JSON only, and the adapter does not repair invalid source.
- Accepted cost: one small JSON editing dependency and a separate adapter, instead of importing the
  element-template builder's template-specific editing rules.

The contracts live in the specs under `libs/modeler-core/src/modeler/form/`; the form-js input
harness and the VS Code smoke test cover re-import, visual editability and persistence.
