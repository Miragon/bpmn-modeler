import { EditorSubscription } from "../editorSession/domain/EditorSession";
import { ConflictStageFacts, ConflictVersionsSource } from "../diff/port/ConflictVersionsSource";
import { ConflictVersionsContractFixture, StagedConflict } from "./conflictVersionsContract";

const UNAVAILABLE: ConflictStageFacts = {
    gitAvailable: false,
    inMergeChanges: false,
    stages: {},
    refs: {},
};

/**
 * A host's Git integration in memory: repositories by root, each with the
 * files in its Merge Changes. A read sees every conflict at once, and a
 * watcher hears the set on {@link gitNotices}, as a host's status refresh
 * tells it.
 */
export class FakeConflictVersionsSource
    implements ConflictVersionsSource, Omit<ConflictVersionsContractFixture, "source">
{
    /** How many times a file's stages were read, by file URI. */
    readonly reads = new Map<string, number>();

    private readonly repositories = new Map<string, Map<string, StagedConflict>>();
    private readonly watchers = new Set<(fileUris: readonly string[]) => void>();
    private available = true;

    async readConflict(fileUri: string): Promise<ConflictStageFacts> {
        if (!this.available) return UNAVAILABLE;
        const repository = this.repositoryOf(fileUri);
        const conflict = repository?.get(fileUri);
        if (!conflict) {
            return { gitAvailable: true, inMergeChanges: false, stages: {}, refs: {} };
        }
        this.reads.set(fileUri, (this.reads.get(fileUri) ?? 0) + 1);
        return {
            gitAvailable: true,
            inMergeChanges: true,
            stages: { ...conflict.stages },
            refs: { ...conflict.refs },
            ...(conflict.workingText === undefined ? {} : { workingText: conflict.workingText }),
        };
    }

    watchMergeChanges(listener: (fileUris: readonly string[]) => void): EditorSubscription {
        this.watchers.add(listener);
        if (this.available) listener(this.mergeChanges());
        return { dispose: () => this.watchers.delete(listener) };
    }

    conflict(root: string, conflict: StagedConflict): void {
        const repository = this.repositories.get(root) ?? new Map<string, StagedConflict>();
        repository.set(conflict.fileUri, conflict);
        this.repositories.set(root, repository);
    }

    resolve(root: string, fileUri: string): void {
        this.repositories.get(root)?.delete(fileUri);
    }

    async gitNotices(): Promise<void> {
        const fileUris = this.mergeChanges();
        this.watchers.forEach((listener) => listener(fileUris));
    }

    openLater(): void {
        // A read waits for nothing in memory: the repository is there when asked.
    }

    gitMissing(): void {
        this.available = false;
    }

    gitStaysUninitialized(): void {
        this.available = false;
    }

    gitListenerCount(): number {
        return this.watchers.size;
    }

    private repositoryOf(fileUri: string): Map<string, StagedConflict> | undefined {
        const root = [...this.repositories.keys()].find((candidate) =>
            fileUri.startsWith(`${candidate}/`),
        );
        return root === undefined ? undefined : this.repositories.get(root);
    }

    private mergeChanges(): string[] {
        return [...this.repositories.values()].flatMap((repository) => [...repository.keys()]);
    }
}
