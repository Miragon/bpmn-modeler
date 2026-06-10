import { beforeEach, describe, expect, it, vi } from "vitest";

import { ScriptKind, UpdateScriptContentQuery } from "@miragon/bpmn-modeler-shared";

// `ScriptTaskService` reaches into vscode directly (`Uri`, `languages`,
// `window`, `workspace`, `ViewColumn`, `TabInputText`), so the factory must
// supply runtime surface, not just types. The hoisted-spy pattern lets the
// (hoisted) `vi.mock` factory close over these consts while keeping them
// assertable in tests.
const onDidChangeTextDocumentMock = vi.fn();
const onDidChangeTabsMock = vi.fn();
const openTextDocumentMock = vi.fn();
const showTextDocumentMock = vi.fn();
const setTextDocumentLanguageMock = vi.fn();
const closeTabMock = vi.fn();

// `window.tabGroups.all` is reassigned per-test to stage which tabs are open;
// the factory reads through the live binding so updates are visible to the
// subject without re-mocking.
let openTabGroups: { tabs: { input: unknown }[] }[] = [];

vi.mock("vscode", () => {
    // Real class so the subject's `instanceof TabInputText` narrowing works.
    class TabInputText {
        constructor(readonly uri: unknown) {}
    }
    return {
        TabInputText,
        ViewColumn: { Beside: 2 },
        // Mirrors the real `Uri.parse` round-trip: `.path` is the
        // `openDocuments` map key, `.toString()` matches against tab inputs
        // in `isUriOpenInAnyTab`.
        Uri: {
            parse: (value: string) => ({
                scheme: "bpmn-script",
                path: value.replace(/^bpmn-script:/, ""),
                toString: () => value,
            }),
        },
        languages: {
            setTextDocumentLanguage: (...args: unknown[]) => setTextDocumentLanguageMock(...args),
        },
        workspace: {
            openTextDocument: (...args: unknown[]) => openTextDocumentMock(...args),
            onDidChangeTextDocument: (...args: unknown[]) => onDidChangeTextDocumentMock(...args),
        },
        window: {
            showTextDocument: (...args: unknown[]) => showTextDocumentMock(...args),
            tabGroups: {
                get all() {
                    return openTabGroups;
                },
                close: (...args: unknown[]) => closeTabMock(...args),
                onDidChangeTabs: (...args: unknown[]) => onDidChangeTabsMock(...args),
            },
        },
    };
});

import { TabInputText, Uri } from "vscode";

import { ScriptTaskService } from "./ScriptTaskService";
import { ScriptLanguage } from "@miragon/bpmn-modeler-core";
import { ScriptUri } from "@miragon/bpmn-modeler-core";

const EDITOR_ID = "file:///repo/process.bpmn";
const ELEMENT_ID = "Task_1";
const KIND: ScriptKind = "script-task";

/** The URI string production builds for the canonical script-task fixture. */
function scriptUriString(format = "javascript"): string {
    return new ScriptUri(
        EDITOR_ID,
        ELEMENT_ID,
        KIND,
        undefined,
        undefined,
        new ScriptLanguage(format).extension,
    ).toString();
}

/** A closed/open tab carrying a `bpmn-script` URI, matching what VS Code emits. */
function makeTab(uriString: string): { input: TabInputText } {
    return { input: new TabInputText(Uri.parse(uriString)) };
}

/** Stages which script tabs VS Code reports as currently open. */
function setOpenTabs(uriStrings: string[]): void {
    openTabGroups = [{ tabs: uriStrings.map(makeTab) }];
}

/**
 * Builds the subject with port doubles, registers it, and captures the two
 * listener callbacks the subject hands to vscode so tests can fire document
 * and tab events directly.
 */
function createService() {
    const editorStore = { postMessage: vi.fn().mockResolvedValue(true) };
    const scriptFs = { writeFile: vi.fn(), readFile: vi.fn(), deleteByPrefix: vi.fn() };
    const notifier = { logError: vi.fn() };
    const picker = { pickScriptLanguage: vi.fn() };

    openTextDocumentMock.mockResolvedValue({});
    showTextDocumentMock.mockResolvedValue(undefined);
    setTextDocumentLanguageMock.mockResolvedValue(undefined);

    const service = new ScriptTaskService(
        editorStore as never,
        scriptFs as never,
        notifier as never,
        picker as never,
    );
    service.register({ subscriptions: [] } as never);

    const fireDocChange = onDidChangeTextDocumentMock.mock.calls[0][0] as (
        event: unknown,
    ) => unknown;
    const fireTabsChange = onDidChangeTabsMock.mock.calls[0][0] as (event: unknown) => unknown;

    return { service, editorStore, scriptFs, notifier, picker, fireDocChange, fireTabsChange };
}

