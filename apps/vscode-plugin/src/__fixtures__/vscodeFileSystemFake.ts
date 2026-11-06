/**
 * The slice of the `vscode` module a `FileSystemProvider` touches, and the
 * `Uri` every fake shares, for
 * `vi.mock("vscode", () => import(".../vscodeFileSystemFake"))`.
 */
import { posix } from "node:path";

const SLASH_ROOTED_SCHEMES = new Set(["file", "http", "https"]);

export class Uri {
    readonly path: string;

    private constructor(
        readonly scheme: string,
        readonly authority: string,
        path: string,
    ) {
        // As VS Code does, so `Uri.file("C:/")` has the path `/C:/`.
        this.path = SLASH_ROOTED_SCHEMES.has(scheme) && !path.startsWith("/") ? `/${path}` : path;
    }

    static parse(value: string): Uri {
        const url = new URL(value);
        return new Uri(url.protocol.slice(0, -1), url.host, decodeURIComponent(url.pathname));
    }

    static from(parts: { scheme: string; authority?: string; path?: string }): Uri {
        return new Uri(parts.scheme, parts.authority ?? "", parts.path ?? "");
    }

    /** Takes a UNC server as the authority, as VS Code does. */
    static file(path: string): Uri {
        const [, authority = "", uncPath = "/"] = /^\/\/([^/]+)(\/.*)?$/.exec(path) ?? [];
        return authority ? new Uri("file", authority, uncPath) : new Uri("file", "", path);
    }

    static joinPath(base: Uri, ...pathSegments: string[]): Uri {
        return new Uri(base.scheme, base.authority, posix.join(base.path, ...pathSegments));
    }

    get fsPath(): string {
        return this.scheme === "file" && this.authority
            ? `//${this.authority}${this.path}`
            : this.path;
    }

    toString(): string {
        return `${this.scheme}://${this.authority}${this.path}`;
    }
}

export class EventEmitter<T> {
    private listeners: ((event: T) => void)[] = [];

    readonly event = (listener: (event: T) => void) => {
        this.listeners.push(listener);
        return { dispose: () => undefined };
    };

    fire(event: T): void {
        this.listeners.forEach((listener) => listener(event));
    }

    dispose(): void {
        this.listeners = [];
    }
}

export class Disposable {
    constructor(private readonly callOnDispose: () => void) {}

    dispose(): void {
        this.callOnDispose();
    }
}

export class FileSystemError extends Error {
    private constructor(
        readonly code: string,
        uri: Uri,
    ) {
        super(`${code}: ${uri.toString()}`);
    }

    static FileNotFound = (uri: Uri) => new FileSystemError("FileNotFound", uri);
    static FileExists = (uri: Uri) => new FileSystemError("FileExists", uri);
    static FileNotADirectory = (uri: Uri) => new FileSystemError("FileNotADirectory", uri);
    static FileIsADirectory = (uri: Uri) => new FileSystemError("FileIsADirectory", uri);
    static NoPermissions = (uri: Uri) => new FileSystemError("NoPermissions", uri);
}

export enum FileType {
    Unknown = 0,
    File = 1,
    Directory = 2,
    SymbolicLink = 64,
}

export enum FileChangeType {
    Changed = 1,
    Created = 2,
    Deleted = 3,
}
