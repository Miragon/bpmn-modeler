import { beforeEach, describe, expect, it, vi } from "vitest";

const showQuickPickMock = vi.fn();
const showWarningMessageMock = vi.fn();
const asRelativePathMock = vi.fn();

interface FakeQuickPickItem {
    label: string;
    description?: string;
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

import { ChoicePrompt, LocateResult, SearchPrompt } from "@miragon/bpmn-modeler-core";

import { VsCodePicker } from "./VsCodePicker";

interface ShownItem {
    label: string;
    description?: string;
}

function acceptQuickPickItemStartingWith(labelPrefix: string): void {
    showQuickPickMock.mockImplementation(async (items: ShownItem[]) =>
        items.find((item) => item.label.startsWith(labelPrefix)),
    );
}

function dismissQuickPick(): void {
    showQuickPickMock.mockResolvedValue(undefined);
}

function shownItems(): ShownItem[] {
    return showQuickPickMock.mock.calls[0][0];
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

            await new VsCodePicker().choose(engines);

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

            await new VsCodePicker().choose({
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

            await new VsCodePicker().choose({
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

            const chosen = await new VsCodePicker().choose({
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

            await expect(new VsCodePicker().choose(engines)).resolves.toBeUndefined();
        });
    });

    describe("chooseMany", () => {
        it("lets the user choose several items and returns their values", async () => {
            showQuickPickMock.mockImplementation(async (items: ShownItem[]) => [
                items[0],
                items[2],
            ]);

            const chosen = await new VsCodePicker().chooseMany(forms);

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

            await expect(new VsCodePicker().chooseMany(forms)).resolves.toEqual([]);
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
            const picker = new VsCodePicker();

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

            await new VsCodePicker().confirm(request(details));

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

            const result = await new VsCodePicker().searchAndChoose(locate(async () => outcome));

            expect(result.outcome).toBe(outcome);
            expect(result.chosen).toBe("/repo/src/b.bpmn");
        });

        it("reveals the choice the outcome leaves, in the prompt's order", async () => {
            pickBehavior = { action: "accept", index: 0 };

            await new VsCodePicker().searchAndChoose(
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

            const result = await new VsCodePicker().searchAndChoose(
                locate(async () => matches(["/a.bpmn", "/b.bpmn"])),
            );

            expect(result.chosen).toBeUndefined();
            expect(lastQuickPick().dispose).toHaveBeenCalled();
        });

        it("never opens a list when the outcome leaves no choice", async () => {
            const result = await new VsCodePicker().searchAndChoose(
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
            const pending = new VsCodePicker().searchAndChoose(
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

            await new VsCodePicker().searchAndChoose(locate(async () => matches(["/a.bpmn"])));

            expect(lastQuickPick().show).not.toHaveBeenCalled();
            expect(lastQuickPick().dispose).toHaveBeenCalled();
        });

        it("disposes the list and reveals nothing when the search fails", async () => {
            vi.useFakeTimers();

            await expect(
                new VsCodePicker().searchAndChoose(
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
