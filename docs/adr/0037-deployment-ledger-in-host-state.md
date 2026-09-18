# 0037 — Deployment freshness ledger in per-developer host state

- Status: accepted
- Date: 2026-09-17
- Category: deployment

## Context

While iterating, a developer fixes a diagram, forgets to redeploy, starts an
instance, and sees the old error again — with no way to tell a new bug from a
stale deployment. The modeler performs the deploy itself, observes every
document change per editor session, and already shows the active deployment
target in the status bar (see [ADR 0036](0036-deployment-targets-file-and-endpoint-overrides.md)).
What was missing is bookkeeping: nothing recorded *what* was last deployed
*where*.

We want the existing target status-bar item to also signal freshness — whether
the content in front of the developer matches what was last deployed to the
active target — without an engine round-trip on every edit or editor open.

## Decision

Record a **content fingerprint at the moment of each successful deploy**, keyed
by **(target identity × file)**, in per-developer host state, and derive a
three-state freshness dot from it locally.

- **Ledger shape.** `DeployedRevision { fingerprint, deployedAt, deploymentId? }`
  per key. The key is `${targetIdentity}::${filePath}`. A named target keys by
  `target:<name>`; ad-hoc mode (no named target) keys by
  `adhoc:<endpointHost>/<tenantId>` — host only, never the full URL. The whole
  map is a `Record<string, DeployedRevision>`.

- **Fingerprint.** `contentFingerprint` EOL-normalises (`\r\n?`→`\n`, matching
  `sameDocumentContent`) then hashes with FNV-1a 64-bit as hex (two 32-bit
  passes, concatenated). Pure TS, no `node:crypto`, matching the `hashSlug`
  precedent — so it runs unchanged in the browser webview, the Node bridge, and
  under Bun.

- **Freshness.** `deployed` (green, `testing.iconPassed`) when the editor buffer
  matches the recorded fingerprint; `changed` (yellow, `charts.yellow`) when it
  differs, tooltip naming the last-deploy time; `unknown` (default) when this
  machine has no record. `unknown` means "no local record", never "absent on the
  engine".

- **Storage is per-developer host state, not the team-shared targets file.** The
  ledger reflects what *this machine* deployed; it is not a fact about the
  environment and must not be shared or reviewed. It lives under one key
  (`bpmn-modeler.deployment.ledger`) in VS Code `workspaceState` / IntelliJ
  `PropertiesComponent` (persisted as a JSON string), alongside the other
  non-secret `deploymentState` values, and rides the bridge's synchronous seed
  per [ADR 0005](0005-host-replicated-state.md) so
  `DeploymentStatePort.getDeployedRevision` stays a synchronous getter.

- **Ownership.** `DeploymentStatusService` owns the status-bar item and the
  ledger (records on deploy, renders freshness on refresh); `DeploymentTargetService`
  keeps only the targets file + credentials (SRP — it no longer touches the
  status bar).

## Alternatives considered

- **Verify against the engine on open/edit.** Rejected for this step: it needs a
  REST round-trip (and, for C8, Operate) and only Camunda 7 exposes a deployment
  lookup. Recorded as an explicit follow-up — the stored `deploymentId` is kept
  precisely so that check needs no new persisted data.
- **Compare against the saved file on disk instead of the editor buffer.**
  Rejected: the developer reasons about what they see. Known limitation: the
  deploy reads the saved file, so a dirty buffer reads `changed` until saved —
  which is correct, since the engine does not run the unsaved bytes.
- **Store the ledger in the shared targets file.** Rejected: it is per-developer,
  per-machine state and would create noise and false sharing in review.

## Consequences

- `DeploymentStatePort` gained `getDeployedRevision` / `saveDeployedRevision`;
  `StatusBarPort.showDeploymentTarget` gained `freshness` + `deployedAt`. Both
  are mirrored across the VS Code adapters and the bridge RPC protocol (new
  `deploymentState/saveDeployedRevision`, extended
  `statusBar/showDeploymentTarget`); `protocol.json` is regenerated and the
  contract test pins them.
- The dot updates on deploy, on editor focus change, and (debounced ~300 ms) on
  document edits, on all hosts. On IntelliJ the widget prepends a `ColorIcon`
  dot; the bridge drives edit-time refreshes off a `DocumentMirror` content
  listener since it has no host-side per-editor change participant.
- Ledger drift is possible (another developer deploys, engine reset behind the
  same URL, file renamed → key changes → gray). These are exactly what the
  engine-verify follow-up addresses.
