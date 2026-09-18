# Deployment

The BPMN Modeler extension includes a deployment sidebar that lets you deploy BPMN/DMN diagrams and start process instances directly from VS Code. It supports both **Camunda Platform 7** and **Camunda 8** with multiple authentication methods.

The sidebar lives in the activity bar (rocket icon) and provides two tabs:

- **Deploy** — upload diagrams (with optional additional files) to a Camunda engine
- **Start Instance** — start a process instance with an optional JSON payload

## Deployment targets

A **deployment target** is a named connection (engine, endpoint, tenant, auth, and
optional endpoint overrides) you can save once and reuse. Targets are stored in a
team-shareable file so a repository can ship its known environments; **secrets are
never written to the file** — credentials live in VS Code's encrypted secret
storage, keyed per target.

- **Storage:** `<configFolder>/deployment-targets.json` (default
  `.camunda/deployment-targets.json`), discovered by walking up from the focused
  diagram to the workspace root (nearest file wins). A JSON schema is registered,
  so the editor validates and autocompletes the file.
- **Editing:** the sidebar's Connection/Authentication/Advanced fields are the
  target editor. The row above Connection has a target select plus **New**,
  **Save**, and **Delete**. Fill the connection, type a **Target Name**, and
  click **New** to create the target from the entered data — a name that already
  exists is rejected so a create never overwrites. **Save** updates the currently
  selected target (including a rename, which migrates the stored credentials);
  it is disabled when no target is selected, and a rename onto another target's
  name is rejected. Save connection changes before using **Deploy** or **Start
  Instance**. Credential-only changes can be used immediately. **Edit JSON**
  opens `deployment-targets.json` in the editor (creating an empty one first) for
  direct, schema-assisted editing.
- **Ad-hoc mode:** with **(none — use form values)** selected, the form behaves
  exactly as before and persists to per-workspace state — nothing is written to
  the file until you save a target.
- **Active target:** shown in the status bar with a coloured freshness dot
  (`$(circle-filled) <name>`, or *No deployment target*). Click it for a small
  menu — switch the active target, or (for a Camunda 7 target) verify against
  the engine; **Switch Deployment Target** changes it directly. The sidebar
  select and the status bar are two views of the same active target.
- **Deployment freshness dot:** the dot colour tells you whether the diagram in
  front of you matches what was last deployed to the active target *from this
  machine*:
  - **Green** — deployed: the content matches the last deployment.
  - **Yellow** — undeployed changes: the content differs; the tooltip shows when
    you last deployed.
  - **Blue** — superseded: a verification found that the deployed version on
    the engine differs from your diagram. Deploying from the modeler turns it
    green again.
  - **Gray** — unknown: this machine has never deployed this file to this target.
    Gray means "no local record", not "absent on the engine".

  Freshness is decided entirely locally (no engine call): the modeler records a
  content fingerprint on each successful deploy, per target and file. Because the
  deploy sends the **saved file on disk**, a diagram with **unsaved edits** shows
  yellow until you save — the engine does not run the bytes you haven't saved.
  The record is per-developer state and is *not* written to
  `deployment-targets.json`.
- **Verify on the engine (Camunda 7):** run **Verify Deployment on Engine** (or
  pick *Verify* from the status-bar menu) to reconcile the local record against
  the engine's latest deployed version of the process. If the engine runs
  exactly this diagram (deployed by a colleague, or before a fresh clone), the
  dot turns green; a differing deployed version turns it blue and shows an
  informational notification; a process that is not deployed clears the
  record. Verification is only ever on
  demand, needs the plain REST base URL (the `endpoints.deploy` override is not
  applied to lookups), and is not available for Camunda 8 targets.

### File format

```json
{
  "targets": [
    {
      "name": "dev",
      "engine": "c7",
      "endpoint": "http://localhost:8080/engine-rest",
      "tenantId": "",
      "auth": { "type": "oauth2", "tokenEndpoint": "https://login/oauth/token", "audience": "" },
      "endpoints": {
        "deploy": "https://gw.example.com/camunda/deploy",
        "startInstance": "https://gw.example.com/camunda/{processDefinitionKey}/start"
      }
    }
  ]
}
```

