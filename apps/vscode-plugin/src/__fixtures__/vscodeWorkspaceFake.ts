/**
 * The slice of the `vscode` module `VsCodeWorkspace` touches, for
 * `vi.mock("vscode", () => import(".../vscodeWorkspaceFake"))`: workspace
 * folders, and `workspace.fs` and `findFiles` over the real disk. Every change
 * made through `workspace.fs` or {@link anotherProgram} reaches the file system
 * watchers created before it as VS Code's disk watcher delivers it: later, in
 * one batch, coalesced per path, a directory moved in or deleted as one event
 * for the directory. A workspace folder is looked up ignoring case, as on
 * Windows, where a drive path can occur; the disk and the globs compare
 * case-sensitively, as on Linux. Symbolic links are not followed. Call
 * {@link resetVscodeWorkspace} before each test.
 */
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { posix } from "node:path";

import { globToRegExp, relativeToRoot } from "@miragon/bpmn-modeler-core";

import { FileSystemError, FileType, Uri } from "./vscodeFileSystemFake";

export { FileSystemError, FileType, Uri } from "./vscodeFileSystemFake";

/** VS Code's default `files.exclude`. */
const DEFAULT_FILES_EXCLUDE = [
    "**/.git",
    "**/.svn",
    "**/.hg",
    "**/CVS",
    "**/.DS_Store",
    "**/Thumbs.db",
];

/** How long VS Code's disk watcher collects changes before it delivers them. */
const WATCHER_THROTTLE_MS = 75;

type DiskChangeKind = "created" | "changed" | "deleted";

interface DiskChange {
    kind: DiskChangeKind;
    readonly uri: Uri;
}

interface WorkspaceFolder {
    readonly uri: Uri;
    readonly name: string;
    readonly index: number;
}

export class RelativePattern {
    readonly baseUri: Uri;

    constructor(
        base: Uri | string,
        readonly pattern: string,
    ) {
        this.baseUri = typeof base === "string" ? Uri.file(base) : base;
    }

    matches(uri: Uri): boolean {
        const below = belowFolder(this.baseUri, uri);
        return below !== undefined && below !== "" && globToRegExp(this.pattern).test(below);
    }
}

type Listener = (uri: Uri) => void;

/**
 * Sees the changes below its base made after it was created, and delivers
 * them in batches, as each watch request of VS Code's disk watcher does.
 */
class FileSystemWatcher {
    private readonly listeners: Record<DiskChangeKind, Set<Listener>> = {
        created: new Set(),
        changed: new Set(),
        deleted: new Set(),
    };
    private batch: DiskChange[] = [];
    private timer: NodeJS.Timeout | undefined;
    delivery: Promise<void> | undefined;

    constructor(private readonly pattern: RelativePattern) {}

    readonly onDidCreate = (listener: Listener) => this.listen("created", listener);
    readonly onDidChange = (listener: Listener) => this.listen("changed", listener);
    readonly onDidDelete = (listener: Listener) => this.listen("deleted", listener);

    dispose(): void {
        clearTimeout(this.timer);
        this.batch = [];
        this.delivery = undefined;
        liveWatchers.delete(this);
    }

    see(change: DiskChange): void {
        if (!holds(this.pattern.baseUri, change.uri)) return;
        this.batch.push({ ...change });
        this.delivery ??= new Promise((resolve) => {
            this.timer = setTimeout(() => {
                this.deliver();
                resolve();
            }, WATCHER_THROTTLE_MS);
        });
    }

    /**
     * Coalesced before the glob filters them, so the delete of a directory
     * whose name the glob does not match leaves no event for its files.
     * Creates first, then changes, then deletes, as the extension host fires a batch.
     */
    private deliver(): void {
        const changes = coalesce(this.batch.splice(0));
        this.delivery = undefined;
        for (const kind of ["created", "changed", "deleted"] as const) {
            for (const change of changes) {
                if (change.kind === kind && this.pattern.matches(change.uri)) {
                    this.listeners[kind].forEach((listener) => listener(change.uri));
                }
            }
        }
    }

    private listen(kind: DiskChangeKind, listener: Listener): { dispose(): void } {
        this.listeners[kind].add(listener);
        return { dispose: () => this.listeners[kind].delete(listener) };
    }
}

const liveWatchers = new Set<FileSystemWatcher>();
let workspaceFolders: WorkspaceFolder[] = [];

export function resetVscodeWorkspace(): void {
    [...liveWatchers].forEach((watcher) => watcher.dispose());
    workspaceFolders = [];
}

function reportChange(kind: DiskChangeKind, path: string): void {
    const change = { kind, uri: Uri.file(path) };
    liveWatchers.forEach((watcher) => watcher.see(change));
}

/** Adds a folder to the workspace, after the folders already open. */
export function openWorkspaceFolder(path: string): void {
    const uri = Uri.file(path);
    if (workspaceFolders.some((folder) => isSameUri(folder.uri, uri))) return;
    workspaceFolders.push({
        uri,
        name: posix.basename(uri.path),
        index: workspaceFolders.length,
    });
}