/** Builds a doc-change event for the given tracked URI and new buffer text. */
function docChangeEvent(uriString: string, text: string) {
    return {
        document: { uri: Uri.parse(uriString), getText: () => text },
        contentChanges: [{}],
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    openTabGroups = [];
});

describe("ScriptTaskService.openScriptEditor", () => {
    it("writes content and reveals the editor for a supported format → new script", async () => {
        const { service, scriptFs } = createService();

        await service.openScriptEditor(
            EDITOR_ID,
            ELEMENT_ID,
            KIND,
            undefined,
            undefined,
            "javascript",
            "console.log(1)",
        );

        const expectedUri = Uri.parse(scriptUriString());
        expect(scriptFs.writeFile).toHaveBeenCalledTimes(1);
        const [writtenUri, writtenBytes] = scriptFs.writeFile.mock.calls[0];
        expect((writtenUri as { path: string }).path).toBe(expectedUri.path);
        expect(new TextDecoder().decode(writtenBytes as Uint8Array)).toBe("console.log(1)");
        expect(setTextDocumentLanguageMock).toHaveBeenCalledWith(expect.anything(), "javascript");
        expect(showTextDocumentMock).toHaveBeenCalledWith(expect.anything(), 2, true);
    });

    it("returns silently when the format is unsupported and the user cancels the picker", async () => {
        const { service, scriptFs, editorStore, picker } = createService();
        picker.pickScriptLanguage.mockResolvedValue(undefined);

        await service.openScriptEditor(
            EDITOR_ID,
            ELEMENT_ID,
            KIND,
            undefined,
            undefined,
            "cobol",
            "x",
        );

        expect(picker.pickScriptLanguage).toHaveBeenCalledWith("cobol");
        expect(scriptFs.writeFile).not.toHaveBeenCalled();
        expect(editorStore.postMessage).not.toHaveBeenCalled();
    });

    it("persists the picked format then opens with its extension when the format is unsupported", async () => {
        const { service, scriptFs, editorStore, picker } = createService();
        picker.pickScriptLanguage.mockResolvedValue("groovy");

        await service.openScriptEditor(
            EDITOR_ID,
            ELEMENT_ID,
            KIND,
            undefined,
            undefined,
            "cobol",
            "x",
        );

        expect(editorStore.postMessage).toHaveBeenCalledWith(
            EDITOR_ID,
            expect.objectContaining({ type: "UpdateScriptFormatQuery", scriptFormat: "groovy" }),
        );
        const [writtenUri] = scriptFs.writeFile.mock.calls[0];
        expect((writtenUri as { path: string }).path).toBe(
            Uri.parse(scriptUriString("groovy")).path,
        );
    });

    it("reveals without rewriting when the same script is already open", async () => {
        const { service, scriptFs } = createService();

        await service.openScriptEditor(
            EDITOR_ID,
            ELEMENT_ID,
            KIND,
            undefined,
            undefined,
            "javascript",
            "a",
        );
        await service.openScriptEditor(
            EDITOR_ID,
            ELEMENT_ID,
            KIND,
            undefined,
            undefined,
            "javascript",
            "a",
        );

        expect(scriptFs.writeFile).toHaveBeenCalledTimes(1);
        expect(openTextDocumentMock).toHaveBeenCalledTimes(2);
        expect(showTextDocumentMock).toHaveBeenCalledTimes(2);
    });
});

