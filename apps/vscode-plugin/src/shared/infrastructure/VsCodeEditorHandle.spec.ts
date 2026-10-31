import { beforeEach, describe, expect, it, vi } from "vitest";

const applyEditMock = vi.fn();

// `workspace.fs.isWritableFileSystem` decides whether a non-`file:` document may
// be edited: `true` for a writable provider, `false` for a read-only one,
// `undefined` when VS Code knows no provider for the scheme.
const isWritableFileSystemMock = vi.fn<(scheme: string) => boolean | undefined>();

// `WorkspaceEdit.replace` is the only method the subject calls; capturing the
// args lets us assert the edit targets the full document range.
const replaceMock = vi.fn();

interface FakeTab {
    input: unknown;
    isActive: boolean;
}

// The editor tabs of one group; `isActive` marks the tab the group shows.
const editorTabs = vi.hoisted(() => ({
    tabs: [] as FakeTab[],
    tabListeners: new Set<() => void>(),
    groupListeners: new Set<() => void>(),
}));

vi.mock("vscode", () => ({
    window: {
        tabGroups: {
            get all() {
                return [{ tabs: editorTabs.tabs }];
            },
            onDidChangeTabs: (listener: () => void) => {
                editorTabs.tabListeners.add(listener);
                return { dispose: () => editorTabs.tabListeners.delete(listener) };
            },
            onDidChangeTabGroups: (listener: () => void) => {
                editorTabs.groupListeners.add(listener);
                return { dispose: () => editorTabs.groupListeners.delete(listener) };
            },
        },
    },
    TabInputCustom: class {
        constructor(
            readonly uri: { toString: () => string },
            readonly viewType: string,
        ) {}
    },
    workspace: {
        applyEdit: (...args: unknown[]) => applyEditMock(...args),
        fs: { isWritableFileSystem: (scheme: string) => isWritableFileSystemMock(scheme) },
        onDidChangeTextDocument: vi.fn(() => ({ dispose: vi.fn() })),
        onDidChangeConfiguration: vi.fn(),
    },
    WorkspaceEdit: class {
        replace = replaceMock;
    },
    // Constructor stub records the range corners so the spec can verify the
    // edit spans line 0 through the document's last line.
    Range: class {
        constructor(
            readonly startLine: number,
            readonly startChar: number,
            readonly endLine: number,
            readonly endChar: number,
        ) {}
    },
}));

// `create` delegates HTML bootstrapping to this module and stores whatever
// panel it returns; returning the fake panel lets us drive panel state.
let nextPanel: unknown;
vi.mock("./bootstrapWebview", () => ({
    bootstrapWebview: vi.fn(() => nextPanel),
}));

import { TabInputCustom, workspace } from "vscode";

import { EditorSessionStore, SettingChange } from "@miragon/bpmn-modeler-core";

import { bootstrapWebview } from "./bootstrapWebview";
import { VsCodeEditorHandle } from "./VsCodeEditorHandle";

interface FakePanel {
    options: { retainContextWhenHidden: boolean };
    visible: boolean;
    active: boolean;
    webview: { postMessage: ReturnType<typeof vi.fn> };
    dispose: ReturnType<typeof vi.fn>;
    onDidChangeViewState: ReturnType<typeof vi.fn>;
    onDidDispose: ReturnType<typeof vi.fn>;
}

function makePanel(overrides: Partial<FakePanel> = {}): FakePanel {
    return {
        options: { retainContextWhenHidden: false },
        visible: true,
        active: false,
        webview: { postMessage: vi.fn().mockResolvedValue(true) },
        dispose: vi.fn(),
        onDidChangeViewState: vi.fn(() => ({ dispose: vi.fn() })),
        onDidDispose: vi.fn(() => ({ dispose: vi.fn() })),
        ...overrides,
    };
}

function editorTab(documentUri: string, isActive: boolean, viewType = "bpmn"): FakeTab {
    return {
        input: new TabInputCustom({ toString: () => documentUri } as never, viewType),
        isActive,
    };
}

