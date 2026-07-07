# Template Marketplace

A template marketplace lets you pull [element templates](/vscode/features/element-template-chooser)
from shared locations — a GitHub or GitLab repository, or a folder on your
machine — instead of copying JSON files into every project by hand.

A marketplace is any location holding a `marketplace.json` at its root. That
file does not contain templates itself; it **points** at where they live — in
the same repository via relative paths, or in other repositories. The source
repositories stay the single source of truth: nothing is copied into your
workspace. Templates are fetched, cached locally, and merged with the
workspace-local templates from `<configFolder>/element-templates/`, so they
appear in the [Element Template Chooser](/vscode/features/element-template-chooser)
and the [Append Menu](/vscode/features/append-menu) like any other template.

## Quick Start

1. Open the command palette and run **BPMN Modeler: Add Marketplace**.
2. Paste a GitHub/GitLab repository URL or a local folder path holding a
   `marketplace.json`.
3. The marketplace is fetched, validated, and saved to your user settings.
   Templates show up immediately — open editors refresh without reopening.
4. To re-fetch later (new templates, updated versions), run
   **BPMN Modeler: Update Marketplaces**.

A marketplace whose `marketplace.json` is missing or malformed is rejected at
add time, so a typo never lands in your settings.

### In JetBrains IDEs

The marketplace also ships in the IntelliJ plugin. The two commands live under
the **Tools** menu — **Add Template Marketplace…** and **Update Template
Marketplaces** — and the source list is edited on the settings page
(**Settings ▸ Tools ▸ Miragon BPMN Modeler ▸ Template Marketplaces**, one
location per line). Fetch, validation, caching, and the per-host token flow are
identical to VS Code; tokens live in the IDE's **PasswordSafe** rather than VS
Code secret storage. The settings list is **strings-only** for now (pasted URLs
and local paths) — the structured self-hosted GHE / self-hosted GitLab object
form is VS-Code-only until a later release.

## The `marketplace.json` Manifest

Place a `marketplace.json` at the root of the repository (or folder). It lists
one or more **sources**; every `.json` file under a source's path is loaded as
an element template.

```json
{
    "sources": [
        { "path": "element-templates" },
        {
            "provider": "github",
            "repo": "my-org/camunda-templates",
            "path": "templates",
            "ref": "v1.2.0"
        },
        {
            "provider": "gitlab",
            "repo": "my-group/platform/templates",
            "path": "element-templates",
            "visibility": "private"
        },
        { "provider": "local", "path": "~/shared/element-templates" }
    ]
}
```

| Field        | Applies to        | Description                                                                                                                                          |
|--------------|-------------------|------------------------------------------------------------------------------------------------------------------------------------------------------|
| `path`       | all               | Required. The folder to scan for `.json` templates. Without a `provider`, it is relative to the marketplace itself.                                   |
| `type`       | optional          | Content type of the source. Defaults to `element-templates` (the only type this version serves). A future, unknown type is skipped with a warning rather than rejecting the whole marketplace, so an older modeler still loads the sources it understands. |
| `provider`   | optional          | Omit for a marketplace-relative path. `github` / `gitlab` point at another repository; `local` at a folder on the user's machine.                     |
| `repo`       | `github`, `gitlab` | `owner/repo` for GitHub; the full `group/subgroup/project` path for GitLab (subgroups allowed).                                                       |
| `ref`        | `github`, `gitlab` | Branch, tag, or commit to pin. Omit for the default branch.                                                                                           |
| `baseUrl`    | `github`, `gitlab` | Base URL of a self-hosted GitHub Enterprise or GitLab instance. Omit for the public host.                                                             |
| `visibility` | `github`, `gitlab` | Set `"private"` to have the modeler ask for an access token up front instead of after the first failed fetch. This is a hint — access is proven by the fetch either way. |

A shape error in the manifest (a missing `path`, an unknown `provider`, a
malformed `repo`) fails loudly with a clear message rather than silently
loading zero templates. Unknown extra fields are tolerated.

## Registering Marketplaces

The **Add Marketplace** command is the easiest way for public hosts
and local folders. Under the hood every marketplace is an entry in the
user-level setting `miragon.bpmnModeler.marketplaces`, which you can
also edit directly:

```json
{
    "miragon.bpmnModeler.marketplaces": [
        "https://github.com/my-org/process-marketplace",
        "my-org/process-marketplace",
        "https://gitlab.com/my-group/platform/marketplace",
        "https://github.com/my-org/process-marketplace/tree/v2",
        "/Users/me/bpmn/marketplace",
        {
            "provider": "github",
            "repo": "my-org/marketplace",
            "baseUrl": "https://github.my-company.com",
            "ref": "main"
        },
        {
            "provider": "gitlab",
            "repo": "platform/tooling/marketplace",
            "baseUrl": "https://gitlab.my-company.com"
        }
    ]
}
```