`name` is the unique identity. `auth.type` is `none`, `basic`, or `oauth2`
(`tokenEndpoint`/`audience` apply to `oauth2`). `endpoints` and its keys are
optional — see [Endpoint overrides](#endpoint-overrides).

### Commands

| Command | Description |
|---|---|
| **Switch Deployment Target** (`bpmn-modeler.switchDeploymentTarget`) | Pick the active target (or ad-hoc) via a Quick Pick. |
| **Deploy Diagram** (`bpmn-modeler.deployDiagram`) | Save the focused diagram, then deploy only that file to the active target (prompting for a target first if none is active). Additional resources still need the sidebar. Also the editor title-bar rocket button. |
| **Deploy Files…** (`bpmn-modeler.deployFiles`) | Multi-select workspace `.bpmn`/`.dmn` files and deploy each to the active target (one deployment per file, named after the file). Also available on the Explorer context menu for `.bpmn`/`.dmn`. |
| **Verify Deployment on Engine** (`bpmn-modeler.verifyDeployment`) | Reconcile the focused diagram's freshness record against the active Camunda 7 target's engine. Also reachable from the status-bar item's click menu. |

## Settings

| Setting | Type | Default | Description |
|---|---|---|---|
| `miragon.bpmnModeler.configFolder` | `string` | `.camunda` | Name of the config folder searched at each directory level from the BPMN file up to the workspace root. Payload files must be under `<configFolder>/payloads/`. |
| `miragon.bpmnModeler.c8ApiVersion` | `string` | `v2` | REST API version prefix for Camunda 8 endpoints (e.g. `v2`). |

## REST Endpoints

### Camunda 7

| Operation | Method | URL |
|---|---|---|
| Deploy | `POST` | `{endpoint}/deployment/create` (multipart), or the target's `endpoints.deploy` override |
| Start Instance | `POST` | `{endpoint}/process-definition/key/{key}/start` (JSON), or the target's `endpoints.startInstance` override |

The deploy request sends a multipart body with fields `deployment-name`, `tenant-id` (optional), `deployment-source` (`"BPMN Modeler"`), and one file part per resource.

The start-instance request wraps the payload in a `variables` key:

```json
{ "variables": { ...payload } }
```

### Camunda 8

| Operation | Method | URL |
|---|---|---|
| Deploy | `POST` | `{endpoint}/{apiVersion}/deployments` (multipart), or the target's `endpoints.deploy` override |
| Start Instance | `POST` | `{endpoint}/{apiVersion}/process-instances` (JSON), or the target's `endpoints.startInstance` override |

The deploy request sends a multipart body with `tenantId` (optional) and file parts all named `resources`.

The start-instance request sends `processDefinitionId` alongside the payload wrapped in a `variables` key:

```json
{
  "processDefinitionId": "<process-definition-key>",
  "variables": { ...payload }
}
```

### Endpoint overrides

A deployment target may override the URL per operation for environments behind a
gateway with custom routes. When `endpoints.deploy` / `endpoints.startInstance`
is set on the active target, the request is sent to that full URL instead of the
convention path above. The request body / multipart shape is unchanged (the
override is assumed to proxy the same engine API), and `{processDefinitionKey}`
in the start-instance override is substituted (percent-encoded) before the call.

## Payload Files

Payload files are plain JSON objects that define the process variables passed when starting a new instance. They are discovered by convention from the `<configFolder>/payloads/` directory.

### Discovery

The extension walks up from the BPMN file's directory to the workspace root, collecting all `.json` files found under `<configFolder>/payloads/` at each level (nearest first). The user picks one via a VS Code QuickPick.

### Directory Structure Example

```
my-project/
├── .camunda/
│   └── payloads/
│       └── default-vars.json      ← discovered for all BPMN files
├── processes/
│   ├── .camunda/
│   │   └── payloads/
│   │       └── order-vars.json    ← discovered for files in processes/
│   └── order-process.bpmn
```

### Payload Format

Camunda 7 and Camunda 8 expect **different** payload formats. The extension sends the payload file contents as-is (wrapped in a `variables` key), so the file must match the target engine's format.

#### Camunda 8

A plain JSON object whose keys become process variables:

```json
{
  "amount": 1500,
  "customerId": "cust-42"
}
```

#### Camunda 7

Each variable is an object with `value` (required), `type` (optional), and `valueInfo` (optional):

```json
{
  "amount": { "value": 1500 },
  "customerId": { "value": "cust-42", "type": "String" }
}
```

See the [Camunda 7 REST API docs](https://docs.camunda.org/rest/camunda-bpm-platform/7.22/#tag/Process-Definition/operation/startProcessInstanceByKey) for the full variable schema.

## Authentication

The sidebar supports three authentication modes, selectable in the form:

| Mode | Header | Details |
|---|---|---|
| **None** | *(no auth header)* | Default. Suitable for local development engines. |
| **Basic Auth** | `Authorization: Basic <base64>` | Username and password encoded as UTF-8 → base64. |
| **OAuth2 Client Credentials** | `Authorization: Bearer <token>` | Fetches an access token from the configured token endpoint using `client_credentials` grant. Optionally includes an `audience` parameter. |

Credentials are stored securely using VS Code's encrypted `SecretStorage` API and restored automatically on the next deployment.