function showTabs(...tabs: FakeTab[]): void {
    editorTabs.tabs = tabs;
}

function changeTabs(...tabs: FakeTab[]): void {
    showTabs(...tabs);
    editorTabs.tabListeners.forEach((listener) => listener());
}

interface FakeDocument {
    uri: {
        scheme: string;
        authority?: string;
        path: string;
        fsPath: string;
        toString: () => string;
    };
    getText: () => string;
    lineCount: number;
    isDirty: boolean;
    save: ReturnType<typeof vi.fn>;
}

function makeDocument(overrides: Partial<FakeDocument> = {}): FakeDocument {
    const scheme = overrides.uri?.scheme ?? "file";
    return {
        uri: {
            scheme,
            path: "/a.bpmn",
            fsPath: "/a.bpmn",
            toString: () => `${scheme}:/a.bpmn`,
        },
        getText: () => "<old/>",
        lineCount: 3,
        isDirty: false,
        save: vi.fn().mockResolvedValue(true),
        ...overrides,
    };
}

/**
 * Builds a handle via the real `create` factory while injecting the fake panel
 * the mocked `bootstrapWebview` hands back. Casting to `never` only at the
 * `create` boundary keeps the doubles' inferred types available to assertions.
 */
function createHandle(panel: FakePanel, document: FakeDocument): VsCodeEditorHandle {
    nextPanel = panel;
    return VsCodeEditorHandle.create("bpmn", "editor-1", panel as never, document as never);
}

beforeEach(() => {
    vi.clearAllMocks();
    editorTabs.tabs = [];
    editorTabs.tabListeners.clear();
    editorTabs.groupListeners.clear();
});

function makeSchemeDocument(scheme: string, overrides: Partial<FakeDocument> = {}): FakeDocument {
    return makeDocument({
        uri: { scheme, path: "/a.bpmn", fsPath: "/a.bpmn", toString: () => `${scheme}:/a.bpmn` },
        ...overrides,
    });
}

describe("VsCodeEditorHandle.writeContent", () => {
    it("throws for a read-only file system (git:) without issuing an edit", async () => {
        isWritableFileSystemMock.mockReturnValue(false);
        const handle = createHandle(makePanel(), makeSchemeDocument("git"));

        await expect(handle.writeContent("<new/>")).rejects.toThrow(/git/);
        expect(isWritableFileSystemMock).toHaveBeenCalledWith("git");
        expect(applyEditMock).not.toHaveBeenCalled();
    });

    it("throws for a scheme VS Code knows no file system for (untitled:)", async () => {
        isWritableFileSystemMock.mockReturnValue(undefined);
        const handle = createHandle(makePanel(), makeSchemeDocument("untitled"));

        await expect(handle.writeContent("<new/>")).rejects.toThrow(/untitled/);
        expect(applyEditMock).not.toHaveBeenCalled();
    });

    it("applies an edit to a document on a writable custom file system (a collaborative provider)", async () => {
        isWritableFileSystemMock.mockReturnValue(true);
        applyEditMock.mockResolvedValue(true);
        const document = makeSchemeDocument("bpm-live", { getText: () => "<old/>", lineCount: 3 });
        const handle = createHandle(makePanel(), document);

        const result = await handle.writeContent("<new/>");

        expect(result).toBe(true);
        expect(isWritableFileSystemMock).toHaveBeenCalledWith("bpm-live");
        expect(replaceMock).toHaveBeenCalledWith(
            document.uri,
            expect.objectContaining({ startLine: 0, startChar: 0, endLine: 3, endChar: 0 }),
            "<new/>",
        );
    });

    it("never consults the file-system registry for a file: document", async () => {
        applyEditMock.mockResolvedValue(true);
        const handle = createHandle(makePanel(), makeDocument());

        await handle.writeContent("<new/>");

        expect(isWritableFileSystemMock).not.toHaveBeenCalled();
    });

    it("returns false without an edit when content is unchanged", async () => {
        const document = makeDocument({ getText: () => "<same/>" });
        const handle = createHandle(makePanel(), document);

        const result = await handle.writeContent("<same/>");

        expect(result).toBe(false);
        expect(applyEditMock).not.toHaveBeenCalled();
    });

    it("applies an edit over the full document range and returns the applyEdit result", async () => {
        applyEditMock.mockResolvedValue(true);
        const document = makeDocument({ getText: () => "<old/>", lineCount: 3 });
        const handle = createHandle(makePanel(), document);

        const result = await handle.writeContent("<new/>");

        expect(result).toBe(true);
        expect(applyEditMock).toHaveBeenCalledTimes(1);
        expect(replaceMock).toHaveBeenCalledWith(
            document.uri,
            expect.objectContaining({ startLine: 0, startChar: 0, endLine: 3, endChar: 0 }),
            "<new/>",
        );
    });
});

