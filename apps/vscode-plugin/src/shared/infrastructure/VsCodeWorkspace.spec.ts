import { beforeEach, describe, expect, it, vi } from "vitest";

const findFilesMock = vi.fn();
const createDirectoryMock = vi.fn();
const writeFileMock = vi.fn();
const readFileMock = vi.fn();
const statMock = vi.fn();
const deleteMock = vi.fn();
const createFileSystemWatcherMock = vi.fn();
const readDirectoryMock = vi.fn();
let workspaceFolders: { uri: { scheme?: string; authority?: string; path: string } }[] | undefined;

vi.mock("vscode", () => ({
    workspace: {
        fs: {
            readDirectory: (...args: unknown[]) => readDirectoryMock(...args),
            readFile: (...args: unknown[]) => readFileMock(...args),
            stat: (...args: unknown[]) => statMock(...args),
            writeFile: (...args: unknown[]) => writeFileMock(...args),
            createDirectory: (...args: unknown[]) => createDirectoryMock(...args),
            delete: (...args: unknown[]) => deleteMock(...args),
        },
        findFiles: (...args: unknown[]) => findFilesMock(...args),
        getWorkspaceFolder: vi.fn(),
        get workspaceFolders() {
            return workspaceFolders;
        },
        createFileSystemWatcher: (...args: unknown[]) => createFileSystemWatcherMock(...args),
    },
    // Mirrors `vscode.FileSystemError`: an `Error` carrying a `.code`
    // discriminant, defined inside the factory to dodge vi.mock's hoist-time TDZ.
    FileSystemError: class FileSystemError extends Error {
        constructor(readonly code: string) {
            super(code);
        }
    },
    // Both constructors take a UNC server as the authority, as VS Code does.
    Uri: {
        file: (path: string) => {
            const unc = /^\/\/([^/]+)(\/.*)?$/.exec(path);
            return unc
                ? { scheme: "file", authority: unc[1], path: unc[2] ?? "/" }
                : { scheme: "file", authority: "", path, fsPath: path };
        },
        // Mirror VS Code's decode of a `file://` string so `toUri` can be shown
        // recovering `/c:/…` from the `%3A`-escaped drive colon.
        parse: (value: string) => {
            const [, authority, path] = /^file:\/\/([^/]*)(.*)$/.exec(value) ?? [];
            return { scheme: "file", authority, path: decodeURIComponent(path) };
        },
    },
    RelativePattern: class {
        constructor(
            readonly base: unknown,
            readonly pattern: string,
        ) {}
    },
    FileType: { File: 1, Directory: 2, SymbolicLink: 64 },
}));

import { FileSystemError, FileType, workspace } from "vscode";

import {
    ArtifactService,
    BpmnLintConfigLocator,
    DirectoryNotFound,
    FileNotFound,
} from "@miragon/bpmn-modeler-core";
import { InMemorySettings } from "@miragon/bpmn-modeler-core/testing";
import { VsCodeWorkspace } from "./VsCodeWorkspace";