- **Strings** cover the public hosts and local folders: a full URL, the bare
  `owner/repo` GitHub shorthand, a `/tree/<ref>` browse URL to pin a branch or
  tag, or an absolute folder path (Windows paths and `file://` URLs work too).
- **Objects** are for self-hosted GitHub Enterprise or GitLab instances, which
  need a `baseUrl` that a plain URL string cannot express unambiguously.
- In `settings.json`, local paths must be absolute — `~` is only expanded when
  you enter it in the Add command's input box.

The setting is application-scoped (per user, not per workspace) because the
template cache lives in the extension's global storage.

## Element Templates

### Online: Public Repositories

Any public GitHub repository or GitLab project with a `marketplace.json` at
its root works out of the box — paste its URL into the Add command and you are
done.

Things to consider when setting one up:

- **Pin a ref for stability.** Without a `ref`, consumers always get the
  default branch's latest state. Registering `…/tree/v1.2.0` (or setting
  `ref` on a source) gives you release-style versioning: consumers only see
  changes when you move the tag or they re-register.
- **Keep templates under a dedicated folder** (e.g. `element-templates/`) and
  point the source's `path` at it. Every `.json` under that path is treated as
  a template, so don't mix in other JSON files (CI configs, `package.json`,
  and the like).
- **GitHub rate limits.** Unauthenticated GitHub API access is limited to 60
  requests per hour. Listing is done with a single tree call per source to
  stay well under that, but if you update very frequently or aggregate many
  sources, the modeler will offer to use a personal access token, which raises
  the limit substantially.
- **Repository size.** Listing fails loudly (rather than loading a partial
  catalogue) if a repository is too large to enumerate in one pass — for
  GitHub that is the API's recursive-tree cap, for GitLab 10.000 files under
  the source path. Point `path` at a narrower folder if you hit this.

### Online: Private Repositories

Private repositories work the same way, authenticated with a **personal access
token (PAT)** per host:

1. When a fetch is denied (or a source is declared `"visibility": "private"`),
   the modeler prompts for a token for that host — once per host per command,
   never repeatedly.
2. The token is stored in VS Code's encrypted secret storage, keyed by host
   (`github.com`, `gitlab.com`, or your self-hosted domain). It never appears
   in settings, logs, or error messages.
3. Entering a new token when the old one is rejected replaces it — that is how
   you rotate an expired token. Pressing Escape declines; the affected source
   is skipped with a warning and everything else continues.

Token scopes to grant:

| Host   | Recommended scope                                                              |
|--------|--------------------------------------------------------------------------------|
| GitHub | Fine-grained PAT with **Contents: Read-only** on the repos, or classic `repo`. |
| GitLab | `read_api` (covers the repository tree and raw file endpoints).                 |

Considerations:

- Declare `"visibility": "private"` on private sources in your
  `marketplace.json`. It lets the modeler ask for the token up front instead
  of after a failed fetch, which reads better for consumers.
- One token per host covers all marketplaces and sources on that host — a
  marketplace on `github.com` with three private sources prompts once, not
  three times.
- For **self-hosted** GitHub Enterprise or GitLab, register the marketplace as
  an object entry with `baseUrl` (see above). Sources in `marketplace.json`
  can carry a `baseUrl` too, so a public marketplace may reference templates
  on an internal instance.

### Offline: Local Marketplaces

A marketplace does not need a remote repository at all — useful for air-gapped
environments, shared network drives, or trying things out locally. Two setups
work:

**A plain local folder.** Put a `marketplace.json` next to your templates and
register the folder by its path:

```
~/bpmn/marketplace/
├── marketplace.json        { "sources": [{ "path": "element-templates" }] }
└── element-templates/
    ├── send-email.json
    └── generate-pdf.json
```

Add it via the command (where `~` is fine) or as an absolute path in settings.
No network access, no rate limits, no tokens.

**A checked-out template repository.** If your organisation keeps templates in
git but you cannot (or don't want to) fetch them over the network, clone the
repository and register the clone's path. It is read like any local folder —
run `git pull` followed by **BPMN Modeler: Update Marketplaces** to
pick up new templates.

If the checked-out repository has no `marketplace.json` of its own, create a
small local marketplace folder that points at the clone instead:

```json
{
    "sources": [
        { "provider": "local", "path": "~/repos/camunda-templates/element-templates" }
    ]
}
```

`local` sources require an absolute or `~`-rooted path; marketplace-relative
paths use a provider-less source.

## Good to Know

- **Caching.** Fetched templates are cached in the extension's global storage
  and re-read from there — the modeler does not hit the network every time an
  editor opens, only on **Add** and **Update Marketplaces**.
- **Cache is not pruned.** Templates removed upstream (or a whole marketplace
  removed from settings) currently stay in the local cache until it is cleared
  manually from the extension's global storage folder. Removing a settings
  entry stops future updates but does not yet delete what was already fetched.
- **Trust.** Templates configure how your processes execute (delegate
  expressions, connectors, called elements). Only register marketplaces from
  sources you trust, the same way you would vet a dependency.
