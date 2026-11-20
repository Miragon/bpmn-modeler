import { describe, expect, expectTypeOf, it, vi } from "vitest";

import { prepareMergeSources } from "@miragon/bpmn-modeler-merge";
import type { ApplyDiffHighlightsQuery, ApplyMergeStatesQuery } from "@miragon/bpmn-modeler-shared";
import type { MergeBuildNote } from "@miragon/bpmn-modeler-types";

import {
    createTestHost,
    FakeDiffPaneHandle,
    FakeMergeWorkingFile,
    mergeSessionOf,
    ORDER_MERGE_STAGES,
    ORDER_REMOVAL_STAGES,
    ORDER_REMOVED_FLOW_STAGES,
    RecordingMergeSidesView,
    ScriptedPicker,
} from "../../testing";
import { ResolvableStages } from "../domain/conflictReading";
import { mergeResultTabLabel } from "../domain/diffTabLabel";
import {
    buildDoneNotice,
    buildRefusalText,
    compareFailureText,
    overwriteConfirm,
    readFailureText,
} from "../domain/mergeBuildTexts";
import { ConflictVersionsSource } from "../port/ConflictVersionsSource";
import { BpmnDiffService } from "./BpmnDiffService";
import { DiffPaneStore } from "./DiffPaneStore";
import { MergeBuildService } from "./MergeBuildService";
import { MergeDecisionService } from "./MergeDecisionService";
import { MergeSessionStore } from "./MergeSessionStore";

const FILE = "file:///repo/order.bpmn";

const URIS = {
    current: "bpmn-merge:/repo/order.current.bpmn?side%3Dcurrent%26opening%3D1",
    incoming: "bpmn-merge:/repo/order.incoming.bpmn?side%3Dincoming%26opening%3D1",
};

const CAPTIONS = {
    current: { side: "current", role: "branch", ref: "main" },
    incoming: { side: "incoming", role: "upstream", ref: "feature" },
} as const;

const markedText = (stages: ResolvableStages) =>
    `<<<<<<< HEAD\n${stages.current}=======\n${stages.incoming}>>>>>>> feature\n`;

interface MergeViewOptions {
    readonly answers?: Record<string, boolean>;
    /** Sources of other stages, so every build of the merge fails its source check. */
    readonly sourcesOf?: ResolvableStages;
}

/** A merge view of `stages` with both panes ready, Git's markers in the working file. */
async function openMergeView(stages: ResolvableStages, options: MergeViewOptions = {}) {
    const { notifier, settings } = createTestHost();
    const picker = new ScriptedPicker(options.answers);
    const store = new DiffPaneStore();
    const view = new RecordingMergeSidesView();
    const sessions = new MergeSessionStore(store, view);
    const decisions = new MergeDecisionService(sessions, notifier);
    const workingFile = new FakeMergeWorkingFile();
    workingFile.onDisk(FILE, markedText(stages));
    const build = new MergeBuildService(
        sessions,
        decisions,
        workingFile,
        view,
        store,
        notifier,
        picker,
    );
    const diffService = new BpmnDiffService(notifier, settings, store, undefined, decisions, build);
    const diffSession = store.registerMerge(URIS);
    const session = await mergeSessionOf({
        fileUri: FILE,
        fileName: "order.bpmn",
        title: "order.bpmn (Merge: main ↔ feature)",
        captions: CAPTIONS,
        uris: URIS,
        stages,
        openedWorkingText: markedText(stages),
    });
    sessions.add(
        options.sourcesOf
            ? { ...session, sources: await prepareMergeSources(options.sourcesOf) }
            : session,
        diffSession,
    );
    const current = new FakeDiffPaneHandle(URIS.current, stages.current);
    const incoming = new FakeDiffPaneHandle(URIS.incoming, stages.incoming);
    diffSession.attachPane(current);
    diffSession.attachPane(incoming);
    await diffService.markReady(current);
    await diffService.markReady(incoming);
    return { notifier, picker, store, view, workingFile, diffService, current, incoming };
}

type MergeView = Awaited<ReturnType<typeof openMergeView>>;

