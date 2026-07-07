import { beforeEach, describe, expect, it, vi } from "vitest";

const showQuickPickMock = vi.fn();
const asRelativePathMock = vi.fn();

interface FakeQuickPick {
    busy: boolean;
    items: { label: string; description: string; path: string }[];
    placeholder: string | undefined;
    selectedItems: { path: string }[];
    show: ReturnType<typeof vi.fn>;
    hide: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
    onDidAccept: (cb: () => void) => void;
    onDidHide: (cb: () => void) => void;
    _accept?: () => void;
    _hide?: () => void;
}

// `pickBehavior` scripts how the simulated user settles a revealed list, so
// tests stay free of hand-timed accept/dismiss calls.
let quickPicks: FakeQuickPick[] = [];
let pickBehavior: { action: "accept"; index: number } | { action: "hide" } = {
    action: "hide",
};

const createQuickPickMock = vi.fn((): FakeQuickPick => {
    const qp: FakeQuickPick = {
        busy: false,
        items: [],
        placeholder: undefined,
        selectedItems: [],
        show: vi.fn(),
        hide: vi.fn(),
        dispose: vi.fn(),
        onDidAccept(cb) {
            qp._accept = cb;
        },
        onDidHide(cb) {
            qp._hide = cb;
            // Both handlers are set now — settle on the next microtask.
            queueMicrotask(() => {
                if (pickBehavior.action === "accept") {
                    qp.selectedItems = qp.items[pickBehavior.index]
                        ? [qp.items[pickBehavior.index]]
                        : [];
                    qp._accept?.();
                } else {
                    qp._hide?.();
                }
            });
        },
    };
    quickPicks.push(qp);
    return qp;
});

function lastQuickPick(): FakeQuickPick {
    return quickPicks[quickPicks.length - 1];
}

vi.mock("vscode", () => ({
    env: { clipboard: { readText: vi.fn(), writeText: vi.fn() } },
    window: {
        showInformationMessage: vi.fn(),
        showErrorMessage: vi.fn(),
        showQuickPick: (...args: unknown[]) => showQuickPickMock(...args),
        createQuickPick: () => createQuickPickMock(),
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
    createQuickPickMock.mockClear();
    quickPicks = [];
    pickBehavior = { action: "hide" };
    asRelativePathMock.mockReset();
    asRelativePathMock.mockImplementation((uri: { path: string }) => uri.path.replace(/^\//, ""));
    vi.useRealTimers();
});

describe("VsCodePicker.searchAndPickReferencedModel", () => {
    it("returns the untouched outcome and the picked path for multiple matches", async () => {
        pickBehavior = { action: "accept", index: 0 };
        const sut = new VsCodePicker(stubWorkspace());
        const outcome = { kind: "matches", paths: ["/repo/src/z.bpmn", "/repo/lib/a.bpmn"] };

        const result = await sut.searchAndPickReferencedModel("Searching…", async () => outcome);

        // Outcome passes through untouched so the service can branch on it.
        expect(result.outcome).toBe(outcome);
        expect(result.chosen).toBe("/repo/lib/a.bpmn");
    });

    it("reveals the list busy=false with sorted basename/relative items for multiple matches", async () => {
        pickBehavior = { action: "accept", index: 0 };
        const sut = new VsCodePicker(stubWorkspace());

        await sut.searchAndPickReferencedModel("Searching…", async () => ({
            kind: "matches",
            paths: ["/repo/src/z.bpmn", "/repo/lib/a.bpmn", "/repo/src/m.bpmn"],
        }));

        const qp = lastQuickPick();
        expect(qp.show).toHaveBeenCalled();
        expect(qp.busy).toBe(false);
        expect(qp.placeholder).toBe("Select the referenced model to open");
        // Sorted by workspace-relative description so nearby files surface first.
        expect(qp.items.map((i) => i.path)).toEqual([
            "/repo/lib/a.bpmn",
            "/repo/src/m.bpmn",
            "/repo/src/z.bpmn",
        ]);
        expect(qp.items[0].label).toBe("a.bpmn");
        expect(qp.items[0].description).toBe("repo/lib/a.bpmn");
        expect(qp.dispose).toHaveBeenCalled();
    });

    it("returns chosen=undefined when the user dismisses the populated list", async () => {
        pickBehavior = { action: "hide" };
        const sut = new VsCodePicker(stubWorkspace());

        const result = await sut.searchAndPickReferencedModel("Searching…", async () => ({
            kind: "matches",
            paths: ["/a.bpmn", "/b.bpmn"],
        }));

        expect(result.chosen).toBeUndefined();
        expect(lastQuickPick().dispose).toHaveBeenCalled();
    });

    it("never reveals a list for a single match and leaves chosen undefined", async () => {
        const sut = new VsCodePicker(stubWorkspace());

        const result = await sut.searchAndPickReferencedModel("Searching…", async () => ({
            kind: "matches",
            paths: ["/a.bpmn"],
        }));

        const qp = lastQuickPick();
        expect(result.chosen).toBeUndefined();
        expect(qp.items).toEqual([]);
        expect(qp.hide).toHaveBeenCalled();
        expect(qp.dispose).toHaveBeenCalled();
    });

    it("never reveals a list for zero matches or a non-matches outcome", async () => {
        const sut = new VsCodePicker(stubWorkspace());

        const empty = await sut.searchAndPickReferencedModel("Searching…", async () => ({
            kind: "matches",
            paths: [],
        }));
        const noScope = await sut.searchAndPickReferencedModel("Searching…", async () => ({
            kind: "no-search-scope",
        }));

        expect(empty.chosen).toBeUndefined();
        expect(noScope.chosen).toBeUndefined();
    });

    it("reveals a busy list only after the ~150 ms delay while the search runs", async () => {
        vi.useFakeTimers();
        let resolveSearch!: (r: { kind: string; paths: string[] }) => void;
        const search = () =>
            new Promise<{ kind: string; paths: string[] }>((res) => (resolveSearch = res));
        const sut = new VsCodePicker(stubWorkspace());

        const pending = sut.searchAndPickReferencedModel("Searching…", search);
        const qp = lastQuickPick();

        // Before the delay elapses the list stays hidden.
        await vi.advanceTimersByTimeAsync(149);
        expect(qp.show).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(1);
        expect(qp.show).toHaveBeenCalled();
        expect(qp.busy).toBe(true);
        expect(qp.placeholder).toBe("Searching…");

        // A single-match result then hides the spinner without populating items.
        resolveSearch({ kind: "matches", paths: ["/a.bpmn"] });
        await pending;
        expect(qp.hide).toHaveBeenCalled();
    });

    it("does not flash the list when the search resolves before the reveal delay", async () => {
        vi.useFakeTimers();
        const sut = new VsCodePicker(stubWorkspace());

        // Search resolves before the 150 ms timer, so the list never shows.
        const result = await sut.searchAndPickReferencedModel("Searching…", async () => ({
            kind: "matches",
            paths: ["/a.bpmn"],
        }));

        const qp = lastQuickPick();
        expect(qp.show).not.toHaveBeenCalled();
        expect(qp.dispose).toHaveBeenCalled();
        expect(result.chosen).toBeUndefined();
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
