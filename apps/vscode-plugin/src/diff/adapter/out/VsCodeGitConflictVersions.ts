import { posix } from "node:path";

import { Disposable, Event, FileType, Uri, workspace } from "vscode";

import {
    ConflictStageFacts,
    ConflictStages,
    ConflictVersionsSource,
    GitCommitFact,
    GitRefFacts,
} from "@miragon/bpmn-modeler-core";
import type { API, Commit, GitExtension, Repository } from "./vscodeGitApi";
import { gitApiOf, gitExtensionHandle } from "./vscodeGitExtension";

/** How long a read waits for Git to finish starting and for a repository to open. */
export interface GitWaits {
    readonly initializedMs: number;
    readonly repositoryMs: number;
}

const DEFAULT_WAITS: GitWaits = { initializedMs: 10_000, repositoryMs: 5_000 };

const UNAVAILABLE: ConflictStageFacts = {
    gitAvailable: false,
    inMergeChanges: false,
    stages: {},
    refs: {},
};

const NOT_CONFLICTED: ConflictStageFacts = {
    gitAvailable: true,
    inMergeChanges: false,
    stages: {},
    refs: {},
};

// Git keeps one of these folders while a rebase runs; `git rebase --apply` and `git am` use the second.
const REBASE_FOLDERS = ["rebase-merge", "rebase-apply"];

const STAGE_REFS: Record<keyof ConflictStages, string> = {
    base: ":1",
    current: ":2",
    incoming: ":3",
};

/**
 * Reads a conflicted file's index stages and the repository's refs through
 * the built-in Git extension's API, looked up at runtime: the modeler still
 * activates where Git is missing or disabled. Hands over raw facts; the core
 * decides what they mean.
 */
export class VsCodeGitConflictVersions implements ConflictVersionsSource {
    constructor(private readonly waits: GitWaits = DEFAULT_WAITS) {}

    async readConflict(fileUri: string): Promise<ConflictStageFacts> {
        const api = await this.gitApi();
        if (!api || !(await this.started(api, this.waits.initializedMs))) {
            return UNAVAILABLE;
        }
        const uri = Uri.parse(fileUri);
        const repository = await this.repositoryOf(api, uri);
        if (!repository) {
            return NOT_CONFLICTED;
        }
        await repository.status();
        const inMergeChanges = repository.state.mergeChanges.some(
            (change) => change.uri.toString() === fileUri,
        );
        if (!inMergeChanges) {
            return NOT_CONFLICTED;
        }
        const [stages, refs, workingText] = await Promise.all([
            this.stagesOf(repository, uri),
            this.refsOf(repository),
            this.workingTextOf(uri),
        ]);
        return {
            gitAvailable: true,
            inMergeChanges: true,
            stages,
            refs,
            ...(workingText === undefined ? {} : { workingText }),
        };
    }

    watchMergeChanges(listener: (fileUris: readonly string[]) => void): Disposable {
        const subscriptions: Disposable[] = [];
        const repositoryWatches = new Map<Repository, Disposable>();
        const waits = new Set<() => void>();
        let disposed = false;
        let told: string | undefined;
        const watch = (api: API) => {
            const tell = () => {
                const fileUris = api.repositories.flatMap((repository) =>
                    repository.state.mergeChanges.map((change) => change.uri.toString()),
                );
                const list = JSON.stringify([...fileUris].sort());
                if (list === told) return;
                told = list;
                listener(fileUris);
            };
            const watchRepository = (repository: Repository) => {
                repositoryWatches.get(repository)?.dispose();
                repositoryWatches.set(repository, repository.state.onDidChange(tell));
            };
            api.repositories.forEach(watchRepository);
            subscriptions.push(
                api.onDidOpenRepository((repository) => {
                    watchRepository(repository);
                    tell();
                }),
                api.onDidCloseRepository((repository) => {
                    repositoryWatches.get(repository)?.dispose();
                    repositoryWatches.delete(repository);
                    tell();
                }),
            );
            tell();
        };
        void this.enabledGitApi(waits).then(async (api) => {
            // A slow workspace scan may keep Git starting for long; the watch waits as long as it is wanted.
            if (api && !disposed && (await this.started(api, undefined, waits)) && !disposed) {
                watch(api);
            }
        });
        return {
            dispose: () => {
                disposed = true;
                subscriptions.splice(0).forEach((subscription) => subscription.dispose());
                repositoryWatches.forEach((subscription) => subscription.dispose());
                repositoryWatches.clear();
                waits.forEach((stop) => stop());
            },
        };
    }

    private async gitApi(): Promise<API | undefined> {
        const git = await gitExtension();
        return git?.enabled ? gitApiOf(git) : undefined;
    }

    /** The API once `git.enabled` is on, waiting until then or until a stop in `waits` runs. */
    private async enabledGitApi(waits: Set<() => void>): Promise<API | undefined> {
        const git = await gitExtension();
        if (!git) return undefined;
        if (git.enabled) return gitApiOf(git);
        const enabled = await firstEvent(git.onDidChangeEnablement, (on) => on, undefined, waits);
        return enabled ? gitApiOf(git) : undefined;
    }

    /** Whether Git finished starting, waiting at most `timeoutMs`, or until stopped when absent. */
    private started(
        api: API,
        timeoutMs: number | undefined,
        waits = new Set<() => void>(),
    ): Promise<boolean> {
        if (api.state === "initialized") return Promise.resolve(true);
        return firstEvent(
            api.onDidChangeState,
            (state) => state === "initialized",
            timeoutMs,
            waits,
        );
    }

