import { beforeEach, describe, expect, it, vi } from "vitest";

const findFilesMock = vi.fn();
const createDirectoryMock = vi.fn();
const writeFileMock = vi.fn();
const readFileMock = vi.fn();
const deleteMock = vi.fn();
const createFileSystemWatcherMock = vi.fn();

vi.mock("vscode", () => ({
    workspace: {
        fs: {
            readDirectory: vi.fn(),
            readFile: (...args: unknown[]) => readFileMock(...args),
            writeFile: (...args: unknown[]) => writeFileMock(...args),
            createDirectory: (...args: unknown[]) => createDirectoryMock(...args),
            delete: (...args: unknown[]) => deleteMock(...args),
        },
        findFiles: (...args: unknown[]) => findFilesMock(...args),
        getWorkspaceFolder: vi.fn(),
        createFileSystemWatcher: (...args: unknown[]) => createFileSystemWatcherMock(...args),
    },
    // Mirrors `vscode.FileSystemError`: an `Error` carrying a `.code`
    // discriminant, defined inside the factory to dodge vi.mock's hoist-time TDZ.
    FileSystemError: class FileSystemError extends Error {
        constructor(readonly code: string) {
            super(code);
        }
    },
    Uri: {
        file: (path: string) => ({ scheme: "file", path, fsPath: path }),
        // Mirror VS Code's decode of a `file://` string so `toUri` can be shown
        // recovering `/c:/…` from the `%3A`-escaped drive colon.
        parse: (value: string) => ({
            scheme: "file",
            path: decodeURIComponent(value.replace(/^file:\/\//, "")),
        }),
    },
    RelativePattern: class {
        constructor(
            readonly base: unknown,
            readonly pattern: string,
        ) {}
    },
    FileType: { File: 1, Directory: 2, SymbolicLink: 64 },
}));

import { FileSystemError, workspace } from "vscode";

import { FileNotFound } from "@miragon/bpmn-modeler-core";
import { VsCodeWorkspace } from "./VsCodeWorkspace";

const getWorkspaceFolderMock = workspace.getWorkspaceFolder as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
    findFilesMock.mockReset();
    findFilesMock.mockResolvedValue([{ path: "/a.bpmn" }, { path: "/b.bpmn" }]);
    createDirectoryMock.mockReset();
    createDirectoryMock.mockResolvedValue(undefined);
    writeFileMock.mockReset();
    writeFileMock.mockResolvedValue(undefined);
    readFileMock.mockReset();
    deleteMock.mockReset();
    deleteMock.mockResolvedValue(undefined);
    createFileSystemWatcherMock.mockReset();
    createFileSystemWatcherMock.mockReturnValue({
        onDidCreate: vi.fn(),
        onDidChange: vi.fn(),
        onDidDelete: vi.fn(),
        dispose: vi.fn(),
    });
});

describe("VsCodeWorkspace.findFiles", () => {
    it("forwards a single include pattern when no exclude is given", async () => {
        const sut = new VsCodeWorkspace();

        const result = await sut.findFiles("**/*.bpmn");

        expect(result).toEqual(["/a.bpmn", "/b.bpmn"]);
        expect(findFilesMock).toHaveBeenCalledWith("**/*.bpmn", undefined, undefined);
    });

    it("forwards a glob exclude pattern when supplied", async () => {
        const sut = new VsCodeWorkspace();

        await sut.findFiles("**/*.bpmn", "**/dist/**");

        expect(findFilesMock).toHaveBeenCalledWith("**/*.bpmn", "**/dist/**", undefined);
    });

    it("forwards null as exclude to opt out of all default excludes", async () => {
        // VS Code's `findFiles(include, null)` disables the implicit
        // `files.exclude` filter — we must preserve that semantic and not
        // coerce null to undefined.
        const sut = new VsCodeWorkspace();

        await sut.findFiles("**/*.bpmn", null);

        expect(findFilesMock).toHaveBeenCalledWith("**/*.bpmn", null, undefined);
    });

    it("forwards the limit as maxResults to workspace.findFiles", async () => {
        const sut = new VsCodeWorkspace();

        await sut.findFiles("**/*.bpmn", "**/dist/**", 20);

        expect(findFilesMock).toHaveBeenCalledWith("**/*.bpmn", "**/dist/**", 20);
    });

    it("returns the .path of every matching Uri", async () => {
        findFilesMock.mockResolvedValueOnce([{ path: "/x.bpmn" }, { path: "/nested/y.bpmn" }]);
        const sut = new VsCodeWorkspace();

        const result = await sut.findFiles("**/*.bpmn");

        expect(result).toEqual(["/x.bpmn", "/nested/y.bpmn"]);
    });

    it("canonicalizes an uppercase Windows drive letter in the results", async () => {
        findFilesMock.mockResolvedValueOnce([{ path: "/C:/ws/a.bpmn" }]);
        const sut = new VsCodeWorkspace();

        await expect(sut.findFiles("**/*.bpmn")).resolves.toEqual(["/c:/ws/a.bpmn"]);
    });
});

describe("VsCodeWorkspace.getWorkspaceFolderForDocument", () => {
    it("lowercases the workspace-folder drive letter so it compares against document paths", () => {
        // VS Code hands the folder its as-opened uppercase drive while document
        // URIs are lowercased; without canonicalization the two never match and
        // the template walk collects nothing (issue #1204).
        getWorkspaceFolderMock.mockReturnValueOnce({ uri: { path: "/C:/ws" } });
        const sut = new VsCodeWorkspace();

        expect(sut.getWorkspaceFolderForDocument("/c:/ws/proc/order.bpmn")).toBe("/c:/ws");
    });

    it("accepts a `file://`-form document string", () => {
        getWorkspaceFolderMock.mockReturnValueOnce({ uri: { path: "/C:/ws" } });
        const sut = new VsCodeWorkspace();

        sut.getWorkspaceFolderForDocument("file:///c%3A/ws/proc/order.bpmn");

        // The URI handed to VS Code must have the decoded drive path, not the
        // doubly-escaped garbage `Uri.file` would have produced.
        expect(getWorkspaceFolderMock).toHaveBeenCalledWith(
            expect.objectContaining({ path: "/c:/ws/proc/order.bpmn" }),
        );
    });
});

