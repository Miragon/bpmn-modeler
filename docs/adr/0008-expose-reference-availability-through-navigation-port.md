# 0008 — Expose reference availability through the model navigation port

- Status: accepted
- Date: 2026-08-28
- Category: bpmn-webview

## Context

The model-navigation capability opens referenced BPMN, DMN, and Camunda Form
files through `ModelNavigationPort`. Form navigation additionally needs to hide
its context-pad action when no matching workspace form exists. The first
implementation delivered that status through the private host/webview protocol
and an internal facade method, outside the public capability contract fixed by
[ADR 0007](0007-public-modeler-api.md).

A host may discover availability asynchronously, but bpmn-js builds context-pad
entries synchronously. The modeler therefore needs a synchronous view of the
host's latest availability snapshot and a notification when that snapshot
changes.

## Decision

`ModelNavigationPort` optionally exposes `isReferenceAvailable(reference)` and
`onReferenceAvailabilityChanged(listener)`. The availability check is
synchronous; a host with asynchronous lookup maintains its own cache and emits
the change notification after refreshing it. The modeler then rebuilds an open
context pad from the new snapshot. The subscription returns an unsubscribe
function that the modeler invokes when its bpmn-js diagram is destroyed.

Both hooks are optional. Omitting them treats every syntactically valid
reference as available, so supplying the navigation capability enables its UI
without requiring workspace-index infrastructure. The VS Code protocol adapter
implements both hooks for linked Forms and keeps its existing pessimistic
visibility until the host supplies the resolvable Form IDs.

## Alternatives considered / rejected

### Add `applyFormReferenceStatus` to the modeler handle

This would expose a Form-specific transport payload on the general modeler
facade and split one capability's input across the handle and its port.

### Resolve availability asynchronously while building the context pad

bpmn-js expects providers to return entries synchronously. Hiding an entry,
starting a request, and reopening the pad later would duplicate cache and
lifecycle behavior that belongs to the host capability.

### Always show linked Form navigation

This is simple for host-less consumers but regresses the hosted editor, where a
dead navigation action can be avoided because the workspace index is already
available.

## Consequences

- Reference opening and reference availability share one typed public
  capability; the private protocol remains an adapter detail.
- Existing consumers remain source-compatible and show valid references by
  default because both hooks are optional.
- Hosts that resolve references asynchronously must cache the result and emit a
  change notification after updating it.
- Availability subscriptions must release their listeners through the returned
  unsubscribe function when the modeler is destroyed.
- The current protocol adapter only restricts Form references, but the contract
  can support availability checks for other reference kinds without another API
  change.
