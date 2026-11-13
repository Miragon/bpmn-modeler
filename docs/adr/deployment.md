# Deployment

- Status: accepted
- Last reviewed: 2026-11-09

## Context

Developers deploy related BPMN/DMN files to several environments and need to share
connection definitions without sharing credentials. They also need to know whether
the engine runs the diagram currently in the editor. Local bookkeeping gives
immediate feedback, but shared engines and deployments from other tools require an
explicit reconciliation path. A committed targets file also chooses where
credentials are sent, so it is untrusted input to the secret handling.

## Contents

- [Targets and credentials](#targets-and-credentials)
- [Saved-target execution](#saved-target-execution)
- [Freshness ledger](#freshness-ledger)
- [Engine reconciliation](#engine-reconciliation)
- [Alternatives and consequences](#alternatives-and-consequences)

## Decision

### Targets and credentials

**The file.** Named targets live in `<configFolder>/deployment-targets.json`
(default `.camunda/`), discovered from the focused document toward its workspace
root; names are unique. `DeploymentTarget.create` owns the value rules, and both
the file parser and a form save build targets through it
([target tests](../../libs/modeler-core/src/deployment/domain/deploymentTarget.spec.ts)):
trimmed non-blank name, engine `c7` or `c8`, non-blank endpoint and the tenant kept
verbatim (ledger keys are built from the endpoint and trimming would orphan the
rows of a hand-edited file), URL overrides trimmed or dropped when blank, auth type
`none`, `basic` or `oauth2` keeping only its own fields, and valid environment
references. The engine and auth type are checked at runtime against their homes
(`ENGINES`, `TARGET_AUTH_TYPES`) because a form save's protocol payload is not
checked on arrival; a malformed save is rejected before it writes a file that would
no longer load. The parser reports a broken value as `targets[i]` plus the field,
and a malformed file yields an error and no targets, never a crashed sidebar. The
[JSON schema](../../libs/shared/src/lib/deploymentTargets.schema.json) is registered
for editor validation.

Three copies that cannot import these homes are pinned to them: the schema's enums
([schema tests](../../libs/modeler-core/src/deployment/domain/deploymentTargetsSchema.spec.ts)),
the protocol's `AuthTypePayload` (a type-equality assertion in the `toTargetPayload`
spec; otherwise an auth type only the protocol knows compiles and silently falls
back to no auth), and the form's `<option>` values (the
[form tests](../../apps/deployment-webview/src/adapter/in/form.spec.ts)).

**Credentials** stay in the host secret store under `<targetsFilePath>::<name>`; the
file path keeps same-named targets in different projects from sharing credentials
in IntelliJ's application-scoped PasswordSafe. Each auth type keeps its credential
pair in one entry, so a failed write leaves the old pair whole. VS Code still reads
the two keys earlier releases stored while the entry is missing; downgrading costs
the pair (an earlier release finds no credentials after the first save). Never write
secrets into the shared file; whole-value environment references (below) are the
only credential values it may hold.

**Edits.** Each edit returns a `TargetChange` (`created`, `saved`, `renamed`, `removed`), the one
place that decides whether a save renames and which slot, ledger rows and approvals are retired or
carried over; services act on it. A save stores the slot's credentials and approvals *before* it
writes the file, so a failure before that point leaves the file and old slot as they were; once the
file is written, a rename or delete removes the retired slot even if clearing the active name fails
(the first failure is reported, later cleanup failures are logged). The trade-off: switching a stored
literal to an environment reference leaves the reference in the slot while the file lacks it, so the
target sends an empty value until a save succeeds. Writing the file first would open the reverse
case (a reference replaced by a literal while the secret store rejects writes), and a rejecting
secret store is the likelier failure
([service tests](../../libs/modeler-core/src/deployment/service/DeploymentTargetService.spec.ts)).

**New and Save** are separate so a target is never overwritten by accident: New rejects an
existing name, Save updates the selected target, and a rename onto another target's name is
rejected before anything is written. The active target name is non-secret host state shared by the
sidebar and the status-bar picker; with no target selected the legacy unnamed ad-hoc connection
applies and no file is written.

**Events.** Every target change publishes one `DeploymentTargetsEvent`
(`DeploymentTargetService.onDidChange`), including a file write whose follow-up cleanup failed (so the
panel reloads instead of offering a retry of the same edit); a rejected save, cancelled delete or
dismissed picker publishes nothing. `DeploymentFeature` subscribes the status service (prunes retired
ledger rows, refreshes the indicator) and each attached panel (pushes the target list), so no command
does either by hand, and a failing listener is logged and skipped.

**Destination.** A target name resolves once per request into a `DeploymentDestination`: blank is the
ad-hoc connection, a name the file holds is that target at the `TargetsLocation` it was read from, and
anything else is unknown. The destination is the one place that answers what differs between the two
(which `.env`, whether approval is needed and under which slot, ledger identity, what an accepted
deploy persists). Each caller states what unknown means: a deploy or start fails, the active target
falls back to the remembered ad-hoc connection, the credentials prefill shows none.

**Routes.** Targets can override complete operation URLs (`endpoints.deploy`,
`endpoints.startInstance`, with a percent-encoded `{processDefinitionKey}`); bodies stay
engine-specific, so overrides are for gateways proxying that API. The conventional routes have one
home (`conventionalRoutes` in `engineRoutes.ts`, built from the `c8ApiVersion` setting, which is read
at each request, never once at construction: the IntelliJ bridge builds the feature before the host's
first settings snapshot) and the form shows them as placeholders without writing any route itself.

**Environment references.** Any connection or auth field may embed
`${env:MIRAGON_NAME}`, resolved from one `.env` (the destination's `dotEnvDirectory`):
for a named target the one in the directory holding the config folder of the targets
file it was read from, never one located again for the request; for an ad-hoc request
the one at the document's workspace folder, so a nearer, possibly vendored targets
file cannot supply variables for an endpoint the user typed. With nested workspace
folders the innermost encloses a document on both hosts. The reference is stored and
displayed as the literal everywhere upstream (secret store, targets file, webview
prefill, target matching) and expanded only when the outbound request is built,
inside the services that issue HTTP requests (`deploy`, `deployFiles`,
`startInstance`, `verifyActive`), on the domain objects that return a request-only
copy (`DeploymentConfig`, `StartInstanceConfig`, `InspectionRequest`, `AuthConfig`).
Late expansion is load-bearing: an accepted deploy writes `config.auth` back to the
secret store and `assertAdmits` matches the request against the saved target
literally, so a resolved value there would persist a secret in cleartext or break
matching (the ledger identity is the one exception, see
[Freshness ledger](#freshness-ledger)). A missing variable throws
`UnresolvedEnvVariableError` and never falls back to the literal; an expanded config
is rebuilt through the same invariants as a typed one.

Resolution is scoped because a committed targets file chooses both the destination
and the variables it embeds:

- Only `MIRAGON_`-prefixed names are referenceable, enforced in the grammar
  (`envRef.ts`): a foreign or malformed `${env:` is rejected when the file is
  parsed or a target saved, and fails the request otherwise. Non-prefixed `.env`
  entries are dropped on read. An open namespace would let a malicious or careless
  targets change send any project secret to its own endpoint.
- The process environment is not a source: it is shared by every project, so a
  globally exported variable would be reachable from any repository's targets file.
  This trades away Codespaces/devcontainer-injected variables.
- The `.env` is tied to the targets file, not the deployed document: a nested file
  (submodule, vendored content) reads its own project's `.env`, and Deploy Files uses
  the active target's `.env` for files from any folder. Documents outside every
  workspace folder resolve no references, and neither does a targets file that a
  config folder such as `../x` places outside its project directory.
- A symlinked `.env` is refused (a repository can commit one pointing at another
  project's). `.env` is read only when a value contains a reference, so an unrelated
  `.env` (a virtualenv directory) cannot fail requests without references.
- No resolved value is echoed. `DisallowedEnvReferenceError` names only the field;
  `FetchHttpClient` replaces fetch's transport errors (which quote the full URL)
  with `HttpTransportError` naming only the host. A gateway may repeat the request
  in its error body, so the REST clients surface only a known message field or a
  plain-text body, drop HTML and other JSON, cap it at one 1000-character line
  (`engineErrorDetail`) and first mask what the request carried (`SecretRedactor`:
  credentials, substituted `.env` values, `Authorization`, URL userinfo and query
  values, in raw and several encoded forms). Only the server's text is masked; the
  modeler's own messages never contain a resolved secret. A successful token
  response is never echoed.

**Origin approval.** A named target's credentials and the `.env` values its requests
carry are bound to the origins (`scheme://host[:port]`) its developer approved for
that target; the scheme counts because `http:` exposes them on the wire. `.env`
values count even without credentials (a committed `auth.type: "none"` target could
otherwise put `${env:MIRAGON_PASSWORD}` into a new host's query). Before deploy,
start instance or verify sends either, the core resolves the request's destinations
(deploy/start URL after substitution or `endpoint`, plus the OAuth2 token endpoint)
and `CredentialApprovalService` asks through the host's confirm dialog for any
origin not yet approved; declining sends nothing and fails the request. A cancelled
prompt (such as the keychain read) is a dismissal, not a decline: services let
`UserCancelledError` through, Deploy Files stops the whole batch since its one
approval precedes any file, and the sidebar replies with a result marked
`cancelled`. Destinations are computed from the resolved request, so a changed
`.env` value is caught, and a URL without a host is refused outright (`https:` plus
a conventional route would parse the first route segment as the host).

- Saving through the form approves only origins the user typed: literal ones no
  target in the shared file names yet. A host the form merely carried over (from the
  saved target, or the one **New** starts from) still asks, and `${env:…}` URLs are
  never approved on save. A non-OAuth2 target keeps no `tokenEndpoint`/`audience`,
  so a hidden token endpoint cannot be prefilled and pass as typed.
- Approvals live in the secret store beside the credentials under the same slot, so
  a resolved host is never persisted in cleartext; delete removes them and rename
  carries them over. Ad-hoc requests are gated only once a `.env` value is
  substituted, under one shared `ad-hoc` slot (a typed endpoint is the user's own
  choice, one from `.env` is not). The prompt leads with the hosts and shows the
  sanitized target name.

**Credential references in the file.** A whole-value env reference is not a secret,
so a credential field whose entire trimmed value is one prefixed reference is also
persisted in the shared file (`auth.username`/`password`/`clientId`/`clientSecret`,
each schema-pinned to the reference pattern so a literal secret cannot validate in;
the parser rejects any other value under these keys for every auth type).
`CredentialRefs` owns the split. The secret store keeps every value as typed, refs
included (blanking would break PasswordSafe, which reads an empty half of a pair
back as absent). On read, file references win over secret-store values and a ref
held only by the store is ignored, so a ref a teammate removed stays removed. A
deploy or start against a named target must carry exactly the target's refs
(`CredentialRefs.admits`), because deploy re-saves credentials only to the secret
store and an edited ref would otherwise never reach the shared file. A teammate can
clone, add a `.env` and deploy with no per-machine credential setup.

### Saved-target execution

Connection changes to a named target must be saved before Deploy or Start Instance
(literal credential edits stay executable; credential references are part of the
target). Both actions share readiness state and are unavailable during target
switches or secret loading. The webview checks the connection the same way before
either posts (a non-blank endpoint and the fields the auth type requires;
`requestAuthOf` in `domain/deploymentDraft.ts` owns the rule and texts), while
**New** and **Save** check no credential: the file holds the connection and
credentials are per machine. The core checks no credential field for presence.

The core independently resolves the submitted target name within the captured
document context and rejects missing targets or mismatching operation settings
before executing or persisting anything; UI disabling alone cannot say which saved
destination a request refers to. `DeploymentTarget.assertAdmits` owns the rule: the
endpoint, engine and auth type, an OAuth2 token endpoint and audience, and only the
settings the operation uses (tenant and deploy URL for a deploy, the start URL for a
start) must equal the saved target's, compared trimmed. An ad-hoc destination admits
any request. Requiring Save keeps the operation bound to a reviewable target
definition; a temporary deployment with unsaved edits would need a different identity
and credential-persistence policy.

**The engine's acceptance is final.** Saving the ad-hoc connection, the credentials
and the ledger row afterwards are separate steps: a failed step is logged and named
in the result ("Not saved: …"), and the ledger row is still written when the
credentials fail. A live deployment is never reported as failed; `DeploymentOutcome`
in the core owns this rule and host adapters decide nothing. The connection is one
`connectionPatch` written in one save.

Private credential requests and replies carry a monotonically increasing request id
and the target name; stale replies, failures included, are ignored. Secrets clear
when the target or auth method switches, target lists carry their document directory
so another document's same-named target cannot inherit a credential draft, and
returning to ad-hoc mode restores its defaults and clears named-target URL overrides.

### Freshness ledger

Record the fingerprint of the bytes successfully deployed, keyed by destination
identity and file, in per-developer host state; the shared targets file describes
connections, not what this machine deployed.

| Field or key | Meaning |
| --- | --- |
| Named destination | `target:<name>@<endpoint-host>` |
| Ad-hoc destination | `adhoc:<endpoint-host>/<tenantId>` |
| With `${env:…}` refs | the resolved host/tenant is stored as `env:<fingerprint>`: a `.env` switch to another engine changes the key, yet no resolved value is ever persisted |
| Ledger key | `<destination-identity>::<filePath>` |
| Revision | `fingerprint`, `deployedAt`, optional `deploymentId`, `origin`, `verifiedAt` |

Fingerprints normalize line endings and concatenate two independently seeded 32-bit
FNV-1a hashes (a portable content-change check without `node:crypto`). A deploy reads
and fingerprints the file on disk, so both deploys of the open diagram first flush the
webview's pending edits into the document and save it through one `SaveBeforeDeploy`
step. The sidebar saves only once the config is valid and the target admitted; a
declined credential approval, failed `.env` lookup or engine error come after the
save and leave the diagram saved; a failed save aborts the deploy. Freshness compares
against the editor buffer, so an edit after a deploy reads `changed` before it is
saved. Additional sidebar files and Deploy Files… deploy as saved.

| Freshness | Interpretation |
| --- | --- |
| `unknown` (gray) | No matching local ledger row; not proof of absence on the engine |
| `deployed` (green) | Editor fingerprint matches the recorded revision |
| `changed` (yellow) | Editor differs from a locally deployed revision |
| `superseded` (blue) | Editor differs from a revision adopted from the engine |

`DeploymentStatusService` owns ledger recording and the indicator;
`DeploymentTargetService` owns target files and credentials. Each ledger write
(record, adopt, forget, prune) ends by refreshing the indicator, even after a failed
write (an ad-hoc deploy saves the connection the indicator reads just before its
row); target changes, editor focus and debounced edits refresh it too. The active
target and ledger are part of the deployment state's synchronous `load()`
([mirror contract](intellij-bridge.md#host-replicated-state)). The indicator
names the connection its freshness refers to (a destination's `statusConnection`; a
target name that no longer resolves falls back to the remembered ad-hoc connection),
and `deploymentStatusView` turns connection, freshness and times into the
`deploymentTarget` [status view](architecture-and-hosts.md#host-integrations), with
times formatted in the modeler language and the machine's time zone so both hosts
show the same text.

### Engine reconciliation

Verification runs on demand (command or status-bar menu), never on open, edit or a
timer, so local feedback needs no network and produces no background authentication
errors against sleeping engines. A separate `EngineInspectionPort.fetchLatestDefinition`
is implemented by the Camunda 7 client only: C8 has no menu entry and its command
reports the operation unavailable, with no unsupported-engine stub. Lookups use the
plain REST base URL, not the deployment URL override; C8 inspection would need a
separate capability such as Operate and its authentication.

Reconciliation compares the stored row, editor content and fingerprint of the engine's
latest XML. A current revision gains `verifiedAt`; a matching engine revision can seed
an absent row; a differing engine revision is adopted with `origin: "engine"`
(`superseded`); an absent engine definition removes the row. A later local deploy
writes a local-origin row, and a missing `origin` on older rows means local. Named
identity includes the endpoint host so changing it invalidates old rows; renaming or
deleting a target prunes the ledger keys of the retired target its `TargetChange`
names, and older name-only keys show `unknown` until a verification or deploy seeds a
current row (an accepted reset that avoids a misleading green indicator).

## Alternatives and consequences

- Host-specific settings profiles cannot provide a team-shareable, host-neutral
  connection file, and a base URL alone cannot express gateways that rewrite whole
  operation paths.
- The local ledger drifts when another developer deploys or an engine is reset;
  on-demand verification repairs it without promising continuously verified state. A
  different path on the same endpoint host is not a distinct named identity, a fresh
  clone shows `unknown`, and a file rename changes the key.
- Deploying the open diagram always saves it first, so neither Deploy button can ship
  the saved version while keeping unsaved edits.
- Approval adds one confirmation per target and host on first use, including once for
  every existing target with credentials or `.env` references after the upgrade that
  introduced it. A fresh clone whose credentials are pure `${env:…}` references
  confirms the host once as well. Approvals follow the targets-file path like the
  credentials do.
- Error messages trade detail for containment: a gateway's plain-text or structured
  message survives, an HTML page or unrecognised JSON shows only the HTTP status, and
  a short substituted value is masked wherever it appears in the server's text.
- Environment references trade convenience for containment: no process-env or
  Codespaces variables, a mandatory `MIRAGON_` prefix (existing `CAMUNDA_*` entries
  must be duplicated), no literal containing `${env:`, and a file with a literal under
  a credential key no longer loads
  ([envRef tests](../../libs/modeler-core/src/deployment/domain/envRef.spec.ts), with a
  schema parity spec).
- A non-OAuth2 target loses a hand-written `auth.tokenEndpoint`/`audience` on load and
  save, and padded URL overrides load and save trimmed, so a hidden field never blocks
  a save.