function lastOfType<T>(pane: FakeDiffPaneHandle, type: string): T {
    const posted = pane.posted.filter(
        (message) => (message as { type: string }).type === type,
    ) as T[];
    expect(posted.length).toBeGreaterThan(0);
    return posted[posted.length - 1];
}

const lastStatesOf = (pane: FakeDiffPaneHandle) =>
    lastOfType<ApplyMergeStatesQuery>(pane, "ApplyMergeStatesQuery");

const lastHighlightsOf = (pane: FakeDiffPaneHandle) =>
    lastOfType<ApplyDiffHighlightsQuery>(pane, "ApplyDiffHighlightsQuery");

/** The panes VS Code resolves for the comparison the build service opened last, both ready. */
async function attachComparison(mergeView: MergeView) {
    const { view, store, diffService } = mergeView;
    const { left, right } = view.opened[view.opened.length - 1];
    const stage = new FakeDiffPaneHandle(left, view.textOf(left));
    const result = new FakeDiffPaneHandle(right, view.textOf(right));
    for (const pane of [stage, result]) {
        const session = store.awaitingPaneFor(pane.uri);
        expect(session?.origin).toBe("merge-result");
        session?.attachPane(pane);
    }
    await diffService.markReady(stage);
    await diffService.markReady(result);
    return { stage, result };
}

/** Decides ORDER_MERGE_STAGES' two conflicts for incoming. */
async function decideForIncoming({ diffService, incoming }: MergeView): Promise<void> {
    await diffService.pickMergeSide(incoming, "Task_Pack", "element");
    await diffService.pickMergeSide(incoming, "Process_1", "element");
}