const getWorkspaceFolderMock = workspace.getWorkspaceFolder as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
    readDirectoryMock.mockReset();
    workspaceFolders = undefined;
    getWorkspaceFolderMock.mockReset();
    findFilesMock.mockReset();
    findFilesMock.mockResolvedValue([{ path: "/a.bpmn" }, { path: "/b.bpmn" }]);
    createDirectoryMock.mockReset();
    createDirectoryMock.mockResolvedValue(undefined);
    writeFileMock.mockReset();
    writeFileMock.mockResolvedValue(undefined);
    readFileMock.mockReset();
    statMock.mockReset();
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
        expect(findFilesMock).toHaveBeenCalledWith("**/*.bpmn", undefined);
    });

    it("forwards a glob exclude pattern when supplied", async () => {
        const sut = new VsCodeWorkspace();

        await sut.findFiles("**/*.bpmn", "**/dist/**");

        expect(findFilesMock).toHaveBeenCalledWith("**/*.bpmn", "**/dist/**");
    });

    it("forwards null as exclude to opt out of all default excludes", async () => {
        // VS Code's `findFiles(include, null)` disables the implicit
        // `files.exclude` filter — we must preserve that semantic and not
        // coerce null to undefined.
        const sut = new VsCodeWorkspace();

        await sut.findFiles("**/*.bpmn", null);

        expect(findFilesMock).toHaveBeenCalledWith("**/*.bpmn", null);
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
        // the template walk collects nothing.
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

describe("VsCodeWorkspace.findWorkspaceFolderForDocument", () => {
    it("returns the canonical folder path for a document inside a workspace folder", () => {
        getWorkspaceFolderMock.mockReturnValueOnce({ uri: { path: "/C:/ws" } });

        expect(new VsCodeWorkspace().findWorkspaceFolderForDocument("/c:/ws/a.bpmn")).toBe(
            "/c:/ws",
        );
    });

    it("returns undefined for a loose file instead of throwing", () => {
        getWorkspaceFolderMock.mockReturnValueOnce(undefined);

        expect(new VsCodeWorkspace().findWorkspaceFolderForDocument("/tmp/a.bpmn")).toBeUndefined();
    });
});

describe("VsCodeWorkspace.getWorkspaceFolderPaths", () => {
    it("lists every open folder in canonical form", () => {
        workspaceFolders = [{ uri: { path: "/C:/ws" } }, { uri: { path: "/home/me/other" } }];

        expect(new VsCodeWorkspace().getWorkspaceFolderPaths()).toEqual([
            "/c:/ws",
            "/home/me/other",
        ]);
    });

    it("returns no folders in a single-file window", () => {
        expect(new VsCodeWorkspace().getWorkspaceFolderPaths()).toEqual([]);
    });
});

describe("VsCodeWorkspace.getDocumentDirectory", () => {
    it("returns the directory of a `file://`-form document as a canonical path", () => {
        expect(new VsCodeWorkspace().getDocumentDirectory("file:///C%3A/ws/proc/order.bpmn")).toBe(
            "/c:/ws/proc",
        );
    });
});

describe("VsCodeWorkspace.readDirectory", () => {
    it("lists files and directories and drops links and other entry types", async () => {
        readDirectoryMock.mockResolvedValueOnce([
            ["order.bpmn", 1],
            ["element-templates", 2],
            ["linked", 64],
            ["socket", 0],
        ]);

        await expect(new VsCodeWorkspace().readDirectory("/ws/.camunda")).resolves.toEqual([
            ["order.bpmn", "file"],
            ["element-templates", "directory"],
        ]);
    });

    it("reports an unreadable directory as DirectoryNotFound so config walks keep going", async () => {
        readDirectoryMock.mockRejectedValueOnce(new FileSystemError("FileNotFound"));

        await expect(new VsCodeWorkspace().readDirectory("/ws/.camunda")).rejects.toBeInstanceOf(
            DirectoryNotFound,
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

    it("subscribes only the supplied handlers and disposes them with the watcher", () => {
        const subscription = { dispose: vi.fn() };
        const watcher = {
            onDidCreate: vi.fn(),
            onDidChange: vi.fn(),
            onDidDelete: vi.fn(() => subscription),
            dispose: vi.fn(),
        };
        createFileSystemWatcherMock.mockReturnValueOnce(watcher);

        const handle = new VsCodeWorkspace().createWatcher("/ws", "**/*.json", {
            onDelete: vi.fn(),
        });
        handle.dispose();

        expect(watcher.onDidCreate).not.toHaveBeenCalled();
        expect(watcher.onDidChange).not.toHaveBeenCalled();
        expect(subscription.dispose).toHaveBeenCalledOnce();
        expect(watcher.dispose).toHaveBeenCalledOnce();
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

describe("VsCodeWorkspace on a UNC share", () => {
    const shareFolderUri = { scheme: "file", authority: "server", path: "/share/ws" };

    it("keeps the server of the workspace folder holding a document", () => {
        getWorkspaceFolderMock.mockReturnValueOnce({ uri: shareFolderUri });

        expect(
            new VsCodeWorkspace().getWorkspaceFolderForDocument("//server/share/ws/a.bpmn"),
        ).toBe("//server/share/ws");
        expect(getWorkspaceFolderMock).toHaveBeenCalledWith(
            expect.objectContaining({ authority: "server", path: "/share/ws/a.bpmn" }),
        );
    });

    it("keeps the server of an open workspace folder", () => {
        workspaceFolders = [{ uri: shareFolderUri }];

        expect(new VsCodeWorkspace().getWorkspaceFolderPaths()).toEqual(["//server/share/ws"]);
    });

    it("keeps the server in the directory of a `file://`-form document", () => {
        expect(
            new VsCodeWorkspace().getDocumentDirectory("file://server/share/ws/proc/order.bpmn"),
        ).toBe("//server/share/ws/proc");
    });

    it("keeps the server of the files it finds", async () => {
        findFilesMock.mockResolvedValueOnce([
            { scheme: "file", authority: "server", path: "/share/ws/a.bpmn" },
        ]);

        await expect(new VsCodeWorkspace().findFiles("**/*.bpmn")).resolves.toEqual([
            "//server/share/ws/a.bpmn",
        ]);
    });

    it("keeps the server of the paths its watcher reports", () => {
        const onChange = vi.fn();
        let reportChange: (uri: unknown) => void = () => undefined;
        createFileSystemWatcherMock.mockReturnValueOnce({
            onDidCreate: vi.fn(),
            onDidChange: vi.fn((listener: (uri: unknown) => void) => {
                reportChange = listener;
                return { dispose: vi.fn() };
            }),
            onDidDelete: vi.fn(),
            dispose: vi.fn(),
        });

        new VsCodeWorkspace().createWatcher("//server/share/ws", "**/*.json", { onChange });
        reportChange({ scheme: "file", authority: "server", path: "/share/ws/x.json" });

        expect(onChange).toHaveBeenCalledWith("//server/share/ws/x.json");
    });

    it("creates the parent directory of a file on the share", async () => {
        await new VsCodeWorkspace().writeFile("//server/share/ws/.camunda/code-link/a.json", "{}");

        expect(createDirectoryMock).toHaveBeenCalledWith(
            expect.objectContaining({ authority: "server", path: "/share/ws/.camunda/code-link" }),
        );
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

        // A real read failure must reach the caller so it can surface it — the
        // old catch-all swallowed it as "file absent".
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

describe("VsCodeWorkspace.isSymbolicLink", () => {
    it("is true when the stat type carries the SymbolicLink bit", async () => {
        statMock.mockResolvedValueOnce({ type: FileType.File | FileType.SymbolicLink });
        const sut = new VsCodeWorkspace();

        await expect(sut.isSymbolicLink("/work/.env")).resolves.toBe(true);
        expect(statMock).toHaveBeenCalledWith(expect.objectContaining({ path: "/work/.env" }));
    });

    it("is false for a plain file", async () => {
        statMock.mockResolvedValueOnce({ type: FileType.File });
        const sut = new VsCodeWorkspace();

        await expect(sut.isSymbolicLink("/work/.env")).resolves.toBe(false);
    });

    it("is false when the path does not exist", async () => {
        statMock.mockRejectedValueOnce(new FileSystemError("FileNotFound"));
        const sut = new VsCodeWorkspace();

        await expect(sut.isSymbolicLink("/work/.env")).resolves.toBe(false);
    });

    it("rethrows a non-FileNotFound filesystem error", async () => {
        statMock.mockRejectedValueOnce(new FileSystemError("NoPermissions"));
        const sut = new VsCodeWorkspace();

        await expect(sut.isSymbolicLink("/work/.env")).rejects.toThrow(/NoPermissions/);
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

describe("VsCodeWorkspace under the config watchers of a Windows document", () => {
    const EDITOR_ID = "file:///c%3A/ws/proc/order.bpmn";

    function reportDeletes(): (path: string) => void {
        let reportDelete: (uri: unknown) => void = () => undefined;
        createFileSystemWatcherMock.mockReturnValue({
            onDidCreate: vi.fn(() => ({ dispose: vi.fn() })),
            onDidChange: vi.fn(() => ({ dispose: vi.fn() })),
            onDidDelete: vi.fn((listener: (uri: unknown) => void) => {
                reportDelete = listener;
                return { dispose: vi.fn() };
            }),
            dispose: vi.fn(),
        });
        return (path) => reportDelete({ scheme: "file", authority: "", path });
    }

    it.each([
        {
            watcher: "element-template",
            arm: (workspace: VsCodeWorkspace, onLookupChange: () => void) =>
                new ArtifactService(workspace, new InMemorySettings()).createWatcher(EDITOR_ID, {
                    refreshElementTemplates: onLookupChange,
                }),
        },
        {
            watcher: ".bpmnlintrc",
            arm: (workspace: VsCodeWorkspace, onLookupChange: () => void) => {
                const settings = new InMemorySettings();
                return new BpmnLintConfigLocator(
                    workspace,
                    settings,
                    new ArtifactService(workspace, settings),
                ).createWatcher(EDITOR_ID, {
                    setBpmnlintConfig: async () => {
                        onLookupChange();
                        return true;
                    },
                });
            },
        },
    ])(
        "follows the $watcher lookup of a document whose URI escapes the drive colon",
        async ({ arm }) => {
            getWorkspaceFolderMock.mockReturnValue({ uri: { path: "/C:/ws" } });
            const reportDelete = reportDeletes();
            const onLookupChange = vi.fn();
            await arm(new VsCodeWorkspace(), onLookupChange);

            reportDelete("/C:/ws/other/.camunda");
            expect(onLookupChange).not.toHaveBeenCalled();

            reportDelete("/C:/ws/.camunda");
            expect(onLookupChange).toHaveBeenCalledOnce();
        },
    );
});
