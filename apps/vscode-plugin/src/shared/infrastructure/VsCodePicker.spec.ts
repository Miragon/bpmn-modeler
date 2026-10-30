import { beforeEach, describe, expect, it, vi } from "vitest";

const showQuickPickMock = vi.fn();
const showWarningMessageMock = vi.fn();
const asRelativePathMock = vi.fn();

interface FakeQuickPickItem {
    label: string;
    description?: string;
    path?: string;
    value?: unknown;
}

interface FakeQuickPick {
    busy: boolean;
    items: FakeQuickPickItem[];
    placeholder: string | undefined;
    title?: string;
    matchOnDescription?: boolean;
    selectedItems: FakeQuickPickItem[];
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
        showWarningMessage: (...args: unknown[]) => showWarningMessageMock(...args),
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

import {
    ChoicePrompt,
    LocateResult,
    SearchPrompt,
    UserCancelledError,
} from "@miragon/bpmn-modeler-core";

import { VsCodePicker } from "./VsCodePicker";
import type { VsCodeWorkspace } from "./VsCodeWorkspace";

function stubWorkspace(findFilesResult: string[] = []): VsCodeWorkspace {
    return {
        findFiles: vi.fn().mockResolvedValue(findFilesResult),
    } as unknown as VsCodeWorkspace;
}

interface ShownItem {
    label: string;
    description?: string;
}

function acceptQuickPickItemStartingWith(labelPrefix: string): void {
    showQuickPickMock.mockImplementation(async (items: (ShownItem | string)[]) =>
        items.find((item) =>
            (typeof item === "string" ? item : item.label).startsWith(labelPrefix),
        ),
    );
}

function dismissQuickPick(): void {
    showQuickPickMock.mockResolvedValue(undefined);
}

function shownItems(): ShownItem[] {
    return showQuickPickMock.mock.calls[0][0];
}

function shownPlaceholder(): string {
    return showQuickPickMock.mock.calls[0][1].placeHolder;
}

beforeEach(() => {
    showQuickPickMock.mockReset();
    showWarningMessageMock.mockReset();
    createQuickPickMock.mockClear();
    quickPicks = [];
    pickBehavior = { action: "hide" };
    asRelativePathMock.mockReset();
    asRelativePathMock.mockImplementation((uri: { path: string }) => uri.path.replace(/^\//, ""));
    vi.useRealTimers();
});

const LOCATE_PROMPTS = {
    searchingPlaceholder: "Searching…",
    pickPlaceholder: "Select the file to open",
};

describe("VsCodePicker.searchAndPickLocatedFile", () => {
    it("returns the untouched outcome and the picked path for multiple matches", async () => {
        pickBehavior = { action: "accept", index: 0 };
        const sut = new VsCodePicker(stubWorkspace());
        const outcome: LocateResult = {
            kind: "matches",
            paths: ["/repo/src/z.bpmn", "/repo/lib/a.bpmn"],
            readFailures: [],
        };

        const result = await sut.searchAndPickLocatedFile(LOCATE_PROMPTS, async () => outcome);

        // Outcome passes through untouched so the service can branch on it.
        expect(result.outcome).toBe(outcome);
        expect(result.chosen).toBe("/repo/lib/a.bpmn");
    });

    it("reveals the list busy=false with sorted basename/relative items for multiple matches", async () => {
        pickBehavior = { action: "accept", index: 0 };
        const sut = new VsCodePicker(stubWorkspace());

        await sut.searchAndPickLocatedFile(LOCATE_PROMPTS, async () => ({
            kind: "matches",
            paths: ["/repo/src/z.bpmn", "/repo/lib/a.bpmn", "/repo/src/m.bpmn"],
            readFailures: [],
        }));

        const qp = lastQuickPick();
        expect(qp.show).toHaveBeenCalled();
        expect(qp.busy).toBe(false);
        expect(qp.placeholder).toBe("Select the file to open");
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

        const result = await sut.searchAndPickLocatedFile(LOCATE_PROMPTS, async () => ({
            kind: "matches",
            paths: ["/a.bpmn", "/b.bpmn"],
            readFailures: [],
        }));

        expect(result.chosen).toBeUndefined();
        expect(lastQuickPick().dispose).toHaveBeenCalled();
    });

    it("never reveals a list for a single match and leaves chosen undefined", async () => {
        const sut = new VsCodePicker(stubWorkspace());

        const result = await sut.searchAndPickLocatedFile(LOCATE_PROMPTS, async () => ({
            kind: "matches",
            paths: ["/a.bpmn"],
            readFailures: [],
        }));

        const qp = lastQuickPick();
        expect(result.chosen).toBeUndefined();
        expect(qp.items).toEqual([]);
        expect(qp.hide).toHaveBeenCalled();
        expect(qp.dispose).toHaveBeenCalled();
    });

    it("never reveals a list for zero matches or a non-matches outcome", async () => {
        const sut = new VsCodePicker(stubWorkspace());

        const empty = await sut.searchAndPickLocatedFile(LOCATE_PROMPTS, async () => ({
            kind: "matches",
            paths: [],
            readFailures: [],
        }));
        const noScope = await sut.searchAndPickLocatedFile(LOCATE_PROMPTS, async () => ({
            kind: "no-search-scope",
        }));

        expect(empty.chosen).toBeUndefined();
        expect(noScope.chosen).toBeUndefined();
    });

    it("reveals a busy list only after the ~150 ms delay while the search runs", async () => {
        vi.useFakeTimers();
        let resolveSearch!: (r: LocateResult) => void;
        const search = () => new Promise<LocateResult>((res) => (resolveSearch = res));
        const sut = new VsCodePicker(stubWorkspace());

        const pending = sut.searchAndPickLocatedFile(LOCATE_PROMPTS, search);
        const qp = lastQuickPick();

        // Before the delay elapses the list stays hidden.
        await vi.advanceTimersByTimeAsync(149);
        expect(qp.show).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(1);
        expect(qp.show).toHaveBeenCalled();
        expect(qp.busy).toBe(true);
        expect(qp.placeholder).toBe("Searching…");

        // A single-match result then hides the spinner without populating items.
        resolveSearch({ kind: "matches", paths: ["/a.bpmn"], readFailures: [] });
        await pending;
        expect(qp.hide).toHaveBeenCalled();
    });

    it("does not flash the list when the search resolves before the reveal delay", async () => {
        vi.useFakeTimers();
        const sut = new VsCodePicker(stubWorkspace());

        // Search resolves before the 150 ms timer, so the list never shows.
        const result = await sut.searchAndPickLocatedFile(LOCATE_PROMPTS, async () => ({
            kind: "matches",
            paths: ["/a.bpmn"],
            readFailures: [],
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

describe("VsCodePicker cancel conventions", () => {
    const picker = () => new VsCodePicker(stubWorkspace());

    it("throws UserCancelledError when a required choice is dismissed", async () => {
        dismissQuickPick();

        await expect(picker().pickNewModelEngine("Engine")).rejects.toBeInstanceOf(
            UserCancelledError,
        );
        await expect(picker().pickMigrationScope(1, 1)).rejects.toBeInstanceOf(UserCancelledError);
        await expect(picker().pickEngineVersion("c8", ["8.7"])).rejects.toBeInstanceOf(
            UserCancelledError,
        );
    });

    it("resolves to an empty result when an optional choice is dismissed", async () => {
        dismissQuickPick();

        await expect(picker().pickPayloadFile(["/payloads/order.json"])).resolves.toBeNull();
        await expect(picker().pickScriptLanguage("groovy")).resolves.toBeUndefined();
        await expect(picker().pickDeploymentTarget(["dev"])).resolves.toBeUndefined();
        await expect(
            picker().pickDeploymentStatusAction({ targetName: "dev", canVerify: true }),
        ).resolves.toBeUndefined();
    });
});

describe("VsCodePicker.pickNewModelEngine", () => {
    it("returns the id of the chosen engine", async () => {
        acceptQuickPickItemStartingWith("Engine-neutral");

        await expect(new VsCodePicker(stubWorkspace()).pickNewModelEngine("Engine")).resolves.toBe(
            "neutral",
        );
    });
});

describe("VsCodePicker.pickMigrationScope", () => {
    it.each([
        ["Camunda 7", "c7"],
        ["Camunda 8", "c8"],
        ["Both", "both"],
    ])("maps the %s entry to the %s scope", async (labelPrefix, scope) => {
        acceptQuickPickItemStartingWith(labelPrefix);

        await expect(new VsCodePicker(stubWorkspace()).pickMigrationScope(1, 2)).resolves.toBe(
            scope,
        );
    });

    it("counts the diagrams per engine in singular and plural", async () => {
        acceptQuickPickItemStartingWith("Both");

        await new VsCodePicker(stubWorkspace()).pickMigrationScope(1, 0);

        expect(shownItems()).toEqual([
            "Camunda 7 only (1 diagram)",
            "Camunda 8 only (0 diagrams)",
            "Both (1 diagram)",
        ]);
    });
});

describe("VsCodePicker.pickPayloadFile", () => {
    it("returns the chosen payload's path and file name", async () => {
        acceptQuickPickItemStartingWith("invoice.json");

        await expect(
            new VsCodePicker(stubWorkspace()).pickPayloadFile([
                "/payloads/order.json",
                "/payloads/invoice.json",
            ]),
        ).resolves.toEqual({ filePath: "/payloads/invoice.json", label: "invoice.json" });
    });
});

describe("VsCodePicker.pickScriptLanguage", () => {
    it("offers every supported language with its file extension", async () => {
        acceptQuickPickItemStartingWith("Python");

        const format = await new VsCodePicker(stubWorkspace()).pickScriptLanguage("");

        expect(format).toBe("python");
        expect(shownItems()).toEqual([
            expect.objectContaining({ label: "Javascript", description: ".js" }),
            expect.objectContaining({ label: "Groovy", description: ".groovy" }),
            expect.objectContaining({ label: "Python", description: ".py" }),
            expect.objectContaining({ label: "Ruby", description: ".rb" }),
        ]);
    });

    it("pins the diagram's current language first, ignoring case and whitespace", async () => {
        acceptQuickPickItemStartingWith("Groovy");

        await new VsCodePicker(stubWorkspace()).pickScriptLanguage(" Groovy ");

        expect(shownItems()[0].label).toBe("Groovy");
    });
});

describe("VsCodePicker.pickDeploymentTarget", () => {
    it("offers ad-hoc mode above the saved targets", async () => {
        acceptQuickPickItemStartingWith("(none");

        const picked = await new VsCodePicker(stubWorkspace()).pickDeploymentTarget([
            "dev",
            "prod",
        ]);

        expect(picked).toBe("");
        expect(shownItems().map((item) => item.label)).toEqual([
            "(none — use form values)",
            "dev",
            "prod",
        ]);
    });

    it("returns the name of a chosen target", async () => {
        acceptQuickPickItemStartingWith("prod");

        await expect(
            new VsCodePicker(stubWorkspace()).pickDeploymentTarget(["dev", "prod"]),
        ).resolves.toBe("prod");
    });
});

describe("VsCodePicker.pickDeploymentStatusAction", () => {
    it("offers verification only for a target that supports it", async () => {
        acceptQuickPickItemStartingWith("$(cloud)");

        const action = await new VsCodePicker(stubWorkspace()).pickDeploymentStatusAction({
            targetName: "dev",
            canVerify: true,
        });

        expect(action).toBe("verify");
        expect(shownPlaceholder()).toBe('Deployment target "dev"');
        expect(shownItems().map((item) => item.label)).toEqual([
            "$(arrow-swap) Switch deployment target…",
            "$(cloud) Verify on dev",
        ]);
    });

    it("offers only switching when no target is selected", async () => {
        acceptQuickPickItemStartingWith("$(arrow-swap)");

        const action = await new VsCodePicker(stubWorkspace()).pickDeploymentStatusAction({
            canVerify: false,
        });

        expect(action).toBe("switch");
        expect(shownPlaceholder()).toBe("No deployment target selected");
        expect(shownItems()).toHaveLength(1);
    });
});

describe("VsCodePicker.confirmDestructive", () => {
    const details = (count: number) =>
        Array.from({ length: count }, (_, index) => `target-${index + 1}`);

    it("asks in a modal dialog and confirms only with the confirm button", async () => {
        const picker = new VsCodePicker(stubWorkspace());
        const options = { title: "Delete target?", confirmLabel: "Delete", details: ["dev"] };

        showWarningMessageMock.mockResolvedValueOnce("Delete");
        await expect(picker.confirmDestructive(options)).resolves.toBe(true);
        showWarningMessageMock.mockResolvedValueOnce(undefined);
        await expect(picker.confirmDestructive(options)).resolves.toBe(false);

        expect(showWarningMessageMock).toHaveBeenCalledWith(
            "Delete target?",
            { modal: true, detail: "dev" },
            "Delete",
        );
    });

    it("lists up to twelve details in full", async () => {
        await new VsCodePicker(stubWorkspace()).confirmDestructive({
            title: "Remove?",
            confirmLabel: "Remove",
            details: details(12),
        });

        expect(showWarningMessageMock.mock.calls[0][1].detail).toBe(details(12).join("\n"));
    });

    it("summarises details beyond the twelfth", async () => {
        await new VsCodePicker(stubWorkspace()).confirmDestructive({
            title: "Remove?",
            confirmLabel: "Remove",
            details: details(14),
        });

        expect(showWarningMessageMock.mock.calls[0][1].detail).toBe(
            [...details(12), "…and 2 more"].join("\n"),
        );
    });
});

describe("VsCodePicker generic prompts", () => {
    const engines: ChoicePrompt<string> = {
        id: "newModelEngine",
        title: "New BPMN model",
        placeholder: "Select the engine",
        items: [
            { label: "Camunda 7", value: "c7" },
            { label: "Engine-neutral", description: "Opens in Design mode", value: "neutral" },
        ],
    };
    const forms: ChoicePrompt<string> = {
        id: "deployableFiles",
        placeholder: "Select files",
        items: ["/repo/a.form", "/repo/b.dmn", "/repo/c.json"].map((path) => ({
            label: path.slice("/repo/".length),
            path,
            value: path,
        })),
    };

    describe("choose", () => {
        it("shows the prompt's title, placeholder and items and filters on descriptions too", async () => {
            dismissQuickPick();

            await new VsCodePicker(stubWorkspace()).choose(engines);

            expect(showQuickPickMock).toHaveBeenCalledWith(
                [
                    expect.objectContaining({ label: "Camunda 7", description: undefined }),
                    expect.objectContaining({
                        label: "Engine-neutral",
                        description: "Opens in Design mode",
                    }),
                ],
                {
                    title: "New BPMN model",
                    placeHolder: "Select the engine",
                    matchOnDescription: true,
                },
            );
        });

        it("shows a file's path relative to the workspace in place of a description", async () => {
            dismissQuickPick();

            await new VsCodePicker(stubWorkspace()).choose({
                id: "payloadFile",
                placeholder: "Select a payload file",
                items: [
                    {
                        label: "order.json",
                        description: "unused",
                        path: "/repo/payloads/order.json",
                        value: "/repo/payloads/order.json",
                    },
                ],
            });

            expect(showQuickPickMock).toHaveBeenCalledWith(
                [expect.objectContaining({ description: "repo/payloads/order.json" })],
                expect.anything(),
            );
        });

        it("puts each icon's codicon before its label", async () => {
            dismissQuickPick();

            await new VsCodePicker(stubWorkspace()).choose({
                id: "deploymentStatusAction",
                placeholder: 'Deployment target "dev"',
                items: [
                    { label: "Switch deployment target…", icon: "swap", value: "switch" },
                    { label: "Verify on dev", icon: "cloud", value: "verify" },
                ],
            });

            expect(showQuickPickMock).toHaveBeenCalledWith(
                [
                    expect.objectContaining({ label: "$(arrow-swap) Switch deployment target…" }),
                    expect.objectContaining({ label: "$(cloud) Verify on dev" }),
                ],
                expect.anything(),
            );
        });

        it("returns the chosen item's value, also when it is empty", async () => {
            acceptQuickPickItemStartingWith("(none");

            const chosen = await new VsCodePicker(stubWorkspace()).choose({
                id: "deploymentTarget",
                placeholder: "Select the active deployment target",
                items: [
                    { label: "(none — use form values)", value: "" },
                    { label: "dev", value: "dev" },
                ],
            });

            expect(chosen).toBe("");
        });

        it("resolves undefined on dismissal", async () => {
            dismissQuickPick();

            await expect(
                new VsCodePicker(stubWorkspace()).choose(engines),
            ).resolves.toBeUndefined();
        });
    });

    describe("chooseMany", () => {
        it("lets the user choose several items and returns their values", async () => {
            showQuickPickMock.mockImplementation(async (items: ShownItem[]) => [
                items[0],
                items[2],
            ]);

            const chosen = await new VsCodePicker(stubWorkspace()).chooseMany(forms);

            expect(chosen).toEqual(["/repo/a.form", "/repo/c.json"]);
            expect(shownItems().map((item) => item.description)).toEqual([
                "repo/a.form",
                "repo/b.dmn",
                "repo/c.json",
            ]);
            expect(showQuickPickMock.mock.calls[0][1]).toEqual({
                placeHolder: "Select files",
                matchOnDescription: true,
                canPickMany: true,
            });
        });

        it("resolves [] on dismissal", async () => {
            dismissQuickPick();

            await expect(new VsCodePicker(stubWorkspace()).chooseMany(forms)).resolves.toEqual([]);
        });
    });

    describe("confirm", () => {
        const request = (details: string[]) => ({
            id: "deleteTarget",
            title: "Delete target?",
            confirmLabel: "Delete",
            details,
        });

        it("asks in a modal dialog and confirms only with the confirm button", async () => {
            const picker = new VsCodePicker(stubWorkspace());

            showWarningMessageMock.mockResolvedValueOnce("Delete");
            await expect(picker.confirm(request(["dev"]))).resolves.toBe(true);
            showWarningMessageMock.mockResolvedValueOnce(undefined);
            await expect(picker.confirm(request(["dev"]))).resolves.toBe(false);

            expect(showWarningMessageMock).toHaveBeenCalledWith(
                "Delete target?",
                { modal: true, detail: "dev" },
                "Delete",
            );
        });

        it("lists the details as given, since the core has summarised them", async () => {
            const details = Array.from({ length: 14 }, (_, index) => `target-${index + 1}`);

            await new VsCodePicker(stubWorkspace()).confirm(request(details));

            expect(showWarningMessageMock).toHaveBeenCalledWith(
                "Delete target?",
                { modal: true, detail: details.join("\n") },
                "Delete",
            );
        });
    });

    describe("searchAndChoose", () => {
        const matches = (paths: string[]): LocateResult => ({
            kind: "matches",
            paths,
            readFailures: [],
        });
        const locate = (search: () => Promise<LocateResult>): SearchPrompt<LocateResult> => ({
            id: "locate",
            searchingPlaceholder: "Searching…",
            search,
            choices: (outcome) =>
                outcome.kind === "matches" && outcome.paths.length > 1
                    ? {
                          id: "locatedFile",
                          title: "Open model",
                          placeholder: "Select the file to open",
                          items: outcome.paths.map((path) => ({
                              label: path.split("/").pop() ?? path,
                              path,
                              value: path,
                          })),
                      }
                    : undefined,
        });

        it("returns the untouched outcome and the chosen value when the outcome leaves a choice", async () => {
            pickBehavior = { action: "accept", index: 1 };
            const outcome = matches(["/repo/lib/a.bpmn", "/repo/src/b.bpmn"]);

            const result = await new VsCodePicker(stubWorkspace()).searchAndChoose(
                locate(async () => outcome),
            );

            expect(result.outcome).toBe(outcome);
            expect(result.chosen).toBe("/repo/src/b.bpmn");
        });

        it("reveals the choice the outcome leaves, in the prompt's order", async () => {
            pickBehavior = { action: "accept", index: 0 };

            await new VsCodePicker(stubWorkspace()).searchAndChoose(
                locate(async () => matches(["/repo/src/z.bpmn", "/repo/lib/a.bpmn"])),
            );

            const qp = lastQuickPick();
            expect(qp.show).toHaveBeenCalled();
            expect(qp.busy).toBe(false);
            expect(qp.title).toBe("Open model");
            expect(qp.placeholder).toBe("Select the file to open");
            expect(qp.matchOnDescription).toBe(true);
            expect(qp.items.map(({ label, description }) => ({ label, description }))).toEqual([
                { label: "z.bpmn", description: "repo/src/z.bpmn" },
                { label: "a.bpmn", description: "repo/lib/a.bpmn" },
            ]);
            expect(qp.dispose).toHaveBeenCalled();
        });

        it("resolves chosen=undefined when the user dismisses the list", async () => {
            pickBehavior = { action: "hide" };

            const result = await new VsCodePicker(stubWorkspace()).searchAndChoose(
                locate(async () => matches(["/a.bpmn", "/b.bpmn"])),
            );

            expect(result.chosen).toBeUndefined();
            expect(lastQuickPick().dispose).toHaveBeenCalled();
        });

        it("never opens a list when the outcome leaves no choice", async () => {
            const result = await new VsCodePicker(stubWorkspace()).searchAndChoose(
                locate(async () => matches(["/a.bpmn"])),
            );

            const qp = lastQuickPick();
            expect(result.chosen).toBeUndefined();
            expect(qp.items).toEqual([]);
            expect(qp.hide).toHaveBeenCalled();
            expect(qp.dispose).toHaveBeenCalled();
        });

        it("reveals a busy list only after ~150 ms while the search runs", async () => {
            vi.useFakeTimers();
            let finishSearch!: (outcome: LocateResult) => void;
            const pending = new VsCodePicker(stubWorkspace()).searchAndChoose(
                locate(() => new Promise<LocateResult>((resolve) => (finishSearch = resolve))),
            );
            const qp = lastQuickPick();

            await vi.advanceTimersByTimeAsync(149);
            expect(qp.show).not.toHaveBeenCalled();

            await vi.advanceTimersByTimeAsync(1);
            expect(qp.show).toHaveBeenCalled();
            expect(qp.busy).toBe(true);
            expect(qp.placeholder).toBe("Searching…");

            finishSearch(matches(["/a.bpmn"]));
            await pending;
            expect(qp.hide).toHaveBeenCalled();
        });

        it("does not flash the list when the search finishes before the reveal delay", async () => {
            vi.useFakeTimers();

            await new VsCodePicker(stubWorkspace()).searchAndChoose(
                locate(async () => matches(["/a.bpmn"])),
            );

            expect(lastQuickPick().show).not.toHaveBeenCalled();
            expect(lastQuickPick().dispose).toHaveBeenCalled();
        });

        it("disposes the list and reveals nothing when the search fails", async () => {
            vi.useFakeTimers();

            await expect(
                new VsCodePicker(stubWorkspace()).searchAndChoose(
                    locate(async () => {
                        throw new Error("scan failed");
                    }),
                ),
            ).rejects.toThrow("scan failed");
            await vi.advanceTimersByTimeAsync(150);

            expect(lastQuickPick().show).not.toHaveBeenCalled();
            expect(lastQuickPick().dispose).toHaveBeenCalled();
        });
    });
});