describe("VsCodeEditorHandle.save", () => {
    it("throws for a scheme without a writable file system (untitled:)", async () => {
        isWritableFileSystemMock.mockReturnValue(undefined);
        const document = makeSchemeDocument("untitled");
        const handle = createHandle(makePanel(), document);

        await expect(handle.save()).rejects.toThrow(/untitled/);
        expect(document.save).not.toHaveBeenCalled();
    });

    it("delegates to document.save on a writable custom file system", async () => {
        isWritableFileSystemMock.mockReturnValue(true);
        const document = makeSchemeDocument("bpm-live");
        const handle = createHandle(makePanel(), document);

        expect(await handle.save()).toBe(true);
        expect(document.save).toHaveBeenCalledTimes(1);
    });

    it("delegates to document.save for a file scheme", async () => {
        const document = makeDocument();
        const handle = createHandle(makePanel(), document);

        const result = await handle.save();

        expect(result).toBe(true);
        expect(document.save).toHaveBeenCalledTimes(1);
    });

    it("reports a clean document as saved when VS Code refuses to save it (read-only)", async () => {
        const document = makeDocument({ isDirty: false, save: vi.fn().mockResolvedValue(false) });
        const handle = createHandle(makePanel(), document);

        expect(await handle.save()).toBe(true);
    });

    it("reports a document that stays dirty after the save as not saved", async () => {
        const document = makeDocument({ isDirty: true, save: vi.fn().mockResolvedValue(false) });
        const handle = createHandle(makePanel(), document);

        expect(await handle.save()).toBe(false);
    });
});

describe("VsCodeEditorHandle.reload", () => {
    it("re-bootstraps the same panel with the session's viewType and visibility", () => {
        const panel = makePanel();
        // Session opened with viewType "bpmn" and the default visibility (true);
        // reload must rebuild the exact same HTML in place.
        const handle = createHandle(panel, makeDocument());
        vi.mocked(bootstrapWebview).mockClear();

        handle.reload();

        expect(bootstrapWebview).toHaveBeenCalledWith("bpmn", panel, true);
    });
});

describe("VsCodeEditorHandle.postMessage", () => {
    const message = { type: "x" } as never;

    it("throws the exact hidden-editor message when hidden and not retained", async () => {
        const panel = makePanel({ options: { retainContextWhenHidden: false }, visible: false });
        const handle = createHandle(panel, makeDocument());

        // Replay logic downstream string-matches this exact text; keep verbatim.
        await expect(handle.postMessage(message)).rejects.toThrow("The active editor is hidden.");
        expect(panel.webview.postMessage).not.toHaveBeenCalled();
    });

    it("posts when hidden but context is retained", async () => {
        const panel = makePanel({ options: { retainContextWhenHidden: true }, visible: false });
        const handle = createHandle(panel, makeDocument());

        const result = await handle.postMessage(message);

        expect(result).toBe(true);
        expect(panel.webview.postMessage).toHaveBeenCalledWith(message);
    });

    it("throws the webview-failure message when postMessage returns false", async () => {
        const panel = makePanel();
        panel.webview.postMessage.mockResolvedValue(false);
        const handle = createHandle(panel, makeDocument());

        await expect(handle.postMessage(message)).rejects.toThrow(
            "Failed to send message to the webview.",
        );
    });
});

