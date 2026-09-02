# 0014 — Back form test values with ephemeral virtual JSON documents

- Status: accepted
- Date: 2026-09-02
- Category: vscode-plugin

## Context

Testing a Camunda Form needs process-variable input and a live view of the
values the form would submit. Those values are runtime test state, not part of
the form schema, so writing companion files beside a `.form` document would
pollute the workspace and risk committing test data. Building another JSON
editor inside the webview would duplicate VS Code's editing, validation,
accessibility, and keyboard behavior.

VS Code content providers expose read-only virtual documents. Form input must
be editable, while form output must reject edits, so one provider mode cannot
express both contracts.

## Decision

Expose form input and output through two extension-owned, in-memory filesystem
schemes. Both open in VS Code's standard JSON text editor. The input scheme is
writable and streams each valid JSON object to the form webview; the output
scheme is registered read-only and receives the preview's current form-js
submit data.

The documents are scoped to an open form editor session. Saving writes only to
their in-memory providers, so the values never create or modify workspace
files. They are removed when that session closes unless VS Code refuses to
close a dirty companion tab; in that case its backing data remains detached
from the form until the last retained tab closes. Host/webview messages carry
canonical JSON strings. Hosts without the VS Code companion editors may ignore
those messages, leaving the form preview's default input as an empty object.

## Alternatives considered / rejected

### Persist companion JSON files

Runtime test values do not belong to the modeled artifact and could be
committed accidentally.

### Use untitled documents

Their lifecycle is detached from the form session and closing dirty documents
prompts the user to save them.

### Embed JSON editors in the form webview

This would duplicate the native JSON editor's validation, accessibility, and
keyboard behavior.

### Use one read-only content provider for both documents

A content-provider document cannot accept form input edits. Separate filesystem
schemes let VS Code enforce output read-only status at provider registration.

## Consequences

- Input and output survive webview recreation while the form session stays
  open, but intentionally reset when the form closes or the extension host
  restarts.
- Input snapshots are saved only in memory, keeping the virtual tab clean
  without making values persistent.
- A companion tab retained after a cancelled close keeps its backing data but
  can no longer update or act on the closed form.
- The private webview protocol gains an input handshake and a live output
  update. Hosts that do not implement the companion documents remain valid.
- Two URI schemes are maintained so VS Code can enforce different write
  capabilities.
