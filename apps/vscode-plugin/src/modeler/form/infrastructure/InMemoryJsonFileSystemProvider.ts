import {
    Disposable,
    EventEmitter,
    FileChangeEvent,
    FileChangeType,
    FileStat,
    FileSystemError,
    FileSystemProvider,
    FileType,
    Uri,
} from "vscode";

interface FileEntry {
    readonly ctime: number;
    mtime: number;
    content: Uint8Array;
}

export class InMemoryJsonFileSystemProvider implements FileSystemProvider, Disposable {
    private readonly files = new Map<string, FileEntry>();
    private readonly changes = new EventEmitter<FileChangeEvent[]>();

    readonly onDidChangeFile = this.changes.event;

    constructor(private readonly readOnly: boolean = false) {}

    watch(): Disposable {
        return new Disposable(() => undefined);
    }

    stat(uri: Uri): FileStat {
        if (uri.path === "/") {
            return { type: FileType.Directory, ctime: 0, mtime: 0, size: 0 };
        }

        const entry = this.files.get(uri.toString());
        if (!entry) throw FileSystemError.FileNotFound(uri);
        return {
            type: FileType.File,
            ctime: entry.ctime,
            mtime: entry.mtime,
            size: entry.content.byteLength,
        };
    }

    readDirectory(uri: Uri): [string, FileType][] {
        if (uri.path !== "/") throw FileSystemError.FileNotADirectory(uri);

        return [...this.files.keys()]
            .map((key) => Uri.parse(key))
            .filter((file) => file.scheme === uri.scheme && file.authority === uri.authority)
            .map((file): [string, FileType] => [file.path.slice(1), FileType.File]);
    }

    createDirectory(uri: Uri): void {
        throw FileSystemError.NoPermissions(uri);
    }

    readFile(uri: Uri): Uint8Array {
        const entry = this.files.get(uri.toString());
        if (!entry) throw FileSystemError.FileNotFound(uri);
        return entry.content.slice();
    }

    writeFile(
        uri: Uri,
        content: Uint8Array,
        options: { readonly create: boolean; readonly overwrite: boolean },
    ): void {
        if (this.readOnly) throw FileSystemError.NoPermissions(uri);

        const exists = this.files.has(uri.toString());
        if (!exists && !options.create) throw FileSystemError.FileNotFound(uri);
        if (exists && !options.overwrite) throw FileSystemError.FileExists(uri);
        this.setBytes(uri, content);
    }

    delete(uri: Uri): void {
        throw FileSystemError.NoPermissions(uri);
    }

    rename(oldUri: Uri): void {
        throw FileSystemError.NoPermissions(oldUri);
    }

    setContent(uri: Uri, content: string): void {
        this.setBytes(uri, new TextEncoder().encode(content));
    }

    deleteFile(uri: Uri): void {
        if (!this.files.delete(uri.toString())) return;
        this.changes.fire([{ type: FileChangeType.Deleted, uri }]);
    }

    dispose(): void {
        this.files.clear();
        this.changes.dispose();
    }

    private setBytes(uri: Uri, content: Uint8Array): void {
        const key = uri.toString();
        const existing = this.files.get(key);
        if (existing && bytesEqual(existing.content, content)) return;

        const now = Math.max(Date.now(), (existing?.mtime ?? 0) + 1);
        this.files.set(key, {
            ctime: existing?.ctime ?? now,
            mtime: now,
            content: content.slice(),
        });
        this.changes.fire([
            { type: existing ? FileChangeType.Changed : FileChangeType.Created, uri },
        ]);
    }
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
    return (
        left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index])
    );
}