describe("ScriptTaskService.onVirtualDocumentChanged", () => {
    it("ignores documents that are not in the bpmn-script scheme", async () => {
        const { fireDocChange, scriptFs, editorStore } = createService();

        await fireDocChange({
            document: { uri: { scheme: "file", path: "/x.js" }, getText: () => "y" },
            contentChanges: [{}],
        });

        expect(scriptFs.writeFile).not.toHaveBeenCalled();
        expect(editorStore.postMessage).not.toHaveBeenCalled();
    });

    it("ignores events with no content changes", async () => {
        const { service, fireDocChange, scriptFs, editorStore } = createService();
        await service.openScriptEditor(
            EDITOR_ID,
            ELEMENT_ID,
            KIND,
            undefined,
            undefined,
            "javascript",
            "a",
        );
        scriptFs.writeFile.mockClear();

        await fireDocChange({
            document: { uri: Uri.parse(scriptUriString()), getText: () => "next" },
            contentChanges: [],
        });

        expect(scriptFs.writeFile).not.toHaveBeenCalled();
        expect(editorStore.postMessage).not.toHaveBeenCalled();
    });

    it("skips the echo of our own write while the path is in the writing guard", async () => {
        const { service, fireDocChange, scriptFs, editorStore } = createService();
        await service.openScriptEditor(
            EDITOR_ID,
            ELEMENT_ID,
            KIND,
            undefined,
            undefined,
            "javascript",
            "a",
        );
        scriptFs.writeFile.mockClear();

        // Pre-seed the guard so the change looks like the echo of our own write.
        (service as never as { writingGuard: Set<string> }).writingGuard.add(
            scriptUriString().replace(/^bpmn-script:/, ""),
        );

        await fireDocChange(docChangeEvent(scriptUriString(), "next"));

        expect(scriptFs.writeFile).not.toHaveBeenCalled();
        expect(editorStore.postMessage).not.toHaveBeenCalled();
    });

    it("ignores changes to a path that is not tracked", async () => {
        const { fireDocChange, scriptFs, editorStore } = createService();

        await fireDocChange(docChangeEvent(scriptUriString(), "next"));

        expect(scriptFs.writeFile).not.toHaveBeenCalled();
        expect(editorStore.postMessage).not.toHaveBeenCalled();
    });

    it("syncs the filesystem and posts an update for a tracked document", async () => {
        const { service, fireDocChange, scriptFs, editorStore } = createService();
        await service.openScriptEditor(
            EDITOR_ID,
            ELEMENT_ID,
            KIND,
            undefined,
            undefined,
            "javascript",
            "a",
        );
        scriptFs.writeFile.mockClear();

        await fireDocChange(docChangeEvent(scriptUriString(), "next"));

        const [, writtenBytes] = scriptFs.writeFile.mock.calls[0];
        expect(new TextDecoder().decode(writtenBytes as Uint8Array)).toBe("next");
        expect(editorStore.postMessage).toHaveBeenCalledWith(
            EDITOR_ID,
            new UpdateScriptContentQuery(ELEMENT_ID, KIND, undefined, "next"),
        );
    });

    it("buffers for resync instead of erroring when the webview is hidden", async () => {
        const { service, fireDocChange, editorStore, notifier, scriptFs } = createService();
        await service.openScriptEditor(
            EDITOR_ID,
            ELEMENT_ID,
            KIND,
            undefined,
            undefined,
            "javascript",
            "a",
        );
        editorStore.postMessage.mockRejectedValueOnce(new Error("The active editor is hidden."));
        scriptFs.readFile.mockReturnValue(new TextEncoder().encode("buffered"));

        await fireDocChange(docChangeEvent(scriptUriString(), "buffered"));

        expect(notifier.logError).not.toHaveBeenCalled();

        // The editor is now armed: a resync replays the buffered edit.
        editorStore.postMessage.mockResolvedValue(true);
        await service.resyncOpenDocuments(EDITOR_ID);
        expect(editorStore.postMessage).toHaveBeenLastCalledWith(
            EDITOR_ID,
            new UpdateScriptContentQuery(ELEMENT_ID, KIND, undefined, "buffered"),
        );
    });

    it("logs any non-hidden error and does not buffer it", async () => {
        const { service, fireDocChange, editorStore, notifier } = createService();
        await service.openScriptEditor(
            EDITOR_ID,
            ELEMENT_ID,
            KIND,
            undefined,
            undefined,
            "javascript",
            "a",
        );
        const failure = new Error("boom");
        editorStore.postMessage.mockRejectedValueOnce(failure);

        await fireDocChange(docChangeEvent(scriptUriString(), "next"));

        expect(notifier.logError).toHaveBeenCalledWith(failure);
        expect(
            (service as never as { pendingResync: Set<string> }).pendingResync.has(EDITOR_ID),
        ).toBe(false);
    });
});

