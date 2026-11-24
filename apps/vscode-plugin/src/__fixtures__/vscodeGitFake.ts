/**
 * The slice of the `vscode` module the merge view's adapters touch, for
 * `vi.mock("vscode", () => import(".../vscodeGitFake"))`: a `Uri` with a
 * query that prints as VS Code prints it, the built-in Git extension's API
 * over repositories a test stages, text document content providers, and
 * `commands.executeCommand`. Call {@link resetVscodeGit} before each test.
 */
import type { StagedConflict } from "@miragon/bpmn-modeler-core/testing";

const encodePath = (path: string): string => path.split("/").map(encodeURIComponent).join("/");

export class Uri {
    private constructor(
        readonly scheme: string,
        readonly authority: string,
        readonly path: string,
        readonly query: string,
    ) {}

    static parse(value: string): Uri {
        const [, scheme, authority = "", path = "", query = ""] =
            /^([a-z][\w+.-]*):(?:\/\/([^/?#]*))?([^?#]*)(?:\?([^#]*))?/i.exec(value) ?? [];
        return new Uri(scheme, authority, decodeURIComponent(path), decodeURIComponent(query));
    }

    static from(parts: { scheme: string; authority?: string; path?: string; query?: string }): Uri {
        return new Uri(parts.scheme, parts.authority ?? "", parts.path ?? "", parts.query ?? "");
    }

    static file(path: string): Uri {
        return new Uri("file", "", path, "");
    }

    static joinPath(base: Uri, ...segments: string[]): Uri {
        const parts: string[] = [];
        for (const part of [base.path, ...segments].join("/").split("/")) {
            if (part === "..") parts.pop();
            else if (part !== "" && part !== ".") parts.push(part);
        }
        return new Uri(base.scheme, base.authority, `/${parts.join("/")}`, "");
    }

    get fsPath(): string {
        return this.path;
    }

    toString(): string {
        const authority = this.authority || this.scheme === "file" ? `//${this.authority}` : "";
        const query = this.query ? `?${encodeURIComponent(this.query)}` : "";
        return `${this.scheme}:${authority}${encodePath(this.path)}${query}`;
    }
}

class Emitter<T> {
    private readonly listeners = new Set<(event: T) => void>();

    readonly event = (listener: (event: T) => void) => {
        this.listeners.add(listener);
        return { dispose: () => this.listeners.delete(listener) };
    };

    fire(event: T): void {
        [...this.listeners].forEach((listener) => listener(event));
    }

    get listenerCount(): number {
        return this.listeners.size;
    }
}

const STAGE_OF_REF = { ":1": "base", ":2": "current", ":3": "incoming" } as const;

export enum FileType {
    File = 1,
    Directory = 2,
}

class FakeRepository {
    readonly conflicts = new Map<string, StagedConflict>();
    /** The files with staged changes, by URI. */
    readonly staged = new Set<string>();
    readonly changes = new Emitter<void>();
    refs: NonNullable<StagedConflict["refs"]> = {};
    opened = true;
    /** The `gitdir:` line of a linked worktree's `.git` file; absent for a `.git` folder. */
    linkedGitDir?: string;
    rebaseFolder: "rebase-merge" | "rebase-apply" = "rebase-merge";
    private published: StagedConflict[] = [];

    constructor(readonly rootUri: Uri) {}

    get state() {
        const commit = (fact?: { hash: string; subject: string }) =>
            fact && { hash: fact.hash, message: `${fact.subject}\n\nThe body.` };
        return {
            HEAD: { name: this.refs.headName, commit: this.refs.head?.hash },
            rebaseCommit: commit(this.refs.rebaseCommit),
            mergeChanges: this.published.map(({ fileUri }) => ({ uri: Uri.parse(fileUri) })),
            indexChanges: [...this.staged].map((fileUri) => ({ uri: Uri.parse(fileUri) })),
            onDidChange: this.changes.event,
        };
    }

    async status(): Promise<void> {
        this.published = [...this.conflicts.values()];
        this.changes.fire();
    }

    async buffer(ref: keyof typeof STAGE_OF_REF, path: string): Promise<Uint8Array> {
        const conflict = [...this.conflicts.values()].find(
            ({ fileUri }) => Uri.parse(fileUri).fsPath === path,
        );
        const text = conflict?.stages[STAGE_OF_REF[ref]];
        if (text === undefined) throw new Error(`fatal: path '${path}' is not in stage ${ref}`);
        return new TextEncoder().encode(text);
    }

    async getCommit(ref: string): Promise<{ hash: string; message: string }> {
        const facts: Record<string, { hash: string; subject: string } | undefined> = {
            HEAD: this.refs.head,
            REBASE_HEAD: this.refs.rebaseHead,
            MERGE_HEAD: this.refs.mergeHead,
            CHERRY_PICK_HEAD: this.refs.cherryPickHead,
        };
        const fact = facts[ref];
        if (!fact) throw new Error(`fatal: bad revision '${ref}'`);
        return { hash: fact.hash, message: `${fact.subject}\n\nThe body.` };
    }

    holds(uri: Uri): boolean {
        return uri.scheme === "file" && uri.path.startsWith(`${this.rootUri.path}/`);
    }

    /** What Git keeps on disk for this repository, by path: the `.git` entry and a running rebase's folder. */
    gitFiles(): Map<string, FileType> {
        const dotGit = `${this.rootUri.path}/.git`;
        const gitDir = this.linkedGitDir
            ? Uri.joinPath(
                  this.linkedGitDir.startsWith("/") ? Uri.file("/") : this.rootUri,
                  this.linkedGitDir,
              ).path
            : dotGit;
        const files = new Map([[dotGit, this.linkedGitDir ? FileType.File : FileType.Directory]]);
        if (this.refs.rebaseInProgress)
            files.set(`${gitDir}/${this.rebaseFolder}`, FileType.Directory);
        return files;
    }
}

const gitFileAt = (uri: Uri): { repository: FakeRepository; type: FileType } | undefined => {
    for (const repository of git.repositories) {
        const type = repository.gitFiles().get(uri.path);
        if (type !== undefined) return { repository, type };
    }
    return undefined;
};

const git = {
    present: true,
    /** Whether the extension runs already, or only once `activate()` is awaited. */
    active: false,
    enabled: true,
    enablements: new Emitter<boolean>(),
    initialized: true,
    repositories: [] as FakeRepository[],
    opensLater: new Set<string>(),
    stateChanges: new Emitter<"uninitialized" | "initialized">(),
    openings: new Emitter<FakeRepository>(),
    closings: new Emitter<FakeRepository>(),
};

const api = {
    get state() {
        return git.initialized ? "initialized" : "uninitialized";
    },
    get onDidChangeState() {
        return git.stateChanges.event;
    },
    get repositories() {
        return git.repositories.filter((repository) => repository.opened);
    },
    get onDidOpenRepository() {
        return git.openings.event;
    },
    get onDidCloseRepository() {
        return git.closings.event;
    },
    getRepository(uri: Uri) {
        const repository = git.repositories.find((candidate) => candidate.holds(uri));
        if (!repository) return null;
        if (repository.opened) return repository;
        // Git was still scanning the workspace: the repository opens a moment later.
        setTimeout(() => {
            repository.opened = true;
            git.openings.fire(repository);
        }, 5);
        return null;
    },
};

const repositoryAt = (root: string): FakeRepository => {
    const existing = git.repositories.find((repository) => repository.rootUri.toString() === root);
    if (existing) return existing;
    const repository = new FakeRepository(Uri.parse(root));
    repository.opened = !git.opensLater.has(root);
    git.repositories.push(repository);
    return repository;
};

/** Git conflicts a file; Git's own state shows it after the next status refresh. */
export function conflictInGit(root: string, conflict: StagedConflict): void {
    const repository = repositoryAt(root);
    repository.conflicts.set(conflict.fileUri, conflict);
    repository.refs = conflict.refs ?? {};
}

/** The repository at `root` is a linked worktree: its `.git` is a file whose `gitdir:` line names `gitDir`. */
export function linkWorktree(
    root: string,
    gitDir: string,
    rebaseFolder: "rebase-merge" | "rebase-apply" = "rebase-merge",
): void {
    const repository = repositoryAt(root);
    repository.linkedGitDir = gitDir;
    repository.rebaseFolder = rebaseFolder;
}

/** The user closes the repository at `root`, or opens it again. */
export function closeRepository(root: string): void {
    const repository = repositoryAt(root);
    repository.opened = false;
    git.closings.fire(repository);
}

export function reopenRepository(root: string): void {
    const repository = repositoryAt(root);
    repository.opened = true;
    git.openings.fire(repository);
}

/** How many listeners the repository at `root` holds on its state. */
export function repositoryListenerCount(root: string): number {
    return repositoryAt(root).changes.listenerCount;
}

export function resolveInGit(root: string, fileUri: string): void {
    repositoryAt(root).conflicts.delete(fileUri);
}

/** Git refreshes every repository's status on its own and tells its listeners. */
export async function gitRefreshes(): Promise<void> {
    await Promise.all(git.repositories.map((repository) => repository.status()));
}

export function openRepositoryLater(root: string): void {
    git.opensLater.add(root);
}

export function removeGit(): void {
    git.present = false;
}

/** The Git extension runs already, as it does while one of its documents is open. */
export function runGit(): void {
    git.active = true;
}

/** The Git extension is installed but not started, with its repositories as they are. */
export function stopGit(): void {
    git.active = false;
}

/** The user stages changes of a file, or unstages them. */
export function stageInGit(root: string, fileUri: string): void {
    repositoryAt(root).staged.add(fileUri);
}

export function unstageInGit(root: string, fileUri: string): void {
    repositoryAt(root).staged.delete(fileUri);
}

/** `git.enabled` is off, as the smoke test starts VS Code. */
export function disableGit(): void {
    git.enabled = false;
}

export function enableGit(): void {
    git.enabled = true;
    git.enablements.fire(true);
}

export function keepGitStarting(): void {
    git.initialized = false;
}

/** Git finishes starting, as after a slow workspace scan. */
export function gitStarts(): void {
    git.initialized = true;
    git.stateChanges.fire("initialized");
}

export function gitListenerCount(): number {
    return (
        git.enablements.listenerCount +
        git.stateChanges.listenerCount +
        git.openings.listenerCount +
        git.closings.listenerCount +
        git.repositories.reduce((count, repository) => count + repository.changes.listenerCount, 0)
    );
}

const contentProviders = new Map<string, { provideTextDocumentContent(uri: Uri): string }>();

/** The text a registered content provider serves for `uri`. */
export function providedContent(uri: string): string | undefined {
    const parsed = Uri.parse(uri);
    return contentProviders.get(parsed.scheme)?.provideTextDocumentContent(parsed);
}

export const commandCalls: unknown[][] = [];

export function resetVscodeGit(): void {
    git.present = true;
    git.active = false;
    git.enabled = true;
    git.enablements = new Emitter();
    git.initialized = true;
    git.repositories = [];
    git.opensLater.clear();
    git.stateChanges = new Emitter();
    git.openings = new Emitter();
    git.closings = new Emitter();
    contentProviders.clear();
    commandCalls.length = 0;
}

export const extensions = {
    getExtension(id: string) {
        if (id !== "vscode.git" || !git.present) return undefined;
        const exports = {
            get enabled() {
                return git.enabled;
            },
            get onDidChangeEnablement() {
                return git.enablements.event;
            },
            getAPI: () => {
                if (!git.enabled) throw new Error("Git model not found");
                return api;
            },
        };
        return { isActive: git.active, exports, activate: async () => exports };
    },
};

export const workspace = {
    fs: {
        async stat(uri: Uri): Promise<{ type: FileType }> {
            const gitFile = gitFileAt(uri);
            if (!gitFile) throw new Error("FileNotFound");
            return { type: gitFile.type };
        },
        async readFile(uri: Uri): Promise<Uint8Array> {
            const gitFile = gitFileAt(uri);
            if (gitFile?.type === FileType.File) {
                return new TextEncoder().encode(`gitdir: ${gitFile.repository.linkedGitDir}\n`);
            }
            const conflict = git.repositories
                .flatMap((repository) => [...repository.conflicts.values()])
                .find(({ fileUri }) => fileUri === uri.toString());
            if (conflict?.workingText === undefined) throw new Error("FileNotFound");
            return new TextEncoder().encode(conflict.workingText);
        },
    },
    registerTextDocumentContentProvider(
        scheme: string,
        provider: { provideTextDocumentContent(uri: Uri): string },
    ) {
        contentProviders.set(scheme, provider);
        return { dispose: () => contentProviders.delete(scheme) };
    },
};

export const commands = {
    async executeCommand(...args: unknown[]): Promise<unknown> {
        commandCalls.push(args);
        return undefined;
    },
};