/** Resolves once every change made so far has reached the watchers. */
export async function fileEventsDelivered(): Promise<void> {
    for (const watcher of liveWatchers) {
        while (watcher.delivery) await watcher.delivery;
    }
}

/** Changes the disk past `workspace.fs`; the watchers see them all the same. */
export const anotherProgram = {
    createDirectory: makeDirectory,

    async moveDirectoryIn(path: string, files: Readonly<Record<string, string>>): Promise<void> {
        const staging = await fs.mkdtemp(posix.join(tmpdir(), "vscode-workspace-staging-"));
        for (const [file, content] of Object.entries(files)) {
            const staged = posix.join(staging, posix.relative(path, file));
            await fs.mkdir(posix.dirname(staged), { recursive: true });
            await fs.writeFile(staged, content);
        }
        await fs.rename(staging, path);
        reportChange("created", path);
    },

    async removeFile(path: string): Promise<void> {
        await fs.rm(path);
        reportChange("deleted", path);
    },

    async createSymbolicLink(path: string, target: string): Promise<void> {
        await fs.symlink(target, path);
        reportChange("created", path);
    },
};

export const workspace = {
    fs: {
        stat: (uri: Uri) =>
            onDisk(uri, async (path) => {
                const stat = await fs.stat(path).catch(async (error: unknown) => {
                    // A dangling link has no target to stat.
                    if (await isSymbolicLink(path)) return undefined;
                    throw error;
                });
                const linkBit = (await isSymbolicLink(path)) ? FileType.SymbolicLink : 0;
                return {
                    type: fileTypeOf(stat) | linkBit,
                    ctime: stat?.ctimeMs ?? 0,
                    mtime: stat?.mtimeMs ?? 0,
                    size: stat?.size ?? 0,
                };
            }),

        readDirectory: (uri: Uri) =>
            onDisk(uri, async (path) => {
                const entries = await fs.readdir(path, { withFileTypes: true });
                return Promise.all(
                    entries.map(async (entry): Promise<[string, FileType]> => {
                        if (!entry.isSymbolicLink()) return [entry.name, fileTypeOf(entry)];
                        const target = await fs.stat(posix.join(path, entry.name)).catch(() => {
                            return undefined;
                        });
                        return [entry.name, fileTypeOf(target) | FileType.SymbolicLink];
                    }),
                );
            }),

        // Node's Buffer, as the Node extension host hands it back.
        readFile: (uri: Uri) => onDisk(uri, (path) => fs.readFile(path)),

        createDirectory: (uri: Uri) => onDisk(uri, makeDirectory),

        writeFile: (uri: Uri, content: Uint8Array) =>
            onDisk(uri, async (path) => {
                const existed = await exists(path);
                await makeDirectory(posix.dirname(path));
                await fs.writeFile(path, content);
                reportChange(existed ? "changed" : "created", path);
            }),

        delete: (uri: Uri, options: { recursive?: boolean } = {}) =>
            onDisk(uri, async (path) => {
                const removed = [path, ...(await pathsBelow(path))];
                await fs.rm(path, { recursive: options.recursive ?? false });
                removed.forEach((removedPath) => reportChange("deleted", removedPath));
            }),
    },

    get workspaceFolders(): readonly WorkspaceFolder[] | undefined {
        return workspaceFolders.length > 0 ? workspaceFolders : undefined;
    },

    /** The innermost open folder holding `uri`, ignoring case as VS Code does on Windows. */
    getWorkspaceFolder(uri: Uri): WorkspaceFolder | undefined {
        return workspaceFolders
            .filter((folder) => holds(withLowerCasePath(folder.uri), withLowerCasePath(uri)))
            .sort((a, b) => b.uri.path.length - a.uri.path.length)[0];
    },

    /**
     * Each folder is searched on its own: the globs match the path below it, and
     * a folder open inside it is left to its own search, so no file is found twice.
     */
    async findFiles(include: string, exclude?: string | null): Promise<Uri[]> {
        const included = globToRegExp(include);
        const excludes = [
            ...(exclude === null ? [] : DEFAULT_FILES_EXCLUDE),
            ...(exclude ? [exclude] : []),
        ].map((glob) => globToRegExp(glob));
        const found: Uri[] = [];
        for (const folder of workspaceFolders) {
            const nestedFolders = workspaceFolders.flatMap((other) => {
                const below = other === folder ? undefined : belowFolder(folder.uri, other.uri);
                return below ? [below] : [];
            });
            const skips = (below: string) =>
                nestedFolders.includes(below) || excludes.some((glob) => glob.test(below));
            for (const below of await filesBelow(folder.uri.fsPath, "", skips)) {
                if (included.test(below)) found.push(Uri.joinPath(folder.uri, below));
            }
        }
        return found;
    },

    createFileSystemWatcher(pattern: RelativePattern): FileSystemWatcher {
        const watcher = new FileSystemWatcher(pattern);
        liveWatchers.add(watcher);
        return watcher;
    },
};