describe("ScriptTaskService.resyncOpenDocuments", () => {
    it("is a no-op when the editor is not pending resync", async () => {
        const { service, editorStore, scriptFs } = createService();
        await service.openScriptEditor(
            EDITOR_ID,
            ELEMENT_ID,
            KIND,
            undefined,
            undefined,
            "javascript",
            "a",
        );
        editorStore.postMessage.mockClear();

        await service.resyncOpenDocuments(EDITOR_ID);

        expect(scriptFs.readFile).not.toHaveBeenCalled();
        expect(editorStore.postMessage).not.toHaveBeenCalled();
    });

    it("replays only the pending editor's docs with decoded content and clears the flag", async () => {
        const { service, editorStore, scriptFs } = createService();
        await service.openScriptEditor(
            EDITOR_ID,
            ELEMENT_ID,
            KIND,
            undefined,
            undefined,
            "javascript",
            "a",
        );
        // A doc for a different editor must be skipped during replay.
        const otherEditor = "file:///repo/other.bpmn";
        await service.openScriptEditor(
            otherEditor,
            "Task_2",
            KIND,
            undefined,
            undefined,
            "javascript",
            "b",
        );
        setOpenTabs([scriptUriString()]);
        scriptFs.readFile.mockReturnValue(new TextEncoder().encode("decoded"));
        editorStore.postMessage.mockClear();

        (service as never as { pendingResync: Set<string> }).pendingResync.add(EDITOR_ID);
        await service.resyncOpenDocuments(EDITOR_ID);

        expect(editorStore.postMessage).toHaveBeenCalledTimes(1);
        expect(editorStore.postMessage).toHaveBeenCalledWith(
            EDITOR_ID,
            new UpdateScriptContentQuery(ELEMENT_ID, KIND, undefined, "decoded"),
        );
        expect(
            (service as never as { pendingResync: Set<string> }).pendingResync.has(EDITOR_ID),
        ).toBe(false);
    });

    it("skips an entry whose readFile throws and continues the loop", async () => {
        const { service, editorStore, scriptFs, notifier } = createService();
        await service.openScriptEditor(
            EDITOR_ID,
            ELEMENT_ID,
            KIND,
            undefined,
            undefined,
            "javascript",
            "a",
        );
        await service.openScriptEditor(
            EDITOR_ID,
            "Task_2",
            KIND,
            undefined,
            undefined,
            "javascript",
            "b",
        );
        setOpenTabs([
            scriptUriString(),
            new ScriptUri(EDITOR_ID, "Task_2", KIND, undefined, undefined, "js").toString(),
        ]);
        scriptFs.readFile.mockImplementationOnce(() => {
            throw new Error("gone");
        });
        scriptFs.readFile.mockReturnValue(new TextEncoder().encode("ok"));
        editorStore.postMessage.mockClear();

        (service as never as { pendingResync: Set<string> }).pendingResync.add(EDITOR_ID);
        await service.resyncOpenDocuments(EDITOR_ID);

        expect(editorStore.postMessage).toHaveBeenCalledTimes(1);
        expect(notifier.logError).not.toHaveBeenCalled();
    });

    it("finishes a deferred cleanup when the replayed tab is no longer open anywhere", async () => {
        const { service, editorStore, scriptFs } = createService();
        await service.openScriptEditor(
            EDITOR_ID,
            ELEMENT_ID,
            KIND,
            undefined,
            undefined,
            "javascript",
            "a",
        );
        scriptFs.readFile.mockReturnValue(new TextEncoder().encode("c"));
        // Tab was closed while hidden: not present in any group during replay.
        setOpenTabs([]);
        editorStore.postMessage.mockClear();

        (service as never as { pendingResync: Set<string> }).pendingResync.add(EDITOR_ID);
        await service.resyncOpenDocuments(EDITOR_ID);

        const path = scriptUriString().replace(/^bpmn-script:/, "");
        const slugDir = path.substring(0, path.lastIndexOf("/") + 1);
        expect(scriptFs.deleteByPrefix).toHaveBeenCalledWith(slugDir);
        expect(
            (service as never as { openDocuments: Map<string, unknown> }).openDocuments.has(path),
        ).toBe(false);
    });

    it("re-arms the pending flag when the webview hides again mid-replay", async () => {
        const { service, editorStore, scriptFs } = createService();
        await service.openScriptEditor(
            EDITOR_ID,
            ELEMENT_ID,
            KIND,
            undefined,
            undefined,
            "javascript",
            "a",
        );
        setOpenTabs([scriptUriString()]);
        scriptFs.readFile.mockReturnValue(new TextEncoder().encode("c"));
        editorStore.postMessage.mockRejectedValueOnce(new Error("The active editor is hidden."));

        (service as never as { pendingResync: Set<string> }).pendingResync.add(EDITOR_ID);
        await service.resyncOpenDocuments(EDITOR_ID);

        expect(
            (service as never as { pendingResync: Set<string> }).pendingResync.has(EDITOR_ID),
        ).toBe(true);
    });
});

