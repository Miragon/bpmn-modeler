# Workspace code allowance

- Status: accepted
- Last reviewed: 2026-11-13

## Context

Two kinds of workspace code run in the modeler: [BPMN plugins](bpmn-plugins.md) in the editor page
and [bpmnlint rule packages](bpmn-linting.md) in the extension host or the bridge, with the user's
rights. Host trust alone does not gate them: the standalone app turns Workspace Trust off, VS Code
treats an empty window as trusted and Orca has no workspace. The core therefore keeps a host-neutral
gate, the allowance. Plugins, rule packages and the [Add-ons view](add-ons.md) all decide by it:
whether code runs, what the notices ask about, what the view lists and what Allow and Revoke write.

VS Code 1.21.0 and IntelliJ 1.16.0 asked per folder and content. Every git worktree asked again, so
one worktree per agent task meant one question per task. A pull or an install asked about files
nobody reviews, so the question was answered with Allow. Rows grew by one per worktree and add-on,
and rows written without the user caused revoke races. The defence against a bad update is the
lockfile, the registry's integrity check and the review of the update, none of them the modeler's
([#2345](https://github.com/Miragon/bpmn-modeler/issues/2345), decided 2026-11-11).

## Contents

- [The allowance](#the-allowance)
- [Finding the repository](#finding-the-repository)
- [Rows and migration](#rows-and-migration)
- [Approval store](#approval-store)
- [Asking](#asking)
- [Host trust](#host-trust)
- [Accepted costs](#accepted-costs)
- [Alternatives](#alternatives)

## Decision

### The allowance

An allowance names an add-on at its origin, not its content: `{ kind, host, origin, addOn }`
(`kernel/domain/allowance.ts`). It holds for whatever content the add-on has there, now and later,
and the question says so.

- *Origin* is the repository that holds the code: the realpath of the git common directory, which
  all worktrees of one clone share. Code in no repository has its own folder as origin.
- *Host* is the remote the code was found on, empty locally. VS Code keeps its global state on the
  client, so one list can hold rows of several remote machines or dev containers that hold a
  repository at the same path. VS Code takes the remote authority (`originHostOf`), computed once at
  activation; a wrong guess fails towards asking. The IntelliJ bridge runs on the machine that
  holds the project, so its host is always empty.
- *Add-on* is the code's place in the repository, spelled so that an update keeps it. A plugin: its
  folder path below the worktree root. An installed rule package: the path below the worktree root
  up to the first `node_modules`, plus the package name. The realpath would not do, because pnpm's
  `.pnpm/<name>@<version>` segment makes every update a new path. A hoisted and a nested copy of
  one name therefore share an allowance. A linked package and a config's own package: the folder
  path.
- *Installed code* (marketplace plugins, [#2243](https://github.com/Miragon/bpmn-modeler/issues/2243),
  [#2317](https://github.com/Miragon/bpmn-modeler/issues/2317)) has the marketplace link as its
  origin. Enabling it is the allowance, and nothing is per folder.

A worktree of an allowed repository asks nothing, whatever its branch holds. A new add-on, another
repository and a second clone ask once. Two worktrees of one repository in one window share one
key: the notice and the list count the add-on once, one answer writes one row, and a decline
answers both places.

The state of a piece of workspace code has one spelling, `AllowanceState` (`allowed`, `new`,
`declined`), one rule of whether a row allows it (`isAllowed`) and one list of what to ask about
(`pendingAllowances`, one entry per key). `AllowanceLocator` is the only place an allowance is
computed from disk. Each host process builds one locator, one `NodeInstalledPackages` and one
`ContentRowMigration` in its shared dependencies, so every feature locates an allowance the same
way and waits on the same migration run.

### Finding the repository

A wrong answer makes one allowance cover foreign code, so the rule fails towards "no repository"
(`kernel/domain/repositoryIdentity.ts`). From the add-on's realpath, the nearest folder upward
that holds a `.git` entry is the worktree root.

- A `.git` that is a directory and not a link is the common directory.
- A `.git` file is a linked worktree only when both hold: the folder its `gitdir:` line names is a
  direct child of `<common directory>/worktrees/`, and that folder's `gitdir` file names this `.git`
  file back. The first check stops a `.git` file that points at an administrative folder of its own
  making, the second one that points at another worktree's.
- Anything else is no repository, and the add-on's folder is the origin: a `.git` that is a link, a
  submodule, `--separate-git-dir`, another version control system.

The remote URL is never read, because any repository can claim any URL. Git is never run: the
domain decides from file facts that a synchronous port reads (`RepositoryFilesPort`). The realpath
comes first, so a folder reached through a link takes its target's origin, and a repository never
covers foreign code through a link. A path Node cannot read, such as a virtual workspace folder, is
a folder origin at the path as given. On Windows the key folds only the drive letter's case, since
VS Code lowercases it while git and Node keep the case they were given.

`describeRepositoryFilesContract` pins the adapters and the in-memory fake, and a spec runs the
locator on worktrees that git itself wrote.

### Rows and migration

The stored row keeps its shape, `{ pluginId, contentHash }`: `pluginId` holds the allowance key and
`contentHash` the marker `allowance-v1:<kind>`. The VS Code global state, the bridge protocol, the
Kotlin store and the merge therefore stay as they were, and an older build reads such a row as
matching nothing. There is at most one row per add-on per repository.
`kernel/domain/approvalRowKind.ts` is the one reading of a row's kind and format.

- *Content rows.* A 1.21.0 row pinned to content still allows the add-on found at that folder,
  whatever its hash, so nobody is asked again while it waits to be rewritten. It counts, is migrated
  and is revoked only where the host is local: it names no host, and in a remote window it may have
  been given on another machine at the same path. The cost is one question per add-on per remote
  for a 1.21.0 user of remote windows.
- *Migration.* `ContentRowMigration` rewrites, once per host process at start and in one change,
  every local content row whose folder it can locate, and revokes the rows it rewrote. It is
  idempotent, and every VS Code window and IntelliJ bridge runs it. A row whose folder it does not
  find stays, because the list may serve several machines. These are the only rows written without
  the user.
- *Waits.* A caller that would ask or revoke first waits for the run, capped at 10 s
  (`CONTENT_ROW_MIGRATION_WAIT_MS`), because `pluginApprovals/change` is a synced write without a
  deadline. A lint never waits: the run's change relints it.
- *Revoke* takes back the key and, only where the host is local, every content row located to the
  same key, each id once.

### Approval store

The host keeps the list outside every workspace (`PluginApprovalStorePort`: VS Code global state,
an IntelliJ application value), so a repository cannot allow itself. Every write is a change, rows
to allow and ids to revoke (`CodeApprovalChange`), that the host merges into the stored list
(`approvalsAfter`). A writer therefore never drops a row it had not read, such as one another
project or window stored. There is no whole-list save. A change that names an id twice, or allows
and revokes one, is refused in both languages: no caller sends one, so it is a bug, and failing
closed is the safe answer. `codeApprovalChange.cases.json` holds the rows for the TypeScript and
the Kotlin merge.

- *IntelliJ.* An application service is the single writer, and each project's bridge mirrors the
  list by revision ([host-replicated state](intellij-bridge.md#host-replicated-state)).
- *VS Code.* The store merges each change on one promise chain. VS Code announces no write another
  window makes to the global state, so the composition reads the stored list again when the window
  gains focus. Unverified residual: if another window's write has not reached this window's
  `Memento` when it writes, the whole value it writes can drop that row. One key per row would
  close it.

Every change of the list, whoever made it, reloads the open BPMN editors it makes stale and relints
the editors a rule package change affects. The question itself reloads nothing.

### Asking

A list never opens unasked ([VS Code UX guidelines](../../.agents/skills/vscode-ux-guidelines/SKILL.md));
the spike's QuickPick opened with the editor and took the focus. The editor opens with the allowed
code at once. When something is pending, the core offers a notice with one **Review…** action
through the [action notice port](architecture-and-hosts.md#host-integrations).

- Only **Review…** opens the review (`ApprovalReviewPort`). `ViewReview` leaves the code to the
  [Add-ons view](add-ons.md) when a folder is open and every pending item lies inside one. It is all
  or nothing, because the view lists only code inside a workspace folder. Otherwise, or when the
  view cannot open, `ListReview` opens a checklist.
- Dismissing the notice or the list, or leaving an item unchecked, declines it for this session.
  It is offered again in a later session; a content change does not reopen it.
- Code left to the view settles the question at once, so the queue does not wait on the view, and
  no notice asks about that allowance again this session.
- Each host builds one `QuestionQueue` and passes it to the plugins and the rule packages, so one
  question is open at a time across both kinds. Code found while it is open is asked afterwards. A
  VS Code notice can stay unanswered in the notification centre, so dropping those would leave a
  second workspace unasked. The queue serialises questions, not writes: each answer is a merged
  change ([#2275](https://github.com/Miragon/bpmn-modeler/issues/2275)).

### Host trust

Host trust comes first. In a workspace the user did not trust, no plugin is served and no rule
package runs, whatever its allowance; nothing asks to allow one, and the Add-ons view offers no
Allow for code and says why. Revoke stays. The rule has one home,
`kernel/domain/workspaceTrust.ts` (`runsInWorkspace`, `offersAllowInWorkspace`). The core reads the
trust through the optional `WorkspaceTrustPort`; a host that wires none is trusted, which suits Orca
and npm consumers, as they run no workspace code. A change of the trust reloads, relints and
rebuilds the view without a restart, and a grant asks about the code the open editors withhold.

- *VS Code.* The extension declares no support for untrusted workspaces, so it does not run in
  Restricted Mode. It follows the grant only, since VS Code reloads the window when the user
  withdraws trust. The standalone app turns Workspace Trust off, so it is always trusted.
- *IntelliJ.* The plugin reads `Project.isTrusted()` and follows `TrustedProjectsListener`. Both
  are experimental API on the 2024.2 floor, and `isTrusted()` is deprecated but present in 2026.1.
  A project the IDE never asked about counts as not trusted, so it runs no workspace code until the
  user trusts it. A Trusted Locations change announces nothing, so it reaches the bridge with the
  next editor, the next spawn or **Refresh** of the Add-ons tab. The bridge mirrors the trust and
  is untrusted until the host says otherwise
  ([host-replicated state](intellij-bridge.md#host-replicated-state)).

### Accepted costs

- Whoever can change the files of an allowed repository (a pull, an install, an agent in a
  worktree) changes code that runs with the user's rights, as for every tool that runs under host
  trust. "Any change asks again", which the 1.21.0 user guide promised, ends.
- A rule package runs in place and unhashed ([rule packages](bpmn-linting.md#weaker-guarantee-than-a-plugins)),
  and one that ran before a revoke or a withdrawn trust stays loaded until the process restarts.
- A repository cloned at a deleted one's path inherits its allowances. The origin carries no stamp
  against this; VS Code Workspace Trust is keyed by path too.
- An archive unpacked into an allowed repository without a `.git` of its own belongs to that
  repository.
- The migration revokes the content rows it rewrites, so a downgrade to 1.21.0 asks again.
- A submodule, a `--separate-git-dir` checkout and other version control systems ask per folder,
  and without git a pnpm update asks again, as the package's folder changes.
- Rows of deleted repositories stay, and no view lists them. An allowance of an add-on removed from
  the repository cannot be revoked from the view.
- Revoke does not reach everywhere at once: another bridge's or window's migration can write the
  allowance back within one round trip, and a waiter goes on when the 10 s cap passes on a hung
  host.

### Alternatives

- **Per folder and content** (1.21.0): every worktree asks.
- **Same content anywhere**: removes the question only for identical bytes. A branch with another
  dependency version, a package an agent edited and a pull that updates a package still ask.
- **Repository and content**: asks in every case the one above asks in, and in a second clone.
- **Repository and declared version**: the same click-through, with the package's rules skipped
  until it is answered. It can become an opt-in setting on this model.
- **Host trust alone**: the gaps named in the context.
- **The remote URL or an id file in the repository as its identity**: a repository would allow
  itself.
- **A stamp of the repository in the origin against path reuse**: a re-clone or a moved checkout
  would ask again.