/**
 * VS Code's coalescing of one batch: a create then a delete of a path cancel,
 * a delete then a create is a change, a create stays a create, and a delete
 * below a deleted directory is dropped.
 */
function coalesce(batch: readonly DiskChange[]): DiskChange[] {
    const byPath = new Map<string, DiskChange>();
    for (const change of batch) {
        const key = change.uri.toString();
        const earlier = byPath.get(key);
        if (!earlier) {
            byPath.set(key, { ...change });
        } else if (earlier.kind === "created" && change.kind === "deleted") {
            byPath.delete(key);
        } else if (earlier.kind === "deleted" && change.kind === "created") {
            earlier.kind = "changed";
        } else if (!(earlier.kind === "created" && change.kind === "changed")) {
            earlier.kind = change.kind;
        }
    }
    const coalesced = [...byPath.values()];
    const deletedDirectories: Uri[] = [];
    const deletes = coalesced
        .filter((change) => change.kind === "deleted")
        .sort((a, b) => a.uri.path.length - b.uri.path.length)
        .filter((change) => {
            if (deletedDirectories.some((deleted) => holds(deleted, change.uri))) return false;
            deletedDirectories.push(change.uri);
            return true;
        });
    return [...deletes, ...coalesced.filter((change) => change.kind !== "deleted")];
}

async function onDisk<T>(uri: Uri, operation: (path: string) => Promise<T>): Promise<T> {
    try {
        return await operation(uri.fsPath);
    } catch (error) {
        throw asFileSystemError(error, uri);
    }
}

function asFileSystemError(error: unknown, uri: Uri): unknown {
    switch ((error as NodeJS.ErrnoException).code) {
        case "ENOENT":
            return FileSystemError.FileNotFound(uri);
        case "ENOTDIR":
            return FileSystemError.FileNotADirectory(uri);
        case "EISDIR":
            return FileSystemError.FileIsADirectory(uri);
        case "EEXIST":
            return FileSystemError.FileExists(uri);
        case "EACCES":
        case "EPERM":
            return FileSystemError.NoPermissions(uri);
        default:
            return error;
    }
}

function fileTypeOf(entry: { isFile(): boolean; isDirectory(): boolean } | undefined): FileType {
    if (entry?.isFile()) return FileType.File;
    if (entry?.isDirectory()) return FileType.Directory;
    return FileType.Unknown;
}

/** `mkdir -p` that reports each directory it creates. */
async function makeDirectory(path: string): Promise<void> {
    const missing: string[] = [];
    for (let current = path; !(await exists(current)); current = posix.dirname(current)) {
        missing.unshift(current);
    }
    await fs.mkdir(path, { recursive: true });
    missing.forEach((directory) => reportChange("created", directory));
}

async function exists(path: string): Promise<boolean> {
    return fs.lstat(path).then(
        () => true,
        () => false,
    );
}

async function isSymbolicLink(path: string): Promise<boolean> {
    return fs.lstat(path).then(
        (stat) => stat.isSymbolicLink(),
        () => false,
    );
}

async function pathsBelow(path: string): Promise<string[]> {
    const entries = await fs.readdir(path, { withFileTypes: true }).catch(() => []);
    const below = await Promise.all(
        entries.map(async (entry) => {
            const child = posix.join(path, entry.name);
            return entry.isDirectory() ? [child, ...(await pathsBelow(child))] : [child];
        }),
    );
    return below.flat();
}

/** The files below `directory`, as paths below the folder searched. */
async function filesBelow(
    directory: string,
    prefix: string,
    skips: (below: string) => boolean,
): Promise<string[]> {
    const entries = await fs.readdir(directory, { withFileTypes: true }).catch(() => []);
    const files = await Promise.all(
        entries.map(async (entry) => {
            const below = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
            if (skips(below)) return [];
            if (entry.isDirectory()) {
                return filesBelow(posix.join(directory, entry.name), below, skips);
            }
            return entry.isFile() ? [below] : [];
        }),
    );
    return files.flat();
}

function belowFolder(folder: Uri, uri: Uri): string | undefined {
    return sameAuthority(folder, uri) ? relativeToRoot(uri.path, folder.path) : undefined;
}

function holds(folder: Uri, uri: Uri): boolean {
    return belowFolder(folder, uri) !== undefined;
}

function withLowerCasePath(uri: Uri): Uri {
    return Uri.from({ scheme: uri.scheme, authority: uri.authority, path: uri.path.toLowerCase() });
}

function isSameUri(a: Uri, b: Uri): boolean {
    return belowFolder(a, b) === "";
}

function sameAuthority(a: Uri, b: Uri): boolean {
    return a.scheme === b.scheme && a.authority === b.authority;
}