describe("MergeBuildService", () => {
    it("refuses to build while a conflict is open and says how many", async () => {
        const mergeView = await openMergeView(ORDER_MERGE_STAGES);

        await mergeView.diffService.buildMergeResult(mergeView.current);

        expect(mergeView.notifier.infos).toStrictEqual([buildRefusalText("order.bpmn", 2)]);
        expect(mergeView.workingFile.replaced).toStrictEqual([]);
        expect(lastStatesOf(mergeView.incoming).states.build).toStrictEqual({
            canBuild: false,
            openConflicts: 2,
            built: false,
            notes: [],
        });
    });

    it("writes the merged BPMN over the working file and opens it", async () => {
        const mergeView = await openMergeView(ORDER_MERGE_STAGES);
        await decideForIncoming(mergeView);
        expect(lastStatesOf(mergeView.current).states.build.canBuild).toBe(true);

        await mergeView.diffService.buildMergeResult(mergeView.incoming);

        const written = mergeView.workingFile.diskText(FILE) ?? "";
        expect(written).not.toContain("<<<<<<<");
        expect(written).toContain('name="Pack box"');
        expect(written).toContain('name="Check order now"');
        expect(written).toContain('name="Order B"');
        expect(mergeView.notifier.openedDocuments).toStrictEqual(["/repo/order.bpmn"]);
        expect(mergeView.notifier.infos).toStrictEqual([buildDoneNotice("order.bpmn", 0)]);
        expect(lastStatesOf(mergeView.current).states.build).toMatchObject({
            canBuild: true,
            built: true,
        });
    });

    it("stages nothing: the working file is all it writes, and the Git port cannot write", async () => {
        const mergeView = await openMergeView(ORDER_REMOVAL_STAGES);

        await mergeView.diffService.buildMergeResult(mergeView.incoming);

        expect(mergeView.workingFile.replaced.map(({ fileUri }) => fileUri)).toStrictEqual([FILE]);
        expectTypeOf<keyof ConflictVersionsSource>().toEqualTypeOf<
            "readConflict" | "watchMergeChanges"
        >();
    });

    it("builds again without asking while the result is untouched", async () => {
        const mergeView = await openMergeView(ORDER_REMOVAL_STAGES);

        await mergeView.diffService.buildMergeResult(mergeView.incoming);
        await mergeView.diffService.buildMergeResult(mergeView.incoming);

        expect(mergeView.workingFile.replaced).toHaveLength(2);
        expect(mergeView.picker.prompts).toStrictEqual([]);
    });

    it("builds again without asking when the save formatted the result", async () => {
        const mergeView = await openMergeView(ORDER_REMOVAL_STAGES);
        mergeView.workingFile.formatsOnSave((text) => text.replaceAll("  ", "\t"));

        await mergeView.diffService.buildMergeResult(mergeView.incoming);
        await mergeView.diffService.buildMergeResult(mergeView.incoming);

        expect(mergeView.workingFile.replaced).toHaveLength(2);
        expect(mergeView.picker.prompts).toStrictEqual([]);
    });

    it("builds once when Build is pressed again while a build runs", async () => {
        const mergeView = await openMergeView(ORDER_REMOVAL_STAGES);

        await Promise.all([
            mergeView.diffService.buildMergeResult(mergeView.incoming),
            mergeView.diffService.buildMergeResult(mergeView.current),
        ]);

        expect(mergeView.workingFile.replaced).toHaveLength(1);
        expect(mergeView.picker.prompts).toStrictEqual([]);
    });

    it("shows why it cannot read the working file and writes nothing", async () => {
        const mergeView = await openMergeView(ORDER_REMOVAL_STAGES);
        vi.spyOn(mergeView.workingFile, "read").mockRejectedValueOnce(new Error("EACCES"));

        await mergeView.diffService.buildMergeResult(mergeView.incoming);

        expect(mergeView.notifier.errors).toStrictEqual([
            readFailureText("order.bpmn", new Error("EACCES")),
        ]);
        expect(mergeView.workingFile.replaced).toStrictEqual([]);
    });

    it("says the build is done even when the built file does not open", async () => {
        const mergeView = await openMergeView(ORDER_REMOVAL_STAGES);
        vi.spyOn(mergeView.notifier, "openDocument").mockRejectedValueOnce(new Error("closed"));

        await mergeView.diffService.buildMergeResult(mergeView.incoming);

        expect(mergeView.notifier.infos).toStrictEqual([buildDoneNotice("order.bpmn", 0)]);
    });

    it("asks before overwriting an edited result and writes nothing on no", async () => {
        const mergeView = await openMergeView(ORDER_REMOVAL_STAGES);
        await mergeView.diffService.buildMergeResult(mergeView.incoming);
        const edited = (mergeView.workingFile.diskText(FILE) ?? "").replace(
            'name="Check order"',
            'name="Check edited order"',
        );
        mergeView.workingFile.onDisk(FILE, edited);

        await mergeView.diffService.buildMergeResult(mergeView.incoming);

        expect(mergeView.picker.prompts).toStrictEqual([
            { method: "confirm", args: [overwriteConfirm("editedSinceBuild", "order.bpmn")] },
        ]);
        expect(mergeView.workingFile.replaced).toHaveLength(1);
        expect(mergeView.workingFile.diskText(FILE)).toBe(edited);
        expect(mergeView.notifier.openedDocuments).toHaveLength(1);
    });

    it("asks before building over markers around a conflict resolved by hand since the merge view opened", async () => {
        const mergeView = await openMergeView(ORDER_REMOVAL_STAGES);
        const handEdited = (mergeView.workingFile.diskText(FILE) ?? "").replace(
            "=======\n",
            "=======\n<!-- kept by hand -->\n",
        );
        mergeView.workingFile.onDisk(FILE, handEdited);

        await mergeView.diffService.buildMergeResult(mergeView.incoming);

        expect(mergeView.picker.prompts).toStrictEqual([
            { method: "confirm", args: [overwriteConfirm("editedSinceOpened", "order.bpmn")] },
        ]);
        expect(mergeView.workingFile.diskText(FILE)).toBe(handEdited);
    });

    it("asks when the working file has unsaved changes and builds over them on yes", async () => {
        const mergeView = await openMergeView(ORDER_REMOVAL_STAGES, {
            answers: { "mergeBuild.unsavedChanges": true },
        });
        mergeView.workingFile.editUnsaved(FILE, "<typed/>");

        await mergeView.diffService.buildMergeResult(mergeView.incoming);

        expect(mergeView.picker.prompts).toStrictEqual([
            { method: "confirm", args: [overwriteConfirm("unsavedChanges", "order.bpmn")] },
        ]);
        await expect(mergeView.workingFile.read(FILE)).resolves.toMatchObject({
            isDirty: false,
        });
        expect(mergeView.workingFile.diskText(FILE)).toContain("<bpmn:definitions");
    });

    it("writes nothing and shows the reason when the build fails", async () => {
        const mergeView = await openMergeView(ORDER_REMOVAL_STAGES, {
            sourcesOf: ORDER_MERGE_STAGES,
        });

        await mergeView.diffService.buildMergeResult(mergeView.incoming);

        expect(mergeView.workingFile.replaced).toStrictEqual([]);
        expect(mergeView.notifier.openedDocuments).toStrictEqual([]);
        expect(mergeView.notifier.errors).toHaveLength(1);
        expect(mergeView.notifier.errors[0]).toMatch(
            /^Cannot build order\.bpmn, so it stays as it was: The merge decisions were made for other versions/,
        );
        expect(lastStatesOf(mergeView.incoming).states.build.built).toBe(false);
    });

    it("sends the notes to both panes before it opens the file", async () => {
        const mergeView = await openMergeView(ORDER_REMOVAL_STAGES);
        await mergeView.diffService.pickMergeSide(mergeView.incoming, "Task_Pack", "element");
        let notesWhenOpened: readonly MergeBuildNote[] | undefined;
        vi.spyOn(mergeView.notifier, "openDocument").mockImplementation(async () => {
            notesWhenOpened = lastStatesOf(mergeView.current).states.build.notes;
        });

        await mergeView.diffService.buildMergeResult(mergeView.incoming);

        expect(notesWhenOpened).toContainEqual({
            kind: "restoredWithoutRemovedWith",
            id: "Task_Pack",
            connections: ["Flow_2", "Flow_3"],
            named: ["Task_Pack", "Flow_2", "Flow_3"],
        });
        expect(lastStatesOf(mergeView.incoming).states.build.notes).toStrictEqual(notesWhenOpened);
        expect(mergeView.notifier.infos).toStrictEqual([
            buildDoneNotice("order.bpmn", notesWhenOpened?.length ?? 0),
        ]);
    });

    it("compares the result with incoming and marks an element a pick dropped as a consequence", async () => {
        const mergeView = await openMergeView(ORDER_REMOVED_FLOW_STAGES);
        await mergeView.diffService.pickMergeSide(mergeView.current, "Task_Pack", "element");
        expect(lastStatesOf(mergeView.current).states.lastOutcome).toMatchObject({
            dropped: ["Flow_2"],
        });
        await mergeView.diffService.buildMergeResult(mergeView.current);

        await mergeView.diffService.compareMergeResult(mergeView.current, "incoming");

        const opened = mergeView.view.opened[mergeView.view.opened.length - 1];
        expect(opened.title).toBe(mergeResultTabLabel("order.bpmn", "incoming"));
        expect(mergeView.view.textOf(opened.left)).toBe(ORDER_REMOVED_FLOW_STAGES.incoming);
        expect(mergeView.view.textOf(opened.right)).toBe(mergeView.workingFile.diskText(FILE));
        const { stage, result } = await attachComparison(mergeView);
        const highlights = lastHighlightsOf(stage);
        expect(highlights.origin).toBe("merge-result");
        expect(highlights.removed).toEqual(
            expect.arrayContaining(["Flow_2", "Task_Pack", "Flow_3"]),
        );
        expect(lastHighlightsOf(result).comparison).toStrictEqual({
            against: "incoming",
            switchTo: "current",
        });
    });

    it("compares the result as the editor holds it, unsaved edits included", async () => {
        const mergeView = await openMergeView(ORDER_REMOVAL_STAGES);
        await mergeView.diffService.buildMergeResult(mergeView.incoming);
        const unsaved = (mergeView.workingFile.diskText(FILE) ?? "").replace(
            '<bpmn:startEvent id="Start_1">',
            '<bpmn:startEvent id="Start_1" name="Order in">',
        );
        mergeView.workingFile.editUnsaved(FILE, unsaved);

        await mergeView.diffService.compareMergeResult(mergeView.incoming, "current");

        const { result } = await attachComparison(mergeView);
        expect(lastHighlightsOf(result).changed).toContain("Start_1");
    });

    it("compares a copy of the working file, so neither a later edit nor a restored tab reaches the file", async () => {
        const mergeView = await openMergeView(ORDER_REMOVAL_STAGES);
        await mergeView.diffService.buildMergeResult(mergeView.incoming);
        const built = mergeView.workingFile.diskText(FILE);

        await mergeView.diffService.compareMergeResult(mergeView.incoming, "incoming");
        mergeView.workingFile.editUnsaved(FILE, "<edited/>");

        const opened = mergeView.view.opened[mergeView.view.opened.length - 1];
        expect([opened.left, opened.right]).not.toContain(FILE);
        expect(mergeView.view.served[mergeView.view.served.length - 1].basenames).toMatchObject({
            result: "order.result.bpmn",
        });
        expect(mergeView.view.textOf(opened.right)).toBe(built);
    });

    it("compares nothing before a result was built", async () => {
        const mergeView = await openMergeView(ORDER_REMOVAL_STAGES);

        await mergeView.diffService.compareMergeResult(mergeView.incoming, "incoming");

        expect(mergeView.view.opened).toHaveLength(0);
    });

    it("switches the comparison to the other side, closing the one open", async () => {
        const mergeView = await openMergeView(ORDER_REMOVAL_STAGES);
        await mergeView.diffService.buildMergeResult(mergeView.incoming);
        await mergeView.diffService.compareMergeResult(mergeView.incoming, "incoming");
        const { stage, result } = await attachComparison(mergeView);

        await mergeView.diffService.switchMergeComparison(result);

        expect([stage.disposed, result.disposed]).toStrictEqual([true, true]);
        const opened = mergeView.view.opened[mergeView.view.opened.length - 1];
        expect(opened.title).toBe(mergeResultTabLabel("order.bpmn", "current"));
        expect(mergeView.view.textOf(opened.left)).toBe(ORDER_REMOVAL_STAGES.current);
        const switched = await attachComparison(mergeView);
        expect(lastHighlightsOf(switched.stage).comparison).toStrictEqual({
            against: "current",
            switchTo: "incoming",
        });
    });

    it("keeps the open comparison and says why when the other side's cannot open", async () => {
        const mergeView = await openMergeView(ORDER_REMOVAL_STAGES);
        await mergeView.diffService.buildMergeResult(mergeView.incoming);
        await mergeView.diffService.compareMergeResult(mergeView.incoming, "incoming");
        const { stage, result } = await attachComparison(mergeView);
        vi.spyOn(mergeView.view, "open").mockRejectedValueOnce(new Error("no editor"));

        await mergeView.diffService.switchMergeComparison(result);

        expect([stage.disposed, result.disposed]).toStrictEqual([false, false]);
        expect(mergeView.notifier.errors).toStrictEqual([
            compareFailureText("order.bpmn", new Error("no editor")),
        ]);
    });

    it("takes the switch away from an open comparison once its merge view closed", async () => {
        const mergeView = await openMergeView(ORDER_REMOVAL_STAGES);
        await mergeView.diffService.buildMergeResult(mergeView.incoming);
        await mergeView.diffService.compareMergeResult(mergeView.incoming, "incoming");
        const { stage, result } = await attachComparison(mergeView);

        mergeView.store.detach(mergeView.current);
        mergeView.store.detach(mergeView.incoming);

        await vi.waitFor(() =>
            expect(lastHighlightsOf(result).comparison).toStrictEqual({ against: "incoming" }),
        );
        expect(lastHighlightsOf(stage).comparison).toStrictEqual({ against: "incoming" });
        const opened = mergeView.view.opened.length;
        await mergeView.diffService.switchMergeComparison(result);
        expect(mergeView.view.opened).toHaveLength(opened);
        expect([stage.disposed, result.disposed]).toStrictEqual([false, false]);
    });

    it("stops serving a comparison's documents once its tab closed", async () => {
        const mergeView = await openMergeView(ORDER_REMOVAL_STAGES);
        await mergeView.diffService.buildMergeResult(mergeView.incoming);
        await mergeView.diffService.compareMergeResult(mergeView.incoming, "incoming");
        const { stage, result } = await attachComparison(mergeView);

        mergeView.store.detach(stage);
        mergeView.store.detach(result);

        expect(mergeView.view.textOf(stage.uri)).toBeUndefined();
        expect(mergeView.view.textOf(result.uri)).toBeUndefined();
    });
});
