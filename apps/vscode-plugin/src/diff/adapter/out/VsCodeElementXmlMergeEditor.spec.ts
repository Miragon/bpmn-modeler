import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("vscode", () => import("../../../__fixtures__/vscodeMergeEditorFake"));

import { commands, ExtensionContext, Uri, workspace } from "vscode";

import type { ElementXmlMergeFinished, ElementXmlMergeRequest } from "@miragon/bpmn-modeler-core";
import { describeElementXmlMergeEditorContract } from "@miragon/bpmn-modeler-core/testing";

import {
    activeMergeTab,
    cancelNextAccept,
    closeMergeTabByUser,
    closeMergeTabsOfByUser,
    editorGroups,
    editorMergesStartTextTo,
    failNextMergeEditorOpen,
    failToSplitGroups,
    type FakeMergeInputTitle,
    finishMergeEditorLoading,
    focusGroupByUser,
    holdMergeEditorLoading,
    mergeEditorUsesWorkingCopy,
    mergeResultTexts,
    mergeTabs,
    openNextMergeEditorWithoutTab,
    resetVscodeMergeEditor,
    restoreMergeTabFromLastSession,
    saveMergeResult,
    splitMergeTab,
    TextDocumentSaveReason,
    typeIntoMergeResult,
} from "../../../__fixtures__/vscodeMergeEditorFake";
import { InMemoryFileSystemProvider } from "../../../shared/adapter/out/InMemoryFileSystemProvider";

import {
    MERGE_EDITOR_READY_TIMEOUT_MS,
    MERGE_RESULT_SCHEME,
    MERGE_XML_SCHEME,
    VsCodeElementXmlMergeEditor,
} from "./VsCodeElementXmlMergeEditor";

const START = "<<<<<<< Current\ncurrent\n=======\nincoming\n>>>>>>> Incoming\n";
const MERGED = "merged by the editor\n";
const dropMarkerLines = (start: string) => start.replace(/^(<<<<<<<|=======|>>>>>>>).*\n/gm, "");

/** What the editor's title says of a side: the branch is its detail, the commit its description behind the commit icon. */
const shownTitle = ({ title, description, detail }: FakeMergeInputTitle) => ({
    title,
    ...(detail === undefined ? {} : { ref: detail }),
    ...(description === undefined ? {} : { shortHash: description.replace("$(git-commit) ", "") }),
});

const REQUEST: ElementXmlMergeRequest = {
    key: "merge-1",
    elementId: "Task_Check",
    sides: {
        current: { title: "Current", ref: "main", shortHash: "1a2b3c4" },
        incoming: { title: "Incoming", ref: "feature" },
    },
    base: "base\n",
    current: "current\n",
    incoming: "incoming\n",
    start: START,
};

let inputs: InMemoryFileSystemProvider;
let results: InMemoryFileSystemProvider;
let finished: { key: string; written: string | undefined }[];
let editor: VsCodeElementXmlMergeEditor;
let logError: ReturnType<typeof vi.fn<(error: string | Error) => void>>;

function registeredEditor(onFinished: ElementXmlMergeFinished): VsCodeElementXmlMergeEditor {
    inputs = new InMemoryFileSystemProvider({ readOnly: true });
    results = new InMemoryFileSystemProvider({ editorMayCreateFiles: false });
    workspace.registerFileSystemProvider(MERGE_XML_SCHEME, inputs);
    workspace.registerFileSystemProvider(MERGE_RESULT_SCHEME, results);
    logError = vi.fn<(error: string | Error) => void>();
    const registered = new VsCodeElementXmlMergeEditor(inputs, results, onFinished, { logError });
    registered.register({ subscriptions: [] } as unknown as ExtensionContext);
    return registered;
}

