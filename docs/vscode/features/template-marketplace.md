# Template marketplace

Pull element templates from a GitHub or GitLab repository or a local folder, instead of copying JSON files into every project.

A marketplace is any location with a `marketplace.json` at its root. The file points at where the templates live; nothing is copied into your workspace. Fetched templates are cached and appear in the [template chooser](/vscode/features/element-template-chooser) and the [append menu](/vscode/features/append-menu) next to your local templates.

## Add a marketplace

1. Run **Miragon BPMN Modeler: Add Marketplace**.
2. Paste a repository URL or a local folder path.
3. Choose **This workspace** (`.vscode/settings.json`, the default) or **All my projects** (User settings). Without an open folder the entry goes to User settings.

The marketplace is fetched and checked before it is saved, so a missing or broken `marketplace.json` never lands in your settings. Open editors pick up the templates right away. If some or all of its sources cannot be fetched, the marketplace is still saved and a warning names each of those sources and why. **Update Marketplaces** tries them again.

| Command | Use |
|---|---|
| **Miragon BPMN Modeler: Add Marketplace** | Register a marketplace. |
| **Miragon BPMN Modeler: Update Marketplaces** | Fetch new and changed templates and drop the ones a source no longer serves. |
| **Miragon BPMN Modeler: Remove Marketplace** | Unregister one or more marketplaces and drop their cached templates. |

These commands run one at a time. A command you start while another one runs shows its progress and waits for it.

## The `marketplace.json` file

A marketplace lists one or more sources. Every `.json` file under a source's `path` is loaded as a template unless `include` narrows it down.

```json
{
    "sources": [
        { "path": "element-templates" },
        { "provider": "github", "repo": "my-org/camunda-templates", "path": "templates", "ref": "v1.2.0" },
        {
            "provider": "github",
            "repo": "camunda/connectors",
            "ref": "8.9.6",
            "path": "connectors",
            "include": ["**/element-templates/*.json"]
        },
        { "provider": "gitlab", "repo": "my-group/platform/templates", "path": "element-templates", "visibility": "private" },
        { "provider": "local", "path": "~/shared/element-templates" }
    ]
}
```

| Field | Applies to | Description |
|---|---|---|
| `path` | all | Required. Folder to scan. Without `provider` it is relative to the marketplace. |
| `include` | all | Glob(s) relative to `path`. `**` matches any folders, `*` and `?` stay within one segment. Case-sensitive, must match the whole relative path. |
| `provider` | optional | `github`, `gitlab` or `local`. Omit for a path inside the marketplace. |
| `repo` | `github`, `gitlab` | `owner/repo`, or the full GitLab path including subgroups. |
| `ref` | `github`, `gitlab` | Branch, tag or commit. Default branch if omitted. |
| `baseUrl` | `github`, `gitlab` | Self-hosted GitHub Enterprise or GitLab instance. |
| `visibility` | `github`, `gitlab` | `"private"` makes the modeler ask for a token up front. |
| `type` | optional | Content type, `element-templates` by default. Unknown types are skipped with a warning. |

`local` sources need an absolute or `~` path. Shape errors (missing `path`, unknown `provider`, empty `include`) are reported, not silently ignored, and so is an `include` that matches nothing.

## The `marketplaces` setting

Every marketplace is an entry in `miragon.bpmnModeler.marketplaces`, which you can also edit by hand:

```json
{
    "miragon.bpmnModeler.marketplaces": [
        "https://github.com/my-org/process-marketplace",
        "my-org/process-marketplace",
        "https://github.com/my-org/process-marketplace/tree/v2",
        "https://gitlab.com/my-group/platform/marketplace",
        "/Users/me/bpmn/marketplace",
        { "provider": "github", "repo": "my-org/marketplace", "baseUrl": "https://github.my-company.com", "ref": "main" },
        { "provider": "gitlab", "repo": "platform/tooling/marketplace", "baseUrl": "https://gitlab.my-company.com" }
    ]
}
```

- **Strings** cover public hosts and local folders: a URL, the GitHub `owner/repo` shorthand, a `/tree/<ref>` URL to pin a branch or tag, or an absolute path (Windows paths and `file://` work). `~` is only expanded in the Add command.
- **Objects** are for self-hosted instances that need a `baseUrl`.
- User and workspace lists are merged. A workspace `[]` does not hide your User entries.

## Private repositories

Private repositories use a personal access token per host. The modeler asks for one when a fetch is denied, or up front for sources marked `"visibility": "private"`, at most once per host and command. Tokens are kept in VS Code's secret storage, never in settings or logs. Enter a new token when asked to replace an expired one; press <kbd>Esc</kbd> to skip that source.

| Host | Token scope |
|---|---|
| GitHub | Fine-grained token with **Contents: Read-only** on the repositories, or classic `repo` |
| GitLab | `read_api` |

One token covers every marketplace on that host. If a stored fine-grained token is rejected for a public repository, the modeler retries without it before asking.

## Local and offline marketplaces

Register a folder that holds a `marketplace.json` and your templates:

```
~/bpmn/marketplace/
├── marketplace.json        { "sources": [{ "path": "element-templates" }] }
└── element-templates/
    └── send-email.json
```

No network, no tokens, no rate limits. For a cloned template repository, register the clone and run **Update Marketplaces** after `git pull`. If the clone has no `marketplace.json`, point a local marketplace at it with a `local` source.

## Camunda version

Templates with an `engines` field are only offered on Camunda 8 diagrams whose `modeler:executionPlatformVersion` matches. To change the version of all diagrams, run **Miragon BPMN Modeler: Migrate All BPMN Diagrams**; open editors update and already applied templates that no longer fit are marked incompatible.

## Limits

- Templates are cached per workspace and fetched only on Add and Update. A marketplace in your User settings is fetched once per workspace: run **Update Marketplaces** in a new workspace.
- A source that cannot be fetched keeps its last fetched templates until an update reaches it again, unless it moved to another place in `sources`. An update lists a marketplace as failed when none of its sources can be fetched.
- Unauthenticated GitHub access allows 60 requests per hour; a token raises the limit.
- Very large repositories fail to list (GitHub's tree limit, 10,000 files under the path on GitLab). Point `path` at a narrower folder.
- Templates control how processes run. Only add marketplaces you trust.

## IntelliJ

The IntelliJ plugin has the same feature as **Add Template Marketplace…**, **Update Template Marketplaces** and **Remove Template Marketplace…** (see [Actions](/intellij/getting-started#actions)). App-wide entries are listed under **Settings ▸ Tools ▸ Miragon BPMN Modeler ▸ Template Marketplaces**; tokens live in the IDE's password safe. Entries there are strings only, so self-hosted instances with `baseUrl` are VS Code only for now.

## Next steps

- [Element templates](/vscode/features/element-template-chooser): browse and apply the loaded templates.
- [Append menu](/vscode/features/append-menu): add a templated element as the next step.
