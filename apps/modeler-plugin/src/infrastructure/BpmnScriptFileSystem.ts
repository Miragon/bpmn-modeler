import {
    Disposable,
    Event,
    EventEmitter,
    FileChangeEvent,
    FileChangeType,
    FileStat,
    FileSystemError,
    FileSystemProvider,
    FileType,
    Uri,
} from "vscode";

/**
 * In-memory `FileSystemProvider` for the `bpmn-script` URI scheme.
 *
 * Stores virtual script documents so that VS Code can open them in full
 * editor tabs with syntax highlighting and IntelliSense. Each file is
 * keyed by its URI path (e.g. `/{editorHash}/{elementId}/script.js`).
 */
export class BpmnScriptFileSystem implements FileSystemProvider {
    private readonly files = new Map<string, Uint8Array>();

    private readonly _onDidChangeFile = new EventEmitter<FileChangeEvent[]>();

    /** Event fired when a virtual file is created, changed, or deleted. */
    readonly onDidChangeFile: Event<FileChangeEvent[]> =
        this._onDidChangeFile.event;

    /**
     * No-op watcher — the provider fires change events programmatically.
     *
     * @returns A disposable that does nothing on dispose.
     */
    watch(): Disposable {
        return new Disposable(() => {});
    }

    /**
     * Returns metadata for the given URI.
     *
     * @param uri The virtual file URI.
     * @throws FileSystemError.FileNotFound if the URI is not tracked.
     */
    stat(uri: Uri): FileStat {
        const data = this.files.get(uri.path);
        if (!data) {
            throw FileSystemError.FileNotFound(uri);
        }
        return {
            type: FileType.File,
            ctime: 0,
            mtime: Date.now(),
            size: data.byteLength,
        };
    }

    /**
     * Lists entries in a virtual directory.
     *
     * Enumerates all tracked file paths that are direct children of the
     * given directory URI.
     *
     * @param uri The directory URI to list.
     */
    readDirectory(uri: Uri): [string, FileType][] {
        const prefix = uri.path.endsWith("/") ? uri.path : uri.path + "/";
        const entries: [string, FileType][] = [];
        for (const path of this.files.keys()) {
            if (path.startsWith(prefix)) {
                const relative = path.substring(prefix.length);
                if (!relative.includes("/")) {
                    entries.push([relative, FileType.File]);
                }
            }
        }
        return entries;
    }

    /**
     * Creates a directory. No-op for this in-memory provider.
     */
    createDirectory(): void {
        // Directories are implicit in the path structure.
    }

    /**
     * Reads the content of a virtual file.
     *
     * @param uri The virtual file URI.
     * @throws FileSystemError.FileNotFound if the URI is not tracked.
     */
    readFile(uri: Uri): Uint8Array {
        const data = this.files.get(uri.path);
        if (!data) {
            throw FileSystemError.FileNotFound(uri);
        }
        return data;
    }

    /**
     * Writes content to a virtual file, creating it if it does not exist.
     *
     * Fires a `FileChangeType.Changed` or `FileChangeType.Created` event
     * so that open editors pick up the update.
     *
     * @param uri The virtual file URI.
     * @param content The file content as a byte array.
     */
    writeFile(uri: Uri, content: Uint8Array): void {
        const existed = this.files.has(uri.path);
        this.files.set(uri.path, content);
        this._onDidChangeFile.fire([
            {
                type: existed ? FileChangeType.Changed : FileChangeType.Created,
                uri,
            },
        ]);
    }

    /**
     * Deletes a virtual file.
     *
     * @param uri The virtual file URI.
     */
    delete(uri: Uri): void {
        this.files.delete(uri.path);
        this._onDidChangeFile.fire([{ type: FileChangeType.Deleted, uri }]);
    }

    /**
     * Renames or moves a virtual file.
     *
     * @param oldUri The current URI of the file.
     * @param newUri The target URI.
     */
    rename(oldUri: Uri, newUri: Uri): void {
        const data = this.files.get(oldUri.path);
        if (!data) {
            throw FileSystemError.FileNotFound(oldUri);
        }
        this.files.set(newUri.path, data);
        this.files.delete(oldUri.path);
        this._onDidChangeFile.fire([
            { type: FileChangeType.Deleted, uri: oldUri },
            { type: FileChangeType.Created, uri: newUri },
        ]);
    }

    /**
     * Deletes all files whose URI path starts with the given prefix.
     *
     * Used to clean up all virtual documents associated with a closed BPMN editor.
     *
     * @param pathPrefix The path prefix to match (e.g. `/{editorHash}/`).
     */
    deleteByPrefix(pathPrefix: string): void {
        for (const path of [...this.files.keys()]) {
            if (path.startsWith(pathPrefix)) {
                const uri = Uri.parse(`bpmn-script:${path}`);
                this.files.delete(path);
                this._onDidChangeFile.fire([
                    { type: FileChangeType.Deleted, uri },
                ]);
            }
        }
    }
}