describe("VsCodeEditorHandle.documentPath", () => {
    it("lowercases a Windows drive letter so it matches workspace-root paths", () => {
        const document = makeDocument({
            uri: {
                scheme: "file",
                path: "/C:/ws/order.bpmn",
                fsPath: "C:\\ws\\order.bpmn",
                toString: () => "file:///c%3A/ws/order.bpmn",
            },
        });

        expect(createHandle(makePanel(), document).documentPath()).toBe("/c:/ws/order.bpmn");
    });

    it("keeps the server of a document on a UNC share", () => {
        const document = makeDocument({
            uri: {
                scheme: "file",
                authority: "server",
                path: "/share/ws/order.bpmn",
                fsPath: "\\\\server\\share\\ws\\order.bpmn",
                toString: () => "file://server/share/ws/order.bpmn",
            },
        });

        expect(createHandle(makePanel(), document).documentPath()).toBe(
            "//server/share/ws/order.bpmn",
        );
    });
});

describe("VsCodeEditorHandle.dispose", () => {
    it("disposes the panel and every subscription only once", () => {
        const panel = makePanel();
        const subscription = { dispose: vi.fn() };
        const handle = createHandle(panel, makeDocument());
        handle.addSubscription(subscription);

        handle.dispose();
        handle.dispose();

        expect(panel.dispose).toHaveBeenCalledOnce();
        expect(subscription.dispose).toHaveBeenCalledOnce();
    });
});

describe("VsCodeEditorHandle.isActive", () => {
    it.each([
        { state: "active and visible", active: true, visible: true, reported: "active" },
        { state: "active but hidden", active: true, visible: false, reported: "not active" },
        { state: "visible but inactive", active: false, visible: true, reported: "not active" },
        { state: "inactive and hidden", active: false, visible: false, reported: "not active" },
    ])("reports a panel that is $state as $reported", ({ active, visible, reported }) => {
        const handle = createHandle(makePanel({ active, visible }), makeDocument());

        expect(handle.isActive()).toBe(reported === "active");
    });

    // Theia creates every panel active and visible and may never correct that
    // for a restored background tab.
    it("reports an active, visible panel as not active while its group shows another tab", () => {
        showTabs(editorTab("file:///repo/1.bpmn", true), editorTab("file:/a.bpmn", false));
        const handle = createHandle(makePanel({ active: true, visible: true }), makeDocument());

        expect(handle.isActive()).toBe(false);
    });

    it("reports an active, visible panel as active while its group shows its tab", () => {
        showTabs(editorTab("file:///repo/1.bpmn", false), editorTab("file:/a.bpmn", true));
        const handle = createHandle(makePanel({ active: true, visible: true }), makeDocument());

        expect(handle.isActive()).toBe(true);
    });

    it("ignores a hidden tab of another editor type on the same document", () => {
        showTabs(editorTab("file:/a.bpmn", false, "bpmn-modeler.dmn"));
        const handle = createHandle(makePanel({ active: true, visible: true }), makeDocument());

        expect(handle.isActive()).toBe(true);
    });
});

