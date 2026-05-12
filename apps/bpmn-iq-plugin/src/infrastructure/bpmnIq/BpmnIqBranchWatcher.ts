import { posix } from "path";
import { promises as fs } from "fs";

import {
    Disposable,
    FileSystemWatcher,
    RelativePattern,
    Uri,
    workspace,
} from "vscode";

/**
 * VS-Code-FileSystemWatcher port of `apps/agent/src/branch-watch.ts`.
 *
 * Watches `<gitDir>/HEAD` and notifies on branch changes, with a 500 ms
 * debounce + branch-equality filter so rebases / cherry-picks (which
 * rewrite HEAD several times in quick succession) collapse into a single
 * notification.
 */

const DEBOUNCE_MS = 500;

async function readBranchFromHead(headPath: string): Promise<string | null> {
    try {
        const raw = (await fs.readFile(headPath, "utf-8")).trim();
        const match = /^ref:\s+refs\/heads\/(.+)$/.exec(raw);
        return match ? match[1]! : null;
    } catch {
        return null;
    }
}

export interface BpmnIqBranchWatcherOptions {
    gitDir: string;
    initialBranch: string;
    onBranchChanged: (branch: string | null) => void;
    onError?: (err: unknown) => void;
}

export interface BpmnIqBranchWatcher extends Disposable {
    stop(): void;
}

/**
 * Start watching `<gitDir>/HEAD` for branch changes.
 *
 * VS-Code's FileSystemWatcher works on absolute paths outside of the
 * workspace root via `RelativePattern(<dir>, <basename>)`, so submodules
 * and worktrees with a `gitDir` outside the workspace are handled.
 */
export function createBranchWatcher(
    opts: BpmnIqBranchWatcherOptions,
): BpmnIqBranchWatcher {
    const headPath = posix.join(opts.gitDir, "HEAD");
    let lastNotifiedBranch: string | null = opts.initialBranch;
    let debounceTimer: NodeJS.Timeout | null = null;
    let stopped = false;

    let watcher: FileSystemWatcher;
    try {
        watcher = workspace.createFileSystemWatcher(
            new RelativePattern(Uri.file(opts.gitDir), "HEAD"),
        );
    } catch (err) {
        opts.onError?.(err);
        return {
            stop() {
                /* noop */
            },
            dispose() {
                /* noop */
            },
        };
    }

    const onHeadFileChanged = (): void => {
        if (stopped) return;
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            debounceTimer = null;
            if (stopped) return;
            void (async () => {
                const next = await readBranchFromHead(headPath);
                if (stopped) return;
                if (next === lastNotifiedBranch) return;
                lastNotifiedBranch = next;
                opts.onBranchChanged(next);
            })();
        }, DEBOUNCE_MS);
        debounceTimer.unref?.();
    };

    const subs: Disposable[] = [
        watcher.onDidCreate(onHeadFileChanged),
        watcher.onDidChange(onHeadFileChanged),
        watcher.onDidDelete(onHeadFileChanged),
        watcher,
    ];

    const stop = (): void => {
        if (stopped) return;
        stopped = true;
        if (debounceTimer) {
            clearTimeout(debounceTimer);
            debounceTimer = null;
        }
        for (const sub of subs) {
            try {
                sub.dispose();
            } catch (err) {
                opts.onError?.(err);
            }
        }
    };

    return { stop, dispose: stop };
}
