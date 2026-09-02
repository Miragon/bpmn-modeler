# 0015 — Integrate form-js into the BPMN modeler extension

- Status: accepted
- Date: 2026-09-02
- Category: vscode-plugin

## Context

The BPMN modeler already uses bpmn.io libraries to model BPMN processes and
DMN decisions. Camunda Forms use the related form-js toolkit and are normally
created alongside processes; modeling forms without processes is an uncommon
use case.

Form support could either be distributed as a separate extension or added to
the existing BPMN modeler extension.

## Decision

Add the form-js modeler as a dedicated webview and `.form` custom editor in the
existing BPMN modeler extension. BPMN, DMN, and form modeling share the same
extension distribution and reusable host infrastructure.

## Alternatives considered / rejected

### Distribute a separate form extension

A separate extension would isolate the feature and its release lifecycle, but
would duplicate infrastructure and split a workflow in which users commonly
model processes and forms together. It would also require users to discover
and install another extension for the less common standalone form use case.

## Consequences

- Existing BPMN modeler users receive form modeling without another install.
- The modelers can share extension resources and infrastructure.
- Form support follows the BPMN modeler's release lifecycle.
- The existing extension becomes larger, including for users who do not model
  forms.
