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
    // Takes a UNC server as the authority, as VS Code's `Uri.file` does.
    const fileUri = (path: string) => {
        const [, authority = "", uriPath = path] = /^\/\/([^/]+)(\/.*)$/.exec(path) ?? [];
        return {
            scheme: "file",
            authority,
            path: uriPath,
            fsPath: path,
            toString: () => `file://${authority}${uriPath}`,
        };
    };
    return {
        TabInputText,
        WorkspaceEdit,
        Range,
        ViewColumn: { Beside: 2 },
        Uri: {
            // `toUri` routes plain paths through `Uri.file`.
            file: fileUri,
            parse: (value: string) => {
                const [, authority, path] = /^file:\/\/([^/]*)(.*)$/.exec(value) ?? [];
                return fileUri(authority ? `//${authority}${path}` : path);
            },
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
    SCRIPT_STREAM_DEBOUNCE_MS,
    ScriptFileStore,
    ScriptLanguage,
    ScriptTabService,
    ScriptTargetResolver,
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

/** Stages an open TextDocument the adapter can find by path. */
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

/**
 * Builds the subject with port doubles, registers it, and captures the two
 * listener callbacks the subject hands to vscode so tests can fire document
 * and tab events directly.
 */
function createService(
    promptAnswers: PromptAnswers = {},
    { folder = "/repo", editorPath = EDITOR_PATH } = {},
) {
    // The canonical editor is live so adoption's reverse hash→editor lookup
    // resolves an opened script to a session.
    const host = createTestHost({ promptAnswers, folders: [folder] });
    const editor = host.openEditor(editorPath);
    const scriptFileStore = new ScriptFileStore(
        host.store,
        host.workspace,
        host.settings,
        new ArtifactService(host.workspace, host.settings),
        host.notifier,
        "/tmp",
        (path) => path,
    );
    // Spied so a test can see which script files the adapter touched or make one fail.
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

    const adapter = new ScriptTaskService(
        scriptFileStore,
        host.settings,
        host.notifier,
        scriptXml as never,
    );
    adapter.register({ subscriptions: [] } as never);
    const scriptTabs = new ScriptTabService(
        host.store,
        adapter,
        new ScriptTargetResolver(host.store, host.picker, host.notifier),
        scriptFileStore,
        host.notifier,
    );

    const fireDocChange = onDidChangeTextDocumentMock.mock.calls[0][0] as (
        event: unknown,
    ) => unknown;
    const fireSave = onDidSaveTextDocumentMock.mock.calls[0][0] as (document: unknown) => unknown;
    const fireTabsChange = onDidChangeTabsMock.mock.calls[0][0] as (event: unknown) => unknown;

    return {
        scriptTabs,
        adapter,
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
    await vi.advanceTimersByTimeAsync(SCRIPT_STREAM_DEBOUNCE_MS);
}

/** A keystroke the hidden webview misses, so its next reload replays the editor's tabs. */
async function missEditWhileHidden(
    fireDocChange: (event: unknown) => unknown,
    editor: FakeEditorHandle,
    path = scriptPath("groovy"),
): Promise<void> {
    editor.hidden = true;
    await typeInScript(fireDocChange, path, "typed while hidden");
    editor.hidden = false;
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
    scriptTabs: ScriptTabService,
    format = "javascript",
    content = "a",
): Promise<void> {
    await scriptTabs.open(EDITOR_ID, {
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
    // Fake timers make the keystroke debounce deterministic; each test
    // advances time explicitly instead of sleeping.
    vi.useFakeTimers();
    openTabGroups = [];
    openTextDocuments = [];
});

afterEach(() => {
    vi.useRealTimers();
});

describe("ScriptTaskService under ScriptTabService: openTab/revealTab", () => {
    it("writes content, ensures the gitignore, and reveals the editor for a new script", async () => {
        const { scriptTabs, host } = createService();

        await openCanonicalScript(scriptTabs, "javascript", "console.log(1)");

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
        const { scriptTabs, scriptFiles } = createService();

        await openCanonicalScript(scriptTabs, "javascript");

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
        const { scriptTabs, scriptFiles } = createService();

        await openCanonicalScript(scriptTabs, "groovy");

        expect(scriptFiles.writeFile).toHaveBeenCalledTimes(1);
        expect(scriptFiles.writeFile).toHaveBeenCalledWith(scriptPath("groovy"), "a");
    });

    it("persists the picked format then opens with its extension when the format is unsupported", async () => {
        const { scriptTabs, scriptFiles, editor } = createService({ scriptLanguage: "groovy" });

        await scriptTabs.open(EDITOR_ID, {
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
        const { scriptTabs, scriptFiles } = createService();

        await openCanonicalScript(scriptTabs, "groovy");
        await openCanonicalScript(scriptTabs, "groovy");

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
        const { scriptTabs, host } = createService();

        await openCanonicalScript(scriptTabs, "groovy");
        host.settings.values.configFolder = ".bpmn";
        await scriptTabs.open(EDITOR_ID, {
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
        const { scriptTabs } = createService();

        await openCanonicalScript(scriptTabs, "groovy", "a");
        await scriptTabs.open(EDITOR_ID, {
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
        expect(scriptTabs.editorOfTab(scriptPath("groovy"))).toBe(EDITOR_ID);
        expect(scriptTabs.editorOfTab(scriptPath("groovy", "Task_2"))).toBe(EDITOR_ID);
    });
});

describe("ScriptTaskService document changes reported to ScriptTabService", () => {
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
        const { scriptTabs, fireDocChange, editor } = createService();
        await openCanonicalScript(scriptTabs);
        // Drop the open-time lock broadcast so the assertion isolates this event.
        clearPosted(editor);

        await fireDocChange({
            document: { uri: Uri.file(scriptPath()), getText: () => "next" },
            contentChanges: [],
        });

        expect(editor.posted).toEqual([]);
    });

    it("skips the echo of our own write while the path is in the writing guard", async () => {
        const { scriptTabs, fireDocChange, editor, adapter } = createService();
        await openCanonicalScript(scriptTabs);
        clearPosted(editor);

        // Pre-seed the guard so the change looks like the echo of our own write.
        (adapter as never as { writingGuard: Set<string> }).writingGuard.add(scriptPath());

        await fireDocChange(docChangeEvent(scriptPath(), "next"));

        expect(editor.posted).toEqual([]);
    });

    it("leaves an ordinary document's text unread", async () => {
        const { fireDocChange, editor } = createService();
        const getText = vi.fn();

        await fireDocChange({
            document: { uri: Uri.file("/repo/src/app.js"), getText },
            contentChanges: [{}],
        });
        await vi.advanceTimersByTimeAsync(SCRIPT_STREAM_DEBOUNCE_MS);

        expect(getText).not.toHaveBeenCalled();
        expect(editor.posted).toEqual([]);
    });

    it("ignores changes to a path that is not tracked", async () => {
        const { fireDocChange, editor } = createService();

        await fireDocChange(docChangeEvent(scriptPath(), "next"));

        expect(editor.posted).toEqual([]);
    });

    it("posts an update for a tracked document without mirroring to disk", async () => {
        const { scriptTabs, fireDocChange, scriptFiles, editor } = createService();
        await openCanonicalScript(scriptTabs, "groovy");
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
        const { scriptTabs, fireDocChange, editor, notifier, scriptFiles } = createService();
        await openCanonicalScript(scriptTabs, "groovy");
        editor.hidden = true;
        scriptFiles.readFile.mockResolvedValue("buffered");

        await typeInScript(fireDocChange, scriptPath("groovy"), "buffered");

        expect(notifier.logged("error")).toEqual([]);

        // The editor is now armed: a resync replays the buffered edit.
        editor.hidden = false;
        await scriptTabs.resync(EDITOR_ID);
        // The lock re-broadcast is posted last; assert the content replay landed.
        expect(editor.posted).toContainEqual(
            new UpdateScriptContentQuery(ELEMENT_ID, KIND, undefined, "buffered"),
        );
    });

    it("logs any non-hidden error and does not buffer it", async () => {
        const { scriptTabs, fireDocChange, editor, notifier } = createService();
        await openCanonicalScript(scriptTabs, "groovy");
        const failure = new Error("boom");
        vi.spyOn(editor, "postMessage").mockRejectedValueOnce(failure);

        await typeInScript(fireDocChange, scriptPath("groovy"), "next");

        expect(notifier.logged("error")).toEqual([failure.stack]);
        clearPosted(editor);
        await scriptTabs.resync(EDITOR_ID);
        expect(contentQueries(editor)).toEqual([]);
    });

    it("coalesces a keystroke burst into a single trailing query", async () => {
        const { scriptTabs, fireDocChange, editor } = createService();
        await openCanonicalScript(scriptTabs, "groovy", "a");
        clearPosted(editor);

        await fireDocChange(docChangeEvent(scriptPath("groovy"), "ab"));
        await fireDocChange(docChangeEvent(scriptPath("groovy"), "abc"));
        // Nothing streams while still inside the window.
        await vi.advanceTimersByTimeAsync(SCRIPT_STREAM_DEBOUNCE_MS - 1);
        expect(contentQueries(editor)).toHaveLength(0);

        await vi.advanceTimersByTimeAsync(1);
        const queries = contentQueries(editor);
        expect(queries).toHaveLength(1);
        expect(queries[0].content).toBe("abc");
    });
});

describe("ScriptTabService.resync over VS Code tabs (readTabContent, isTabShown)", () => {
    it("replays nothing when the webview missed no edit", async () => {
        const { scriptTabs, editor, scriptFiles } = createService();
        await openCanonicalScript(scriptTabs, "groovy");
        clearPosted(editor);

        await scriptTabs.resync(EDITOR_ID);

        expect(scriptFiles.readFile).not.toHaveBeenCalled();
        expect(contentQueries(editor)).toEqual([]);
    });

    it("replays from the open buffer, preferring it over the (possibly stale) file", async () => {
        const { scriptTabs, editor, scriptFiles, fireDocChange } = createService();
        await openCanonicalScript(scriptTabs, "groovy");
        setOpenTabs([scriptPath("groovy")]);
        stageDocument(scriptPath("groovy"), "buffer-content");
        scriptFiles.readFile.mockResolvedValue("stale-disk-content");
        clearPosted(editor);

        await missEditWhileHidden(fireDocChange, editor);
        await scriptTabs.resync(EDITOR_ID);

        expect(editor.posted).toContainEqual(
            new UpdateScriptContentQuery(ELEMENT_ID, KIND, undefined, "buffer-content"),
        );
        expect(scriptFiles.readFile).not.toHaveBeenCalled();
    });

    it("replays only that editor's tabs from disk, and only once", async () => {
        const { scriptTabs, host, editor, scriptFiles, fireDocChange } = createService();
        await openCanonicalScript(scriptTabs, "groovy");
        // A doc for a different editor must be skipped during replay.
        const otherEditor = host.openEditor("/repo/other.bpmn");
        await scriptTabs.open(otherEditor.id, {
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

        await missEditWhileHidden(fireDocChange, editor);
        await scriptTabs.resync(EDITOR_ID);

        expect(contentQueries(editor)).toHaveLength(1);
        expect(contentQueries(otherEditor)).toEqual([]);
        expect(editor.posted).toContainEqual(
            new UpdateScriptContentQuery(ELEMENT_ID, KIND, undefined, "decoded"),
        );
        clearPosted(editor);
        await scriptTabs.resync(EDITOR_ID);
        expect(contentQueries(editor)).toEqual([]);
    });

    it("skips an entry whose readFile rejects and continues the loop", async () => {
        const { scriptTabs, editor, scriptFiles, notifier, fireDocChange } = createService();
        await openCanonicalScript(scriptTabs, "groovy");
        await scriptTabs.open(EDITOR_ID, {
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

        await missEditWhileHidden(fireDocChange, editor);
        await scriptTabs.resync(EDITOR_ID);

        expect(contentQueries(editor)).toHaveLength(1);
        expect(notifier.logged("error")).toEqual([]);
    });

    it("skips a document untracked while an earlier one replays", async () => {
        const { scriptTabs, editor, scriptFiles, fireDocChange } = createService();
        await openCanonicalScript(scriptTabs, "groovy");
        await scriptTabs.open(EDITOR_ID, {
            elementId: "Task_2",
            kind: KIND,
            listenerIndex: undefined,
            eventName: undefined,
            scriptFormat: "groovy",
            content: "b",
        });
        setOpenTabs([scriptPath("groovy"), scriptPath("groovy", "Task_2")]);
        scriptFiles.readFile.mockImplementationOnce(async () => {
            await scriptTabs.applyModelChange(EDITOR_ID, {
                elementId: "Task_2",
                kind: KIND,
                listenerIndex: undefined,
                content: undefined,
            });
            return "first";
        });
        scriptFiles.readFile.mockResolvedValue("second");
        clearPosted(editor);

        await missEditWhileHidden(fireDocChange, editor);
        await scriptTabs.resync(EDITOR_ID);

        expect(contentQueries(editor).map((query) => query.content)).toEqual(["first"]);
    });

    it("finishes a deferred cleanup when the replayed tab is no longer open anywhere", async () => {
        const { scriptTabs, editor, scriptFiles, fireDocChange } = createService();
        await openCanonicalScript(scriptTabs, "groovy");
        scriptFiles.readFile.mockResolvedValue("c");
        // Tab was closed while hidden: not present in any group during replay.
        setOpenTabs([]);
        clearPosted(editor);

        await missEditWhileHidden(fireDocChange, editor);
        await scriptTabs.resync(EDITOR_ID);
        await flushAsync();

        const path = scriptPath("groovy");
        // The replay happened, then tracking was released — but the file stays
        // on disk (deletion is reserved for element deletion / editor dispose).
        expect(scriptFiles.deleteFolder).not.toHaveBeenCalled();
        expect(scriptTabs.editorOfTab(path)).toBeUndefined();
    });

    it("replays again on the next reload when the webview hides again mid-replay", async () => {
        const { scriptTabs, editor, scriptFiles, fireDocChange } = createService();
        await openCanonicalScript(scriptTabs, "groovy");
        setOpenTabs([scriptPath("groovy")]);
        scriptFiles.readFile.mockResolvedValue("c");
        await missEditWhileHidden(fireDocChange, editor);
        vi.spyOn(editor, "postMessage").mockRejectedValueOnce(
            new Error("The active editor is hidden."),
        );

        await scriptTabs.resync(EDITOR_ID);
        clearPosted(editor);
        await scriptTabs.resync(EDITOR_ID);

        expect(contentQueries(editor).map(({ content }) => content)).toEqual(["c"]);
    });
});

describe("ScriptTaskService tab closes reported to ScriptTabService", () => {
    it("releases tracking but keeps the file when a tab is closed for good", async () => {
        const { scriptTabs, fireTabsChange, scriptFiles } = createService();
        await openCanonicalScript(scriptTabs, "groovy");
        setOpenTabs([]);

        fireTabsChange({ closed: [makeTab(scriptPath("groovy"))], opened: [], changed: [] });
        await flushAsync();

        const path = scriptPath("groovy");
        // A plain tab close must not delete the file — reopening it has to work.
        expect(scriptFiles.deleteFolder).not.toHaveBeenCalled();
        expect(scriptTabs.editorOfTab(path)).toBeUndefined();
    });

    it("treats a close as a move (no cleanup) when the uri is still open in another tab", async () => {
        const { scriptTabs, fireTabsChange, scriptFiles } = createService();
        await openCanonicalScript(scriptTabs, "groovy");
        setOpenTabs([scriptPath("groovy")]);

        fireTabsChange({ closed: [makeTab(scriptPath("groovy"))], opened: [], changed: [] });
        await flushAsync();

        expect(scriptFiles.deleteFolder).not.toHaveBeenCalled();
        expect(scriptTabs.editorOfTab(scriptPath("groovy"))).toBe(EDITOR_ID);
    });

    it("defers cleanup when the editor is pending resync", async () => {
        const { scriptTabs, fireTabsChange, scriptFiles, fireDocChange, editor } = createService();
        await openCanonicalScript(scriptTabs, "groovy");
        setOpenTabs([]);
        await missEditWhileHidden(fireDocChange, editor);

        fireTabsChange({ closed: [makeTab(scriptPath("groovy"))], opened: [], changed: [] });
        await flushAsync();

        expect(scriptFiles.deleteFolder).not.toHaveBeenCalled();
        // The tab is the deferred replay's payload now, so it stays tracked
        // until the reload replays it.
        expect(scriptTabs.editorOfTab(scriptPath("groovy"))).toBe(EDITOR_ID);
    });

    it("ignores a closed tab whose uri is not tracked", async () => {
        const { fireTabsChange, scriptFiles } = createService();

        fireTabsChange({ closed: [makeTab(scriptPath())], opened: [], changed: [] });
        await flushAsync();

        expect(scriptFiles.deleteFolder).not.toHaveBeenCalled();
    });

    it("ignores closed tabs for unrelated files", async () => {
        const { scriptTabs, fireTabsChange, scriptFiles } = createService();
        await openCanonicalScript(scriptTabs, "groovy");
        scriptFiles.deleteFolder.mockClear();

        fireTabsChange({ closed: [makeTab("/somewhere/else/x.js")], opened: [], changed: [] });
        await flushAsync();

        expect(scriptFiles.deleteFolder).not.toHaveBeenCalled();
    });
});

describe("ScriptTaskService reopen after close", () => {
    it("rewrites the file with fresh model content when a closed script is reopened", async () => {
        const { scriptTabs, fireTabsChange, scriptFiles } = createService();
        await openCanonicalScript(scriptTabs, "groovy", "old");

        // Close the tab: tracking is released, the file is left on disk.
        setOpenTabs([]);
        fireTabsChange({ closed: [makeTab(scriptPath("groovy"))], opened: [], changed: [] });
        await flushAsync();
        scriptFiles.writeFile.mockClear();

        // Reopen: the tab is no longer tracked, so this takes the rewrite
        // branch (not the reveal branch) and overwrites the stale file.
        await openCanonicalScript(scriptTabs, "groovy", "new");

        expect(scriptFiles.writeFile).toHaveBeenCalledWith(scriptPath("groovy"), "new");
    });

    it("still deletes the editor hash dir on dispose after a tab was closed earlier", async () => {
        const { scriptTabs, fireTabsChange, scriptFiles } = createService();
        await openCanonicalScript(scriptTabs, "groovy");

        // Close the script tab first — its file is deliberately left behind.
        setOpenTabs([]);
        fireTabsChange({ closed: [makeTab(scriptPath("groovy"))], opened: [], changed: [] });
        await flushAsync();
        expect(scriptFiles.deleteFolder).not.toHaveBeenCalled();

        // Editor dispose sweeps the whole <editorHash> dir, covering the
        // earlier-closed script's leftover file.
        scriptTabs.disposeEditor(EDITOR_ID);
        await flushAsync();

        expect(scriptFiles.deleteFolder).toHaveBeenCalledWith(
            `${BASE_DIR}/${ScriptUri.hashEditorId(EDITOR_ID)}`,
        );
    });
});

describe("ScriptTaskService under ScriptTabService: updateTabContent/closeTab", () => {
    it("overwrites the open buffer through a workspace edit under the writing guard", async () => {
        const { scriptTabs, editor } = createService();
        await openCanonicalScript(scriptTabs, "groovy", "old");
        stageDocument(scriptPath("groovy"), "old");
        clearPosted(editor);

        await scriptTabs.applyModelChange(EDITOR_ID, {
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
        const { scriptTabs } = createService();
        await openCanonicalScript(scriptTabs, "groovy", "same");
        stageDocument(scriptPath("groovy"), "same");

        await scriptTabs.applyModelChange(EDITOR_ID, {
            elementId: ELEMENT_ID,
            kind: KIND,
            listenerIndex: undefined,
            content: "same",
        });

        expect(applyEditMock).not.toHaveBeenCalled();
    });

    it("writes the file when no document is materialised for the tab", async () => {
        const { scriptTabs, scriptFiles } = createService();
        await openCanonicalScript(scriptTabs, "groovy", "old");
        scriptFiles.writeFile.mockClear();

        await scriptTabs.applyModelChange(EDITOR_ID, {
            elementId: ELEMENT_ID,
            kind: KIND,
            listenerIndex: undefined,
            content: "undone",
        });

        expect(applyEditMock).not.toHaveBeenCalled();
        expect(scriptFiles.writeFile).toHaveBeenCalledWith(scriptPath("groovy"), "undone");
    });

    it("is a no-op for a script that has no open tab", async () => {
        const { scriptTabs, scriptFiles } = createService();

        await scriptTabs.applyModelChange(EDITOR_ID, {
            elementId: ELEMENT_ID,
            kind: KIND,
            listenerIndex: undefined,
            content: "x",
        });

        expect(applyEditMock).not.toHaveBeenCalled();
        expect(scriptFiles.writeFile).not.toHaveBeenCalled();
    });

    it("closes the tab, saves a dirty buffer first, and deletes the file on element deletion", async () => {
        const { scriptTabs, editor, scriptFiles } = createService();
        await openCanonicalScript(scriptTabs, "groovy", "a");
        setOpenTabs([scriptPath("groovy")]);
        const doc = stageDocument(scriptPath("groovy"), "a", true);
        clearPosted(editor);

        await scriptTabs.applyModelChange(EDITOR_ID, {
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
        expect(scriptTabs.editorOfTab(path)).toBeUndefined();
    });
});

describe("ScriptTaskService lock broadcast", () => {
    it("broadcasts the open script (fileName + addressing) when a tab opens", async () => {
        const { scriptTabs, editor } = createService();

        await openCanonicalScript(scriptTabs);

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
        const { scriptTabs, fireTabsChange, editor } = createService();
        await openCanonicalScript(scriptTabs, "groovy");
        setOpenTabs([]);

        fireTabsChange({ closed: [makeTab(scriptPath("groovy"))], opened: [], changed: [] });
        // Cleanup is async now (flushes the sender before the lock re-broadcast).
        await flushAsync();

        expect(lastBroadcastRefs(editor)).toEqual([]);
    });

    it("replays what a hidden webview missed, then locks its open scripts again (resync)", async () => {
        const { scriptTabs, fireDocChange, editor, scriptFiles } = createService();
        await openCanonicalScript(scriptTabs, "groovy");
        editor.hidden = true;
        scriptFiles.readFile.mockResolvedValue("buffered");
        await typeInScript(fireDocChange, scriptPath("groovy"), "buffered");
        editor.hidden = false;
        setOpenTabs([scriptPath("groovy")]);
        clearPosted(editor);

        await scriptTabs.resync(EDITOR_ID);

        expect(contentQueries(editor)).toEqual([
            new UpdateScriptContentQuery(ELEMENT_ID, KIND, undefined, "buffered"),
        ]);
        expect(editor.posted.at(-1)).toBeInstanceOf(UpdateOpenScriptEditorsQuery);
        expect(lastBroadcastRefs(editor)?.map(({ elementId }) => elementId)).toEqual([ELEMENT_ID]);
    });

    it("locks its open scripts again on a reload with nothing to replay (resync)", async () => {
        const { scriptTabs, editor } = createService();
        await openCanonicalScript(scriptTabs, "groovy");
        clearPosted(editor);

        await scriptTabs.resync(EDITOR_ID);

        expect(contentQueries(editor)).toEqual([]);
        const lockBroadcasts = editor.postedOfType<UpdateOpenScriptEditorsQuery>(
            "UpdateOpenScriptEditorsQuery",
        );
        expect(lockBroadcasts).toHaveLength(1);
        expect(lockBroadcasts[0].openScripts.map(({ elementId }) => elementId)).toEqual([
            ELEMENT_ID,
        ]);
    });

    it("re-broadcasts the current open set on the reload handshake", async () => {
        const { scriptTabs, editor } = createService();
        await openCanonicalScript(scriptTabs, "groovy");
        clearPosted(editor);

        await scriptTabs.resync(EDITOR_ID);

        const refs = lastBroadcastRefs(editor);
        expect(refs).toHaveLength(1);
        expect(refs?.[0].elementId).toBe(ELEMENT_ID);
    });

    it("tolerates a hidden webview during the lock broadcast without logging", async () => {
        const { scriptTabs, editor, notifier } = createService();
        editor.hidden = true;

        await openCanonicalScript(scriptTabs, "groovy");
        // Let the fire-and-forget broadcast's rejection settle.
        await Promise.resolve();

        expect(notifier.logged("error")).toEqual([]);
    });
});

describe("ScriptTaskService under ScriptTabService: closeEditorTabs", () => {
    it("clears state, closes orphaned tabs, and deletes the editor's script directory", async () => {
        const { scriptTabs, scriptFiles } = createService();
        await openCanonicalScript(scriptTabs, "groovy");
        setOpenTabs([scriptPath("groovy")]);

        scriptTabs.disposeEditor(EDITOR_ID);
        await flushAsync();

        expect(closeTabMock).toHaveBeenCalledTimes(1);
        expect(scriptFiles.deleteFolder).toHaveBeenCalledWith(
            `${BASE_DIR}/${ScriptUri.hashEditorId(EDITOR_ID)}`,
        );
        expect(scriptTabs.editorOfTab(scriptPath("groovy"))).toBeUndefined();
    });

    it("saves a dirty script buffer before closing its tab", async () => {
        const { scriptTabs } = createService();
        await openCanonicalScript(scriptTabs, "groovy");
        setOpenTabs([scriptPath("groovy")]);
        const doc = stageDocument(scriptPath("groovy"), "edited", true);

        scriptTabs.disposeEditor(EDITOR_ID);
        await flushAsync();

        expect(doc.save).toHaveBeenCalledTimes(1);
    });

    it("makes a later tab-close for a disposed path a no-op", async () => {
        const { scriptTabs, fireTabsChange, scriptFiles } = createService();
        await openCanonicalScript(scriptTabs, "groovy");
        setOpenTabs([scriptPath("groovy")]);
        scriptTabs.disposeEditor(EDITOR_ID);
        await flushAsync();
        scriptFiles.deleteFolder.mockClear();
        setOpenTabs([]);

        fireTabsChange({ closed: [makeTab(scriptPath("groovy"))], opened: [], changed: [] });
        await flushAsync();

        // State was already cleared by dispose, so performCleanup never runs.
        expect(scriptFiles.deleteFolder).not.toHaveBeenCalled();
    });

    it("touches no disk when the editor never opened a script", async () => {
        const { scriptTabs, scriptFiles } = createService();

        scriptTabs.disposeEditor(EDITOR_ID);
        await flushAsync();

        expect(closeTabMock).not.toHaveBeenCalled();
        // No cached base dir → nothing was ever written → nothing to delete.
        expect(scriptFiles.deleteFolder).not.toHaveBeenCalled();
    });
});

describe("ScriptTaskService keystroke debounce", () => {
    it("cancels a pending keystroke when a model change overwrites the buffer", async () => {
        const { scriptTabs, fireDocChange, editor } = createService();
        await openCanonicalScript(scriptTabs, "groovy", "a");
        stageDocument(scriptPath("groovy"), "a");
        clearPosted(editor);

        // Type, then let a canvas undo overwrite the buffer before the window ends.
        await fireDocChange(docChangeEvent(scriptPath("groovy"), "stale"));
        await scriptTabs.applyModelChange(EDITOR_ID, {
            elementId: ELEMENT_ID,
            kind: KIND,
            listenerIndex: undefined,
            content: "undone",
        });
        await vi.advanceTimersByTimeAsync(SCRIPT_STREAM_DEBOUNCE_MS);

        // The stale keystroke was cancelled: it never streamed back as a query.
        expect(contentQueries(editor)).toHaveLength(0);
        // The overwrite itself lands via a workspace edit, not a post.
        expect(applyEditMock).toHaveBeenCalledTimes(1);
    });

    it("flushes the last keystroke before releasing a closed script tab", async () => {
        const { scriptTabs, fireDocChange, fireTabsChange, editor, scriptFiles } = createService();
        await openCanonicalScript(scriptTabs, "groovy", "a");
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

});

describe("ScriptTaskService dispose write-back", () => {
    it("writes the buffered script into the diagram and saves before deleting", async () => {
        const { scriptTabs, scriptFiles, scriptXml } = createService();
        await openCanonicalScript(scriptTabs, "groovy", "edited");
        setOpenTabs([scriptPath("groovy")]);
        stageDocument(scriptPath("groovy"), "edited");
        const diagramDoc = stageDocument("/repo/process.bpmn", "<old-xml/>");
        scriptXml.applyScriptContents.mockResolvedValue("<new-xml/>");

        scriptTabs.disposeEditor(EDITOR_ID);
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
        const { scriptTabs, scriptFiles } = createService();
        await openCanonicalScript(scriptTabs, "groovy", "edited");
        stageDocument(scriptPath("groovy"), "edited");
        stageDocument("/repo/process.bpmn", "<xml/>");
        // The default scriptXml stub resolves undefined (no divergence).

        scriptTabs.disposeEditor(EDITOR_ID);
        await flushAsync();

        expect(applyEditMock).not.toHaveBeenCalled();
        expect(scriptFiles.deleteFolder).toHaveBeenCalled();
    });

    it("reads the script file when its buffer is gone, then writes back", async () => {
        const { scriptTabs, scriptFiles, scriptXml } = createService();
        await openCanonicalScript(scriptTabs, "groovy", "edited");
        // No staged script doc → the buffer is gone → readFile fallback.
        scriptFiles.readFile.mockResolvedValue("from-disk");
        stageDocument("/repo/process.bpmn", "<xml/>");
        scriptXml.applyScriptContents.mockResolvedValue("<new/>");

        scriptTabs.disposeEditor(EDITOR_ID);
        await flushAsync();

        expect(scriptXml.applyScriptContents).toHaveBeenCalledWith("<xml/>", [
            { elementId: ELEMENT_ID, kind: KIND, listenerIndex: undefined, content: "from-disk" },
        ]);
    });

    it("opens the diagram document when it is not already staged", async () => {
        const { scriptTabs, scriptXml } = createService();
        await openCanonicalScript(scriptTabs, "groovy", "edited");
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

        scriptTabs.disposeEditor(EDITOR_ID);
        await flushAsync();

        expect(openTextDocumentMock).toHaveBeenCalled();
        expect(diagramDoc.save).toHaveBeenCalledTimes(1);
    });

    it("logs and still deletes when the write-back throws", async () => {
        const { scriptTabs, scriptFiles, scriptXml, notifier } = createService();
        await openCanonicalScript(scriptTabs, "groovy", "edited");
        stageDocument(scriptPath("groovy"), "edited");
        stageDocument("/repo/process.bpmn", "<xml/>");
        const boom = new Error("boom");
        scriptXml.applyScriptContents.mockRejectedValue(boom);

        scriptTabs.disposeEditor(EDITOR_ID);
        await flushAsync();

        expect(notifier.logged("error")).toEqual([boom.stack]);
        expect(scriptFiles.deleteFolder).toHaveBeenCalled();
    });

    it("skips the write-back entirely when the diagram was reverted", async () => {
        const { scriptTabs, scriptXml, adapter } = createService();
        await openCanonicalScript(scriptTabs, "groovy", "edited");
        stageDocument(scriptPath("groovy"), "edited");
        stageDocument("/repo/process.bpmn", "<xml/>");
        (adapter as never as { revertedEditors: Set<string> }).revertedEditors.add(EDITOR_ID);

        scriptTabs.disposeEditor(EDITOR_ID);
        await flushAsync();

        expect(scriptXml.applyScriptContents).not.toHaveBeenCalled();
        expect(applyEditMock).not.toHaveBeenCalled();
    });
});

describe("ScriptTaskService revert tracking", () => {
    /** The private revert set, read for assertions. */
    function reverted(adapter: ScriptTaskService): Set<string> {
        return (adapter as never as { revertedEditors: Set<string> }).revertedEditors;
    }

    it("marks the editor on a clean diagram change and clears it on save", async () => {
        const { scriptTabs, fireDocChange, fireSave, adapter } = createService();
        // Open a script so the editor has a script base directory.
        await openCanonicalScript(scriptTabs, "groovy");

        // A change landing on an already-clean diagram is a "Don't Save" revert.
        await fireDocChange(diagramChangeEvent(false));
        expect(reverted(adapter).has(EDITOR_ID)).toBe(true);

        // Saving the diagram at the prompt is not a revert — clear the mark.
        fireSave({ uri: { toString: () => EDITOR_ID } });
        expect(reverted(adapter).has(EDITOR_ID)).toBe(false);
    });

    it("unmarks the editor when the diagram becomes dirty again", async () => {
        const { scriptTabs, fireDocChange, adapter } = createService();
        await openCanonicalScript(scriptTabs, "groovy");

        await fireDocChange(diagramChangeEvent(false));
        expect(reverted(adapter).has(EDITOR_ID)).toBe(true);

        // The user resumed editing: a dirty change clears the revert mark.
        await fireDocChange(diagramChangeEvent(true));
        expect(reverted(adapter).has(EDITOR_ID)).toBe(false);
    });

    it("ignores diagram changes for editors that never opened a script", async () => {
        const { fireDocChange, adapter } = createService();

        // No script opened → no script base directory → not tracked.
        await fireDocChange(diagramChangeEvent(false));

        expect(reverted(adapter).has(EDITOR_ID)).toBe(false);
    });
});

/** Reads the private tracking map for direct assertions. */
/** The slug directory holding the canonical script and its JS ambient siblings. */
function slugDirOf(path: string): string {
    return path.substring(0, path.lastIndexOf("/"));
}

describe("ScriptTaskService under ScriptTabService: writeScript", () => {
    it("writes the script and its JS ambient files without opening, tracking, or locking", async () => {
        const { scriptTabs, scriptFiles, editor } = createService();

        const result = await scriptTabs.materialize(EDITOR_ID, {
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
        expect(scriptTabs.editorOfTab(scriptPath())).toBeUndefined();
    });

    it("writes no ambient files for a non-JavaScript script", async () => {
        const { scriptTabs, scriptFiles } = createService();

        const result = await scriptTabs.materialize(EDITOR_ID, {
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

    it("rejects when the script file cannot be written", async () => {
        const { scriptTabs, scriptFiles } = createService();
        scriptFiles.writeFile.mockRejectedValueOnce(new Error("EACCES: permission denied"));

        await expect(
            scriptTabs.materialize(EDITOR_ID, {
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
        const { scriptTabs, scriptFiles } = createService();

        // Materialise never tracks, so a second call is still "untracked" and
        // rewrites — proving a file that went stale is refreshed from the model.
        await scriptTabs.materialize(EDITOR_ID, {
            elementId: ELEMENT_ID,
            kind: KIND,
            listenerIndex: undefined,
            eventName: undefined,
            scriptFormat: "groovy",
            content: "v1",
        });
        await scriptTabs.materialize(EDITOR_ID, {
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
        const { scriptTabs, fireTabsChange, editor } = createService();

        await fireOpen(fireTabsChange, scriptPath());

        expect(scriptTabs.editorOfTab(scriptPath())).toBe(EDITOR_ID);
        expect(setTextDocumentLanguageMock).toHaveBeenCalledWith(expect.anything(), "javascript");
        const refs = lastBroadcastRefs(editor);
        expect(refs).toHaveLength(1);
        expect(refs?.[0]).toMatchObject({ elementId: ELEMENT_ID, kind: KIND });
    });

    it("never sweeps the adopted file, not even on a later write into its base dir", async () => {
        const { scriptTabs, fireTabsChange, host } = createService();
        await host.workspace.writeFile(scriptPath(), "disk content");

        await fireOpen(fireTabsChange, scriptPath());
        await scriptTabs.materialize(EDITOR_ID, {
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
        const { scriptTabs, fireTabsChange, editor } = createService();
        // open tracks before revealing, so the opened-tab event it
        // would trigger must be a no-op for the adoption listener.
        await openCanonicalScript(scriptTabs, "groovy");
        clearPosted(editor);

        await fireOpen(fireTabsChange, scriptPath("groovy"));

        expect(scriptTabs.editorOfTab(scriptPath("groovy"))).toBe(EDITOR_ID);
        expect(lastBroadcastRefs(editor)).toBeUndefined();
    });

    it("ignores an opened script whose editor hash matches no live session", async () => {
        const { scriptTabs, fireTabsChange, editor } = createService();
        // A well-formed script path under a hash no open editor owns.
        const orphanPath = `${BASE_DIR}/deadbeef/${ELEMENT_ID}/script-task/${ELEMENT_ID}.js`;

        await fireOpen(fireTabsChange, orphanPath);

        expect(scriptTabs.editorOfTab(orphanPath)).toBeUndefined();
        expect(lastBroadcastRefs(editor)).toBeUndefined();
    });

    it("ignores an opened script that resolves outside the editor's base directory", async () => {
        const { scriptTabs, fireTabsChange, editor } = createService();
        // Right editor hash and slug shape, but a different tmp/scripting root:
        // the containment check against the resolved base dir must reject it.
        const hash = ScriptUri.hashEditorId(EDITOR_ID);
        const outsidePath = `/elsewhere/tmp/scripting/${hash}/${ELEMENT_ID}/script-task/${ELEMENT_ID}.js`;

        await fireOpen(fireTabsChange, outsidePath);

        expect(scriptTabs.editorOfTab(outsidePath)).toBeUndefined();
        expect(lastBroadcastRefs(editor)).toBeUndefined();
    });

    it("ignores the camunda.d.ts ambient sibling (not a script language)", async () => {
        const { scriptTabs, fireTabsChange, editor } = createService();
        const dtsPath = `${slugDirOf(scriptPath())}/camunda.d.ts`;

        await fireOpen(fireTabsChange, dtsPath);

        expect(scriptTabs.editorOfTab(dtsPath)).toBeUndefined();
        expect(lastBroadcastRefs(editor)).toBeUndefined();
    });

    it("releases the lock but leaves the file on disk when an adopted tab is closed", async () => {
        const { scriptTabs, fireTabsChange, editor, scriptFiles } = createService();
        await fireOpen(fireTabsChange, scriptPath());
        clearPosted(editor);

        // Close the adopted tab: tracking is released and the lock re-broadcast
        // empties, but adoption never owns deletion — the file survives.
        setOpenTabs([]);
        fireTabsChange({ closed: [makeTab(scriptPath())], opened: [], changed: [] });
        await flushAsync();

        expect(scriptTabs.editorOfTab(scriptPath())).toBeUndefined();
        expect(lastBroadcastRefs(editor)).toEqual([]);
        expect(scriptFiles.deleteFolder).not.toHaveBeenCalled();
    });
});

describe("ScriptTaskService for a diagram on a UNC share", () => {
    function createServiceOnShare() {
        return createService(
            {},
            { folder: "//server/share/repo", editorPath: "//server/share/repo/process.bpmn" },
        );
    }

    function shareScriptPath(editorId: string): string {
        const rel = new ScriptUri(
            editorId,
            ELEMENT_ID,
            KIND,
            undefined,
            undefined,
            new ScriptLanguage("javascript").extension,
        ).relativePath();
        return `//server/share/repo/.camunda/tmp/scripting/${rel}`;
    }

    async function openScript(scriptTabs: ScriptTabService, editorId: string): Promise<void> {
        await scriptTabs.open(editorId, {
            elementId: ELEMENT_ID,
            kind: KIND,
            listenerIndex: undefined,
            eventName: undefined,
            scriptFormat: "javascript",
            content: "console.log(1)",
        });
    }

    it("writes the script and its ambient files to the share", async () => {
        const { scriptTabs, host, editor } = createServiceOnShare();

        await openScript(scriptTabs, editor.id);

        const path = shareScriptPath(editor.id);
        expect(host.workspace.files.get(path)).toBe("console.log(1)");
        expect(host.workspace.files.has(`${slugDirOf(path)}/camunda.d.ts`)).toBe(true);
    });

    it("deletes the script from the share when its element is deleted", async () => {
        const { scriptTabs, host, editor } = createServiceOnShare();
        await openScript(scriptTabs, editor.id);
        await host.workspace.writeFile(shareScriptPath(editor.id), "console.log(1)");

        await scriptTabs.applyModelChange(editor.id, {
            elementId: ELEMENT_ID,
            kind: KIND,
            listenerIndex: undefined,
            content: undefined,
        });
        await flushAsync();

        expect(host.workspace.files.has(shareScriptPath(editor.id))).toBe(false);
    });

    it("writes a model change to the script on the share when no buffer is open", async () => {
        const { scriptTabs, host, editor } = createServiceOnShare();
        await openScript(scriptTabs, editor.id);

        await scriptTabs.applyModelChange(editor.id, {
            elementId: ELEMENT_ID,
            kind: KIND,
            listenerIndex: undefined,
            content: "undone",
        });

        expect(host.workspace.files.get(shareScriptPath(editor.id))).toBe("undone");
    });

    it("writes back a script read from the share when its diagram closes", async () => {
        const { scriptTabs, host, editor, scriptXml } = createServiceOnShare();
        await openScript(scriptTabs, editor.id);
        await host.workspace.writeFile(shareScriptPath(editor.id), "from-disk");

        scriptTabs.disposeEditor(editor.id);
        await flushAsync();

        expect(scriptXml.applyScriptContents).toHaveBeenCalledWith("<diagram-xml/>", [
            { elementId: ELEMENT_ID, kind: KIND, listenerIndex: undefined, content: "from-disk" },
        ]);
    });

    it("adopts a script opened from the share", async () => {
        const { fireTabsChange, editor } = createServiceOnShare();

        fireTabsChange({ opened: [makeTab(shareScriptPath(editor.id))], closed: [], changed: [] });
        await flushAsync();

        expect(lastBroadcastRefs(editor)).toEqual([
            expect.objectContaining({ elementId: ELEMENT_ID, kind: KIND }),
        ]);
    });
});

describe("ScriptTaskService for a script tab opened under an uppercase drive letter", () => {
    const DRIVE_EDITOR_PATH = "/c:/repo/process.bpmn";

    function createServiceOnDrive() {
        return createService({}, { folder: "/c:/repo", editorPath: DRIVE_EDITOR_PATH });
    }

    function driveScriptPath(editorId: string): string {
        const rel = new ScriptUri(
            editorId,
            ELEMENT_ID,
            KIND,
            undefined,
            undefined,
            new ScriptLanguage("groovy").extension,
        ).relativePath();
        return `/c:/repo/.camunda/tmp/scripting/${rel}`;
    }

    /** The spelling the Explorer hands out: its root keeps the uppercase drive. */
    function explorerSpelling(path: string): string {
        return path.replace(/^\/c:/, "/C:");
    }

    /** Adopts the Explorer-opened tab and stages its open, dirty buffer. */
    async function adoptFromExplorer(fireTabsChange: (event: unknown) => unknown, path: string) {
        const explorerPath = explorerSpelling(path);
        setOpenTabs([explorerPath]);
        fireTabsChange({ opened: [makeTab(explorerPath)], closed: [], changed: [] });
        await flushAsync();
        return stageDocument(explorerPath, "typed", true);
    }

    it("overwrites the open buffer, not the file, on a model change", async () => {
        const { scriptTabs, editor, fireTabsChange, scriptFiles } = createServiceOnDrive();
        await adoptFromExplorer(fireTabsChange, driveScriptPath(editor.id));
        scriptFiles.writeFile.mockClear();

        await scriptTabs.applyModelChange(editor.id, {
            elementId: ELEMENT_ID,
            kind: KIND,
            listenerIndex: undefined,
            content: "undone",
        });

        expect(applyEditMock).toHaveBeenCalledTimes(1);
        expect(scriptFiles.writeFile).not.toHaveBeenCalled();
    });

    it("holds the echo of its own buffer overwrite back from the model", async () => {
        const { scriptTabs, editor, fireTabsChange, fireDocChange } = createServiceOnDrive();
        const path = driveScriptPath(editor.id);
        await adoptFromExplorer(fireTabsChange, path);
        applyEditMock.mockImplementation(async () => {
            await fireDocChange(docChangeEvent(explorerSpelling(path), "undone"));
            return true;
        });
        clearPosted(editor);

        await scriptTabs.applyModelChange(editor.id, {
            elementId: ELEMENT_ID,
            kind: KIND,
            listenerIndex: undefined,
            content: "undone",
        });
        await vi.advanceTimersByTimeAsync(SCRIPT_STREAM_DEBOUNCE_MS);

        expect(contentQueries(editor)).toHaveLength(0);
    });

    it("writes back the open buffer when its diagram closes", async () => {
        const { scriptTabs, editor, fireTabsChange, scriptXml } = createServiceOnDrive();
        await adoptFromExplorer(fireTabsChange, driveScriptPath(editor.id));

        scriptTabs.disposeEditor(editor.id);
        await flushAsync();

        expect(scriptXml.applyScriptContents).toHaveBeenCalledWith("<diagram-xml/>", [
            { elementId: ELEMENT_ID, kind: KIND, listenerIndex: undefined, content: "typed" },
        ]);
    });

    it("saves and closes the tab when its element is deleted", async () => {
        const { scriptTabs, editor, fireTabsChange } = createServiceOnDrive();
        const doc = await adoptFromExplorer(fireTabsChange, driveScriptPath(editor.id));

        await scriptTabs.applyModelChange(editor.id, {
            elementId: ELEMENT_ID,
            kind: KIND,
            listenerIndex: undefined,
            content: undefined,
        });
        await flushAsync();

        expect(doc.save).toHaveBeenCalledTimes(1);
        expect(closeTabMock).toHaveBeenCalledTimes(1);
    });
});
