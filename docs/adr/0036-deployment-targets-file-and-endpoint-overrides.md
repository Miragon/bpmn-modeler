# 0036 — Named deployment targets in a workspace file, with per-operation endpoint overrides

- Status: accepted
- Date: 2026-09-16
- Category: deployment

## Context

Deploy and Start Instance shared one *unnamed* connection — endpoint, engine,
tenant, and auth — persisted as flat per-workspace keys (VS Code
`workspaceState`, IntelliJ `PropertiesComponent`, both under
`bpmn-modeler.deployment.*`). A developer who deploys to dev, staging, and prod
had to retype the whole connection every time they switched, and there was no
way to share a team's known environments: the values lived in a host-private
store, invisible to the repository.

Two further constraints came from real deployments:

- Some environments sit behind an API gateway with custom routes, so the
  convention-derived URL (`<endpoint>/deployment/create`,
  `<endpoint>/process-definition/key/{key}/start`, and the C8 equivalents) is
  wrong even though the request body is unchanged.
- Secrets must never land in a shareable file.

## Decision

Introduce **named deployment targets** stored in a team-shareable workspace
file, and make the existing sidebar form the target editor.

- **Storage:** `<configFolder>/deployment-targets.json` (default
  `.camunda/deployment-targets.json`), discovered nearest-first by walking up
  from the focused document to the workspace root — the same convention
  `ArtifactService` already uses for element templates and payloads, generalised
  into a `findConfigFile` helper. Identity is the trimmed, non-empty, unique
  `name`. The file is parsed defensively (a hand-edited/team-shared file is
  untrusted input) and a malformed file surfaces an error rather than crashing
  the sidebar. A JSON schema (`schemas/deployment-targets.schema.json`) is
  registered for editor validation.

- **Secrets stay out of the file.** Credentials live in the host secret store
  (VS Code `SecretStorage`, IntelliJ PasswordSafe) keyed by a **slot**,
  `<targetsFilePath>::<name>`. The file path in the slot is what prevents a
  target named `dev` in two different workspaces from colliding in IntelliJ's
  *application*-scoped PasswordSafe. `SecretStorePort` gained an optional
  trailing `slot` on every method (absent = the legacy unnamed keys, so ad-hoc
  mode is unchanged) plus a `delete(slot)` for target deletion/rename.

- **Active target** is persisted as one more non-secret value
  (`bpmn-modeler.deployment.activeTargetName`) and, per
  [ADR 0005](0005-host-replicated-state.md), rides the bridge's synchronous seed
  so `DeploymentStatePort.getActiveTargetName()` can stay a synchronous getter.
  It is shown in a clickable status-bar item (VS Code item / IntelliJ widget,
  priority next to the engine-version item) that opens the switch-target picker;
  the sidebar select and the picker are two views of the same persisted value. A
  persisted name that no longer resolves to a target is tolerated as ad-hoc mode,
  not an error.

- **Full-URL overrides per operation.** A target may carry an optional
  `endpoints.deploy` and `endpoints.startInstance`. When set, the REST client
  posts to that URL instead of the convention path;
  `{processDefinitionKey}` in the start-instance override is substituted with a
  percent-encoded value. The request body / multipart shape stays
  engine-specific (the assumption is that a custom route proxies the *same*
  engine API). `DeploymentConfig`/`StartInstanceConfig` gained trailing optional
  `deployUrl?` / `startInstanceUrl?`.

- **Ad-hoc mode is preserved.** With no target selected the form behaves exactly
  as before and persists to the legacy keys, so existing workspaces keep working
  with nothing written until the user saves a target.

Two new commands ship on both hosts: `switchDeploymentTarget` (status-bar / palette)
and `deployFiles` (a multi-select QuickPick that deploys each chosen `.bpmn`/`.dmn`
to the active target as its own deployment named after the file).

## Alternatives considered

- **Keep flat host state, add a "profiles" object to settings.json.** Settings
  are host-shaped (VS Code `settings.json` vs IntelliJ) and not the natural home
  for per-environment connection data; a dedicated file in the existing config
  folder is host-neutral, reviewable, and already the modeler's convention.
- **Per-target base URL only (no full-URL override).** Rejected: a gateway can
  rewrite the whole route, not just the origin, so only a full URL is
  expressive enough. The convention path remains the default when no override is
  set.
- **One secret slot per target name (no file path).** Rejected: PasswordSafe is
  application-scoped, so two workspaces with a `dev` target would share
  credentials. The targets-file path in the slot key namespaces them.

## Consequences

- The connection is now defined once per environment and shared through the
  repository; switching is one click.
- `SecretStorePort`, `DeploymentStatePort`, `StatusBarPort`, and `PickerPort`
  each grew a small, additive surface, mirrored across the VS Code adapters and
  the bridge RPC protocol (new `secretStore/delete`,
  `deploymentState/saveActiveTarget`, `statusBar/showDeploymentTarget`, and
  host→core `deployment/switchTarget` / `deployment/deployFiles`; `slot` added to
  the `secretStore/*` params). `protocol.json` is regenerated and the contract
  test pins the new methods.
- A malformed or hand-broken targets file degrades to "no targets" with an error
  toast, never a crash; the active-target status bar shows "No deployment target".
