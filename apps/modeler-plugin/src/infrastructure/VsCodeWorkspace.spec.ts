import { beforeEach, describe, expect, it, vi } from "vitest";

const findFilesMock = vi.fn();

vi.mock("vscode", () => ({
    workspace: {
        fs: {
            readDirectory: vi.fn(),
            readFile: vi.fn(),
            writeFile: vi.fn(),
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
    findFilesMock.mockResolvedValue([
        { path: "/a.bpmn" },
        { path: "/b.bpmn" },
    ]);
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

        expect(findFilesMock).toHaveBeenCalledWith(
            "**/*.bpmn",
            "**/dist/**",
        );
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
        findFilesMock.mockResolvedValueOnce([
            { path: "/x.bpmn" },
            { path: "/nested/y.bpmn" },
        ]);
        const sut = new VsCodeWorkspace();

        const result = await sut.findFiles("**/*.bpmn");

        expect(result).toEqual(["/x.bpmn", "/nested/y.bpmn"]);
    });
});
