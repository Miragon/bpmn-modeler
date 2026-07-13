import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    OpenScriptEditorRef,
    ScriptKind,
    UpdateOpenScriptEditorsQuery,
    UpdateScriptContentQuery,
} from "@miragon/bpmn-modeler-shared";

// `ScriptTaskService` reaches into vscode directly (`Uri`, `languages`,
// `window`, `workspace`, `ViewColumn`, `TabInputText`, `WorkspaceEdit`), so
// the factory must supply runtime surface, not just types. The hoisted-spy
// pattern lets the (hoisted) `vi.mock` factory close over these consts while
// keeping them assertable in tests.
const onDidChangeTextDocumentMock = vi.fn();
const onDidSaveTextDocumentMock = vi.fn();
const onDidChangeTabsMock = vi.fn();
const openTextDocumentMock = vi.fn();
const showTextDocumentMock = vi.fn();
const setTextDocumentLanguageMock = vi.fn();
const closeTabMock = vi.fn();
const applyEditMock = vi.fn();

// `window.tabGroups.all` / `workspace.textDocuments` are reassigned per-test
// to stage which tabs and documents are open; the factory reads through the
// live bindings so updates are visible to the subject without re-mocking.
let openTabGroups: { tabs: { input: unknown }[] }[] = [];
let openTextDocuments: unknown[] = [];

