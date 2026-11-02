# Deployment

- Status: accepted
- Last reviewed: 2026-11-01

## Context

Developers deploy related BPMN/DMN files to several environments and need to
share connection definitions without sharing credentials. They also need to
know whether the engine runs the diagram currently in the editor. Local
bookkeeping gives immediate feedback, but shared engines and deployments from
other tools require an explicit reconciliation path.

## Contents

- [Targets and credentials](#targets-and-credentials)
- [Saved-target execution](#saved-target-execution)
- [Freshness ledger](#freshness-ledger)
- [Engine reconciliation](#engine-reconciliation)
- [Alternatives and consequences](#alternatives-and-consequences)

## Decision

### Targets and credentials

Store named targets in `<configFolder>/deployment-targets.json`, defaulting to
`.camunda/deployment-targets.json`. Discover the nearest file by walking from
the focused document toward its workspace root using the shared config-file
discovery helper. Target names are unique.
`DeploymentTarget.create` owns the target value rules, and both the file parser
and a form save build targets through it: a trimmed, non-blank name; an engine
of `c7` or `c8`; a non-blank endpoint and the tenant kept verbatim, since named
ledger keys are built from the endpoint and trimming would orphan the rows of a
hand-edited file; URL overrides trimmed, or dropped when blank; an auth type of
`none`, `basic` or `oauth2`, keeping only its own fields and credential refs
(`TargetAuth`); and valid environment references
([target tests](../../libs/modeler-core/src/deployment/domain/deploymentTarget.spec.ts)).
`create` checks the engine and auth type at runtime, because the protocol
payload of a form save is not checked on arrival: a malformed save is rejected
before it writes a file that would no longer load. Parse the team-editable file
defensively: the parser checks the JSON shape and reports a broken value rule
as `targets[i]` plus the field. Register the file's
[JSON schema](../../libs/shared/src/lib/deploymentTargets.schema.json)
for editor validation. A malformed file reports an error and yields no targets
rather than crashing the sidebar.

Credentials stay in the host secret store under `<targetsFilePath>::<name>`.
The file path prevents same-named targets in different projects from sharing
credentials in application-scoped IntelliJ PasswordSafe. Optional secret-store
slots retain the legacy unnamed keys when absent; deletion/rename cleans up
the target slot. Each auth type keeps its credential pair in one entry
(PasswordSafe `Credentials` in IntelliJ, a JSON object in VS Code), so a failed
write leaves the old pair whole. VS Code still reads a pair from the two keys
earlier releases stored while that entry is missing. A save removes those keys
once the entry is stored; a failure to remove them does not fail the save,
because the entry shadows them and the next save or the slot's delete removes
them. Downgrading costs the pair: an earlier release reads only the two keys,
so after the first save it finds no credentials for that target, and a pair it
saves then stays shadowed by the entry after the next upgrade until the target
is saved again. VS Code's delete tries every key of the slot before it reports
the first failure. Never write secrets into the shared file; whole-value
environment references (below) are the only credential values it may hold.

Each edit of the file returns a `TargetChange` from `DeploymentTargets`
(`created`, `saved`, `renamed` or `removed`, with the target it replaces or
removes as `before`), the one place that decides whether a save renames. It names
the retired slot (the old or deleted name, even when the file no longer holds
it), the retired target whose ledger rows are pruned, the name whose
approvals carry over (the saved or renamed target's, none for a create), and
the new slot no saved target owns yet (a created or renamed target's)
([target tests](../../libs/modeler-core/src/deployment/domain/deploymentTarget.spec.ts)).
The services act on the change, so nothing reads a target before saving or
deleting it.

A save stores the slot's credentials and approvals before it writes the file.
Once the file holds a new name, nothing names the old slot again, so a failure
before that point leaves the file and the old slot as they were and empties the
new slot. Once the file is written, a rename or a delete removes the retired
slot even when saving or clearing the active name fails; a delete clears the
active name first, so a failing secret store does not leave it naming the
deleted target. The first failure is the one reported; a cleanup failing after
it is only logged. A save of an existing target keeps what it stored in that
target's slot when the file write fails, because the slot is still in use. That
is a trade-off for one case: switching a stored literal to an environment
reference leaves the reference in the slot while the file still lacks it, so
the target sends an empty value until a save succeeds. Writing the file first
would open the reverse case instead, a reference replaced by a literal while
the secret store rejects writes, and a rejecting secret store is the likelier
failure
([target service tests](../../libs/modeler-core/src/deployment/service/DeploymentTargetService.spec.ts)).

Creating and updating are separate operations so a target is never overwritten
by accident. **New** creates a target from the entered form data and rejects a
name that already exists; **Save** updates the selected target in place and is
disabled when none is selected. A rename onto another existing target's name is
rejected the same way. Both surface a `DuplicateDeploymentTargetError` before
anything is written, so a rejected create or rename leaves the file and secret
store untouched.

Persist the active target name in non-secret host state. The sidebar and
status-bar target picker use the same value. With no selected target, preserve
the legacy unnamed connection behavior and write no target file until the user
creates a target.

Every target change publishes one `DeploymentTargetsEvent` through
`DeploymentTargetService.onDidChange`: a create, save, rename or delete carries
its `TargetEdit`, and a sidebar select or a picked switch carries the new
active name. A create, save, rename or delete that wrote the file publishes
even when saving or clearing the active name or deleting the retired slot fails
after it, so the panel reloads instead of offering a retry of the same edit. A
rejected save, a cancelled delete or a dismissed picker publishes nothing. An
edit stores the active name it implies without a second event. The service
awaits the listeners in subscription order. The change is already made when
they run, so a failing listener is logged and skipped, and the sidebar still
reports the target as saved when the ledger prune after it fails.
`DeploymentFeature` subscribes the status service once and each attached panel
until it is disposed. The status service prunes a retired target's ledger rows
and refreshes the indicator, and the panel pushes the target list, so no
command does either by hand. A panel posts the result of its own target command
before that push, because the form ends its reload lock on the first target
list after a successful result. Overlapping commands push once, after the last
result
([target service tests](../../libs/modeler-core/src/deployment/service/DeploymentTargetService.spec.ts),
[feature tests](../../libs/modeler-core/src/deployment/DeploymentFeature.spec.ts)).

A target name is resolved once per request, command or prefill into a
`DeploymentDestination`: a blank name is the ad-hoc connection
(`AdHocDestination`), a name the file holds is that target at the
`TargetsLocation` it was read from (`NamedDestination`), and any other name is
unknown. The destination is the one place that answers what differs between
the two: which `.env` a request reads, whether it needs approval and under which
slot, the secret slot, the ledger identity, what an accepted deploy persists,
admission, and how the approval prompt names the connection. Each caller states
what an unknown name means: a deploy or start request fails
(`requestDestination`), the active target falls back to the remembered ad-hoc
connection (`activeDestination`), and the credentials prefill shows none
(`prefillDestination`)
([destination tests](../../libs/modeler-core/src/deployment/domain/deploymentDestination.spec.ts)).

Targets can override complete operation URLs through `endpoints.deploy` and
`endpoints.startInstance`. Substitute a percent-encoded process definition key
for `{processDefinitionKey}` in a start URL. Without overrides use conventional
engine routes. Request bodies remain engine-specific: overrides are for gateways
proxying that API, not a different deployment protocol.

Any connection or auth field may embed `${env:MIRAGON_NAME}` references,
resolved from one `.env` (the destination's `dotEnvDirectory`): for a named
target, the one in the directory holding the config folder of the targets file
it was read from (`TargetsLocation.projectDir`), never one located again for the
request; for an ad-hoc request, the one at the document's workspace folder, so a nearer,
possibly vendored targets file can't supply variables for an endpoint the user
typed. With nested workspace folders the innermost one encloses a document on
both hosts — the bridge matches the longest registered root, as VS Code does —
so an outer folder can't widen discovery to a tree the project does not own. Store and display the literal
reference everywhere upstream — secret store, targets file, webview prefill,
target matching — and expand it only when the outbound request is built, inside
the services that issue HTTP requests (`DeploymentService.deploy`/`deployFiles`,
`StartInstanceService.startInstance`, `DeploymentVerificationService.verifyActive`).
The expansion itself lives on the domain objects (`DeploymentConfig`,
`StartInstanceConfig`, `AuthConfig`), which return a request-only copy;
`EnvValueResolver` only builds the variable lookup. Expansion at the last moment
is load-bearing: an accepted deploy writes `config.auth` back to the secret store
and `DeploymentTarget.assertAdmits` matches the request against the saved
target literally — a resolved value there would persist a secret in cleartext
or freeze it, and would break target matching. The ledger identity is the exception, see
[Freshness ledger](#freshness-ledger). A missing variable throws
`UnresolvedEnvVariableError` (names the variable, field and the `.env` searched);
it never falls back to the literal. An expanded config is rebuilt through the
same invariants as a typed one, so a variable set to an empty value behaves like
an empty field.

Resolution is scoped because a committed targets file chooses both the
destination and the variables it embeds:

- Only `MIRAGON_`-prefixed names are referenceable, enforced in the reference
  grammar (`envRef.ts`): every `${env:` must open a well-formed, prefixed
  reference, so a foreign or malformed one is rejected when the targets file is
  parsed or a target is saved, and fails the request otherwise. Non-prefixed
  `.env` entries are dropped on read. An open namespace would let a malicious or
  careless targets change send any project secret to its own endpoint.
- The process environment is not a source. It is shared by every project, so a
  globally exported variable would be reachable from any repository's committed
  targets file. This trades away Codespaces/devcontainer-injected variables.
- The `.env` is tied to the targets file, not to the deployed document: a nested
  targets file (a submodule, vendored content) reads its own project's `.env`,
  never the workspace root's, and Deploy Files uses the active target's `.env`
  for files from any folder. Documents outside every workspace folder resolve no
  references — the git-root/document-directory fallback of config discovery could
  otherwise reach a `.env` from an unrelated tree — and neither does a targets
  file that a config folder such as `../x` places outside its project directory.
- A symlinked `.env` is refused (`WorkspacePort.isSymbolicLink`), since a
  repository can commit one pointing at another project's `.env`.
- `.env` is read only when a value contains a reference, so a broken or
  unrelated `.env` (a virtualenv directory) can't fail requests without
  references; an unreadable one fails referencing requests with
  `UnreadableDotEnvError`.
- No resolved value is echoed: `DisallowedEnvReferenceError` names only the
  field (the offending text may be part of a literal secret), and
  `FetchHttpClient` replaces fetch's transport errors, which quote the full URL,
  with `HttpTransportError` naming only the host.
- No request secret is echoed back either. A gateway in front of the engine may
  repeat the request in its error body, so the REST clients surface only a
  known message field (`message`, `detail`, `title`, `error_description`,
  `error`) or a plain-text body, drop HTML and any other JSON, and cap it at one
  1000-character line (`engineErrorDetail`). Before that, `SecretRedactor` masks
  in it what the request carried: its credentials, the `.env` values substituted
  into it (the expanded config records them as `envValues`), the
  `Authorization` values, and URL userinfo and query values — raw, percent-
  (also twice and with lowercase hex), form-, URL-path- and JSON-encoded. Only
  the server's text is masked; the modeler's own messages never contain a
  resolved secret — only a transport error's resolved host — so a short `.env`
  value can't garble a status code. A successful token response is never
  echoed: an unparseable one may still hold the token.

With these limits, a committed targets file can reach exactly the values the
user put into this project's `.env` for the modeler, and only toward hosts this
developer approved for the target (below).

A named target's credentials and the `.env` values its requests carry are bound
to the origins (`scheme://host[:port]`) its developer approved for the target;
the scheme counts because a switch to `http:` exposes them on the wire. `.env`
values count even without credentials: a committed `auth.type: "none"` target
could otherwise put `${env:MIRAGON_PASSWORD}` into a new host's query. Before
deploy, start instance or verify sends either, the core resolves the request's
destinations — `deployUrl`/`startInstanceUrl` (after `{processDefinitionKey}`
substitution) or `endpoint`, plus the OAuth2 token endpoint — and
`CredentialApprovalService` asks through the host's confirm dialog for any origin
not yet approved; declining sends nothing and fails the request. A cancelled
prompt, such as the keychain read of the approvals, is a dismissal instead: the
services let `UserCancelledError` through, a command ends without a message,
Deploy Files stops the whole batch because its one approval comes before any
file is sent, and the sidebar's Deploy and Start Instance reply with a result
marked `cancelled`, which ends the form's progress without a result banner.
Destinations are computed from the resolved request, so a changed
`.env` value is caught too, and a URL without a host is refused outright: what
`https:` plus a conventional route would reach (WHATWG parsing skips the extra
slashes and takes the route's first segment as the host) can't be checked.
Saving a target through the form approves only the origins the user typed:
literal ones that no target in the shared file names yet. A host the form merely
carried over still asks — from the saved target, or from the selected one that
**New** starts from.
`${env:…}` URLs are never approved on save, and a target that isn't OAuth2
keeps no `tokenEndpoint`/`audience`, so a hidden token endpoint can't be
prefilled and pass as typed when the form switches the target to OAuth2.
Approvals live in the secret store beside the credentials under the same slot
(`getApprovedDestinations` / `saveApprovedDestinations`), so a resolved host is never persisted in
cleartext, `delete` removes them with the credentials, and a rename carries them
over. Ad-hoc requests are gated only once a `.env` value is substituted into
them, under one shared `ad-hoc` slot like their credentials: a typed endpoint is
the user's own choice, one from `.env` is not. The prompt leads with the hosts
and shows the target name, which comes from the shared file, sanitized.

A whole-value env reference is not a secret, so a credential field whose entire
trimmed value is a single prefixed reference is also persisted in the shared
targets file (under `auth.username`/`password`/`clientId`/`clientSecret`, each
schema-pinned to the reference pattern so a literal secret can never validate in;
the parser rejects any other value under these keys, for every auth type).
`CredentialRefs` owns that split. The secret store keeps every value as typed,
refs included: storing a ref overwrites an older literal, and blanking it instead
would break IntelliJ's PasswordSafe, which reads an empty half of a pair back as
absent. On read, file references win over secret-store values and a ref held
only by the store is ignored, so a ref a teammate removed from the file stays
removed (`DeploymentTarget.authWith`); a whole ref is expanded in its trimmed form. A
deploy or start request against a named target must carry exactly the target's
credential refs (`CredentialRefs.admits`): deploy re-saves credentials only to the
secret store, so an edited, added or removed ref would otherwise never reach the
shared file. This lets a teammate clone, add a `.env`, and deploy with no
per-machine credential setup.

Both hosts expose target switching and multi-file deployment. Each selected
`.bpmn`/`.dmn` file is deployed separately, named after the file. The status-bar
item opens the target/verification menu described below.

### Saved-target execution

Connection changes to a named target must be saved before Deploy or Start
Instance. Literal credential edits remain executable; credential environment
references are part of the saved target and must be saved. Both actions share readiness
state and are unavailable during target switches or secret loading.

The core independently resolves the submitted target name within the captured
document context and rejects missing targets or mismatching operation settings
before executing or persisting anything. UI disabling alone cannot establish
which saved destination a request refers to. `DeploymentTarget.assertAdmits`
owns the admission rule for a `TargetRequest`: the endpoint, engine and auth
type, an OAuth2 token endpoint and audience, and only the settings the
operation uses (tenant and deploy URL for a deploy, the start URL for a start)
must equal the saved target's, compared trimmed so a hand-edited file's
padding is no change. A changed connection is reported before differing
credential refs ([target tests](../../libs/modeler-core/src/deployment/domain/deploymentTarget.spec.ts)).
The dispatcher only maps the payload into the request; `requestDestination`
rejects a missing target, and an ad-hoc destination admits any request.

The engine's acceptance is final. Saving the ad-hoc connection, the
credentials and the ledger row afterwards are separate steps: a failed step is
logged and named in the result message ("Not saved: …"), and the ledger row is
still written when the credentials fail. The connection is one
`connectionPatch`: the endpoint, the tenant and the auth type, and for OAuth2
the token endpoint and audience. It is written in one save, so the bridge sends
it as one request, not three. A live deployment is never reported as
failed. `DeploymentOutcome` in the core owns this rule; host adapters report
write failures and decide nothing.

Private credential requests/replies carry a monotonically increasing request
ID and the requested target name. Ignore stale replies, including failures;
uncorrelated replies cannot complete the current lookup. Clear secrets when
switching target or authentication method. Target lists carry their document
directory so another document's same-named target cannot inherit a credential
draft. Returning to ad-hoc mode restores all its connection defaults and clears
named-target URL overrides.

Temporary deployment with unsaved connection edits would require a different
identity and credential-persistence policy. Requiring Save keeps the operation
bound to a reviewable target definition.

### Freshness ledger

Record the fingerprint of the bytes successfully deployed, keyed by destination
identity and file, in per-developer host state. The shared targets file describes
connections, not what this machine deployed.

| Field or key | Meaning |
| --- | --- |
| Named destination | `target:<name>@<endpoint-host>` |
| Ad-hoc destination | `adhoc:<endpoint-host>/<tenantId>` |
| With `${env:…}` refs | the resolved host / tenant is stored as `env:<fingerprint>` — a `.env` switch to another engine changes the key, yet no resolved value is ever persisted |
| Ledger key | `<destination-identity>::<filePath>` |
| Revision | `fingerprint`, `deployedAt`, optional `deploymentId`, `origin`, `verifiedAt` |
| Host state key | the `ledger` field of `bpmn-modeler.deployment.state` in VS Code workspace state / `bpmn-modeler.deployment.ledger` in IntelliJ PropertiesComponent |

Fingerprints normalize line endings and concatenate two independently seeded
32-bit FNV-1a hashes as a 16-digit hex value. This is a portable content-change
check, without `node:crypto`. A deploy reads and fingerprints the file on
disk, so both deploys of the open diagram, the sidebar's Deploy and Deploy
Diagram, first flush the webview's pending edits into the document and save it
through one `SaveBeforeDeploy` step. The sidebar saves only once the config is
valid and the target admitted, so a request rejected at either step writes
nothing. A declined credential approval, a failed `.env` lookup and an engine
error all come after the save, on both deploys, and leave the diagram saved. A
failed save aborts the deploy, whether the save throws or the host reports that
it could not save. Freshness compares against the current editor
buffer, not just disk, so an edit made after the deploy reads `changed` before
it is saved. Additional sidebar files and Deploy Files… are deployed as saved.

| Freshness | Interpretation |
| --- | --- |
| `unknown` (default/gray) | No matching local ledger row; not proof of absence on the engine |
| `deployed` (green) | Editor fingerprint matches the recorded revision |
| `changed` (yellow) | Editor differs from a locally deployed revision |
| `superseded` (blue) | Editor differs from a revision adopted from the engine |

`DeploymentStatusService` owns ledger recording and the freshness indicator;
`DeploymentTargetService` owns target files and credentials. Each ledger write
(record, adopt, forget, prune) ends by refreshing the indicator, so no caller
refreshes after a deploy or a verification. It refreshes after a failed write
too, because an ad-hoc deploy saves the connection the indicator reads just
before its row. Target changes (through the
[targets event](#targets-and-credentials)), editor focus and debounced
document edits refresh it as well. The bridge listens to its document mirror
for edit-time refresh. The active target and the ledger are part of the
deployment state's synchronous `load()`, which follows the
[synchronous mirror contract](architecture-and-hosts.md#host-replicated-state),
and of the startup/restart seeds.

The indicator names the connection its freshness refers to. Each destination
answers it as its `statusConnection`: a named target gives its name, the ad-hoc
destination gives the form values once a deploy has saved the form's endpoint,
and no connection before that. A target name that no longer resolves falls back
to the remembered ad-hoc destination, so it is labelled as the form values too.
`deploymentStatusView` turns the connection, the freshness and the revision's
times into the `deploymentTarget` slot's
[status view](architecture-and-hosts.md#host-integrations):
the label, the dot's tone and the tooltip for both hosts
([view table](../../libs/modeler-core/src/deployment/domain/deploymentStatusView.spec.ts)).
Without a connection it shows "No deployment target" with no freshness. The
core formats the times with `Intl.DateTimeFormat` in the modeler language and
the machine's time zone, so VS Code and IntelliJ show the same text; an
unreadable stored time is shown as stored.

### Engine reconciliation

Verification runs on demand through a command or the status-bar menu, never on
open, edit or a timer. Local feedback therefore needs no network access and
does not produce background authentication errors against sleeping engines.

A separate `EngineInspectionPort.fetchLatestDefinition` is implemented by the
Camunda 7 client. C8 has no verification menu entry and its command reports the
operation unavailable; there is no unsupported engine-router stub. Lookups use
the plain REST base URL, not the deployment URL override. Adding C8 inspection
would require a separate capability such as Operate and its authentication.

Reconciliation compares the stored row, editor content and fingerprint of the
engine's latest XML. A current revision gains `verifiedAt`; a matching engine
revision can seed an absent local row; a differing engine revision is adopted
with `origin: "engine"`, producing blue freshness; an absent engine definition
removes the row. A subsequent local deploy writes a local-origin row. Missing
`origin` on older rows means local, preserving their interpretation.

Named identity includes endpoint host so changing that host invalidates old
rows. Target rename/delete prunes the ledger keys of the retired target its
`TargetChange` names, at the file the edit was made in
(`TargetEdit.retiredDestination`). Older name-only keys no
longer match and show unknown until verification or deployment seeds a current
row. This accepted reset avoids reusing a misleading green indicator.

The inspection service is separate from local status refresh. Protocol additions
for verification, status menus, ledger persistence/pruning and `verifiedAt`
belong to the private bridge contract; both hosts render the same freshness
states and timestamps.

## Alternatives and consequences

- Host-specific settings profiles cannot provide the same team-shareable,
  host-neutral connection file. A base URL alone cannot express gateways that
  rewrite entire operation paths.
- The local ledger can drift when another developer deploys or an engine is
  reset. On-demand verification repairs it without promising continuously
  verified engine state. A different path on the same endpoint host is not a
  distinct named ledger identity under the current scheme.
- The ledger belongs to one developer, so fresh clones initially show unknown;
  verification can adopt a matching engine revision. File renames likewise
  change the key.
- Credentials remain private while connection definitions are reviewable.
  Saving target metadata is an intentional additional step before execution.
- Deploying the open diagram always saves it first, so neither Deploy button
  can ship the saved version while keeping unsaved edits.
- Approval adds one confirmation per target and host on first use, including
  once for every existing target with credentials or `.env` references after
  upgrading, because no approval predates the feature. A host that another
  target in the file already uses asks once even when typed. A fresh clone whose
  credentials are pure `${env:…}` references confirms the target's host once as
  well. Approvals are per secret slot, so they follow the targets-file path like
  the credentials do.
- Error messages trade detail for containment: a gateway's plain-text or
  structured message survives, but an HTML page or an unrecognised JSON body
  shows only the HTTP status, and a short substituted `.env` value or query
  value is masked wherever it appears in the server's text. A draft loaded while
  the file named a host and saved after that host was removed counts it as
  typed: the save sees only the file's current state.
- A non-OAuth2 target loses a hand-written `auth.tokenEndpoint`/`audience` on
  load and on save, before its references are checked, so a hidden field never
  blocks a save. Padded URL overrides of a hand-edited file load trimmed and are
  rewritten trimmed.
- Environment references trade convenience for containment: no process-env or
  Codespaces variables, a mandatory `MIRAGON_` prefix (existing `CAMUNDA_*`
  entries must be duplicated), literal values may not contain `${env:`, and a
  targets file carrying a literal under a credential key no longer loads. The
  [envRef tests](../../libs/modeler-core/src/deployment/domain/envRef.spec.ts)
  pin the grammar and a schema parity spec keeps the JSON schema patterns in step.
- Core target validation and webview regression tests cover stale replies,
  readiness and context changes; [deployment tests](../../libs/modeler-core/src/deployment)
  cover identity, freshness and reconciliation, and the
  [bridge contract tests](../../apps/modeler-bridge/src/protocol/protocol.spec.ts)
  pin the protocol descriptor, and the IntelliJ
  [handler coverage test](../../apps/intellij-plugin/src/test/kotlin/io/miragon/intellij/bpmn/bridge/ProtocolHandlerCoverageTest.kt)
  checks that the Kotlin host handles each of its core→host methods.