describe("VsCodeEditorHandle.onDidChangeActive", () => {
    function viewStateListener(panel: FakePanel): () => void {
        return panel.onDidChangeViewState.mock.calls[0][0] as () => void;
    }

    it("reports the panel's focus state on every view-state change", () => {
        const panel = makePanel();
        const activeChanged = vi.fn();
        createHandle(panel, makeDocument()).onDidChangeActive(activeChanged);

        panel.active = false;
        viewStateListener(panel)();
        panel.active = true;
        viewStateListener(panel)();

        expect(activeChanged.mock.calls).toEqual([[false], [true]]);
    });

    it("reports a panel that stays active but turns hidden as blurred", () => {
        const panel = makePanel({ active: true, visible: true });
        const activeChanged = vi.fn();
        createHandle(panel, makeDocument()).onDidChangeActive(activeChanged);

        panel.visible = false;
        viewStateListener(panel)();

        expect(activeChanged.mock.calls).toEqual([[false]]);
    });

    it("reports the panel's focus state when its group starts or stops showing its tab", () => {
        showTabs(editorTab("file:/a.bpmn", true));
        const activeChanged = vi.fn();
        createHandle(makePanel({ active: true, visible: true }), makeDocument()).onDidChangeActive(
            activeChanged,
        );

        changeTabs(editorTab("file:/a.bpmn", false), editorTab("file:///repo/1.bpmn", true));
        changeTabs(editorTab("file:/a.bpmn", true), editorTab("file:///repo/1.bpmn", false));

        expect(activeChanged.mock.calls).toEqual([[false], [true]]);
    });

    it("stays silent on a tab change that leaves the panel's focus state alone", () => {
        showTabs(editorTab("file:/a.bpmn", true));
        const activeChanged = vi.fn();
        createHandle(makePanel({ active: true, visible: true }), makeDocument()).onDidChangeActive(
            activeChanged,
        );

        changeTabs(editorTab("file:/a.bpmn", true), editorTab("file:///repo/1.bpmn", false));

        expect(activeChanged).not.toHaveBeenCalled();
    });

    it("stops listening to tab changes once its panel is disposed", () => {
        const panel = makePanel({ active: true, visible: true });
        createHandle(panel, makeDocument()).onDidChangeActive(vi.fn());

        const panelDisposed = panel.onDidDispose.mock.calls[0][0] as () => void;
        panelDisposed();

        expect(editorTabs.tabListeners.size).toBe(0);
        expect(editorTabs.groupListeners.size).toBe(0);
    });

    it("stops listening to tab changes once the subscription is disposed", () => {
        const subscription = createHandle(makePanel(), makeDocument()).onDidChangeActive(vi.fn());

        subscription.dispose();

        expect(editorTabs.tabListeners.size).toBe(0);
        expect(editorTabs.groupListeners.size).toBe(0);
    });

    // Theia creates every panel active and visible, then reports a restored
    // background tab as its active widget while the tab stays hidden.
    it("hands the command target back to the visible diagram when a hidden tab reports active", () => {
        const store = new EditorSessionStore(() => undefined);
        const visiblePanel = makePanel({ active: true, visible: true });
        const hiddenPanel = makePanel({ active: true, visible: true });
        store.register(createSessionHandle("file:///repo/1.bpmn", visiblePanel));
        store.subscribeToTabChangeEvent("file:///repo/1.bpmn");
        store.register(createSessionHandle("file:///repo/3.bpmn", hiddenPanel));
        store.subscribeToTabChangeEvent("file:///repo/3.bpmn");

        hiddenPanel.visible = false;
        viewStateListener(hiddenPanel)();

        expect(store.getActiveEditorId()).toBe("file:///repo/1.bpmn");
        expect(store.isFocused("file:///repo/3.bpmn")).toBe(false);
    });

    describe("after a restart of the standalone app, with 1.bpmn shown and 3.bpmn behind it", () => {
        const shown = "file:///repo/1.bpmn";
        const behind = "file:///repo/3.bpmn";

        // Theia creates every panel active and visible, whatever tab it restores.
        function restore(store: EditorSessionStore): {
            shownPanel: FakePanel;
            behindPanel: FakePanel;
        } {
            const shownPanel = makePanel({ active: true, visible: true });
            const behindPanel = makePanel({ active: true, visible: true });
            store.register(createSessionHandle(shown, shownPanel));
            store.subscribeToTabChangeEvent(shown);
            store.register(createSessionHandle(behind, behindPanel));
            store.subscribeToTabChangeEvent(behind);
            return { shownPanel, behindPanel };
        }

        it("keeps the command target on 1.bpmn when Theia reports no view state", () => {
            showTabs(editorTab(shown, true), editorTab(behind, false));
            const store = new EditorSessionStore(() => undefined);
            restore(store);

            expect(store.getActiveEditorId()).toBe(shown);
            expect(store.getFocusedEditorId()).toBe(shown);
        });

        it("keeps the command target on 1.bpmn when it blurs before 3.bpmn reports hidden", () => {
            showTabs(editorTab(shown, true), editorTab(behind, false));
            const store = new EditorSessionStore(() => undefined);
            const { shownPanel, behindPanel } = restore(store);

            shownPanel.active = false;
            viewStateListener(shownPanel)();
            behindPanel.visible = false;
            viewStateListener(behindPanel)();

            expect(store.getActiveEditorId()).toBe(shown);
        });

        it("hands the command target to 1.bpmn once the tab model arrives", () => {
            const store = new EditorSessionStore(() => undefined);
            restore(store);

            showTabs(editorTab(shown, true), editorTab(behind, false));
            editorTabs.groupListeners.forEach((listener) => listener());

            expect(store.getActiveEditorId()).toBe(shown);
            expect(store.isFocused(behind)).toBe(false);
        });

        it("hands the command target to 3.bpmn once the user shows its tab", () => {
            showTabs(editorTab(shown, true), editorTab(behind, false));
            const store = new EditorSessionStore(() => undefined);
            restore(store);

            changeTabs(editorTab(shown, false), editorTab(behind, true));

            expect(store.getActiveEditorId()).toBe(behind);
            expect(store.getFocusedEditorId()).toBe(behind);
        });
    });

    function createSessionHandle(editorId: string, panel: FakePanel): VsCodeEditorHandle {
        nextPanel = panel;
        const document = makeDocument({
            uri: { scheme: "file", path: editorId, fsPath: editorId, toString: () => editorId },
        });
        return VsCodeEditorHandle.create("bpmn", editorId, panel as never, document as never);
    }
});