describe("ScriptTaskService.onTabsChanged", () => {
    it("cleans up a tracked tab closed for good (uri not open elsewhere)", async () => {
        const { service, fireTabsChange, scriptFs } = createService();
        await service.openScriptEditor(
            EDITOR_ID,
            ELEMENT_ID,
            KIND,
            undefined,
            undefined,
            "javascript",
            "a",
        );
        setOpenTabs([]);

        fireTabsChange({ closed: [makeTab(scriptUriString())], opened: [], changed: [] });

        const path = scriptUriString().replace(/^bpmn-script:/, "");
        const slugDir = path.substring(0, path.lastIndexOf("/") + 1);
        expect(scriptFs.deleteByPrefix).toHaveBeenCalledWith(slugDir);
        expect(
            (service as never as { openDocuments: Map<string, unknown> }).openDocuments.has(path),
        ).toBe(false);
    });

    it("treats a close as a move (no cleanup) when the uri is still open in another tab", async () => {
        const { service, fireTabsChange, scriptFs } = createService();
        await service.openScriptEditor(
            EDITOR_ID,
            ELEMENT_ID,
            KIND,
            undefined,
            undefined,
            "javascript",
            "a",
        );
        setOpenTabs([scriptUriString()]);

        fireTabsChange({ closed: [makeTab(scriptUriString())], opened: [], changed: [] });

        expect(scriptFs.deleteByPrefix).not.toHaveBeenCalled();
        expect(
            (service as never as { openDocuments: Map<string, unknown> }).openDocuments.has(
                scriptUriString().replace(/^bpmn-script:/, ""),
            ),
        ).toBe(true);
    });

    it("defers cleanup when the editor is pending resync", async () => {
        const { service, fireTabsChange, scriptFs } = createService();
        await service.openScriptEditor(
            EDITOR_ID,
            ELEMENT_ID,
            KIND,
            undefined,
            undefined,
            "javascript",
            "a",
        );
        setOpenTabs([]);
        (service as never as { pendingResync: Set<string> }).pendingResync.add(EDITOR_ID);

        fireTabsChange({ closed: [makeTab(scriptUriString())], opened: [], changed: [] });

        expect(scriptFs.deleteByPrefix).not.toHaveBeenCalled();
    });

    it("ignores a closed tab whose uri is not tracked", () => {
        const { fireTabsChange, scriptFs } = createService();

        fireTabsChange({ closed: [makeTab(scriptUriString())], opened: [], changed: [] });

        expect(scriptFs.deleteByPrefix).not.toHaveBeenCalled();
    });

    it("ignores closed tabs that are not bpmn-script inputs", async () => {
        const { service, fireTabsChange, scriptFs } = createService();
        await service.openScriptEditor(
            EDITOR_ID,
            ELEMENT_ID,
            KIND,
            undefined,
            undefined,
            "javascript",
            "a",
        );

        fireTabsChange({
            closed: [
                {
                    input: new TabInputText({
                        scheme: "file",
                        path: "/x.js",
                        toString: () => "file:///x.js",
                    } as never),
                },
            ],
            opened: [],
            changed: [],
        });

        expect(scriptFs.deleteByPrefix).not.toHaveBeenCalled();
    });
});

describe("ScriptTaskService.disposeForEditor", () => {
    it("clears state, closes orphaned tabs, and sweeps the editor's virtual files", async () => {
        const { service, scriptFs } = createService();
        await service.openScriptEditor(
            EDITOR_ID,
            ELEMENT_ID,
            KIND,
            undefined,
            undefined,
            "javascript",
            "a",
        );
        setOpenTabs([scriptUriString()]);

        service.disposeForEditor(EDITOR_ID);

        expect(closeTabMock).toHaveBeenCalledTimes(1);
        expect(scriptFs.deleteByPrefix).toHaveBeenCalledWith(ScriptUri.editorPathPrefix(EDITOR_ID));
        expect(
            (service as never as { openDocuments: Map<string, unknown> }).openDocuments.size,
        ).toBe(0);
    });

    it("makes a later tab-close for a disposed path a no-op", async () => {
        const { service, fireTabsChange, scriptFs } = createService();
        await service.openScriptEditor(
            EDITOR_ID,
            ELEMENT_ID,
            KIND,
            undefined,
            undefined,
            "javascript",
            "a",
        );
        setOpenTabs([scriptUriString()]);
        service.disposeForEditor(EDITOR_ID);
        scriptFs.deleteByPrefix.mockClear();
        setOpenTabs([]);

        fireTabsChange({ closed: [makeTab(scriptUriString())], opened: [], changed: [] });

        // State was already cleared by dispose, so performCleanup never runs.
        expect(scriptFs.deleteByPrefix).not.toHaveBeenCalled();
    });

    it("still sweeps via deleteByPrefix when there are no orphaned tabs to close", () => {
        const { service, scriptFs } = createService();

        service.disposeForEditor(EDITOR_ID);

        expect(closeTabMock).not.toHaveBeenCalled();
        expect(scriptFs.deleteByPrefix).toHaveBeenCalledWith(ScriptUri.editorPathPrefix(EDITOR_ID));
    });
});
