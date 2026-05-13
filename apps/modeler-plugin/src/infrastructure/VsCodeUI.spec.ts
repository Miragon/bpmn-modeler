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

import { VsCodeUI } from "./VsCodeUI";

beforeEach(() => {
    showQuickPickMock.mockReset();
    asRelativePathMock.mockReset();
    asRelativePathMock.mockImplementation((uri: { path: string }) => uri.path.replace(/^\//, ""));
});

describe("VsCodeUI.pickReferencedModel", () => {
    it("returns the chosen item's path", async () => {
        showQuickPickMock.mockImplementation((items: { path: string }[]) =>
            Promise.resolve(items[0]),
        );

        const sut = new VsCodeUI();

        const result = await sut.pickReferencedModel(["/src/a.bpmn"]);

        expect(result).toBe("/src/a.bpmn");
    });

    it("returns undefined when the user dismisses the picker", async () => {
        showQuickPickMock.mockResolvedValue(undefined);

        const sut = new VsCodeUI();

        const result = await sut.pickReferencedModel(["/src/a.bpmn"]);

        expect(result).toBeUndefined();
    });

    it("builds items with basename label + workspace-relative description", async () => {
        showQuickPickMock.mockResolvedValue(undefined);

        const sut = new VsCodeUI();
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
        const sut = new VsCodeUI();
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

        const sut = new VsCodeUI();
        await sut.pickReferencedModel(["/a.bpmn"]);

        const options = showQuickPickMock.mock.calls[0][1] as {
            placeHolder: string;
        };
        expect(options.placeHolder).toBe("Select the referenced model to open");
    });
});
