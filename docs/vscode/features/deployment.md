# Deployment

Deploy BPMN and DMN files to Camunda 7 or Camunda 8 and start process instances from VS Code.

## The Deploy sidebar

Open the **Deploy Diagram** view from the rocket icon in the activity bar. It has two tabs:

- **Deploy** saves the open diagram and uploads it, optionally with additional files. If the diagram cannot be saved, nothing is uploaded. Additional files go out as last saved.
- **Start Instance** starts a process instance, optionally with a JSON payload. It fills in the id of the diagram's first executable process, which you can change.

Fill in engine, endpoint, tenant and authentication, then deploy. For a quick deploy of the open diagram use the rocket button in the editor title bar.

## Authentication

| Mode | Sends |
|---|---|
| **None** (default) | No auth header, for local engines |
| **Basic Auth** | `Authorization: Basic …` from username and password |
| **OAuth2 Client Credentials** | `Authorization: Bearer …`, fetched from the token endpoint, with optional `audience` |

Credentials are kept in VS Code's encrypted secret storage, never in files. The one exception is a credential that is exactly one [environment reference](#environment-variable-references), which is not a secret.

### Approved hosts

A named target's credentials, and the `.env` values its requests carry, go only to hosts you approved for that target: the shared `deployment-targets.json`, or a `.env` value it references, decides where they go, and someone else's commit can change that. A host is scheme, host name and port (`https://camunda.example:8443`); switching from `https` to `http` counts as a new host.

- **Saving a target** approves the hosts you typed that no target in the file uses yet. Hosts carried over by the form (including from the target **New** started from) and URLs built from `${env:...}` still need approval.
- **The first request** (deploy, start instance, verify) that would send credentials (for OAuth2, the client secret and its token) or a `.env` value to an unapproved host asks first, naming the host. **Send Credentials** remembers it; dismissing sends nothing.
- Approvals live with the target's credentials: deleting the target removes them, a rename keeps them.
- In ad-hoc mode a typed endpoint is never questioned; once a request uses an `${env:...}` value, its host needs approval too.

### Error messages

A failed request shows the server's own explanation (Camunda 7 `message`, Camunda 8 `detail`/`title`, OAuth2 `error_description`, or a plain-text body) on one line of at most 1000 characters. An HTML error page, or JSON that is not an error message (such as a proxy echoing the request), is dropped, leaving only the HTTP status. Values the request carried that may be secret are masked as `***`: credentials, the `Authorization` header, URL query values and user info, and substituted `MIRAGON_` values.

## Deployment targets

A target is a saved, named connection you can reuse and share with your team. Targets live in `<configFolder>/deployment-targets.json` (`.camunda/deployment-targets.json` by default); the nearest file from the diagram up to the workspace root wins. The file has a JSON schema, so the editor completes and validates it.

```json
{
  "targets": [
    {
      "name": "dev",
      "engine": "c7",
      "endpoint": "http://localhost:8080/engine-rest",
      "tenantId": "",
      "auth": { "type": "oauth2", "tokenEndpoint": "https://login.example.com/oauth/token", "audience": "" },
      "endpoints": {
        "deploy": "https://gw.example.com/camunda/deploy",
        "startInstance": "https://gw.example.com/camunda/{processDefinitionKey}/start"
      }
    }
  ]
}
```

- `name` is unique. `engine` is `c7` or `c8`. `auth.type` is `none`, `basic` or `oauth2`; `auth.tokenEndpoint` and `auth.audience` are only read for `oauth2`.
- `auth.username`/`auth.password` (basic) and `auth.clientId`/`auth.clientSecret` (oauth2) are optional and accept only a single `${env:MIRAGON_NAME}` reference. A literal there makes the whole file invalid, so a secret cannot be committed by accident. These keys are validated under any `auth.type`.
- `endpoints` is optional. Use it when a gateway exposes custom routes: the request goes to that URL with the same body, and `{processDefinitionKey}` is filled in.

