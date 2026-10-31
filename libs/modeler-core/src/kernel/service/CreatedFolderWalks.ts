import { WorkspacePort } from "../domain/hostPorts";
import { outermostPaths } from "../domain/rootContainment";
import { findFilesBelow } from "./workspaceFileSearch";

// Spans one delivery of watcher events: the bridge spreads a burst over its
// ~50 ms per-path debounce.
const CREATED_FOLDER_BURST_MS = 100;

/**
 * Walks the folders created in one burst for the files a consumer watches,
 * from the outermost folders only: a tree written at once reports a create for
 * each of its folders, and walking each would read every file once per folder
 * above it.
 */
export class CreatedFolderWalks {
    private readonly folders = new Set<string>();
    private burst: { timer: ReturnType<typeof setTimeout>; start: () => void } | undefined;
    private walked: Promise<void> | undefined;
    private disposed = false;

    constructor(
        private readonly workspace: WorkspacePort,
        private readonly isWatchedFile: (path: string) => boolean,
        private readonly onFilesFound: (files: string[]) => Promise<unknown> | void,
        private readonly burstMs: number = CREATED_FOLDER_BURST_MS,
    ) {}

    /** Resolves once the burst `folder` joined was walked and its files handed on. */
    add(folder: string): Promise<void> {
        if (this.disposed) {
            return Promise.resolve();
        }
        this.folders.add(folder);
        this.walked ??= this.walkAfterBurst();
        return this.walked;
    }

    dispose(): void {
        this.disposed = true;
        if (this.burst) {
            clearTimeout(this.burst.timer);
            this.burst.start();
        }
    }

    private async walkAfterBurst(): Promise<void> {
        await new Promise<void>((start) => {
            this.burst = { timer: setTimeout(start, this.burstMs), start };
        });
        const folders = outermostPaths([...this.folders]);
        this.folders.clear();
        this.burst = undefined;
        this.walked = undefined;
        if (this.disposed) {
            return;
        }
        const found = await Promise.all(
            folders.map((folder) => findFilesBelow(this.workspace, folder, this.isWatchedFile)),
        );
        await this.onFilesFound(found.flat());
    }
}
