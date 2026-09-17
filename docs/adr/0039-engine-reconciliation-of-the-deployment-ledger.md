# 0039 — On-demand engine reconciliation of the deployment ledger (Camunda 7)

- Status: accepted
- Date: 2026-09-17
- Category: deployment

## Context

The freshness dot from [ADR 0037](0037-deployment-ledger-in-host-state.md) is
decided entirely locally, and the ledger drifts: a colleague deploys to the
shared target, the engine is reset behind the same URL, the target's
`endpoint` is hand-edited under the same name, a target is deleted and
re-created, or the deploy happens outside the modeler. Several of these
produce a **wrong green** — the dangerous case, because the dot exists to
prevent exactly that misplaced confidence. ADR 0037 recorded engine
verification as an explicit follow-up and kept the `deploymentId` in the
ledger for it.

Only Camunda 7 exposes a deployment/resource lookup through its plain REST
API; C8 would need Operate.

## Decision

Reconcile the ledger against the engine **on demand only** — a palette/Tools
command plus a menu on the status-bar item's click (switch target / verify).
Never automatically: a local single-developer engine gains nothing from
polling, and verification is a deliberate act.

- **C7-only inspection port.** A separate `EngineInspectionPort`
  (`fetchLatestDefinition`) that only `Camunda7RestClient` implements — no
  router involvement, no "unsupported" stub for C8. C8 targets get no verify
  menu entry and the command reports it as unavailable. Lookups use the plain
  REST base URL; the `endpoints.deploy` override is not applied.
- **Reconcile, don't just check.** The pure `reconcile` function compares the
  recorded row, the editor content, and the engine's latest version
  (fingerprinting the deployed XML): `current` re-stamps `verifiedAt`,
  `adopted` seeds a row from the engine when its content matches the editor
  (fixing gray dots from fresh clones or colleague deploys of the same
  diagram), `missing` deletes the row.
- **Engine-origin revisions render a distinct `superseded` (blue) state** when
  their content differs from the editor: "the engine runs something newer" is
  a different fact than "you have undeployed changes" (yellow). `origin:
  "engine"` on the revision carries this; a subsequent local deploy writes a
  local-origin row and leaves the state.
- **Ledger hygiene.** Named-target identity now includes the endpoint host
  (`target:<name>@<host>`), so a hand-edited endpoint self-invalidates its
  rows; target delete and rename prune the identity's rows
  (`DeploymentStatePort` gained `listLedgerKeys` /
  `deleteDeployedRevisions`).

## Alternatives considered

- **Automatic verification on open/edit/interval.** Rejected: an engine
  round-trip per edit or editor open is the cost ADR 0037 avoided, and a
  background 401 toast against a sleeping local engine is noise. On-demand
  keeps the dot's contract honest ("local record") and makes verification an
  explicit act with an explicit result.
- **A C8 path via Operate.** Rejected for now: Operate is a separate product
  with separate auth; the plain C8 REST API has no deployment/resource
  lookup. The port boundary keeps the door open.
- **Verification state outside the ledger.** Rejected: a second store would
  need its own pruning and seeding; `origin`/`verifiedAt` on the existing
  `DeployedRevision` keeps one row per (target × file) and old rows valid
  (absent `origin` means local).

## Consequences

- Existing `target:<name>` ledger rows no longer match the new
  `target:<name>@<host>` keys and go gray once; a verify (or the next deploy)
  re-seeds them. Accepted — a one-time gray beats a false green.
- `freshnessFor` gained the `superseded` state; both hosts render it blue
  (`charts.blue` / `JBColor(0x3574F0, 0x548AF7)`) and show `verifiedAt` in
  the tooltip. The status-bar click now opens a menu instead of switching
  directly.
- The bridge protocol gained `deployment/verify`, `deployment/statusBarMenu`
  (host→core) and `deploymentState/deleteDeployedRevisions` (core→host);
  `statusBar/showDeploymentTarget` carries `verifiedAt`. `protocol.json` is
  regenerated and the contract test pins them.
- Supersedes the "Verify against the engine on open/edit" note under
  *Alternatives considered* in ADR 0037 — the follow-up recorded there is
  this decision.
