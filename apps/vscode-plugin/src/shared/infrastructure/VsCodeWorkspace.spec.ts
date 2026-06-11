import { beforeEach, describe, expect, it, vi } from "vitest";

const findFilesMock = vi.fn();
const createDirectoryMock = vi.fn();
const writeFileMock = vi.fn();

vi.mock("vscode", () => ({
    workspace: {
        fs: {
            readDirectory: vi.fn(),
            readFile: vi.fn(),
            writeFile: (...args: unknown[]) => writeFileMock(...args),
            createDirectory: (...args: unknown[]) => createDirectoryMock(...args),
        },
        findFiles: (...args: unknown[]) => findFilesMock(...args),
        getWorkspaceFolder: vi.fn(),
    },
    Uri: { file: (path: string) => ({ scheme: "file", path, fsPath: path }) },
    FileType: { File: 1, Directory: 2, SymbolicLink: 64 },
}));

import { VsCodeWorkspace } from "./VsCodeWorkspace";

beforeEach(() => {
    findFilesMock.mockReset();
    findFilesMock.mockResolvedValue([{ path: "/a.bpmn" }, { path: "/b.bpmn" }]);
    createDirectoryMock.mockReset();
    createDirectoryMock.mockResolvedValue(undefined);
    writeFileMock.mockReset();
    writeFileMock.mockResolvedValue(undefined);
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
