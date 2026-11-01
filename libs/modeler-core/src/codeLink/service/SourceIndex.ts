import { WorkspacePort } from "../../kernel/domain/hostPorts";
import { ScopeMembership } from "../../kernel/domain/ScopeMembership";
import { SearchScope, searchScopeKey } from "../../kernel/domain/searchScope";
import { EVERY_PATH_GLOB, watchedChangeOf } from "../../kernel/domain/watchedFiles";
import { WatcherEventKind } from "../../kernel/domain/watcherEvents";
import {
    findFilesInScope,
    resolveSearchScope,
    SearchLogger,
} from "../../kernel/service/workspaceFileSearch";
import { SOURCE_FILES } from "../domain/ImplementationReference";
import { SourceFileFacts } from "../domain/SourceFileFacts";

// Larger files are generated or bundled code; keeping their facts would
// dominate the index, so they are read again on every scan.
const MAX_INDEXED_FILE_LENGTH = 1_000_000;

type WorkspaceFoldersScope = Extract<SearchScope, { kind: "workspace-folders" }>;

export interface InspectedSource {
    readonly facts: SourceFileFacts;
    /** Present only when requested. */
    readonly content?: string;
}

/** The source files a batched resolve searches, and what each of them declares. */
export interface SourceCatalog {
    /** @returns `undefined` when there is nothing to search. */
    listSources(): Promise<string[] | undefined>;
    /** @returns `undefined` for an unreadable file. */
    inspect(path: string, withContent: boolean): Promise<InspectedSource | undefined>;
}

export function listSourceFiles(
    workspace: WorkspacePort,
    scope: SearchScope,
    logger: SearchLogger,
): Promise<string[]> {
    return findFilesInScope(workspace, scope, SOURCE_FILES.glob(), {
        logger,
        matchesWalkedFile: SOURCE_FILES.includes,
    });
}

export class DirectSourceCatalog implements SourceCatalog {
    constructor(
        private readonly workspace: WorkspacePort,
        private readonly logger: SearchLogger,
        private readonly sourceDocumentPath: string | undefined,
    ) {}

    async listSources(): Promise<string[] | undefined> {
        const scope = resolveSearchScope(this.workspace, this.sourceDocumentPath);
        return scope && listSourceFiles(this.workspace, scope, this.logger);
    }

    async inspect(path: string, withContent: boolean): Promise<InspectedSource | undefined> {
        const content = await readOrUndefined(this.workspace, path);
        if (content === undefined) {
            return undefined;
        }
        return {
            facts: SourceFileFacts.extract(content),
            content: withContent ? content : undefined,
        };
    }
}

/**
 * The source files of the workspace folders and what each declares, shared by
 * every editor whose document lies in those folders, so a further editor
 * resolves its code links without listing or reading the workspace again. Each
 * index watches all of its folders to stay current and is dropped with its last
 * editor.
 */
export class SourceIndex {
    private readonly indexes = new Map<string, IndexedSources>();
    private readonly membership = new ScopeMembership();

    constructor(
        private readonly workspace: WorkspacePort,
        private readonly logger: SearchLogger & { logWarning(message: string): void },
    ) {}

    /**
     * @returns `undefined` for a document outside every workspace folder, whose
     *   search walks its own directory tree and is not shared.
     */
    sourcesFor(
        editorId: string,
        sourceDocumentPath: string | undefined,
    ): SourceCatalog | undefined {
        const scope = resolveSearchScope(this.workspace, sourceDocumentPath);
        if (scope?.kind !== "workspace-folders") {
            this.release(editorId);
            return undefined;
        }

        const indexKey = searchScopeKey(scope);
        const { isNewScope, emptiedScope } = this.membership.assign(editorId, indexKey);
        this.disposeIndex(emptiedScope);
        if (isNewScope && !this.createIndex(indexKey, scope)) {
            this.membership.release(editorId);
            return undefined;
        }
        return this.indexes.get(indexKey);
    }

    release(editorId: string): void {
        this.disposeIndex(this.membership.release(editorId));
    }

    dispose(): void {
        this.indexes.forEach((index) => index.dispose());
        this.indexes.clear();
        this.membership.clear();
    }

    private disposeIndex(indexKey: string | undefined): void {
        if (indexKey === undefined) {
            return;
        }
        this.indexes.get(indexKey)?.dispose();
        this.indexes.delete(indexKey);
    }

    private createIndex(
        indexKey: string,
        scope: WorkspaceFoldersScope,
    ): IndexedSources | undefined {
        try {
            const index = new IndexedSources(this.workspace, this.logger, scope);
            this.indexes.set(indexKey, index);
            return index;
        } catch (error) {
            // Without a watcher the index could not notice edits.
            this.logger.logWarning(
                `[code-link] source index disabled, could not watch ${scope.folders.join(", ")}: ${
                    (error as Error).message
                }`,
            );
            return undefined;
        }
    }
}

