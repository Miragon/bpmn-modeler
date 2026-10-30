import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    UpdateOpenScriptEditorsQuery,
    UpdateScriptContentQuery,
} from "@miragon/bpmn-modeler-shared";
import { OpenScriptEditorRef, ScriptKind } from "@miragon/bpmn-modeler-types";

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
import {
    ArtifactService,
    ScriptFileStore,
    ScriptLanguage,
    scriptLanguagePrompt,
    ScriptUri,
} from "@miragon/bpmn-modeler-core";
import {
    createTestHost,
    FakeEditorHandle,
    PromptAnswers,
} from "@miragon/bpmn-modeler-core/testing";

const EDITOR_PATH = "/repo/process.bpmn";
const EDITOR_ID = `file://${EDITOR_PATH}`;
const ELEMENT_ID = "Task_1";
const KIND: ScriptKind = "script-task";
const BASE_DIR = "/repo/.camunda/tmp/scripting";
const GITIGNORE = "/repo/.camunda/tmp/.gitignore";

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
function createService(promptAnswers: PromptAnswers = {}) {
    // The canonical editor is live so adoption's reverse hash→editor lookup
    // resolves an opened script to a session.
    const host = createTestHost({ promptAnswers, folders: ["/repo"] });
    const editor = host.openEditor(EDITOR_PATH);
    const scriptFileStore = new ScriptFileStore(
        host.store,
        host.workspace,
        host.settings,
        new ArtifactService(host.workspace, host.settings),
        host.notifier,
        "/tmp",
        (path) => path,
    );
    // Spied so a test can see which script files the service touched or make one fail.
    const scriptFiles = {
        writeFile: vi.spyOn(scriptFileStore, "writeFile"),
        readFile: vi.spyOn(scriptFileStore, "readFile"),
        deleteFolder: vi.spyOn(scriptFileStore, "deleteFolder"),
    };
    // Default: nothing diverged, so the dispose-time write-back is a no-op.
    const scriptXml = { applyScriptContents: vi.fn().mockResolvedValue(undefined) };

    // A generic TextDocument shape works both for the script opened in
    // `open` and the diagram re-opened by `persistScriptsToDocument`.
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
        host.store,
        scriptFileStore,
        host.settings,
        host.notifier,
        host.picker,
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
        host,
        editor,
        scriptFiles,
        notifier: host.notifier,
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

/** Content-update posts only, filtering out lock broadcasts to the same webview. */
function contentQueries(editor: FakeEditorHandle): UpdateScriptContentQuery[] {
    return editor.postedOfType<UpdateScriptContentQuery>("UpdateScriptContentQuery");
}

/** The `openScripts` array of the most recent lock broadcast, or `undefined`. */
function lastBroadcastRefs(editor: FakeEditorHandle): OpenScriptEditorRef[] | undefined {
    const broadcasts = editor.postedOfType<UpdateOpenScriptEditorsQuery>(
        "UpdateOpenScriptEditorsQuery",
    );
    return broadcasts[broadcasts.length - 1]?.openScripts;
}

function clearPosted(editor: FakeEditorHandle): void {
    editor.posted.length = 0;
}

async function openCanonicalScript(
    service: ScriptTaskService,
    format = "javascript",
    content = "a",
): Promise<void> {
    await service.open(EDITOR_ID, {
        elementId: ELEMENT_ID,
        kind: KIND,
        listenerIndex: undefined,
        eventName: undefined,
        scriptFormat: format,
        content,
    });
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

describe("ScriptTaskService.open", () => {
    it("writes content, ensures the gitignore, and reveals the editor for a new script", async () => {
        const { service, host } = createService();

        await openCanonicalScript(service, "javascript", "console.log(1)");

        expect(host.workspace.files.get(GITIGNORE)).toBe("*\n");
        expect(host.workspace.files.get(scriptPath())).toBe("console.log(1)");
        expect(setTextDocumentLanguageMock).toHaveBeenCalledWith(expect.anything(), "javascript");
        expect(showTextDocumentMock).toHaveBeenCalledWith(expect.anything(), {
            viewColumn: 2,
            preserveFocus: true,
            preview: false,
        });
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
        const { service, scriptFiles, editor, host } = createService();

        await service.open(EDITOR_ID, {
            elementId: ELEMENT_ID,
            kind: KIND,
            listenerIndex: undefined,
            eventName: undefined,
            scriptFormat: "cobol",
            content: "x",
        });

        expect(host.picker.prompts).toEqual([
            { method: "choose", args: [scriptLanguagePrompt("cobol")] },
        ]);
        expect(scriptFiles.writeFile).not.toHaveBeenCalled();
        expect(editor.posted).toEqual([]);
    });

    it("persists the picked format then opens with its extension when the format is unsupported", async () => {
        const { service, scriptFiles, editor } = createService({ scriptLanguage: "groovy" });

        await service.open(EDITOR_ID, {
            elementId: ELEMENT_ID,
            kind: KIND,
            listenerIndex: undefined,
            eventName: undefined,
            scriptFormat: "cobol",
            content: "x",
        });

        expect(editor.posted).toContainEqual(
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
        // The reveal must pin the tab too, or revealing a preview tab would let
        // the next batch open replace it.
        expect(showTextDocumentMock).toHaveBeenLastCalledWith(expect.anything(), {
            viewColumn: 2,
            preserveFocus: true,
            preview: false,
        });
    });

    it("keeps writing into the editor's first base directory after the config folder changed", async () => {
        const { service, host } = createService();

        await openCanonicalScript(service, "groovy");
        host.settings.values.configFolder = ".bpmn";
        await service.open(EDITOR_ID, {
            elementId: "Task_2",
            kind: KIND,
            listenerIndex: undefined,
            eventName: undefined,
            scriptFormat: "groovy",
            content: "b",
        });

        expect(host.workspace.files.get(scriptPath("groovy", "Task_2"))).toBe("b");
    });

    it("opens two scripts as pinned tabs that both stay tracked (openAll regression)", async () => {
        const { service } = createService();

        await openCanonicalScript(service, "groovy", "a");
        await service.open(EDITOR_ID, {
            elementId: "Task_2",
            kind: KIND,
            listenerIndex: undefined,
            eventName: undefined,
            scriptFormat: "groovy",
            content: "b",
        });

        // Neither open may replace the other: both tabs are pinned…
        for (const call of showTextDocumentMock.mock.calls) {
            expect(call[1]).toMatchObject({ preview: false });
        }
        // …and both scripts remain tracked (a preview replacement would have
        // arrived as a close and evicted Task_1).
        const openDocuments = (service as never as { openDocuments: Map<string, unknown> })
            .openDocuments;
        expect(openDocuments.has(scriptPath("groovy"))).toBe(true);
        expect(openDocuments.has(scriptPath("groovy", "Task_2"))).toBe(true);
    });
});

describe("ScriptTaskService.onScriptDocumentChanged", () => {
    it("ignores documents outside the file scheme", async () => {
        const { fireDocChange, editor } = createService();

        await fireDocChange({
            document: {
                uri: { scheme: "untitled", path: "/x.js" },
                getText: () => "y",
            },
            contentChanges: [{}],
        });

        expect(editor.posted).toEqual([]);
    });

    it("ignores events with no content changes", async () => {
        const { service, fireDocChange, editor } = createService();
        await openCanonicalScript(service);
        // Drop the open-time lock broadcast so the assertion isolates this event.
        clearPosted(editor);

        await fireDocChange({
            document: { uri: Uri.file(scriptPath()), getText: () => "next" },
            contentChanges: [],
        });

        expect(editor.posted).toEqual([]);
    });

    it("skips the echo of our own write while the path is in the writing guard", async () => {
        const { service, fireDocChange, editor } = createService();
        await openCanonicalScript(service);
        clearPosted(editor);

        // Pre-seed the guard so the change looks like the echo of our own write.
        (service as never as { writingGuard: Set<string> }).writingGuard.add(scriptPath());

        await fireDocChange(docChangeEvent(scriptPath(), "next"));

        expect(editor.posted).toEqual([]);
    });

    it("ignores changes to a path that is not tracked", async () => {
        const { fireDocChange, editor } = createService();

        await fireDocChange(docChangeEvent(scriptPath(), "next"));

        expect(editor.posted).toEqual([]);
    });

    it("posts an update for a tracked document without mirroring to disk", async () => {
        const { service, fireDocChange, scriptFiles, editor } = createService();
        await openCanonicalScript(service, "groovy");
        scriptFiles.writeFile.mockClear();

        await typeInScript(fireDocChange, scriptPath("groovy"), "next");

        // The buffer is authoritative; disk freshness follows the user's
        // save behaviour, so a keystroke never writes the file.
        expect(scriptFiles.writeFile).not.toHaveBeenCalled();
        expect(editor.posted).toContainEqual(
            new UpdateScriptContentQuery(ELEMENT_ID, KIND, undefined, "next"),
        );
    });

    it("buffers for resync instead of erroring when the webview is hidden", async () => {
        const { service, fireDocChange, editor, notifier, scriptFiles } = createService();
        await openCanonicalScript(service, "groovy");
        editor.hidden = true;
        scriptFiles.readFile.mockResolvedValue("buffered");

        await typeInScript(fireDocChange, scriptPath("groovy"), "buffered");

        expect(notifier.logged("error")).toEqual([]);

        // The editor is now armed: a resync replays the buffered edit.
        editor.hidden = false;
        await service.resyncOpenDocuments(EDITOR_ID);
        // The lock re-broadcast is posted last; assert the content replay landed.
        expect(editor.posted).toContainEqual(
            new UpdateScriptContentQuery(ELEMENT_ID, KIND, undefined, "buffered"),
        );
    });

    it("logs any non-hidden error and does not buffer it", async () => {
        const { service, fireDocChange, editor, notifier } = createService();
        await openCanonicalScript(service, "groovy");
        const failure = new Error("boom");
        vi.spyOn(editor, "postMessage").mockRejectedValueOnce(failure);

        await typeInScript(fireDocChange, scriptPath("groovy"), "next");

        expect(notifier.logged("error")).toEqual([failure.stack]);
        expect(
            (service as never as { pendingResync: Set<string> }).pendingResync.has(EDITOR_ID),
        ).toBe(false);
    });

    it("coalesces a keystroke burst into a single trailing query", async () => {
        const { service, fireDocChange, editor } = createService();
        await openCanonicalScript(service, "groovy", "a");
        clearPosted(editor);

        await fireDocChange(docChangeEvent(scriptPath("groovy"), "ab"));
        await fireDocChange(docChangeEvent(scriptPath("groovy"), "abc"));
        // Nothing streams while still inside the window.
        await vi.advanceTimersByTimeAsync(STREAM_DEBOUNCE_MS - 1);
        expect(contentQueries(editor)).toHaveLength(0);

        await vi.advanceTimersByTimeAsync(1);
        const queries = contentQueries(editor);
        expect(queries).toHaveLength(1);
        expect(queries[0].content).toBe("abc");
    });
});

describe("ScriptTaskService.resyncOpenDocuments", () => {
    it("is a no-op when the editor is not pending resync", async () => {
        const { service, editor, scriptFiles } = createService();
        await openCanonicalScript(service, "groovy");
        clearPosted(editor);

        await service.resyncOpenDocuments(EDITOR_ID);

        expect(scriptFiles.readFile).not.toHaveBeenCalled();
        expect(editor.posted).toEqual([]);
    });

    it("replays from the open buffer, preferring it over the (possibly stale) file", async () => {
        const { service, editor, scriptFiles } = createService();
        await openCanonicalScript(service, "groovy");
        setOpenTabs([scriptPath("groovy")]);
        stageDocument(scriptPath("groovy"), "buffer-content");
        scriptFiles.readFile.mockResolvedValue("stale-disk-content");
        clearPosted(editor);

        (service as never as { pendingResync: Set<string> }).pendingResync.add(EDITOR_ID);
        await service.resyncOpenDocuments(EDITOR_ID);

        expect(editor.posted).toContainEqual(
            new UpdateScriptContentQuery(ELEMENT_ID, KIND, undefined, "buffer-content"),
        );
        expect(scriptFiles.readFile).not.toHaveBeenCalled();
    });

    it("replays only the pending editor's docs from disk and clears the flag", async () => {
        const { service, host, editor, scriptFiles } = createService();
        await openCanonicalScript(service, "groovy");
        // A doc for a different editor must be skipped during replay.
        const otherEditor = host.openEditor("/repo/other.bpmn");
        await service.open(otherEditor.id, {
            elementId: "Task_2",
            kind: KIND,
            listenerIndex: undefined,
            eventName: undefined,
            scriptFormat: "groovy",
            content: "b",
        });
        setOpenTabs([scriptPath("groovy")]);
        scriptFiles.readFile.mockResolvedValue("decoded");
        clearPosted(editor);
        clearPosted(otherEditor);

        (service as never as { pendingResync: Set<string> }).pendingResync.add(EDITOR_ID);
        await service.resyncOpenDocuments(EDITOR_ID);

        expect(contentQueries(editor)).toHaveLength(1);
        expect(contentQueries(otherEditor)).toEqual([]);
        expect(editor.posted).toContainEqual(
            new UpdateScriptContentQuery(ELEMENT_ID, KIND, undefined, "decoded"),
        );
        expect(
            (service as never as { pendingResync: Set<string> }).pendingResync.has(EDITOR_ID),
        ).toBe(false);
    });

    it("skips an entry whose readFile rejects and continues the loop", async () => {
        const { service, editor, scriptFiles, notifier } = createService();
        await openCanonicalScript(service, "groovy");
        await service.open(EDITOR_ID, {
            elementId: "Task_2",
            kind: KIND,
            listenerIndex: undefined,
            eventName: undefined,
            scriptFormat: "groovy",
            content: "b",
        });
        setOpenTabs([scriptPath("groovy"), scriptPath("groovy", "Task_2")]);
        scriptFiles.readFile.mockRejectedValueOnce(new Error("gone"));
        scriptFiles.readFile.mockResolvedValue("ok");
        clearPosted(editor);

        (service as never as { pendingResync: Set<string> }).pendingResync.add(EDITOR_ID);
        await service.resyncOpenDocuments(EDITOR_ID);

        expect(contentQueries(editor)).toHaveLength(1);
        expect(notifier.logged("error")).toEqual([]);
    });

    it("finishes a deferred cleanup when the replayed tab is no longer open anywhere", async () => {
        const { service, editor, scriptFiles } = createService();
        await openCanonicalScript(service, "groovy");
        scriptFiles.readFile.mockResolvedValue("c");
        // Tab was closed while hidden: not present in any group during replay.
        setOpenTabs([]);
        clearPosted(editor);

        (service as never as { pendingResync: Set<string> }).pendingResync.add(EDITOR_ID);
        await service.resyncOpenDocuments(EDITOR_ID);
        await flushAsync();

        const path = scriptPath("groovy");
        // The replay happened, then tracking was released — but the file stays
        // on disk (deletion is reserved for element deletion / editor dispose).
        expect(scriptFiles.deleteFolder).not.toHaveBeenCalled();
        expect(
            (service as never as { openDocuments: Map<string, unknown> }).openDocuments.has(path),
        ).toBe(false);
    });

    it("re-arms the pending flag when the webview hides again mid-replay", async () => {
        const { service, editor, scriptFiles } = createService();
        await openCanonicalScript(service, "groovy");
        setOpenTabs([scriptPath("groovy")]);
        scriptFiles.readFile.mockResolvedValue("c");
        vi.spyOn(editor, "postMessage").mockRejectedValueOnce(
            new Error("The active editor is hidden."),
        );

        (service as never as { pendingResync: Set<string> }).pendingResync.add(EDITOR_ID);
        await service.resyncOpenDocuments(EDITOR_ID);

        expect(
            (service as never as { pendingResync: Set<string> }).pendingResync.has(EDITOR_ID),
        ).toBe(true);
    });
});

describe("ScriptTaskService.onTabsChanged", () => {
    it("releases tracking but keeps the file when a tab is closed for good", async () => {
        const { service, fireTabsChange, scriptFiles } = createService();
        await openCanonicalScript(service, "groovy");
        setOpenTabs([]);

        fireTabsChange({ closed: [makeTab(scriptPath("groovy"))], opened: [], changed: [] });
        await flushAsync();

        const path = scriptPath("groovy");
        // A plain tab close must not delete the file — reopening it has to work.
        expect(scriptFiles.deleteFolder).not.toHaveBeenCalled();
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

        expect(scriptFiles.deleteFolder).not.toHaveBeenCalled();
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

        expect(scriptFiles.deleteFolder).not.toHaveBeenCalled();
        // The `openDocuments` entry is the deferred replay's payload now, so it
        // must survive until `resyncOpenDocuments` finishes the cleanup.
        expect(
            (service as never as { openDocuments: Map<string, unknown> }).openDocuments.has(
                scriptPath("groovy"),
            ),
        ).toBe(true);
    });

    it("ignores a closed tab whose uri is not tracked", async () => {
        const { fireTabsChange, scriptFiles } = createService();

        fireTabsChange({ closed: [makeTab(scriptPath())], opened: [], changed: [] });
        await flushAsync();

        expect(scriptFiles.deleteFolder).not.toHaveBeenCalled();
    });

    it("ignores closed tabs for unrelated files", async () => {
        const { service, fireTabsChange, scriptFiles } = createService();
        await openCanonicalScript(service, "groovy");
        scriptFiles.deleteFolder.mockClear();

        fireTabsChange({ closed: [makeTab("/somewhere/else/x.js")], opened: [], changed: [] });
        await flushAsync();

        expect(scriptFiles.deleteFolder).not.toHaveBeenCalled();
    });
});

describe("ScriptTaskService reopen after close", () => {
    it("rewrites the file with fresh model content when a closed script is reopened", async () => {
        const { service, fireTabsChange, scriptFiles } = createService();
        await openCanonicalScript(service, "groovy", "old");

        // Close the tab: tracking is released, the file is left on disk.
        setOpenTabs([]);
        fireTabsChange({ closed: [makeTab(scriptPath("groovy"))], opened: [], changed: [] });
        await flushAsync();
        scriptFiles.writeFile.mockClear();

        // Reopen: the path is gone from openDocuments, so this takes the rewrite
        // branch (not the reveal branch) and overwrites the stale file.
        await openCanonicalScript(service, "groovy", "new");

        expect(scriptFiles.writeFile).toHaveBeenCalledWith(scriptPath("groovy"), "new");
    });

    it("still deletes the editor hash dir on dispose after a tab was closed earlier", async () => {
        const { service, fireTabsChange, scriptFiles } = createService();
        await openCanonicalScript(service, "groovy");

        // Close the script tab first — its file is deliberately left behind.
        setOpenTabs([]);
        fireTabsChange({ closed: [makeTab(scriptPath("groovy"))], opened: [], changed: [] });
        await flushAsync();
        expect(scriptFiles.deleteFolder).not.toHaveBeenCalled();

        // Editor dispose sweeps the whole <editorHash> dir, covering the
        // earlier-closed script's leftover file.
        service.disposeEditor(EDITOR_ID);
        await flushAsync();

        expect(scriptFiles.deleteFolder).toHaveBeenCalledWith(
            `${BASE_DIR}/${ScriptUri.hashEditorId(EDITOR_ID)}`,
        );
    });
});

describe("ScriptTaskService.applyModelChange", () => {
    it("overwrites the open buffer through a workspace edit under the writing guard", async () => {
        const { service, editor } = createService();
        await openCanonicalScript(service, "groovy", "old");
        stageDocument(scriptPath("groovy"), "old");
        clearPosted(editor);

        await service.applyModelChange(EDITOR_ID, {
            elementId: ELEMENT_ID,
            kind: KIND,
            listenerIndex: undefined,
            content: "undone",
        });

        expect(applyEditMock).toHaveBeenCalledTimes(1);
        const edit = applyEditMock.mock.calls[0][0] as { replacements: { newText: string }[] };
        expect(edit.replacements[0].newText).toBe("undone");
        // The overwrite must not stream back to the webview as a keystroke.
        expect(contentQueries(editor)).toHaveLength(0);
    });

    it("skips the edit when the buffer already matches", async () => {
        const { service } = createService();
        await openCanonicalScript(service, "groovy", "same");
        stageDocument(scriptPath("groovy"), "same");

        await service.applyModelChange(EDITOR_ID, {
            elementId: ELEMENT_ID,
            kind: KIND,
            listenerIndex: undefined,
            content: "same",
        });

        expect(applyEditMock).not.toHaveBeenCalled();
    });

    it("writes the file when no document is materialised for the tab", async () => {
        const { service, scriptFiles } = createService();
        await openCanonicalScript(service, "groovy", "old");
        scriptFiles.writeFile.mockClear();

        await service.applyModelChange(EDITOR_ID, {
            elementId: ELEMENT_ID,
            kind: KIND,
            listenerIndex: undefined,
            content: "undone",
        });

        expect(applyEditMock).not.toHaveBeenCalled();
        expect(scriptFiles.writeFile).toHaveBeenCalledWith(scriptPath("groovy"), "undone");
    });

    it("is a no-op for a script that has no open tab", async () => {
        const { service, scriptFiles } = createService();

        await service.applyModelChange(EDITOR_ID, {
            elementId: ELEMENT_ID,
            kind: KIND,
            listenerIndex: undefined,
            content: "x",
        });

        expect(applyEditMock).not.toHaveBeenCalled();
        expect(scriptFiles.writeFile).not.toHaveBeenCalled();
    });

    it("closes the tab, saves a dirty buffer first, and deletes the file on element deletion", async () => {
        const { service, editor, scriptFiles } = createService();
        await openCanonicalScript(service, "groovy", "a");
        setOpenTabs([scriptPath("groovy")]);
        const doc = stageDocument(scriptPath("groovy"), "a", true);
        clearPosted(editor);

        await service.applyModelChange(EDITOR_ID, {
            elementId: ELEMENT_ID,
            kind: KIND,
            listenerIndex: undefined,
            content: undefined,
        });
        await flushAsync();

        expect(doc.save).toHaveBeenCalledTimes(1);
        expect(closeTabMock).toHaveBeenCalledTimes(1);
        const path = scriptPath("groovy");
        expect(scriptFiles.deleteFolder).toHaveBeenCalledWith(
            path.substring(0, path.lastIndexOf("/")),
        );
        expect(lastBroadcastRefs(editor)).toEqual([]);
        expect(
            (service as never as { openDocuments: Map<string, unknown> }).openDocuments.size,
        ).toBe(0);
    });
});

describe("ScriptTaskService lock broadcast", () => {
    it("broadcasts the open script (fileName + addressing) when a tab opens", async () => {
        const { service, editor } = createService();

        await openCanonicalScript(service);

        const filename = new ScriptUri(EDITOR_ID, ELEMENT_ID, KIND, undefined, undefined, "js")
            .filename;
        expect(lastBroadcastRefs(editor)).toEqual([
            {
                elementId: ELEMENT_ID,
                kind: KIND,
                listenerIndex: undefined,
                fileName: filename,
            },
        ]);
    });

    it("broadcasts an empty set when the last script tab is cleaned up", async () => {
        const { service, fireTabsChange, editor } = createService();
        await openCanonicalScript(service, "groovy");
        setOpenTabs([]);

        fireTabsChange({ closed: [makeTab(scriptPath("groovy"))], opened: [], changed: [] });
        // Cleanup is async now (flushes the sender before the lock re-broadcast).
        await flushAsync();

        expect(lastBroadcastRefs(editor)).toEqual([]);
    });

    it("replays what a hidden webview missed, then locks its open scripts again (resync)", async () => {
        const { service, fireDocChange, editor, scriptFiles } = createService();
        await openCanonicalScript(service, "groovy");
        editor.hidden = true;
        scriptFiles.readFile.mockResolvedValue("buffered");
        await typeInScript(fireDocChange, scriptPath("groovy"), "buffered");
        editor.hidden = false;
        setOpenTabs([scriptPath("groovy")]);
        clearPosted(editor);

        await service.resync(EDITOR_ID);

        expect(contentQueries(editor)).toEqual([
            new UpdateScriptContentQuery(ELEMENT_ID, KIND, undefined, "buffered"),
        ]);
        expect(editor.posted.at(-1)).toBeInstanceOf(UpdateOpenScriptEditorsQuery);
        expect(lastBroadcastRefs(editor)?.map(({ elementId }) => elementId)).toEqual([ELEMENT_ID]);
    });

    it("locks its open scripts again on a reload with nothing to replay (resync)", async () => {
        const { service, editor } = createService();
        await openCanonicalScript(service, "groovy");
        clearPosted(editor);

        await service.resync(EDITOR_ID);

        expect(contentQueries(editor)).toEqual([]);
        const lockBroadcasts = editor.postedOfType<UpdateOpenScriptEditorsQuery>(
            "UpdateOpenScriptEditorsQuery",
        );
        expect(lockBroadcasts).toHaveLength(1);
        expect(lockBroadcasts[0].openScripts.map(({ elementId }) => elementId)).toEqual([
            ELEMENT_ID,
        ]);
    });

    it("re-broadcasts the current open set on the reload handshake (syncLockState)", async () => {
        const { service, editor } = createService();
        await openCanonicalScript(service, "groovy");
        clearPosted(editor);

        service.syncLockState(EDITOR_ID);

        const refs = lastBroadcastRefs(editor);
        expect(refs).toHaveLength(1);
        expect(refs?.[0].elementId).toBe(ELEMENT_ID);
    });

    it("tolerates a hidden webview during the lock broadcast without logging", async () => {
        const { service, editor, notifier } = createService();
        editor.hidden = true;

        await openCanonicalScript(service, "groovy");
        // Let the fire-and-forget broadcast's rejection settle.
        await Promise.resolve();

        expect(notifier.logged("error")).toEqual([]);
    });
});

describe("ScriptTaskService.disposeEditor", () => {
    it("clears state, closes orphaned tabs, and deletes the editor's script directory", async () => {
        const { service, scriptFiles } = createService();
        await openCanonicalScript(service, "groovy");
        setOpenTabs([scriptPath("groovy")]);

        service.disposeEditor(EDITOR_ID);
        await flushAsync();

        expect(closeTabMock).toHaveBeenCalledTimes(1);
        expect(scriptFiles.deleteFolder).toHaveBeenCalledWith(
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

        service.disposeEditor(EDITOR_ID);
        await flushAsync();

        expect(doc.save).toHaveBeenCalledTimes(1);
    });

    it("makes a later tab-close for a disposed path a no-op", async () => {
        const { service, fireTabsChange, scriptFiles } = createService();
        await openCanonicalScript(service, "groovy");
        setOpenTabs([scriptPath("groovy")]);
        service.disposeEditor(EDITOR_ID);
        await flushAsync();
        scriptFiles.deleteFolder.mockClear();
        setOpenTabs([]);

        fireTabsChange({ closed: [makeTab(scriptPath("groovy"))], opened: [], changed: [] });
        await flushAsync();

        // State was already cleared by dispose, so performCleanup never runs.
        expect(scriptFiles.deleteFolder).not.toHaveBeenCalled();
    });

    it("touches no disk when the editor never opened a script", async () => {
        const { service, scriptFiles } = createService();

        service.disposeEditor(EDITOR_ID);
        await flushAsync();

        expect(closeTabMock).not.toHaveBeenCalled();
        // No cached base dir → nothing was ever written → nothing to delete.
        expect(scriptFiles.deleteFolder).not.toHaveBeenCalled();
    });
});

describe("ScriptTaskService keystroke debounce", () => {
    it("cancels a pending keystroke when a model change overwrites the buffer", async () => {
        const { service, fireDocChange, editor } = createService();
        await openCanonicalScript(service, "groovy", "a");
        stageDocument(scriptPath("groovy"), "a");
        clearPosted(editor);

        // Type, then let a canvas undo overwrite the buffer before the window ends.
        await fireDocChange(docChangeEvent(scriptPath("groovy"), "stale"));
        await service.applyModelChange(EDITOR_ID, {
            elementId: ELEMENT_ID,
            kind: KIND,
            listenerIndex: undefined,
            content: "undone",
        });
        await vi.advanceTimersByTimeAsync(STREAM_DEBOUNCE_MS);

        // The stale keystroke was cancelled: it never streamed back as a query.
        expect(contentQueries(editor)).toHaveLength(0);
        // The overwrite itself lands via a workspace edit, not a post.
        expect(applyEditMock).toHaveBeenCalledTimes(1);
    });

    it("flushes the last keystroke before releasing a closed script tab", async () => {
        const { service, fireDocChange, fireTabsChange, editor, scriptFiles } = createService();
        await openCanonicalScript(service, "groovy", "a");
        clearPosted(editor);

        // Type, then close the tab within the debounce window.
        await fireDocChange(docChangeEvent(scriptPath("groovy"), "typed"));
        setOpenTabs([]);
        fireTabsChange({ closed: [makeTab(scriptPath("groovy"))], opened: [], changed: [] });
        await flushAsync();

        // The flush delivered the last keystroke before tracking was released…
        const queries = contentQueries(editor);
        expect(queries).toHaveLength(1);
        expect(queries[0].content).toBe("typed");
        // …but the file itself survives the close.
        expect(scriptFiles.deleteFolder).not.toHaveBeenCalled();
    });

    it("arms pendingResync and defers cleanup when the flush hits a hidden webview", async () => {
        const { service, fireDocChange, fireTabsChange, editor, scriptFiles } = createService();
        await openCanonicalScript(service, "groovy", "a");
        editor.hidden = true;

        await fireDocChange(docChangeEvent(scriptPath("groovy"), "typed"));
        setOpenTabs([]);
        fireTabsChange({ closed: [makeTab(scriptPath("groovy"))], opened: [], changed: [] });
        await flushAsync();

        // The buffered edit still needs replaying, so cleanup is deferred: the
        // tracking entry (the replay payload) is retained and nothing is deleted.
        expect(
            (service as never as { pendingResync: Set<string> }).pendingResync.has(EDITOR_ID),
        ).toBe(true);
        expect(scriptFiles.deleteFolder).not.toHaveBeenCalled();
        expect(
            (service as never as { openDocuments: Map<string, unknown> }).openDocuments.has(
                scriptPath("groovy"),
            ),
        ).toBe(true);
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
        const { service, fireDocChange, editor, notifier } = createService();
        await openCanonicalScript(service, "groovy", "a");
        clearPosted(editor);

        await fireDocChange(docChangeEvent(scriptPath("groovy"), "typed"));
        service.disposeEditor(EDITOR_ID);
        await vi.advanceTimersByTimeAsync(STREAM_DEBOUNCE_MS);

        expect(contentQueries(editor)).toHaveLength(0);
        expect(notifier.logged("error")).toEqual([]);
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

        service.disposeEditor(EDITOR_ID);
        await flushAsync();

        expect(scriptXml.applyScriptContents).toHaveBeenCalledWith("<old-xml/>", [
            { elementId: ELEMENT_ID, kind: KIND, listenerIndex: undefined, content: "edited" },
        ]);
        const edit = applyEditMock.mock.calls[0][0] as { replacements: { newText: string }[] };
        expect(edit.replacements[0].newText).toBe("<new-xml/>");
        expect(diagramDoc.save).toHaveBeenCalledTimes(1);
        expect(scriptFiles.deleteFolder).toHaveBeenCalled();
    });

    it("skips the write-back but still deletes when nothing diverged", async () => {
        const { service, scriptFiles } = createService();
        await openCanonicalScript(service, "groovy", "edited");
        stageDocument(scriptPath("groovy"), "edited");
        stageDocument("/repo/process.bpmn", "<xml/>");
        // The default scriptXml stub resolves undefined (no divergence).

        service.disposeEditor(EDITOR_ID);
        await flushAsync();

        expect(applyEditMock).not.toHaveBeenCalled();
        expect(scriptFiles.deleteFolder).toHaveBeenCalled();
    });

    it("reads the script file when its buffer is gone, then writes back", async () => {
        const { service, scriptFiles, scriptXml } = createService();
        await openCanonicalScript(service, "groovy", "edited");
        // No staged script doc → the buffer is gone → readFile fallback.
        scriptFiles.readFile.mockResolvedValue("from-disk");
        stageDocument("/repo/process.bpmn", "<xml/>");
        scriptXml.applyScriptContents.mockResolvedValue("<new/>");

        service.disposeEditor(EDITOR_ID);
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

        service.disposeEditor(EDITOR_ID);
        await flushAsync();

        expect(openTextDocumentMock).toHaveBeenCalled();
        expect(diagramDoc.save).toHaveBeenCalledTimes(1);
    });

    it("logs and still deletes when the write-back throws", async () => {
        const { service, scriptFiles, scriptXml, notifier } = createService();
        await openCanonicalScript(service, "groovy", "edited");
        stageDocument(scriptPath("groovy"), "edited");
        stageDocument("/repo/process.bpmn", "<xml/>");
        const boom = new Error("boom");
        scriptXml.applyScriptContents.mockRejectedValue(boom);

        service.disposeEditor(EDITOR_ID);
        await flushAsync();

        expect(notifier.logged("error")).toEqual([boom.stack]);
        expect(scriptFiles.deleteFolder).toHaveBeenCalled();
    });

    it("skips the write-back entirely when the diagram was reverted", async () => {
        const { service, scriptXml } = createService();
        await openCanonicalScript(service, "groovy", "edited");
        stageDocument(scriptPath("groovy"), "edited");
        stageDocument("/repo/process.bpmn", "<xml/>");
        (service as never as { revertedEditors: Set<string> }).revertedEditors.add(EDITOR_ID);

        service.disposeEditor(EDITOR_ID);
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
        // Open a script so the editor has a script base directory.
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

        // No script opened → no script base directory → not tracked.
        await fireDocChange(diagramChangeEvent(false));

        expect(reverted(service).has(EDITOR_ID)).toBe(false);
    });
});

/** Reads the private tracking map for direct assertions. */
function openDocumentsOf(service: ScriptTaskService): Map<string, unknown> {
    return (service as never as { openDocuments: Map<string, unknown> }).openDocuments;
}

/** The slug directory holding the canonical script and its JS ambient siblings. */
function slugDirOf(path: string): string {
    return path.substring(0, path.lastIndexOf("/"));
}

describe("ScriptTaskService.materialize", () => {
    it("writes the script and its JS ambient files without opening, tracking, or locking", async () => {
        const { service, scriptFiles, editor } = createService();

        const result = await service.materialize(EDITOR_ID, {
            elementId: ELEMENT_ID,
            kind: KIND,
            listenerIndex: undefined,
            eventName: undefined,
            scriptFormat: "javascript",
            content: "console.log(1)",
        });

        expect(result).toEqual({ kind: "written" });
        expect(scriptFiles.writeFile).toHaveBeenCalledWith(scriptPath(), "console.log(1)");
        const written = scriptFiles.writeFile.mock.calls.map(([path]) => path);
        expect(written).toContain(`${slugDirOf(scriptPath())}/camunda.d.ts`);
        expect(written).toContain(`${slugDirOf(scriptPath())}/jsconfig.json`);

        // Generation is disk-only: no tab is revealed, the panel lock is not
        // broadcast, and nothing is tracked — live sync starts only on adoption.
        expect(showTextDocumentMock).not.toHaveBeenCalled();
        expect(editor.posted).toEqual([]);
        expect(openDocumentsOf(service).size).toBe(0);
    });

    it("writes no ambient files for a non-JavaScript script", async () => {
        const { service, scriptFiles } = createService();

        const result = await service.materialize(EDITOR_ID, {
            elementId: ELEMENT_ID,
            kind: KIND,
            listenerIndex: undefined,
            eventName: undefined,
            scriptFormat: "groovy",
            content: "a",
        });

        expect(result).toEqual({ kind: "written" });
        expect(scriptFiles.writeFile).toHaveBeenCalledTimes(1);
        expect(scriptFiles.writeFile).toHaveBeenCalledWith(scriptPath("groovy"), "a");
    });

    it("reports a cancelled language pick and writes nothing", async () => {
        const { service, scriptFiles } = createService();

        const result = await service.materialize(EDITOR_ID, {
            elementId: ELEMENT_ID,
            kind: KIND,
            listenerIndex: undefined,
            eventName: undefined,
            scriptFormat: "cobol",
            content: "x",
        });

        expect(result).toEqual({ kind: "cancelled" });
        expect(scriptFiles.writeFile).not.toHaveBeenCalled();
    });

    it("leaves the buffer untouched when a tab already owns the script", async () => {
        const { service, scriptFiles } = createService();
        // An open tab is the authoritative copy; materialise must not overwrite it.
        await openCanonicalScript(service, "groovy", "old");
        scriptFiles.writeFile.mockClear();

        const result = await service.materialize(EDITOR_ID, {
            elementId: ELEMENT_ID,
            kind: KIND,
            listenerIndex: undefined,
            eventName: undefined,
            scriptFormat: "groovy",
            content: "new",
        });

        expect(result).toEqual({ kind: "alreadyOpen" });
        expect(scriptFiles.writeFile).not.toHaveBeenCalled();
    });

    it("rejects when the script file cannot be written", async () => {
        const { service, scriptFiles } = createService();
        scriptFiles.writeFile.mockRejectedValueOnce(new Error("EACCES: permission denied"));

        await expect(
            service.materialize(EDITOR_ID, {
                elementId: ELEMENT_ID,
                kind: KIND,
                listenerIndex: undefined,
                eventName: undefined,
                scriptFormat: "groovy",
                content: "x",
            }),
        ).rejects.toThrow("EACCES: permission denied");
    });

    it("overwrites stale disk content on a fresh (untracked) materialize", async () => {
        const { service, scriptFiles } = createService();

        // Materialise never tracks, so a second call is still "untracked" and
        // rewrites — proving a file that went stale is refreshed from the model.
        await service.materialize(EDITOR_ID, {
            elementId: ELEMENT_ID,
            kind: KIND,
            listenerIndex: undefined,
            eventName: undefined,
            scriptFormat: "groovy",
            content: "v1",
        });
        await service.materialize(EDITOR_ID, {
            elementId: ELEMENT_ID,
            kind: KIND,
            listenerIndex: undefined,
            eventName: undefined,
            scriptFormat: "groovy",
            content: "v2",
        });

        expect(scriptFiles.writeFile).toHaveBeenLastCalledWith(scriptPath("groovy"), "v2");
    });
});

describe("ScriptTaskService adoption", () => {
    /** Fires an opened-tab event for a file URI and drains the fire-and-forget tail. */
    async function fireOpen(
        fireTabsChange: (event: unknown) => unknown,
        path: string,
    ): Promise<void> {
        fireTabsChange({ opened: [makeTab(path)], closed: [], changed: [] });
        await flushAsync();
    }

    it("adopts an untracked script: tracks it, sets its language, and broadcasts the lock", async () => {
        const { service, fireTabsChange, editor } = createService();

        await fireOpen(fireTabsChange, scriptPath());

        expect(openDocumentsOf(service).has(scriptPath())).toBe(true);
        expect(setTextDocumentLanguageMock).toHaveBeenCalledWith(expect.anything(), "javascript");
        const refs = lastBroadcastRefs(editor);
        expect(refs).toHaveLength(1);
        expect(refs?.[0]).toMatchObject({ elementId: ELEMENT_ID, kind: KIND });
    });

    it("never sweeps the adopted file, not even on a later write into its base dir", async () => {
        const { service, fireTabsChange, host } = createService();
        await host.workspace.writeFile(scriptPath(), "disk content");

        await fireOpen(fireTabsChange, scriptPath());
        await service.materialize(EDITOR_ID, {
            elementId: "Task_2",
            kind: KIND,
            listenerIndex: undefined,
            eventName: undefined,
            scriptFormat: "groovy",
            content: "b",
        });

        expect(host.workspace.files.get(scriptPath())).toBe("disk content");
        expect(host.workspace.files.get(scriptPath("groovy", "Task_2"))).toBe("b");
    });

    it("streams a subsequent keystroke into the model once the script is adopted", async () => {
        const { fireTabsChange, fireDocChange, editor } = createService();
        await fireOpen(fireTabsChange, scriptPath());
        clearPosted(editor);

        await typeInScript(fireDocChange, scriptPath(), "typed");

        expect(editor.posted).toContainEqual(
            new UpdateScriptContentQuery(ELEMENT_ID, KIND, undefined, "typed"),
        );
    });

    it("does not re-adopt our own open (no duplicate tracking or broadcast)", async () => {
        const { service, fireTabsChange, editor } = createService();
        // open tracks before revealing, so the opened-tab event it
        // would trigger must be a no-op for the adoption listener.
        await openCanonicalScript(service, "groovy");
        clearPosted(editor);

        await fireOpen(fireTabsChange, scriptPath("groovy"));

        expect(openDocumentsOf(service).size).toBe(1);
        expect(lastBroadcastRefs(editor)).toBeUndefined();
    });

    it("ignores an opened script whose editor hash matches no live session", async () => {
        const { service, fireTabsChange, editor } = createService();
        // A well-formed script path under a hash no open editor owns.
        const orphanPath = `${BASE_DIR}/deadbeef/${ELEMENT_ID}/script-task/${ELEMENT_ID}.js`;

        await fireOpen(fireTabsChange, orphanPath);

        expect(openDocumentsOf(service).has(orphanPath)).toBe(false);
        expect(lastBroadcastRefs(editor)).toBeUndefined();
    });

    it("ignores an opened script that resolves outside the editor's base directory", async () => {
        const { service, fireTabsChange, editor } = createService();
        // Right editor hash and slug shape, but a different tmp/scripting root:
        // the containment check against the resolved base dir must reject it.
        const hash = ScriptUri.hashEditorId(EDITOR_ID);
        const outsidePath = `/elsewhere/tmp/scripting/${hash}/${ELEMENT_ID}/script-task/${ELEMENT_ID}.js`;

        await fireOpen(fireTabsChange, outsidePath);

        expect(openDocumentsOf(service).has(outsidePath)).toBe(false);
        expect(lastBroadcastRefs(editor)).toBeUndefined();
    });

    it("ignores the camunda.d.ts ambient sibling (not a script language)", async () => {
        const { service, fireTabsChange, editor } = createService();
        const dtsPath = `${slugDirOf(scriptPath())}/camunda.d.ts`;

        await fireOpen(fireTabsChange, dtsPath);

        expect(openDocumentsOf(service).has(dtsPath)).toBe(false);
        expect(lastBroadcastRefs(editor)).toBeUndefined();
    });

    it("releases the lock but leaves the file on disk when an adopted tab is closed", async () => {
        const { service, fireTabsChange, editor, scriptFiles } = createService();
        await fireOpen(fireTabsChange, scriptPath());
        clearPosted(editor);

        // Close the adopted tab: tracking is released and the lock re-broadcast
        // empties, but adoption never owns deletion — the file survives.
        setOpenTabs([]);
        fireTabsChange({ closed: [makeTab(scriptPath())], opened: [], changed: [] });
        await flushAsync();

        expect(openDocumentsOf(service).has(scriptPath())).toBe(false);
        expect(lastBroadcastRefs(editor)).toEqual([]);
        expect(scriptFiles.deleteFolder).not.toHaveBeenCalled();
    });
});
