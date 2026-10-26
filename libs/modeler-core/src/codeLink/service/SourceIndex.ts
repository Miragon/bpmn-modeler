import { pathIsInsideExcludedDir } from "../../shared/domain/excludedDirs";
import { WorkspacePort } from "../../shared/domain/hostPorts";
import { ScopeMembership } from "../../shared/domain/ScopeMembership";
import { SearchScope, searchScopeKey } from "../../shared/domain/searchScope";
import {
    findFilesInScope,
    resolveSearchScope,
    SearchLogger,
} from "../../shared/service/workspaceFileSearch";
import { isSourceFile, SOURCE_EXTENSIONS } from "../domain/ImplementationReference";
import { SourceFileFacts } from "../domain/SourceFileFacts";

const SOURCE_GLOB = `**/*.{${SOURCE_EXTENSIONS.join(",")}}`;

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
    return findFilesInScope(workspace, scope, SOURCE_GLOB, {
        logger,
        matchesWalkedFile: isSourceFile,
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
    private listedPathKeys: Set<string> | undefined;
    private readonly factsByPathKey = new Map<string, SourceFileFacts>();
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
                const folderKey = toPathKey(folder);
                const watch = (onEvent: (pathKey: string) => void) => (path: string) => {
                    const pathKey = toPathKey(path);
                    if (!isInsideExcludedDirWithin(folderKey, pathKey)) {
                        onEvent(pathKey);
                    }
                };
                this.watchers.push(
                    workspace.createWatcher(folder, "**/*", {
                        onCreate: watch((pathKey) => this.onCreated(pathKey)),
                        onChange: watch((pathKey) => this.onChanged(pathKey)),
                        onDelete: watch((pathKey) => this.onDeleted(pathKey)),
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
                        this.listedPathKeys = new Set(paths.map(toPathKey));
                    }
                },
                () => this.forgetListing(listing),
            );
        }
        return this.listing;
    }

    async inspect(path: string, withContent: boolean): Promise<InspectedSource | undefined> {
        this.dropFactsOfInvalidatedFolders();
        const pathKey = toPathKey(path);
        if (withContent) {
            return this.readSource(path, pathKey);
        }
        const facts = this.factsByPathKey.get(pathKey) ?? (await this.sharedRead(path, pathKey));
        return facts && { facts };
    }

    dispose(): void {
        this.disposed = true;
        this.watchers.forEach((watcher) => watcher.dispose());
        this.watchers.length = 0;
        this.factsByPathKey.clear();
        this.sharedReads.clear();
    }

    private sharedRead(path: string, pathKey: string): Promise<SourceFileFacts | undefined> {
        const pending = this.sharedReads.get(pathKey);
        if (pending) {
            return pending;
        }
        const reading = this.readSource(path, pathKey).then((source) => source?.facts);
        this.sharedReads.set(pathKey, reading);
        const settle = () => {
            if (this.sharedReads.get(pathKey) === reading) {
                this.sharedReads.delete(pathKey);
            }
        };
        reading.then(settle, settle);
        return reading;
    }

    private async readSource(path: string, pathKey: string): Promise<InspectedSource | undefined> {
        const revision = this.revisions.get(pathKey);
        const folderInvalidations = this.folderInvalidations;
        const content = await readOrUndefined(this.workspace, path);
        if (content === undefined) {
            return undefined;
        }
        const facts = SourceFileFacts.extract(content);
        const unchangedSinceRead =
            this.revisions.get(pathKey) === revision &&
            this.folderInvalidations === folderInvalidations;
        if (!this.disposed && unchangedSinceRead && content.length <= MAX_INDEXED_FILE_LENGTH) {
            this.factsByPathKey.set(pathKey, facts);
        }
        return { facts, content };
    }

    private onCreated(pathKey: string): void {
        if (isSourceFile(pathKey)) {
            this.forgetFacts(pathKey);
            if (this.listedPathKeys?.has(pathKey)) {
                return;
            }
        } else {
            // A folder moved in may not report its files one by one.
            this.invalidateFolder(pathKey);
        }
        this.forgetListing();
    }

    private onChanged(pathKey: string): void {
        if (isSourceFile(pathKey)) {
            this.forgetFacts(pathKey);
        }
    }

    private onDeleted(pathKey: string): void {
        if (isSourceFile(pathKey)) {
            this.forgetFacts(pathKey);
        } else {
            // A deleted folder is reported as one event, without its files.
            this.invalidateFolder(pathKey);
        }
        this.forgetListing();
    }

    private forgetListing(listing = this.listing): void {
        if (this.listing === listing) {
            this.listing = undefined;
            this.listedPathKeys = undefined;
        }
    }

    private forgetFacts(pathKey: string): void {
        this.revisions.set(pathKey, (this.revisions.get(pathKey) ?? 0) + 1);
        this.factsByPathKey.delete(pathKey);
        this.sharedReads.delete(pathKey);
    }

    private invalidateFolder(pathKey: string): void {
        this.folderInvalidations++;
        this.invalidatedFolders.add(pathKey);
        this.sharedReads.clear();
    }

    private dropFactsOfInvalidatedFolders(): void {
        if (this.invalidatedFolders.size === 0) {
            return;
        }
        for (const pathKey of [...this.factsByPathKey.keys()]) {
            if (this.isInsideInvalidatedFolder(pathKey)) {
                this.factsByPathKey.delete(pathKey);
            }
        }
        this.invalidatedFolders.clear();
    }

    private isInsideInvalidatedFolder(pathKey: string): boolean {
        for (let end = pathKey.lastIndexOf("/"); end > 0; end = pathKey.lastIndexOf("/", end - 1)) {
            if (this.invalidatedFolders.has(pathKey.slice(0, end))) {
                return true;
            }
        }
        return false;
    }
}

// Build output above the workspace folder (a checkout under `~/build/`) must
// not hide every event inside it.
function isInsideExcludedDirWithin(folderKey: string, pathKey: string): boolean {
    const relativePath = pathKey.startsWith(`${folderKey}/`)
        ? pathKey.slice(folderKey.length + 1)
        : pathKey;
    return pathIsInsideExcludedDir(relativePath);
}

// The bridge joins watcher paths with the platform separator while its file
// listing uses `/`; one key form keeps both pointing at the same entry.
function toPathKey(path: string): string {
    return path.replace(/\\/g, "/");
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