class IndexedSources implements SourceCatalog {
    private readonly watchers: { dispose(): void }[] = [];
    private listing: Promise<string[]> | undefined;
    private listedPaths: Set<string> | undefined;
    private readonly factsByPath = new Map<string, SourceFileFacts>();
    private readonly sharedReads = new Map<string, Promise<SourceFileFacts | undefined>>();
    // Bumped by every event for a source path, so a read an edit overtook is not kept.
    private readonly revisions = new Map<string, number>();
    // Paths that may be folders created or deleted as a whole; their files'
    // facts are dropped on the next inspection rather than per event.
    private readonly invalidatedFolders = new Set<string>();
    private folderInvalidations = 0;
    private disposed = false;

    constructor(
        private readonly workspace: WorkspacePort,
        private readonly logger: SearchLogger,
        private readonly scope: WorkspaceFoldersScope,
    ) {
        try {
            for (const folder of scope.folders) {
                const watch = (event: WatcherEventKind) => (path: string) =>
                    this.onWatchedChange(event, path, folder);
                this.watchers.push(
                    workspace.createWatcher(folder, EVERY_PATH_GLOB, {
                        onCreate: watch("create"),
                        onChange: watch("change"),
                        onDelete: watch("delete"),
                    }),
                );
            }
        } catch (error) {
            this.dispose();
            throw error;
        }
    }

    listSources(): Promise<string[]> {
        if (!this.listing) {
            const listing = listSourceFiles(this.workspace, this.scope, this.logger);
            this.listing = listing;
            listing.then(
                (paths) => {
                    if (this.listing === listing) {
                        this.listedPaths = new Set(paths);
                    }
                },
                () => this.forgetListing(listing),
            );
        }
        return this.listing;
    }

    async inspect(path: string, withContent: boolean): Promise<InspectedSource | undefined> {
        this.dropFactsOfInvalidatedFolders();
        if (withContent) {
            return this.readSource(path);
        }
        const facts = this.factsByPath.get(path) ?? (await this.sharedRead(path));
        return facts && { facts };
    }

    dispose(): void {
        this.disposed = true;
        this.watchers.forEach((watcher) => watcher.dispose());
        this.watchers.length = 0;
        this.factsByPath.clear();
        this.sharedReads.clear();
    }

    private sharedRead(path: string): Promise<SourceFileFacts | undefined> {
        const pending = this.sharedReads.get(path);
        if (pending) {
            return pending;
        }
        const reading = this.readSource(path).then((source) => source?.facts);
        this.sharedReads.set(path, reading);
        const settle = () => {
            if (this.sharedReads.get(path) === reading) {
                this.sharedReads.delete(path);
            }
        };
        reading.then(settle, settle);
        return reading;
    }

    private async readSource(path: string): Promise<InspectedSource | undefined> {
        const revision = this.revisions.get(path);
        const folderInvalidations = this.folderInvalidations;
        const content = await readOrUndefined(this.workspace, path);
        if (content === undefined) {
            return undefined;
        }
        const facts = SourceFileFacts.extract(content);
        const unchangedSinceRead =
            this.revisions.get(path) === revision &&
            this.folderInvalidations === folderInvalidations;
        if (!this.disposed && unchangedSinceRead && content.length <= MAX_INDEXED_FILE_LENGTH) {
            this.factsByPath.set(path, facts);
        }
        return { facts, content };
    }

    private onWatchedChange(event: WatcherEventKind, path: string, folder: string): void {
        const change = watchedChangeOf(event, path, folder, SOURCE_FILES.includes);
        if (change === "unrelated") {
            return;
        }
        if (change !== "file") {
            this.invalidateFolder(path);
            this.forgetListing();
            return;
        }
        this.forgetFacts(path);
        if (event === "delete" || (event === "create" && !this.listedPaths?.has(path))) {
            this.forgetListing();
        }
    }

    private forgetListing(listing = this.listing): void {
        if (this.listing === listing) {
            this.listing = undefined;
            this.listedPaths = undefined;
        }
    }

    private forgetFacts(path: string): void {
        this.revisions.set(path, (this.revisions.get(path) ?? 0) + 1);
        this.factsByPath.delete(path);
        this.sharedReads.delete(path);
    }

    private invalidateFolder(path: string): void {
        this.folderInvalidations++;
        this.invalidatedFolders.add(path);
        this.sharedReads.clear();
    }

    private dropFactsOfInvalidatedFolders(): void {
        if (this.invalidatedFolders.size === 0) {
            return;
        }
        for (const path of [...this.factsByPath.keys()]) {
            if (this.isInsideInvalidatedFolder(path)) {
                this.factsByPath.delete(path);
            }
        }
        this.invalidatedFolders.clear();
    }

    private isInsideInvalidatedFolder(path: string): boolean {
        for (let end = path.lastIndexOf("/"); end > 0; end = path.lastIndexOf("/", end - 1)) {
            if (this.invalidatedFolders.has(path.slice(0, end))) {
                return true;
            }
        }
        return false;
    }
}

async function readOrUndefined(
    workspace: WorkspacePort,
    path: string,
): Promise<string | undefined> {
    try {
        return await workspace.readFile(path);
    } catch {
        return undefined;
    }
}