describeElementXmlMergeEditorContract("VsCodeElementXmlMergeEditor", (onFinished) => {
    resetVscodeMergeEditor();
    editorMergesStartTextTo(dropMarkerLines);
    const contracted = registeredEditor(onFinished);
    return {
        editor: contracted,
        shown: () => mergeResultTexts(),
        shownFor: dropMarkerLines,
        inputs: (elementId) => {
            const tab = mergeTabs().find(({ input }) => input.result.path === `/${elementId}.xml`);
            if (!tab?.titles) return undefined;
            const served = (uri: { toString(): string }) =>
                new TextDecoder().decode(inputs.readFile(Uri.parse(uri.toString())));
            return {
                base: served(tab.input.base),
                current: { ...shownTitle(tab.titles.input1), text: served(tab.input.input1) },
                incoming: { ...shownTitle(tab.titles.input2), text: served(tab.input.input2) },
            };
        },
        focused: () => {
            const result = activeMergeTab()?.input.result;
            return result?.path.split("/").pop()?.replace(/\.xml$/, "");
        },
        save: (elementId, text) => {
            typeIntoMergeResult(text, elementId);
            saveMergeResult(TextDocumentSaveReason.Manual, elementId);
        },
        closeByUser: (elementId) => closeMergeTabsOfByUser(elementId),
    };
});

afterEach(() => {
    vi.useRealTimers();
});

beforeEach(() => {
    resetVscodeMergeEditor();
    editorMergesStartTextTo(() => MERGED);
    finished = [];
    editor = registeredEditor((key, written) => finished.push({ key, written }));
});

function servedUris(): Uri[] {
    const { input } = mergeTabs()[0];
    return [input.base, input.input1, input.input2, input.result].map((uri) =>
        Uri.parse(uri.toString()),
    );
}

function isServed(uri: Uri): boolean {
    const files = uri.scheme === MERGE_RESULT_SCHEME ? results : inputs;
    try {
        files.readFile(uri);
        return true;
    } catch {
        return false;
    }
}