vi.mock("vscode", () => {
    // Real class so the subject's `instanceof TabInputText` narrowing works.
    class TabInputText {
        constructor(readonly uri: unknown) {}
    }
    class WorkspaceEdit {
        replacements: unknown[] = [];
        replace(uri: unknown, range: unknown, newText: string): void {
            this.replacements.push({ uri, range, newText });
        }
    }
    class Range {
        constructor(
            readonly start: unknown,
            readonly end: unknown,
        ) {}
    }
    const fileUri = (path: string) => ({
        scheme: "file",
        path,
        fsPath: path,
        toString: () => `file://${path}`,
    });
    return {
        TabInputText,
        WorkspaceEdit,
        Range,
        ViewColumn: { Beside: 2 },
        Uri: {
            // `toUri` routes plain paths through `Uri.file`.
            file: fileUri,
            parse: (value: string) => fileUri(value.replace(/^file:\/\//, "")),
        },
        languages: {
            setTextDocumentLanguage: (...args: unknown[]) => setTextDocumentLanguageMock(...args),
        },
        workspace: {
            openTextDocument: (...args: unknown[]) => openTextDocumentMock(...args),
            onDidChangeTextDocument: (...args: unknown[]) => onDidChangeTextDocumentMock(...args),
            onDidSaveTextDocument: (...args: unknown[]) => onDidSaveTextDocumentMock(...args),
            applyEdit: (...args: unknown[]) => applyEditMock(...args),
            get textDocuments() {
                return openTextDocuments;
            },
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
const BASE_DIR = "/repo/.camunda/tmp/scripting";

/** The absolute file path production builds for the canonical script-task fixture. */
function scriptPath(format = "javascript", elementId = ELEMENT_ID): string {
    const rel = new ScriptUri(
        EDITOR_ID,
        elementId,
        KIND,
        undefined,
        undefined,
        new ScriptLanguage(format).extension,
    ).relativePath();
    return `${BASE_DIR}/${rel}`;
}

/** A closed/open tab carrying a script-file URI, matching what VS Code emits. */
function makeTab(path: string): { input: TabInputText } {
    return { input: new TabInputText(Uri.file(path)) };
}

/** Stages which script tabs VS Code reports as currently open. */
function setOpenTabs(paths: string[]): void {
    openTabGroups = [{ tabs: paths.map(makeTab) }];
}

/** Stages an open TextDocument the service can find by path. */
function stageDocument(path: string, text: string, isDirty = false) {
    const doc = {
        uri: Uri.file(path),
        getText: () => text,
        positionAt: (offset: number) => ({ offset }),
        isDirty,
        save: vi.fn().mockResolvedValue(true),
    };
    openTextDocuments = [...openTextDocuments, doc];
    return doc;
}

/**
 * Lets fire-and-forget async tails (dispose, deleteScriptDir, tab-close flush)
 * settle. Under fake timers, advancing by 0 ms drains the microtask queue
 * behind those promise chains without firing the 300 ms keystroke debounce.
 */
async function flushAsync(): Promise<void> {
    await vi.advanceTimersByTimeAsync(0);
}

/** Keystroke debounce window; a burst must sit inside it, one post lands after. */
const STREAM_DEBOUNCE_MS = 300;

/**
 * Builds the subject with port doubles, registers it, and captures the two
 * listener callbacks the subject hands to vscode so tests can fire document
 * and tab events directly.
 */
function createService() {
    const editorStore = { postMessage: vi.fn().mockResolvedValue(true) };
    const scriptFiles = {
        resolveBaseDir: vi.fn().mockResolvedValue(BASE_DIR),
        writeFile: vi.fn().mockResolvedValue(undefined),
        readFile: vi.fn().mockResolvedValue(""),
        deleteDir: vi.fn().mockResolvedValue(undefined),
        ensureGitignore: vi.fn().mockResolvedValue(undefined),
    };
    const settings = { getScriptingSpin: () => true };
    const notifier = { logError: vi.fn() };
    const picker = { pickScriptLanguage: vi.fn() };
    // Default: nothing diverged, so the dispose-time write-back is a no-op.
    const scriptXml = { applyScriptContents: vi.fn().mockResolvedValue(undefined) };

    // A generic TextDocument shape works both for the script opened in
    // `openScriptEditor` and the diagram re-opened by `persistScriptsToDocument`.
    openTextDocumentMock.mockResolvedValue({
        uri: Uri.file("/repo/process.bpmn"),
        getText: () => "<diagram-xml/>",
        positionAt: (offset: number) => ({ offset }),
        isDirty: false,
        save: vi.fn().mockResolvedValue(true),
    });
    showTextDocumentMock.mockResolvedValue(undefined);
    setTextDocumentLanguageMock.mockResolvedValue(undefined);
    applyEditMock.mockResolvedValue(true);

    const service = new ScriptTaskService(
        editorStore as never,
        scriptFiles as never,
        settings as never,
        notifier as never,
        picker as never,
        scriptXml as never,
    );
    service.register({ subscriptions: [] } as never);

    const fireDocChange = onDidChangeTextDocumentMock.mock.calls[0][0] as (
        event: unknown,
    ) => unknown;
    const fireSave = onDidSaveTextDocumentMock.mock.calls[0][0] as (document: unknown) => unknown;
    const fireTabsChange = onDidChangeTabsMock.mock.calls[0][0] as (event: unknown) => unknown;

    return {
        service,
        editorStore,
        scriptFiles,
        notifier,
        picker,
        scriptXml,
        fireDocChange,
        fireSave,
        fireTabsChange,
    };
}

/** Builds a doc-change event for the given tracked path and new buffer text. */
function docChangeEvent(path: string, text: string) {
    return {
        document: { uri: Uri.file(path), getText: () => text },
        contentChanges: [{}],
    };
}

/**
 * Fires a keystroke in a tracked script and lets the debounce window elapse so
 * the coalesced content actually streams into the webview model.
 */
async function typeInScript(
    fireDocChange: (event: unknown) => unknown,
    path: string,
    text: string,
): Promise<void> {
    await fireDocChange(docChangeEvent(path, text));
    await vi.advanceTimersByTimeAsync(STREAM_DEBOUNCE_MS);
}

/**
 * Builds a change event for the tracked *diagram* (not a script file), used to
 * exercise the "Don't Save" revert detection. A clean (`isDirty: false`) change
 * is the revert signal; a dirty one means the user is still editing.
 */
function diagramChangeEvent(isDirty: boolean) {
    return {
        document: {
            uri: { scheme: "file", path: "/repo/process.bpmn", toString: () => EDITOR_ID },
            isDirty,
            getText: () => "<diagram-xml/>",
        },
        contentChanges: [{}],
    };
}

/** Content-update posts only, filtering out lock broadcasts that share the mock. */
function contentQueryCalls(postMessage: { mock: { calls: unknown[][] } }): unknown[][] {
    return postMessage.mock.calls.filter(
        ([, message]) => (message as { type: string }).type === "UpdateScriptContentQuery",
    );
}

/** The `openScripts` array of the most recent lock broadcast, or `undefined`. */
function lastBroadcastRefs(postMessage: {
    mock: { calls: unknown[][] };
}): OpenScriptEditorRef[] | undefined {
    const calls = postMessage.mock.calls.filter(
        ([, message]) => (message as { type: string }).type === "UpdateOpenScriptEditorsQuery",
    );
    const last = calls[calls.length - 1];
    return last ? (last[1] as UpdateOpenScriptEditorsQuery).openScripts : undefined;
}

async function openCanonicalScript(
    service: ScriptTaskService,
    format = "javascript",
    content = "a",
): Promise<void> {
    await service.openScriptEditor(
        EDITOR_ID,
        ELEMENT_ID,
        KIND,
        undefined,
        undefined,
        format,
        content,
    );
}

beforeEach(() => {
    vi.clearAllMocks();
    // Fake timers make the 300 ms keystroke debounce deterministic; each test
    // advances time explicitly instead of sleeping.
    vi.useFakeTimers();
    openTabGroups = [];
    openTextDocuments = [];
});

afterEach(() => {
    vi.useRealTimers();
});

describe("ScriptTaskService.openScriptEditor", () => {
    it("writes content, ensures the gitignore, and reveals the editor for a new script", async () => {
        const { service, scriptFiles } = createService();

        await openCanonicalScript(service, "javascript", "console.log(1)");

        expect(scriptFiles.resolveBaseDir).toHaveBeenCalledWith(EDITOR_ID);
        expect(scriptFiles.ensureGitignore).toHaveBeenCalledWith(BASE_DIR);
        expect(scriptFiles.writeFile).toHaveBeenCalledWith(scriptPath(), "console.log(1)");
        expect(setTextDocumentLanguageMock).toHaveBeenCalledWith(expect.anything(), "javascript");
        expect(showTextDocumentMock).toHaveBeenCalledWith(expect.anything(), 2, true);
    });

    it("places camunda.d.ts and jsconfig.json next to a JavaScript script", async () => {
        const { service, scriptFiles } = createService();

        await openCanonicalScript(service, "javascript");

        const slugDir = scriptPath().substring(0, scriptPath().lastIndexOf("/"));
        const written = scriptFiles.writeFile.mock.calls.map(([path]) => path);
        expect(written).toContain(`${slugDir}/camunda.d.ts`);
        expect(written).toContain(`${slugDir}/jsconfig.json`);
        const dts = scriptFiles.writeFile.mock.calls.find(([path]) =>
            (path as string).endsWith("camunda.d.ts"),
        )?.[1] as string;
        expect(dts).toContain("declare const execution: DelegateExecution;");
    });

    it("writes no ambient files for a non-JavaScript script", async () => {
        const { service, scriptFiles } = createService();

        await openCanonicalScript(service, "groovy");

        expect(scriptFiles.writeFile).toHaveBeenCalledTimes(1);
        expect(scriptFiles.writeFile).toHaveBeenCalledWith(scriptPath("groovy"), "a");
    });

    it("returns silently when the format is unsupported and the user cancels the picker", async () => {
        const { service, scriptFiles, editorStore, picker } = createService();
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
        expect(scriptFiles.writeFile).not.toHaveBeenCalled();
        expect(editorStore.postMessage).not.toHaveBeenCalled();
    });

    it("persists the picked format then opens with its extension when the format is unsupported", async () => {
        const { service, scriptFiles, editorStore, picker } = createService();
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
        expect(scriptFiles.writeFile).toHaveBeenCalledWith(scriptPath("groovy"), "x");
    });

    it("reveals without rewriting when the same script is already open", async () => {
        const { service, scriptFiles } = createService();

        await openCanonicalScript(service, "groovy");
        await openCanonicalScript(service, "groovy");

        expect(scriptFiles.writeFile).toHaveBeenCalledTimes(1);
        expect(openTextDocumentMock).toHaveBeenCalledTimes(2);
        expect(showTextDocumentMock).toHaveBeenCalledTimes(2);
    });

    it("resolves the base directory once per editor", async () => {
        const { service, scriptFiles } = createService();

        await openCanonicalScript(service, "groovy");
        await service.openScriptEditor(
            EDITOR_ID,
            "Task_2",
            KIND,
            undefined,
            undefined,
            "groovy",
            "b",
        );

        expect(scriptFiles.resolveBaseDir).toHaveBeenCalledTimes(1);
    });
});

describe("ScriptTaskService.onScriptDocumentChanged", () => {
    it("ignores documents outside the file scheme", async () => {
        const { fireDocChange, editorStore } = createService();

        await fireDocChange({
            document: {
                uri: { scheme: "untitled", path: "/x.js" },
                getText: () => "y",
            },
            contentChanges: [{}],
        });

        expect(editorStore.postMessage).not.toHaveBeenCalled();
    });

    it("ignores events with no content changes", async () => {
        const { service, fireDocChange, editorStore } = createService();
        await openCanonicalScript(service);
        // Drop the open-time lock broadcast so the assertion isolates this event.
        editorStore.postMessage.mockClear();

        await fireDocChange({
            document: { uri: Uri.file(scriptPath()), getText: () => "next" },
            contentChanges: [],
        });

        expect(editorStore.postMessage).not.toHaveBeenCalled();
    });

    it("skips the echo of our own write while the path is in the writing guard", async () => {
        const { service, fireDocChange, editorStore } = createService();
        await openCanonicalScript(service);
        editorStore.postMessage.mockClear();

        // Pre-seed the guard so the change looks like the echo of our own write.
        (service as never as { writingGuard: Set<string> }).writingGuard.add(scriptPath());

        await fireDocChange(docChangeEvent(scriptPath(), "next"));

        expect(editorStore.postMessage).not.toHaveBeenCalled();
    });

    it("ignores changes to a path that is not tracked", async () => {
        const { fireDocChange, editorStore } = createService();

        await fireDocChange(docChangeEvent(scriptPath(), "next"));

        expect(editorStore.postMessage).not.toHaveBeenCalled();
    });

    it("posts an update for a tracked document without mirroring to disk", async () => {
        const { service, fireDocChange, scriptFiles, editorStore } = createService();
        await openCanonicalScript(service, "groovy");
        scriptFiles.writeFile.mockClear();

        await typeInScript(fireDocChange, scriptPath("groovy"), "next");

        // The buffer is authoritative; disk freshness follows the user's
        // save behaviour, so a keystroke never writes the file.
        expect(scriptFiles.writeFile).not.toHaveBeenCalled();
        expect(editorStore.postMessage).toHaveBeenCalledWith(
            EDITOR_ID,
            new UpdateScriptContentQuery(ELEMENT_ID, KIND, undefined, "next"),
        );
    });

    it("buffers for resync instead of erroring when the webview is hidden", async () => {
        const { service, fireDocChange, editorStore, notifier, scriptFiles } = createService();
        await openCanonicalScript(service, "groovy");
        editorStore.postMessage.mockRejectedValueOnce(new Error("The active editor is hidden."));
        scriptFiles.readFile.mockResolvedValue("buffered");

        await typeInScript(fireDocChange, scriptPath("groovy"), "buffered");

        expect(notifier.logError).not.toHaveBeenCalled();

        // The editor is now armed: a resync replays the buffered edit.
        editorStore.postMessage.mockResolvedValue(true);
        await service.resyncOpenDocuments(EDITOR_ID);
        // The lock re-broadcast is posted last; assert the content replay landed.
        expect(editorStore.postMessage).toHaveBeenCalledWith(
            EDITOR_ID,
            new UpdateScriptContentQuery(ELEMENT_ID, KIND, undefined, "buffered"),
        );
    });

    it("logs any non-hidden error and does not buffer it", async () => {
        const { service, fireDocChange, editorStore, notifier } = createService();
        await openCanonicalScript(service, "groovy");
        const failure = new Error("boom");
        editorStore.postMessage.mockRejectedValueOnce(failure);

        await typeInScript(fireDocChange, scriptPath("groovy"), "next");

        expect(notifier.logError).toHaveBeenCalledWith(failure);
        expect(
            (service as never as { pendingResync: Set<string> }).pendingResync.has(EDITOR_ID),
        ).toBe(false);
    });

    it("coalesces a keystroke burst into a single trailing query", async () => {
        const { service, fireDocChange, editorStore } = createService();
        await openCanonicalScript(service, "groovy", "a");
        editorStore.postMessage.mockClear();

        await fireDocChange(docChangeEvent(scriptPath("groovy"), "ab"));
        await fireDocChange(docChangeEvent(scriptPath("groovy"), "abc"));
        // Nothing streams while still inside the window.
        await vi.advanceTimersByTimeAsync(STREAM_DEBOUNCE_MS - 1);
        expect(contentQueryCalls(editorStore.postMessage)).toHaveLength(0);

        await vi.advanceTimersByTimeAsync(1);
        const calls = contentQueryCalls(editorStore.postMessage);
        expect(calls).toHaveLength(1);
        expect((calls[0][1] as UpdateScriptContentQuery).content).toBe("abc");
    });
});

describe("ScriptTaskService.resyncOpenDocuments", () => {
    it("is a no-op when the editor is not pending resync", async () => {
        const { service, editorStore, scriptFiles } = createService();
        await openCanonicalScript(service, "groovy");
        editorStore.postMessage.mockClear();

        await service.resyncOpenDocuments(EDITOR_ID);

        expect(scriptFiles.readFile).not.toHaveBeenCalled();
        expect(editorStore.postMessage).not.toHaveBeenCalled();
    });

    it("replays from the open buffer, preferring it over the (possibly stale) file", async () => {
        const { service, editorStore, scriptFiles } = createService();
        await openCanonicalScript(service, "groovy");
        setOpenTabs([scriptPath("groovy")]);
        stageDocument(scriptPath("groovy"), "buffer-content");
        scriptFiles.readFile.mockResolvedValue("stale-disk-content");
        editorStore.postMessage.mockClear();

        (service as never as { pendingResync: Set<string> }).pendingResync.add(EDITOR_ID);
        await service.resyncOpenDocuments(EDITOR_ID);

        expect(editorStore.postMessage).toHaveBeenCalledWith(
            EDITOR_ID,
            new UpdateScriptContentQuery(ELEMENT_ID, KIND, undefined, "buffer-content"),
        );
        expect(scriptFiles.readFile).not.toHaveBeenCalled();
    });

    it("replays only the pending editor's docs from disk and clears the flag", async () => {
        const { service, editorStore, scriptFiles } = createService();
        await openCanonicalScript(service, "groovy");
        // A doc for a different editor must be skipped during replay.
        const otherEditor = "file:///repo/other.bpmn";
        await service.openScriptEditor(
            otherEditor,
            "Task_2",
            KIND,
            undefined,
            undefined,
            "groovy",
            "b",
        );
        setOpenTabs([scriptPath("groovy")]);
        scriptFiles.readFile.mockResolvedValue("decoded");
        editorStore.postMessage.mockClear();

        (service as never as { pendingResync: Set<string> }).pendingResync.add(EDITOR_ID);
        await service.resyncOpenDocuments(EDITOR_ID);

        // One content replay (the lock re-broadcast rides on the same mock).
        expect(contentQueryCalls(editorStore.postMessage)).toHaveLength(1);
        expect(editorStore.postMessage).toHaveBeenCalledWith(
            EDITOR_ID,
            new UpdateScriptContentQuery(ELEMENT_ID, KIND, undefined, "decoded"),
        );
        expect(
            (service as never as { pendingResync: Set<string> }).pendingResync.has(EDITOR_ID),
        ).toBe(false);
    });

    it("skips an entry whose readFile rejects and continues the loop", async () => {
        const { service, editorStore, scriptFiles, notifier } = createService();
        await openCanonicalScript(service, "groovy");
        await service.openScriptEditor(
            EDITOR_ID,
            "Task_2",
            KIND,
            undefined,
            undefined,
            "groovy",
            "b",
        );
        setOpenTabs([scriptPath("groovy"), scriptPath("groovy", "Task_2")]);
        scriptFiles.readFile.mockRejectedValueOnce(new Error("gone"));
        scriptFiles.readFile.mockResolvedValue("ok");
        editorStore.postMessage.mockClear();

        (service as never as { pendingResync: Set<string> }).pendingResync.add(EDITOR_ID);
        await service.resyncOpenDocuments(EDITOR_ID);

        expect(contentQueryCalls(editorStore.postMessage)).toHaveLength(1);
        expect(notifier.logError).not.toHaveBeenCalled();
    });

    it("finishes a deferred cleanup when the replayed tab is no longer open anywhere", async () => {
        const { service, editorStore, scriptFiles } = createService();
        await openCanonicalScript(service, "groovy");
        scriptFiles.readFile.mockResolvedValue("c");
        // Tab was closed while hidden: not present in any group during replay.
        setOpenTabs([]);
        editorStore.postMessage.mockClear();

        (service as never as { pendingResync: Set<string> }).pendingResync.add(EDITOR_ID);
        await service.resyncOpenDocuments(EDITOR_ID);
        await flushAsync();

        const path = scriptPath("groovy");
        const slugDir = path.substring(0, path.lastIndexOf("/"));
        expect(scriptFiles.deleteDir).toHaveBeenCalledWith(slugDir);
        expect(
            (service as never as { openDocuments: Map<string, unknown> }).openDocuments.has(path),
        ).toBe(false);
    });

    it("re-arms the pending flag when the webview hides again mid-replay", async () => {
        const { service, editorStore, scriptFiles } = createService();
        await openCanonicalScript(service, "groovy");
        setOpenTabs([scriptPath("groovy")]);
        scriptFiles.readFile.mockResolvedValue("c");
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
        const { service, fireTabsChange, scriptFiles } = createService();
        await openCanonicalScript(service, "groovy");
        setOpenTabs([]);

        fireTabsChange({ closed: [makeTab(scriptPath("groovy"))], opened: [], changed: [] });
        await flushAsync();

        const path = scriptPath("groovy");
        const slugDir = path.substring(0, path.lastIndexOf("/"));
        expect(scriptFiles.deleteDir).toHaveBeenCalledWith(slugDir);
        expect(
            (service as never as { openDocuments: Map<string, unknown> }).openDocuments.has(path),
        ).toBe(false);
    });

    it("treats a close as a move (no cleanup) when the uri is still open in another tab", async () => {
        const { service, fireTabsChange, scriptFiles } = createService();
        await openCanonicalScript(service, "groovy");
        setOpenTabs([scriptPath("groovy")]);

        fireTabsChange({ closed: [makeTab(scriptPath("groovy"))], opened: [], changed: [] });
        await flushAsync();

        expect(scriptFiles.deleteDir).not.toHaveBeenCalled();
        expect(
            (service as never as { openDocuments: Map<string, unknown> }).openDocuments.has(
                scriptPath("groovy"),
            ),
        ).toBe(true);
    });

    it("defers cleanup when the editor is pending resync", async () => {
        const { service, fireTabsChange, scriptFiles } = createService();
        await openCanonicalScript(service, "groovy");
        setOpenTabs([]);
        (service as never as { pendingResync: Set<string> }).pendingResync.add(EDITOR_ID);

        fireTabsChange({ closed: [makeTab(scriptPath("groovy"))], opened: [], changed: [] });
        await flushAsync();

        expect(scriptFiles.deleteDir).not.toHaveBeenCalled();
    });

    it("ignores a closed tab whose uri is not tracked", async () => {
        const { fireTabsChange, scriptFiles } = createService();

        fireTabsChange({ closed: [makeTab(scriptPath())], opened: [], changed: [] });
        await flushAsync();

        expect(scriptFiles.deleteDir).not.toHaveBeenCalled();
    });

    it("ignores closed tabs for unrelated files", async () => {
        const { service, fireTabsChange, scriptFiles } = createService();
        await openCanonicalScript(service, "groovy");
        scriptFiles.deleteDir.mockClear();

        fireTabsChange({ closed: [makeTab("/somewhere/else/x.js")], opened: [], changed: [] });
        await flushAsync();

        expect(scriptFiles.deleteDir).not.toHaveBeenCalled();
    });
});

describe("ScriptTaskService.applyModelChange", () => {
    it("overwrites the open buffer through a workspace edit under the writing guard", async () => {
        const { service, editorStore } = createService();
        await openCanonicalScript(service, "groovy", "old");
        stageDocument(scriptPath("groovy"), "old");
        editorStore.postMessage.mockClear();

        await service.applyModelChange(EDITOR_ID, ELEMENT_ID, KIND, undefined, "undone");

        expect(applyEditMock).toHaveBeenCalledTimes(1);
        const edit = applyEditMock.mock.calls[0][0] as { replacements: { newText: string }[] };
        expect(edit.replacements[0].newText).toBe("undone");
        // The overwrite must not stream back to the webview as a keystroke.
        expect(contentQueryCalls(editorStore.postMessage)).toHaveLength(0);
    });

    it("skips the edit when the buffer already matches", async () => {
        const { service } = createService();
        await openCanonicalScript(service, "groovy", "same");
        stageDocument(scriptPath("groovy"), "same");

        await service.applyModelChange(EDITOR_ID, ELEMENT_ID, KIND, undefined, "same");

        expect(applyEditMock).not.toHaveBeenCalled();
    });

    it("writes the file when no document is materialised for the tab", async () => {
        const { service, scriptFiles } = createService();
        await openCanonicalScript(service, "groovy", "old");
        scriptFiles.writeFile.mockClear();

        await service.applyModelChange(EDITOR_ID, ELEMENT_ID, KIND, undefined, "undone");

        expect(applyEditMock).not.toHaveBeenCalled();
        expect(scriptFiles.writeFile).toHaveBeenCalledWith(scriptPath("groovy"), "undone");
    });

    it("is a no-op for a script that has no open tab", async () => {
        const { service, scriptFiles } = createService();

        await service.applyModelChange(EDITOR_ID, ELEMENT_ID, KIND, undefined, "x");

        expect(applyEditMock).not.toHaveBeenCalled();
        expect(scriptFiles.writeFile).not.toHaveBeenCalled();
    });

    it("closes the tab, saves a dirty buffer first, and deletes the file on element deletion", async () => {
        const { service, editorStore, scriptFiles } = createService();
        await openCanonicalScript(service, "groovy", "a");
        setOpenTabs([scriptPath("groovy")]);
        const doc = stageDocument(scriptPath("groovy"), "a", true);
        editorStore.postMessage.mockClear();

        await service.applyModelChange(EDITOR_ID, ELEMENT_ID, KIND, undefined, undefined);
        await flushAsync();

        expect(doc.save).toHaveBeenCalledTimes(1);
        expect(closeTabMock).toHaveBeenCalledTimes(1);
        const path = scriptPath("groovy");
        expect(scriptFiles.deleteDir).toHaveBeenCalledWith(
            path.substring(0, path.lastIndexOf("/")),
        );
        expect(lastBroadcastRefs(editorStore.postMessage)).toEqual([]);
        expect(
            (service as never as { openDocuments: Map<string, unknown> }).openDocuments.size,
        ).toBe(0);
    });
});

describe("ScriptTaskService lock broadcast", () => {
    it("broadcasts the open script (fileName + addressing) when a tab opens", async () => {
        const { service, editorStore } = createService();

        await openCanonicalScript(service);

        const filename = new ScriptUri(EDITOR_ID, ELEMENT_ID, KIND, undefined, undefined, "js")
            .filename;
        expect(lastBroadcastRefs(editorStore.postMessage)).toEqual([
            {
                elementId: ELEMENT_ID,
                kind: KIND,
                listenerIndex: undefined,
                fileName: filename,
            },
        ]);
    });

    it("broadcasts an empty set when the last script tab is cleaned up", async () => {
        const { service, fireTabsChange, editorStore } = createService();
        await openCanonicalScript(service, "groovy");
        setOpenTabs([]);

        fireTabsChange({ closed: [makeTab(scriptPath("groovy"))], opened: [], changed: [] });
        // Cleanup is async now (flushes the sender before the lock re-broadcast).
        await flushAsync();

        expect(lastBroadcastRefs(editorStore.postMessage)).toEqual([]);
    });

    it("re-broadcasts the current open set on the reload handshake (syncLockState)", async () => {
        const { service, editorStore } = createService();
        await openCanonicalScript(service, "groovy");
        editorStore.postMessage.mockClear();

        service.syncLockState(EDITOR_ID);

        const refs = lastBroadcastRefs(editorStore.postMessage);
        expect(refs).toHaveLength(1);
        expect(refs?.[0].elementId).toBe(ELEMENT_ID);
    });

    it("tolerates a hidden webview during the lock broadcast without logging", async () => {
        const { service, editorStore, notifier } = createService();
        editorStore.postMessage.mockRejectedValue(new Error("The active editor is hidden."));

        await openCanonicalScript(service, "groovy");
        // Let the fire-and-forget broadcast's rejection settle.
        await Promise.resolve();

        expect(notifier.logError).not.toHaveBeenCalled();
    });
});

describe("ScriptTaskService.disposeForEditor", () => {
    it("clears state, closes orphaned tabs, and deletes the editor's script directory", async () => {
        const { service, scriptFiles } = createService();
        await openCanonicalScript(service, "groovy");
        setOpenTabs([scriptPath("groovy")]);

        service.disposeForEditor(EDITOR_ID);
        await flushAsync();

        expect(closeTabMock).toHaveBeenCalledTimes(1);
        expect(scriptFiles.deleteDir).toHaveBeenCalledWith(
            `${BASE_DIR}/${ScriptUri.hashEditorId(EDITOR_ID)}`,
        );
        expect(
            (service as never as { openDocuments: Map<string, unknown> }).openDocuments.size,
        ).toBe(0);
    });

    it("saves a dirty script buffer before closing its tab", async () => {
        const { service } = createService();
        await openCanonicalScript(service, "groovy");
        setOpenTabs([scriptPath("groovy")]);
        const doc = stageDocument(scriptPath("groovy"), "edited", true);

        service.disposeForEditor(EDITOR_ID);
        await flushAsync();

        expect(doc.save).toHaveBeenCalledTimes(1);
    });

    it("makes a later tab-close for a disposed path a no-op", async () => {
        const { service, fireTabsChange, scriptFiles } = createService();
        await openCanonicalScript(service, "groovy");
        setOpenTabs([scriptPath("groovy")]);
        service.disposeForEditor(EDITOR_ID);
        await flushAsync();
        scriptFiles.deleteDir.mockClear();
        setOpenTabs([]);

        fireTabsChange({ closed: [makeTab(scriptPath("groovy"))], opened: [], changed: [] });
        await flushAsync();

        // State was already cleared by dispose, so performCleanup never runs.
        expect(scriptFiles.deleteDir).not.toHaveBeenCalled();
    });

    it("touches no disk when the editor never opened a script", async () => {
        const { service, scriptFiles } = createService();

        service.disposeForEditor(EDITOR_ID);
        await flushAsync();

        expect(closeTabMock).not.toHaveBeenCalled();
        // No cached base dir → nothing was ever written → nothing to delete.
        expect(scriptFiles.deleteDir).not.toHaveBeenCalled();
    });
});

describe("ScriptTaskService keystroke debounce", () => {
    it("cancels a pending keystroke when a model change overwrites the buffer", async () => {
        const { service, fireDocChange, editorStore } = createService();
        await openCanonicalScript(service, "groovy", "a");
        stageDocument(scriptPath("groovy"), "a");
        editorStore.postMessage.mockClear();

        // Type, then let a canvas undo overwrite the buffer before the window ends.
        await fireDocChange(docChangeEvent(scriptPath("groovy"), "stale"));
        await service.applyModelChange(EDITOR_ID, ELEMENT_ID, KIND, undefined, "undone");
        await vi.advanceTimersByTimeAsync(STREAM_DEBOUNCE_MS);

        // The stale keystroke was cancelled: it never streamed back as a query.
        expect(contentQueryCalls(editorStore.postMessage)).toHaveLength(0);
        // The overwrite itself lands via a workspace edit, not a post.
        expect(applyEditMock).toHaveBeenCalledTimes(1);
    });

    it("flushes the last keystroke before deleting a closed script tab", async () => {
        const { service, fireDocChange, fireTabsChange, editorStore, scriptFiles } =
            createService();
        await openCanonicalScript(service, "groovy", "a");
        editorStore.postMessage.mockClear();

        // Type, then close the tab within the debounce window.
        await fireDocChange(docChangeEvent(scriptPath("groovy"), "typed"));
        setOpenTabs([]);
        fireTabsChange({ closed: [makeTab(scriptPath("groovy"))], opened: [], changed: [] });
        await flushAsync();

        // The flush delivered the last keystroke before the file was removed.
        const calls = contentQueryCalls(editorStore.postMessage);
        expect(calls).toHaveLength(1);
        expect((calls[0][1] as UpdateScriptContentQuery).content).toBe("typed");
        const path = scriptPath("groovy");
        expect(scriptFiles.deleteDir).toHaveBeenCalledWith(
            path.substring(0, path.lastIndexOf("/")),
        );
    });

    it("arms pendingResync and defers deletion when the flush hits a hidden webview", async () => {
        const { service, fireDocChange, fireTabsChange, editorStore, scriptFiles } =
            createService();
        await openCanonicalScript(service, "groovy", "a");
        editorStore.postMessage.mockRejectedValue(new Error("The active editor is hidden."));

        await fireDocChange(docChangeEvent(scriptPath("groovy"), "typed"));
        setOpenTabs([]);
        fireTabsChange({ closed: [makeTab(scriptPath("groovy"))], opened: [], changed: [] });
        await flushAsync();

        // The buffered edit only lives in the file/buffer; do not delete it yet.
        expect(
            (service as never as { pendingResync: Set<string> }).pendingResync.has(EDITOR_ID),
        ).toBe(true);
        expect(scriptFiles.deleteDir).not.toHaveBeenCalled();
    });

    it("drops the content sender when a script tab is cleaned up", async () => {
        const { service, fireDocChange, fireTabsChange } = createService();
        await openCanonicalScript(service, "groovy", "a");
        await fireDocChange(docChangeEvent(scriptPath("groovy"), "typed"));

        setOpenTabs([]);
        fireTabsChange({ closed: [makeTab(scriptPath("groovy"))], opened: [], changed: [] });
        await flushAsync();

        expect(
            (service as never as { contentSenders: Map<string, unknown> }).contentSenders.has(
                scriptPath("groovy"),
            ),
        ).toBe(false);
    });

    it("cancels pending keystrokes on dispose without posting or logging", async () => {
        const { service, fireDocChange, editorStore, notifier } = createService();
        await openCanonicalScript(service, "groovy", "a");
        editorStore.postMessage.mockClear();

        await fireDocChange(docChangeEvent(scriptPath("groovy"), "typed"));
        service.disposeForEditor(EDITOR_ID);
        await vi.advanceTimersByTimeAsync(STREAM_DEBOUNCE_MS);

        expect(contentQueryCalls(editorStore.postMessage)).toHaveLength(0);
        expect(notifier.logError).not.toHaveBeenCalled();
    });
});

describe("ScriptTaskService dispose write-back", () => {
    it("writes the buffered script into the diagram and saves before deleting", async () => {
        const { service, scriptFiles, scriptXml } = createService();
        await openCanonicalScript(service, "groovy", "edited");
        setOpenTabs([scriptPath("groovy")]);
        stageDocument(scriptPath("groovy"), "edited");
        const diagramDoc = stageDocument("/repo/process.bpmn", "<old-xml/>");
        scriptXml.applyScriptContents.mockResolvedValue("<new-xml/>");

        service.disposeForEditor(EDITOR_ID);
        await flushAsync();

        expect(scriptXml.applyScriptContents).toHaveBeenCalledWith("<old-xml/>", [
            { elementId: ELEMENT_ID, kind: KIND, listenerIndex: undefined, content: "edited" },
        ]);
        const edit = applyEditMock.mock.calls[0][0] as { replacements: { newText: string }[] };
        expect(edit.replacements[0].newText).toBe("<new-xml/>");
        expect(diagramDoc.save).toHaveBeenCalledTimes(1);
        expect(scriptFiles.deleteDir).toHaveBeenCalled();
    });

    it("skips the write-back but still deletes when nothing diverged", async () => {
        const { service, scriptFiles } = createService();
        await openCanonicalScript(service, "groovy", "edited");
        stageDocument(scriptPath("groovy"), "edited");
        stageDocument("/repo/process.bpmn", "<xml/>");
        // The default scriptXml stub resolves undefined (no divergence).

        service.disposeForEditor(EDITOR_ID);
        await flushAsync();

        expect(applyEditMock).not.toHaveBeenCalled();
        expect(scriptFiles.deleteDir).toHaveBeenCalled();
    });

    it("reads the script file when its buffer is gone, then writes back", async () => {
        const { service, scriptFiles, scriptXml } = createService();
        await openCanonicalScript(service, "groovy", "edited");
        // No staged script doc → the buffer is gone → readFile fallback.
        scriptFiles.readFile.mockResolvedValue("from-disk");
        stageDocument("/repo/process.bpmn", "<xml/>");
        scriptXml.applyScriptContents.mockResolvedValue("<new/>");

        service.disposeForEditor(EDITOR_ID);
        await flushAsync();

        expect(scriptXml.applyScriptContents).toHaveBeenCalledWith("<xml/>", [
            { elementId: ELEMENT_ID, kind: KIND, listenerIndex: undefined, content: "from-disk" },
        ]);
    });

    it("opens the diagram document when it is not already staged", async () => {
        const { service, scriptXml } = createService();
        await openCanonicalScript(service, "groovy", "edited");
        stageDocument(scriptPath("groovy"), "edited");
        // Diagram NOT staged → persistScriptsToDocument must open it.
        scriptXml.applyScriptContents.mockResolvedValue("<new/>");
        openTextDocumentMock.mockClear();
        const diagramDoc = {
            uri: Uri.file("/repo/process.bpmn"),
            getText: () => "<xml/>",
            positionAt: (offset: number) => ({ offset }),
            save: vi.fn().mockResolvedValue(true),
        };
        openTextDocumentMock.mockResolvedValue(diagramDoc);

        service.disposeForEditor(EDITOR_ID);
        await flushAsync();

        expect(openTextDocumentMock).toHaveBeenCalled();
        expect(diagramDoc.save).toHaveBeenCalledTimes(1);
    });

    it("logs and still deletes when the write-back throws", async () => {
        const { service, scriptFiles, scriptXml, notifier } = createService();
        await openCanonicalScript(service, "groovy", "edited");
        stageDocument(scriptPath("groovy"), "edited");
        stageDocument("/repo/process.bpmn", "<xml/>");
        scriptXml.applyScriptContents.mockRejectedValue(new Error("boom"));

        service.disposeForEditor(EDITOR_ID);
        await flushAsync();

        expect(notifier.logError).toHaveBeenCalled();
        expect(scriptFiles.deleteDir).toHaveBeenCalled();
    });

    it("skips the write-back entirely when the diagram was reverted", async () => {
        const { service, scriptXml } = createService();
        await openCanonicalScript(service, "groovy", "edited");
        stageDocument(scriptPath("groovy"), "edited");
        stageDocument("/repo/process.bpmn", "<xml/>");
        (service as never as { revertedEditors: Set<string> }).revertedEditors.add(EDITOR_ID);

        service.disposeForEditor(EDITOR_ID);
        await flushAsync();

        expect(scriptXml.applyScriptContents).not.toHaveBeenCalled();
        expect(applyEditMock).not.toHaveBeenCalled();
    });
});

describe("ScriptTaskService revert tracking", () => {
    /** The private revert set, read for assertions. */
    function reverted(service: ScriptTaskService): Set<string> {
        return (service as never as { revertedEditors: Set<string> }).revertedEditors;
    }

    it("marks the editor on a clean diagram change and clears it on save", async () => {
        const { service, fireDocChange, fireSave } = createService();
        // Open a script so the editor is tracked in baseDirByEditor.
        await openCanonicalScript(service, "groovy");

        // A change landing on an already-clean diagram is a "Don't Save" revert.
        await fireDocChange(diagramChangeEvent(false));
        expect(reverted(service).has(EDITOR_ID)).toBe(true);

        // Saving the diagram at the prompt is not a revert — clear the mark.
        fireSave({ uri: { toString: () => EDITOR_ID } });
        expect(reverted(service).has(EDITOR_ID)).toBe(false);
    });

    it("unmarks the editor when the diagram becomes dirty again", async () => {
        const { service, fireDocChange } = createService();
        await openCanonicalScript(service, "groovy");

        await fireDocChange(diagramChangeEvent(false));
        expect(reverted(service).has(EDITOR_ID)).toBe(true);

        // The user resumed editing: a dirty change clears the revert mark.
        await fireDocChange(diagramChangeEvent(true));
        expect(reverted(service).has(EDITOR_ID)).toBe(false);
    });

    it("ignores diagram changes for editors that never opened a script", async () => {
        const { service, fireDocChange } = createService();

        // No script opened → editor absent from baseDirByEditor → not tracked.
        await fireDocChange(diagramChangeEvent(false));

        expect(reverted(service).has(EDITOR_ID)).toBe(false);
    });
});
