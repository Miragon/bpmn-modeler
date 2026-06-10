import { beforeEach, describe, expect, it, vi } from "vitest";

const showQuickPickMock = vi.fn();
const asRelativePathMock = vi.fn();

vi.mock("vscode", () => ({
    env: { clipboard: { readText: vi.fn(), writeText: vi.fn() } },
    window: {
        showInformationMessage: vi.fn(),
        showErrorMessage: vi.fn(),
        showQuickPick: (...args: unknown[]) => showQuickPickMock(...args),
        createOutputChannel: () => ({
            clear: vi.fn(),
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            show: vi.fn(),
        }),
        tabGroups: {
            onDidChangeTabs: () => ({ dispose: vi.fn() }),
            all: [],
            close: vi.fn(),
        },
    },
    workspace: {
        asRelativePath: (uri: { path: string }) => asRelativePathMock(uri),
        openTextDocument: vi.fn(),
    },
    Uri: { file: (path: string) => ({ scheme: "file", path, fsPath: path }) },
    ViewColumn: { Beside: -2 },
}));

vi.mock("./extensionContext", () => ({
    getContext: () => ({ subscriptions: { push: vi.fn() } }),
    setContext: vi.fn(),
}));

import { VsCodePicker } from "./VsCodePicker";
import type { VsCodeWorkspace } from "./VsCodeWorkspace";

function stubWorkspace(findFilesResult: string[] = []): VsCodeWorkspace {
    return {
        findFiles: vi.fn().mockResolvedValue(findFilesResult),
    } as unknown as VsCodeWorkspace;
}

beforeEach(() => {
    showQuickPickMock.mockReset();
    asRelativePathMock.mockReset();
    asRelativePathMock.mockImplementation((uri: { path: string }) => uri.path.replace(/^\//, ""));
});

describe("VsCodePicker.pickReferencedModel", () => {
    it("returns the chosen item's path", async () => {
        showQuickPickMock.mockImplementation((items: { path: string }[]) =>
            Promise.resolve(items[0]),
        );

        const sut = new VsCodePicker(stubWorkspace());

        const result = await sut.pickReferencedModel(["/src/a.bpmn"]);

        expect(result).toBe("/src/a.bpmn");
    });

    it("returns undefined when the user dismisses the picker", async () => {
        showQuickPickMock.mockResolvedValue(undefined);

        const sut = new VsCodePicker(stubWorkspace());

        const result = await sut.pickReferencedModel(["/src/a.bpmn"]);

        expect(result).toBeUndefined();
    });

    it("builds items with basename label + workspace-relative description", async () => {
        showQuickPickMock.mockResolvedValue(undefined);

        const sut = new VsCodePicker(stubWorkspace());
        await sut.pickReferencedModel(["/repo/src/a.bpmn"]);

        const items = showQuickPickMock.mock.calls[0][0] as {
            label: string;
            description: string;
            path: string;
        }[];
        expect(items).toHaveLength(1);
        expect(items[0].label).toBe("a.bpmn");
        expect(items[0].description).toBe("repo/src/a.bpmn");
        expect(items[0].path).toBe("/repo/src/a.bpmn");
    });

    it("sorts items by workspace-relative description", async () => {
        showQuickPickMock.mockResolvedValue(undefined);
        // Inputs in non-alphabetical order; expect the picker to receive
        // them sorted by `description` so nearby files surface first.
        const sut = new VsCodePicker(stubWorkspace());
        await sut.pickReferencedModel(["/repo/src/z.bpmn", "/repo/lib/a.bpmn", "/repo/src/m.bpmn"]);

        const items = showQuickPickMock.mock.calls[0][0] as { path: string }[];
        expect(items.map((i) => i.path)).toEqual([
            "/repo/lib/a.bpmn",
            "/repo/src/m.bpmn",
            "/repo/src/z.bpmn",
        ]);
    });

    it("passes the placeholder to the picker", async () => {
        showQuickPickMock.mockResolvedValue(undefined);

        const sut = new VsCodePicker(stubWorkspace());
        await sut.pickReferencedModel(["/a.bpmn"]);

        const options = showQuickPickMock.mock.calls[0][1] as {
            placeHolder: string;
        };
        expect(options.placeHolder).toBe("Select the referenced model to open");
    });
});

describe("VsCodePicker.pickWorkspaceFiles", () => {
    it("returns the file paths of the chosen items", async () => {
        showQuickPickMock.mockImplementation((items: { filePath: string }[]) =>
            Promise.resolve([items[0], items[1]]),
        );
        const workspace = stubWorkspace(["/a.form", "/b.dmn", "/c.json"]);
        const sut = new VsCodePicker(workspace);

        const result = await sut.pickWorkspaceFiles({
            glob: "**/*.{form,json,dmn}",
            placeholder: "pick",
        });

        expect(result).toEqual(["/a.form", "/b.dmn"]);
    });

    it("returns [] when the user dismisses the picker", async () => {
        showQuickPickMock.mockResolvedValue(undefined);
        const sut = new VsCodePicker(stubWorkspace(["/a.form"]));

        const result = await sut.pickWorkspaceFiles({
            glob: "**/*.form",
            placeholder: "pick",
        });

        expect(result).toEqual([]);
    });

    it("forwards glob, exclude and limit to the workspace search", async () => {
        showQuickPickMock.mockResolvedValue(undefined);
        const workspace = stubWorkspace([]);
        const sut = new VsCodePicker(workspace);

        await sut.pickWorkspaceFiles({
            glob: "**/*.{form,json,dmn}",
            exclude: "**/element-templates/**",
            placeholder: "pick",
            limit: 20,
        });

        expect(workspace.findFiles).toHaveBeenCalledWith(
            "**/*.{form,json,dmn}",
            "**/element-templates/**",
            20,
        );
    });

    it("passes the placeholder and multi-select option to the picker", async () => {
        showQuickPickMock.mockResolvedValue(undefined);
        const sut = new VsCodePicker(stubWorkspace(["/a.form"]));

        await sut.pickWorkspaceFiles({
            glob: "**/*.form",
            placeholder: "Select files",
        });

        const options = showQuickPickMock.mock.calls[0][1] as {
            placeHolder: string;
            canPickMany: boolean;
            matchOnDescription: boolean;
        };
        expect(options.placeHolder).toBe("Select files");
        expect(options.canPickMany).toBe(true);
        expect(options.matchOnDescription).toBe(true);
    });

    it("builds items with basename label and absolute-path description", async () => {
        showQuickPickMock.mockResolvedValue(undefined);
        const sut = new VsCodePicker(stubWorkspace(["/repo/src/order.form"]));

        await sut.pickWorkspaceFiles({
            glob: "**/*.form",
            placeholder: "pick",
        });

        const items = showQuickPickMock.mock.calls[0][0] as {
            label: string;
            description: string;
            filePath: string;
        }[];
        expect(items).toHaveLength(1);
        expect(items[0].label).toBe("order.form");
        expect(items[0].description).toBe("/repo/src/order.form");
        expect(items[0].filePath).toBe("/repo/src/order.form");
    });
});