describe("VsCodeElementXmlMergeEditor", () => {
    it("opens the result as the start text the editor merges, titled after the element", async () => {
        await editor.open(REQUEST);

        expect(mergeTabs().map((tab) => tab.label)).toEqual(["Merging: Task_Check.xml"]);
        const [, , , result] = servedUris();
        expect(new TextDecoder().decode(results.readFile(result))).toBe(START);
    });

    it("titles each side as VS Code's Git merge editor does: its position, its commit beside the commit icon, its branch", async () => {
        await editor.open(REQUEST);

        expect(mergeTabs()[0].titles).toStrictEqual({
            input1: { title: "Current", description: "$(git-commit) 1a2b3c4", detail: "main" },
            input2: { title: "Incoming", detail: "feature" },
        });
    });

    it("finishes with the text a manual save wrote once the merge tab closes", async () => {
        await editor.open(REQUEST);
        typeIntoMergeResult("resolved\n");

        saveMergeResult(TextDocumentSaveReason.Manual);
        closeMergeTabByUser();

        expect(finished).toEqual([{ key: "merge-1", written: "resolved\n" }]);
    });

    it("counts a manual save of the editor's own merge as an answer", async () => {
        await editor.open(REQUEST);

        saveMergeResult(TextDocumentSaveReason.Manual);
        closeMergeTabByUser();

        expect(finished).toEqual([{ key: "merge-1", written: MERGED }]);
    });

    it("finishes without a text when the tab closes without a save", async () => {
        await editor.open(REQUEST);
        typeIntoMergeResult("resolved\n");

        closeMergeTabByUser();

        expect(finished).toEqual([{ key: "merge-1", written: undefined }]);
    });

    it.each([TextDocumentSaveReason.AfterDelay, TextDocumentSaveReason.FocusOut])(
        "takes an auto-save (reason %s) as no answer",
        async (reason) => {
            await editor.open(REQUEST);

            saveMergeResult(reason);
            closeMergeTabByUser();

            expect(finished).toEqual([{ key: "merge-1", written: undefined }]);
        },
    );

    it("keeps the manual save's text through a later auto-save", async () => {
        await editor.open(REQUEST);
        typeIntoMergeResult("resolved\n");
        saveMergeResult(TextDocumentSaveReason.Manual);
        typeIntoMergeResult("half edited\n");

        saveMergeResult(TextDocumentSaveReason.AfterDelay);
        closeMergeTabByUser();

        expect(finished).toEqual([{ key: "merge-1", written: "resolved\n" }]);
    });

    it("takes an auto-saved result as the answer when the user accepts the merge", async () => {
        await editor.open(REQUEST);
        typeIntoMergeResult("resolved\n");
        saveMergeResult(TextDocumentSaveReason.AfterDelay);

        const accepted = editor.acceptingActiveMerge();
        await commands.executeCommand("mergeEditor.acceptMerge");
        accepted();

        expect(finished).toEqual([{ key: "merge-1", written: "resolved\n" }]);
    });

    it("takes a dirty result as the answer through the save the accept runs", async () => {
        await editor.open(REQUEST);
        typeIntoMergeResult("resolved\n");

        const accepted = editor.acceptingActiveMerge();
        await commands.executeCommand("mergeEditor.acceptMerge");
        accepted();

        expect(finished).toEqual([{ key: "merge-1", written: "resolved\n" }]);
    });

    it("answers as before once the user cancelled the accept", async () => {
        await editor.open(REQUEST);
        saveMergeResult(TextDocumentSaveReason.AfterDelay);
        cancelNextAccept();

        const accepted = editor.acceptingActiveMerge();
        await commands.executeCommand("mergeEditor.acceptMerge");
        accepted();
        closeMergeTabByUser();

        expect(finished).toEqual([{ key: "merge-1", written: undefined }]);
    });

    it("finishes a split merge only when its last tab closes", async () => {
        await editor.open(REQUEST);
        splitMergeTab();
        saveMergeResult(TextDocumentSaveReason.Manual);

        closeMergeTabByUser(1);
        expect(finished).toEqual([]);

        closeMergeTabByUser(0);
        expect(finished).toEqual([{ key: "merge-1", written: MERGED }]);
    });

    it("stops serving the merge's files once it finishes", async () => {
        await editor.open(REQUEST);
        const uris = servedUris();

        closeMergeTabByUser();

        expect(uris.filter(isServed)).toEqual([]);
    });

    it("closes a dirty merge from code without asking to save, and reports no text", async () => {
        await editor.open(REQUEST);
        saveMergeResult(TextDocumentSaveReason.Manual);
        typeIntoMergeResult("half edited\n");

        await editor.close(REQUEST.key);

        expect(mergeTabs()).toEqual([]);
        expect(finished).toEqual([{ key: "merge-1", written: undefined }]);
    });

    it("finishes a merge whose editor never showed once it is closed", async () => {
        vi.useFakeTimers();
        openNextMergeEditorWithoutTab();
        const opening = editor.open(REQUEST);
        await vi.advanceTimersByTimeAsync(MERGE_EDITOR_READY_TIMEOUT_MS);
        await opening;
        vi.useRealTimers();
        expect(finished).toEqual([]);

        await editor.close(REQUEST.key);

        expect(finished).toEqual([{ key: "merge-1", written: undefined }]);
        await expect(editor.open(REQUEST)).resolves.toBeUndefined();
    });

    it("resolves the open only once the editor merged the start, so a save right after it is taken", async () => {
        holdMergeEditorLoading();
        let opened = false;
        const opening = editor.open(REQUEST).then(() => {
            opened = true;
        });
        await new Promise((done) => setTimeout(done, 0));
        expect(mergeTabs()).toHaveLength(1);
        expect(opened).toBe(false);

        finishMergeEditorLoading();
        await opening;
        saveMergeResult(TextDocumentSaveReason.Manual);
        closeMergeTabByUser();

        expect(finished).toEqual([{ key: "merge-1", written: MERGED }]);
    });

    it("resolves the open of a start without conflict markers once its tab shows", async () => {
        holdMergeEditorLoading();

        await editor.open({ ...REQUEST, start: "resumed\n" });

        expect(mergeTabs()).toHaveLength(1);
    });

    it("resolves the open once the user closes the merge while it loads", async () => {
        holdMergeEditorLoading();
        const opening = editor.open(REQUEST);
        await new Promise((done) => setTimeout(done, 0));

        closeMergeTabByUser();

        await expect(opening).resolves.toBeUndefined();
        expect(finished).toEqual([{ key: "merge-1", written: undefined }]);
    });

    it("logs and resolves the open when the editor never finishes loading", async () => {
        vi.useFakeTimers();
        holdMergeEditorLoading();
        const opening = editor.open(REQUEST);

        await vi.advanceTimersByTimeAsync(MERGE_EDITOR_READY_TIMEOUT_MS);

        await expect(opening).resolves.toBeUndefined();
        expect(logError).toHaveBeenCalledTimes(1);
        expect(mergeTabs()).toHaveLength(1);
    });

    it("resolves the open once the tab shows where the editor merges into a working copy", async () => {
        vi.useFakeTimers();
        mergeEditorUsesWorkingCopy();
        let opened = false;
        void editor.open(REQUEST).then(() => {
            opened = true;
        });

        await vi.advanceTimersByTimeAsync(1);

        expect(opened).toBe(true);
        expect(logError).not.toHaveBeenCalled();
    });

    it("lets the editor finish loading before the merge view closes it, so no dirty result stays behind", async () => {
        holdMergeEditorLoading();
        const opening = editor.open(REQUEST);
        await new Promise((done) => setTimeout(done, 0));

        const closing = editor.close(REQUEST.key);
        finishMergeEditorLoading();
        await closing;
        await opening;

        expect(mergeTabs()).toEqual([]);
        expect(workspace.textDocuments.filter((document) => document.isDirty)).toEqual([]);
        expect(finished).toEqual([{ key: "merge-1", written: undefined }]);
    });

    it("finishes once without a text when the user closes the tab while the merge view's close waits for the load", async () => {
        holdMergeEditorLoading();
        const opening = editor.open(REQUEST);
        await new Promise((done) => setTimeout(done, 0));
        const closing = editor.close(REQUEST.key);

        closeMergeTabByUser();

        await expect(closing).resolves.toBeUndefined();
        await opening;
        expect(finished).toEqual([{ key: "merge-1", written: undefined }]);
    });

    it("releases the files and finishes without a text when the editor fails to open", async () => {
        failNextMergeEditorOpen();

        await expect(editor.open(REQUEST)).rejects.toThrow("_open.mergeEditor");

        expect(finished).toEqual([{ key: "merge-1", written: undefined }]);
        await editor.open(REQUEST);
        expect(mergeTabs()).toHaveLength(1);
    });

    it("opens the first merge in a new group below the diagrams and the next one beside it", async () => {
        await editor.open(REQUEST);
        focusGroupByUser(0);

        await editor.open({ ...REQUEST, key: "merge-2", elementId: "Task_Pack" });

        const groups = editorGroups();
        expect(groups).toHaveLength(2);
        expect(groups[0].tabs).toEqual([]);
        expect(groups[1].tabs.map((tab) => tab.label)).toEqual([
            "Merging: Task_Check.xml",
            "Merging: Task_Pack.xml",
        ]);
    });

    it("opens in the active group where the host cannot split it", async () => {
        failToSplitGroups();

        await editor.open(REQUEST);

        expect(editorGroups().map((group) => group.tabs.length)).toEqual([1]);
    });

    it("brings an open merge to the front from another group without a second tab", async () => {
        await editor.open(REQUEST);
        await editor.open({ ...REQUEST, key: "merge-2", elementId: "Task_Pack" });
        focusGroupByUser(0);

        await editor.focus(REQUEST.key);

        expect(mergeTabs()).toHaveLength(2);
        expect(activeMergeTab()?.label).toBe("Merging: Task_Check.xml");
    });

    it("closes a restored merge tab whose result it no longer serves", () => {
        resetVscodeMergeEditor();
        restoreMergeTabFromLastSession(Uri.parse("bpmn-merge-result://gone/Task_Check.xml"));

        registeredEditor(() => undefined);

        expect(mergeTabs()).toEqual([]);
    });

    it("refuses to open a merge that is already open, and keeps the open one", async () => {
        await editor.open(REQUEST);
        typeIntoMergeResult("resolved\n");

        await expect(editor.open({ ...REQUEST, start: "other\n" })).rejects.toThrow("merge-1");
        saveMergeResult(TextDocumentSaveReason.Manual);
        closeMergeTabByUser();

        expect(mergeTabs()).toEqual([]);
        expect(finished).toEqual([{ key: "merge-1", written: "resolved\n" }]);
    });
});