describe("VsCodeEditorHandle.onDidChangeDocument", () => {
    function emitTextDocumentChange(
        contentChanges: unknown[],
        uri: object = { path: "/ws/other.bpmn", toString: () => "file:///ws/other.bpmn" },
    ) {
        const listener = vi.mocked(workspace.onDidChangeTextDocument).mock.calls[0][0] as (
            event: unknown,
        ) => void;
        listener({ contentChanges, document: { uri } });
    }

    it("reports which document changed and whether its content did", () => {
        const received = vi.fn();
        createHandle(makePanel(), makeDocument()).onDidChangeDocument(received);

        emitTextDocumentChange([{ text: "x" }]);
        emitTextDocumentChange([]);

        const [edit, saveOnly] = received.mock.calls.map(([event]) => event);
        expect(edit.documentUriString()).toBe("file:///ws/other.bpmn");
        expect(edit.documentPath()).toBe("/ws/other.bpmn");
        expect(edit.hasContentChanges()).toBe(true);
        expect(saveOnly.hasContentChanges()).toBe(false);
    });

    it("keeps the server in the path of a changed document on a UNC share", () => {
        const received = vi.fn();
        createHandle(makePanel(), makeDocument()).onDidChangeDocument(received);

        emitTextDocumentChange([{ text: "x" }], {
            scheme: "file",
            authority: "server",
            path: "/share/ws/other.bpmn",
            toString: () => "file://server/share/ws/other.bpmn",
        });

        expect(received.mock.calls[0][0].documentPath()).toBe("//server/share/ws/other.bpmn");
    });
});

describe("VsCodeEditorHandle.onDidChangeSetting", () => {
    it("looks a setting key up below the miragon.bpmnModeler section", () => {
        const received = vi.fn<(change: SettingChange) => void>();
        createHandle(makePanel(), makeDocument()).onDidChangeSetting(received);
        const listener = vi.mocked(workspace.onDidChangeConfiguration).mock.calls[0][0] as (
            event: unknown,
        ) => void;

        listener({
            affectsConfiguration: (section: string) =>
                section === "miragon.bpmnModeler.scripting.spin",
        });

        const [[change]] = received.mock.calls;
        expect(change.affects("scripting.spin")).toBe(true);
        expect(change.affects("language")).toBe(false);
    });
});
