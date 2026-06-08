import { FSWatcher, watch } from "chokidar";
import * as fs from "fs/promises";
import * as path from "path";

export type FileChangeListener = (content: string) => void;

/**
 * Owns all filesystem access for the CLI.
 *
 * Writes atomically (tmp file + rename) and watches for external edits.
 * A short-lived self-write guard suppresses change events triggered by
 * {@link write} so the webview isn't reloaded by its own save.
 */
export class FileAdapter {
    private watcher: FSWatcher | undefined;
    private listeners: FileChangeListener[] = [];
    private suppressUntil = 0;

    constructor(public readonly filePath: string) {}

    read(): Promise<string> {
        return fs.readFile(this.filePath, "utf8");
    }

    async write(content: string): Promise<void> {
        const tmp = `${this.filePath}.${process.pid}.tmp`;
        await fs.writeFile(tmp, content, "utf8");
        await fs.rename(tmp, this.filePath);
        this.suppressUntil = Date.now() + 500;
    }

    async writeSibling(fileName: string, content: string): Promise<void> {
        const dir = path.dirname(this.filePath);
        await fs.writeFile(path.join(dir, fileName), content, "utf8");
    }

    onExternalChange(listener: FileChangeListener): void {
        this.listeners.push(listener);
        if (this.watcher) return;
        const watcher = watch(this.filePath, { ignoreInitial: true });
        this.watcher = watcher;
        watcher.on("change", async () => {
            if (Date.now() < this.suppressUntil) return;
            try {
                const content = await this.read();
                for (const fn of this.listeners) fn(content);
            } catch (err) {
                console.error("[FileAdapter] failed to re-read file after change", err);
            }
        });
    }

    dispose(): void {
        void this.watcher?.close();
        this.watcher = undefined;
        this.listeners.length = 0;
    }
}