**Manage targets in the sidebar.** Pick a target above **Connection**, then use **New** (create from the form, rejects existing names), **Save** (update the selected target, including a rename) or **Delete**. **Edit JSON** opens the file. Save connection changes before you deploy. Literal credential changes apply at once; adding, changing or removing a credential [environment reference](#environment-variable-references) needs **Save** first. With no target selected (the first entry, which uses the form values), the form is stored per workspace and nothing is written to the file.

## Environment variable references

Connection and authentication fields may contain `${env:MIRAGON_NAME}` references, resolved from the project's `.env` when a deploy, start-instance or verify request is built. A value may hold several, e.g. `https://camunda.${env:MIRAGON_STAGE}.example/engine-rest`.

```dotenv
# .env beside the folder holding deployment-targets.json; keep it out of version control
MIRAGON_CAMUNDA_URL=https://camunda.dev.example/engine-rest
MIRAGON_CAMUNDA_USER=demo
MIRAGON_CAMUNDA_PASSWORD=s3cret
```

Supported fields: `username`, `password`, `clientId`, `clientSecret`, `tokenEndpoint`, `audience`, `endpoint`, `tenantId` and the `endpoints` overrides. The form and storage keep the literal `${env:...}` text, so the webview never sees a resolved value, and errors name at most the resolved host and port, never a resolved URL.

**Which `.env`.** For a named target, the `.env` in the directory containing the config folder of its targets file (by default `<workspace>/.env` beside `<workspace>/.camunda/`; `sub/.camunda/deployment-targets.json` reads `sub/.env`). **Deploy Files…** uses the active target's `.env` for every selected file. In ad-hoc mode, the `.env` at the root of the diagram's workspace folder. Diagrams outside a workspace folder resolve nothing.

**Missing and empty values.** An undefined variable fails the request, naming the variable and the `.env` searched; it never falls back to the literal text. A variable defined as empty counts as set: an empty URL override falls back to the convention route, an empty endpoint is rejected.

**Shareable credentials.** When you save a named target, a credential whose entire value is one `${env:MIRAGON_NAME}` is also written to `deployment-targets.json`. Teammates clone the repo, add their own `.env` and deploy without per-machine setup. The file is the only authority for references: it wins over a value stored on the machine, and a reference removed from it is not restored from local storage. Anything else (literals, partial interpolation like `user-${env:MIRAGON_SUFFIX}`, every ad-hoc value) stays in the secret store only.

**Security boundaries.** A committed targets file decides both where a request goes and which variables it carries, so resolution is narrow:

- Only `MIRAGON_`-prefixed names can be referenced. Others (`${env:GITHUB_TOKEN}`) are rejected when the file loads or the target is saved, and other `.env` entries are discarded on read.
- Only that one project `.env` is read: never the IDE's process environment, a parent folder or the git root. A symlinked `.env` is refused.
- `.env` is read only when a value contains a reference, so an unrelated `.env` (such as a Python virtualenv directory) cannot break plain deployments.
- A literal must not contain `${env:` unless it is a valid reference; put such a value into `.env`, whose values are never expanded again.

`.env` syntax is plain `KEY=VALUE` lines, `#` comment lines, an optional `export ` prefix and surrounding quotes. Inline comments (`KEY=value # note`) and escapes such as `\n` are not interpreted; they become part of the value.

## Status bar and freshness

The status bar shows the active target with a coloured dot. Click it to switch targets or, for Camunda 7, verify against the engine.

With no target selected, the item reads **Form values** once a deploy has saved the form's connection, and its dot then refers to that connection. A target name that is no longer in `deployment-targets.json` falls back to the form values, so it reads **Form values** too. Until a deploy saves the form's connection, the item reads **No deployment target** without a freshness colour.

The tooltip shows when the diagram was last deployed and verified, in the modeler's UI language.

| Dot | Meaning |
|---|---|
| Green | The diagram matches your last deployment to this target. |
| Yellow | The diagram changed since then, including unsaved edits. |
| Blue | Verification found a different version on the engine. |
| Gray | This machine has never deployed this file to this target. |

Freshness is recorded locally per target and file, not on the engine and not in `deployment-targets.json`. **Verify Deployment on Engine** (Camunda 7 only) compares with the engine's latest version of the diagram's first executable process: green if it matches, blue if not. It uses the plain endpoint, not the `endpoints.deploy` override.

## Commands

| Command | Use |
|---|---|
| **Miragon BPMN Modeler: Deploy Diagram** | Save and deploy the open diagram to the active target. Additional files need the sidebar. |
| **Miragon BPMN Modeler: Deploy Files…** | Deploy several `.bpmn`/`.dmn` files, one deployment each. Also in the Explorer context menu. |
| **Miragon BPMN Modeler: Switch Deployment Target** | Pick the active target or ad-hoc form values. |
| **Miragon BPMN Modeler: Verify Deployment on Engine** | Check the open diagram against a Camunda 7 engine. |

The additional files of the **Deploy** tab and the files of **Deploy Files…** come from the whole workspace, except `node_modules`, build output (`dist`, `build`, `out`, `target`, `bin`, `coverage`) and folders whose name starts with a dot, such as `.camunda` with `deployment-targets.json` or `.vscode`.

## Payload files

Process variables for **Start Instance** come from `.json` files under `<configFolder>/payloads/`. The modeler collects them from the diagram's folder up to the workspace root (nearest first) and lets you pick one.

```
my-project/
├── .camunda/payloads/default-vars.json      # every diagram
└── processes/
    ├── .camunda/payloads/order-vars.json    # diagrams in processes/
    └── order-process.bpmn
```

The file is sent as `variables` unchanged, so it must match the engine:

```jsonc
// Camunda 8
{ "amount": 1500, "customerId": "cust-42" }
```

```jsonc
// Camunda 7
{ "amount": { "value": 1500 }, "customerId": { "value": "cust-42", "type": "String" } }
```

See the [Camunda 7 REST API](https://docs.camunda.org/rest/camunda-bpm-platform/7.22/#tag/Process-Definition/operation/startProcessInstanceByKey) for the Camunda 7 variable format.

## Endpoints and settings

| Engine | Deploy | Start instance |
|---|---|---|
| Camunda 7 | `POST {endpoint}/deployment/create` | `POST {endpoint}/process-definition/key/{key}/start` |
| Camunda 8 | `POST {endpoint}/{apiVersion}/deployments` | `POST {endpoint}/{apiVersion}/process-instances` |

| Setting | Default | Description |
|---|---|---|
| `miragon.bpmnModeler.configFolder` | `.camunda` | Folder searched for targets and payloads. |
| `miragon.bpmnModeler.c8ApiVersion` | `v2` | API version for Camunda 8 endpoints. |

## Next steps

- [Linting](/vscode/features/linting): catch what the engine cannot run before you deploy.
- [BPMN diff](/vscode/features/bpmn-diff): review what changed before you deploy.
- [Configuration](/vscode/configuration): the config folder and Camunda 8 API version.
