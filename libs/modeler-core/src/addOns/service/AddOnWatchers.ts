import { EVERY_PATH_GLOB } from "../../kernel/domain/watchedFiles";
import { SettingsPort, WorkspacePort } from "../../kernel/port/hostPorts";
import { affectsAddOns } from "../domain/addOnPaths";

/**
 * One watcher per workspace folder while a view is attached. Installed
 * packages are not watched: a refresh, or a view becoming visible, reads
 * them again.
 */
export class AddOnWatchers {
    private readonly watchers = new Map<string, { dispose(): void }>();

    constructor(
        private readonly workspace: WorkspacePort,
        private readonly settings: SettingsPort,
        private readonly onChange: () => void,
    ) {}

    /** Watches the folders open now; the port reports no folder added or removed. */
    follow(folders: readonly string[]): void {
        for (const [root, watcher] of this.watchers) {
            if (!folders.includes(root)) {
                watcher.dispose();
                this.watchers.delete(root);
            }
        }
        for (const root of folders) {
            if (!this.watchers.has(root)) {
                this.watchers.set(root, this.watch(root));
            }
        }
    }

    dispose(): void {
        this.watchers.forEach((watcher) => watcher.dispose());
        this.watchers.clear();
    }

    private watch(root: string): { dispose(): void } {
        const changed = (path: string) => {
            if (affectsAddOns(path, root, this.settings.getConfigFolder())) this.onChange();
        };
        return this.workspace.createWatcher(root, EVERY_PATH_GLOB, {
            onCreate: changed,
            onChange: changed,
            onDelete: changed,
        });
    }
}