describe("VsCodeWorkspace.createWatcher", () => {
    it("builds the RelativePattern from a real Uri base when the root is a `file://` string", () => {
        const sut = new VsCodeWorkspace();

        sut.createWatcher("file:///c%3A/ws", "**/*.json", {});

        const pattern = createFileSystemWatcherMock.mock.calls[0][0];
        // A `Uri` base (not the raw `file://` string) is what makes the glob
        // resolve — the watcher would silently never fire otherwise.
        expect(pattern.base).toEqual(expect.objectContaining({ path: "/c:/ws" }));
        expect(pattern.pattern).toBe("**/*.json");
    });

    it("delivers canonicalized event paths to handlers", () => {
        const onChange = vi.fn();
        let changeCb: (uri: { path: string }) => void = () => undefined;
        createFileSystemWatcherMock.mockReturnValueOnce({
            onDidCreate: vi.fn(),
            onDidChange: vi.fn((cb: (uri: { path: string }) => void) => {
                changeCb = cb;
                return { dispose: vi.fn() };
            }),
            onDidDelete: vi.fn(),
            dispose: vi.fn(),
        });
        const sut = new VsCodeWorkspace();

        sut.createWatcher("/c:/ws", "**/*.json", { onChange });
        changeCb({ path: "/C:/ws/.camunda/element-templates/x.json" });

        expect(onChange).toHaveBeenCalledWith("/c:/ws/.camunda/element-templates/x.json");
    });
});

describe("VsCodeWorkspace.deleteDirectory", () => {
    it("recursively deletes the directory", async () => {
        const sut = new VsCodeWorkspace();

        await sut.deleteDirectory("/global/marketplaces/stale");

        expect(deleteMock).toHaveBeenCalledWith(
            expect.objectContaining({ path: "/global/marketplaces/stale" }),
            { recursive: true },
        );
    });

    it("swallows a FileNotFound so pruning a missing slot is a no-op", async () => {
        deleteMock.mockRejectedValueOnce(new FileSystemError("FileNotFound"));
        const sut = new VsCodeWorkspace();

        await expect(sut.deleteDirectory("/global/marketplaces/gone")).resolves.toBeUndefined();
    });

    it("rethrows a non-FileNotFound filesystem error", async () => {
        deleteMock.mockRejectedValueOnce(new FileSystemError("NoPermissions"));
        const sut = new VsCodeWorkspace();

        await expect(sut.deleteDirectory("/global/marketplaces/locked")).rejects.toThrow(
            /NoPermissions/,
        );
    });
});

describe("VsCodeWorkspace.readFile", () => {
    it("decodes the read buffer to a string", async () => {
        readFileMock.mockResolvedValueOnce(Buffer.from("hello"));
        const sut = new VsCodeWorkspace();

        await expect(sut.readFile("/work/a.txt")).resolves.toBe("hello");
    });

    it("maps a FileNotFound fs error to the domain FileNotFound carrying the path", async () => {
        readFileMock.mockRejectedValue(new FileSystemError("FileNotFound"));
        const sut = new VsCodeWorkspace();

        // The path — not the raw rejection — is what callers log, so the domain
        // error must carry it (mirrors NodeWorkspace.readFile).
        await expect(sut.readFile("/work/gone.txt")).rejects.toBeInstanceOf(FileNotFound);
        await expect(sut.readFile("/work/gone.txt")).rejects.toThrow(/gone\.txt/);
    });

    it("rethrows a non-FileNotFound fs error instead of masking it as FileNotFound", async () => {
        readFileMock.mockRejectedValue(new FileSystemError("NoPermissions"));
        const sut = new VsCodeWorkspace();

        // A real read failure must reach the caller so the manifest participant
        // can surface it — the old catch-all swallowed it as "no manifest".
        await expect(sut.readFile("/work/locked.txt")).rejects.not.toBeInstanceOf(FileNotFound);
        await expect(sut.readFile("/work/locked.txt")).rejects.toThrow(/NoPermissions/);
    });

    it("rethrows a plain Error unchanged", async () => {
        readFileMock.mockRejectedValue(new Error("boom"));
        const sut = new VsCodeWorkspace();

        await expect(sut.readFile("/work/x.txt")).rejects.not.toBeInstanceOf(FileNotFound);
        await expect(sut.readFile("/work/x.txt")).rejects.toThrow(/boom/);
    });
});

describe("VsCodeWorkspace.writeFile", () => {
    it("creates the parent directory before writing (nested artifact paths)", async () => {
        const sut = new VsCodeWorkspace();

        await sut.writeFile("/work/proj/.camunda/code-link/src/order.bpmn.json", "{}");

        expect(createDirectoryMock).toHaveBeenCalledWith(
            expect.objectContaining({ path: "/work/proj/.camunda/code-link/src" }),
        );
        expect(writeFileMock).toHaveBeenCalledWith(
            expect.objectContaining({ path: "/work/proj/.camunda/code-link/src/order.bpmn.json" }),
            expect.anything(),
        );
        // The directory must exist before the write is attempted.
        expect(createDirectoryMock.mock.invocationCallOrder[0]).toBeLessThan(
            writeFileMock.mock.invocationCallOrder[0],
        );
    });
});