    private async repositoryOf(api: API, uri: Uri): Promise<Repository | undefined> {
        const repository = api.getRepository(uri);
        if (repository) return repository;
        const opened = await firstEvent(
            api.onDidOpenRepository,
            () => api.getRepository(uri) !== null,
            this.waits.repositoryMs,
            new Set(),
        );
        return opened ? (api.getRepository(uri) ?? undefined) : undefined;
    }

    private async stagesOf(repository: Repository, uri: Uri): Promise<ConflictStages> {
        const entries = await Promise.all(
            (Object.keys(STAGE_REFS) as (keyof ConflictStages)[]).map(
                async (stage) => [stage, await stageText(repository, STAGE_REFS[stage], uri)] as const,
            ),
        );
        return Object.fromEntries(entries.filter(([, text]) => text !== undefined));
    }

    private async refsOf(repository: Repository): Promise<GitRefFacts> {
        const [[head, rebaseHead, mergeHead, cherryPickHead], rebaseInProgress] = await Promise.all([
            Promise.all(
                ["HEAD", "REBASE_HEAD", "MERGE_HEAD", "CHERRY_PICK_HEAD"].map((ref) =>
                    repository.getCommit(ref).then(commitFact, () => undefined),
                ),
            ),
            rebaseRuns(repository.rootUri),
        ]);
        const { HEAD, rebaseCommit } = repository.state;
        const refs: Record<string, string | boolean | GitCommitFact | undefined> = {
            headName: HEAD?.name,
            head,
            rebaseHead,
            rebaseInProgress: rebaseInProgress || undefined,
            rebaseCommit: rebaseCommit && commitFact(rebaseCommit),
            mergeHead,
            cherryPickHead,
        };
        return Object.fromEntries(
            Object.entries(refs).filter(([, value]) => value !== undefined),
        ) as GitRefFacts;
    }

    private async workingTextOf(uri: Uri): Promise<string | undefined> {
        try {
            return new TextDecoder("utf-8").decode(await workspace.fs.readFile(uri));
        } catch {
            return undefined;
        }
    }
}

async function gitExtension(): Promise<GitExtension | undefined> {
    try {
        const extension = gitExtensionHandle();
        if (!extension) return undefined;
        return extension.isActive ? extension.exports : await extension.activate();
    } catch {
        return undefined;
    }
}

// `git show --textconv` underneath: a textconv driver or Git LFS hands over converted text or a pointer.
async function stageText(repository: Repository, ref: string, uri: Uri): Promise<string | undefined> {
    try {
        return new TextDecoder("utf-8").decode(await repository.buffer(ref, uri.fsPath));
    } catch {
        return undefined;
    }
}

async function rebaseRuns(root: Uri): Promise<boolean> {
    const gitFolder = await gitFolderOf(root);
    if (!gitFolder) return false;
    const found = await Promise.all(
        REBASE_FOLDERS.map((folder) => fileTypeOf(Uri.joinPath(gitFolder, folder))),
    );
    return found.some((type) => isOfType(type, FileType.Directory));
}

/** `<root>/.git`, or in a linked worktree or submodule the folder its `.git` file's `gitdir:` line names. */
async function gitFolderOf(root: Uri): Promise<Uri | undefined> {
    const dotGit = Uri.joinPath(root, ".git");
    const type = await fileTypeOf(dotGit);
    if (isOfType(type, FileType.Directory)) return dotGit;
    if (!isOfType(type, FileType.File)) return undefined;
    try {
        const text = new TextDecoder("utf-8").decode(await workspace.fs.readFile(dotGit));
        const gitDir = /^gitdir:\s*(.+?)\s*$/m.exec(text)?.[1];
        if (!gitDir) return undefined;
        return posix.isAbsolute(gitDir) || /^[a-z]:[\\/]/i.test(gitDir)
            ? Uri.file(gitDir)
            : Uri.joinPath(root, gitDir);
    } catch {
        return undefined;
    }
}

async function fileTypeOf(uri: Uri): Promise<FileType | undefined> {
    try {
        return (await workspace.fs.stat(uri)).type;
    } catch {
        return undefined;
    }
}

// A symbolic link adds its own bit to the type of what it points to.
function isOfType(type: FileType | undefined, expected: FileType): boolean {
    return type !== undefined && (type & expected) !== 0;
}

function commitFact(commit: Commit): GitCommitFact {
    return { hash: commit.hash, subject: commit.message.split("\n")[0] };
}

/**
 * Resolves `true` on the first event `matches` accepts, `false` when
 * `timeoutMs` passes first or a stop in `stoppable` runs; the listener goes either way.
 */
function firstEvent<T>(
    event: Event<T>,
    matches: (value: T) => boolean,
    timeoutMs: number | undefined,
    stoppable: Set<() => void>,
): Promise<boolean> {
    return new Promise((resolve) => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const finish = (happened: boolean) => {
            subscription.dispose();
            if (timer) clearTimeout(timer);
            stoppable.delete(stop);
            resolve(happened);
        };
        const stop = () => finish(false);
        const subscription = event((value) => {
            if (matches(value)) finish(true);
        });
        stoppable.add(stop);
        if (timeoutMs !== undefined) timer = setTimeout(() => finish(false), timeoutMs);
    });
}
