import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("vscode", () => import("../../../__fixtures__/vscodeMergeEditorFake"));

import { ExtensionContext, Uri, workspace } from "vscode";

import type { ElementXmlMergeFinished, ElementXmlMergeRequest } from "@miragon/bpmn-modeler-core";
import { describeElementXmlMergeEditorContract } from "@miragon/bpmn-modeler-core/testing";

import {
    activeMergeTab,
    closeMergeTabByUser,
    closeMergeTabsOfByUser,
    editorGroups,
    editorMergesStartTextTo,
    failNextMergeEditorOpen,
    failToSplitGroups,
    focusGroupByUser,
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
import { InMemoryFileSystemProvider } from "../../../shared/adapter/in/InMemoryFileSystemProvider";

import {
    MERGE_RESULT_SCHEME,
    MERGE_XML_SCHEME,
    VsCodeElementXmlMergeEditor,
} from "./VsCodeElementXmlMergeEditor";

const START = "<<<<<<< Current\ncurrent\n=======\nincoming\n>>>>>>> Incoming\n";
const MERGED = "merged by the editor\n";

const REQUEST: ElementXmlMergeRequest = {
    key: "merge-1",
    elementId: "Task_Check",
    labels: { current: "Current", incoming: "Incoming" },
    base: "base\n",
    current: "current\n",
    incoming: "incoming\n",
    start: START,
};

let inputs: InMemoryFileSystemProvider;
let results: InMemoryFileSystemProvider;
let finished: { key: string; written: string | undefined }[];
let editor: VsCodeElementXmlMergeEditor;

function registeredEditor(onFinished: ElementXmlMergeFinished): VsCodeElementXmlMergeEditor {
    inputs = new InMemoryFileSystemProvider({ readOnly: true });
    results = new InMemoryFileSystemProvider({ editorMayCreateFiles: false });
    workspace.registerFileSystemProvider(MERGE_XML_SCHEME, inputs);
    workspace.registerFileSystemProvider(MERGE_RESULT_SCHEME, results);
    const registered = new VsCodeElementXmlMergeEditor(inputs, results, onFinished);
    registered.register({ subscriptions: [] } as unknown as ExtensionContext);
    return registered;
}

describeElementXmlMergeEditorContract("VsCodeElementXmlMergeEditor", (onFinished) => {
    resetVscodeMergeEditor();
    const contracted = registeredEditor(onFinished);
    return {
        editor: contracted,
        shown: () => mergeResultTexts(),
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
        openNextMergeEditorWithoutTab();
        await editor.open(REQUEST);
        expect(finished).toEqual([]);

        await editor.close(REQUEST.key);

        expect(finished).toEqual([{ key: "merge-1", written: undefined }]);
        await expect(editor.open(REQUEST)).resolves.toBeUndefined();
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
