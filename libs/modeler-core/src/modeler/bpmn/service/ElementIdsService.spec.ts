import { describe, expect, it } from "vitest";

import {
    ApplyElementIdsQuery,
    CloseElementIdReviewQuery,
    ElementIdProposalsCommand,
    ElementIdProposalsQuery,
    ElementIdsAppliedCommand,
    FocusElementQuery,
} from "@miragon/bpmn-modeler-shared";
import type { ElementIdRow } from "@miragon/bpmn-modeler-types";

import { createTestHost } from "../../../testing";
import type { ElementIdReviewView } from "../domain/elementIdReviewView";
import type { ElementIdReviewPort } from "../port/bpmnPorts";
import { ElementIdsService } from "./ElementIdsService";

const SWITCH_MODE = "Switch to Design or Implement mode to generate IDs from names.";

function createService() {
    const host = createTestHost();
    const editor = host.openEditor("/work/diagram.bpmn");
    const service = new ElementIdsService(host.store, host.notifier);
    return { service, host, editor, notifier: host.notifier };
}

describe("ElementIdsService on a host without a review panel", () => {
    it("says the editor cannot show the review, and asks no editor for its rows", async () => {
        const { service, editor, notifier } = createService();

        await service.generate(editor.id);

        expect(notifier.infos).toEqual([
            "This editor cannot show the review of IDs generated from names. Use Generate from name under an element's ID.",
        ]);
        expect(editor.posted).toEqual([]);
        expect(service.hasReviewPanel).toBe(false);
    });
});

class RecordingReviewPanel implements ElementIdReviewPort {
    readonly shown: ElementIdReviewView[] = [];
    closed = 0;

    show(view: ElementIdReviewView): void {
        this.shown.push(view);
    }

    close(): void {
        this.closed++;
    }

    get last(): ElementIdReviewView | undefined {
        return this.shown.at(-1);
    }
}

const ROWS: ElementIdRow[] = [
    {
        id: "Process_1",
        name: "Order fulfilment",
        type: "bpmn:Process",
        kind: "process",
        status: "unchecked",
        newId: "orderFulfilment",
        clash: false,
        shownId: "Process_1",
    },
    {
        id: "Activity_1",
        name: "Check stock",
        type: "bpmn:ServiceTask",
        kind: "activity",
        status: "rename",
        newId: "serviceTask_checkStock",
        clash: false,
        shownId: "Activity_1",
    },
];

const LISTED = new ElementIdProposalsCommand("listed", ROWS, ["Process_1"]);

function createPanelService() {
    const host = createTestHost();
    const editor = host.openEditor("/work/order.bpmn");
    const panel = new RecordingReviewPanel();
    const service = new ElementIdsService(host.store, host.notifier, panel);
    return { service, host, editor, panel, notifier: host.notifier };
}

async function openReview() {
    const setUp = createPanelService();
    await setUp.service.generate(setUp.editor.id);
    setUp.service.reportProposals(setUp.editor.id, LISTED);
    setUp.editor.posted.length = 0;
    return setUp;
}

describe("ElementIdsService with the host's own review panel", () => {
    it("asks the editor the command targets for the review's rows", async () => {
        const { service, host, editor, panel } = createPanelService();
        const other = host.openEditor("/work/other.bpmn");

        await service.generate(editor.id);

        expect(service.hasReviewPanel).toBe(true);
        expect(editor.posted).toEqual([new ElementIdProposalsQuery(null)]);
        expect(other.posted).toEqual([]);
        expect(panel.shown).toEqual([]);
    });

    it("rejects for an editor that is not open, so the host can ask for a diagram", async () => {
        const { service, editor, notifier } = createPanelService();

        await expect(service.generate("file:///work/closed.bpmn")).rejects.toThrow(
            "No editor found for id: file:///work/closed.bpmn",
        );

        expect(editor.posted).toEqual([]);
        expect(notifier.infos).toEqual([]);
    });

    it("shows the rows the editor lists, under the diagram's file name", async () => {
        const { panel } = await openReview();

        expect(panel.last).toMatchObject({
            title: "order.bpmn",
            renameCount: 1,
            groups: [
                { id: "process", checked: false },
                { id: "activity", checked: true },
            ],
        });
    });

    it("ignores rows from an editor whose review it is not", async () => {
        const { service, host, panel } = await openReview();
        const other = host.openEditor("/work/other.bpmn");

        service.reportProposals(other.id, LISTED);

        expect(panel.shown).toHaveLength(1);
    });

    it("shows a change of a checkbox at once and asks the editor for the new rows", async () => {
        const { service, editor, panel } = await openReview();

        await service.setChecked(["Activity_1"], false);

        expect(panel.last?.renameCount).toBe(0);
        expect(editor.posted).toEqual([new ElementIdProposalsQuery(["Process_1", "Activity_1"])]);
    });

    it("renames the checked rows and closes the panel once the editor has", async () => {
        const { service, editor, panel } = await openReview();

        await service.apply();
        service.reportApplied(editor.id, new ElementIdsAppliedCommand(1));
        service.reportProposals(editor.id, LISTED);

        expect(editor.posted).toEqual([new ApplyElementIdsQuery(["Process_1"])]);
        expect(panel.closed).toBe(1);
        expect(panel.shown).toHaveLength(1);
    });

    it("discards the review: the panel closes and the editor stops listing", async () => {
        const { service, editor, panel } = await openReview();

        await service.discard();

        expect(panel.closed).toBe(1);
        expect(editor.posted).toEqual([new CloseElementIdReviewQuery()]);
    });

    it("reveals a row's element in its editor", async () => {
        const { service, editor } = await openReview();

        await service.reveal("Activity_1");

        expect(editor.posted).toEqual([new FocusElementQuery("Activity_1")]);
    });

    it("tells the user to switch modes when the review cannot open, and shows no panel", async () => {
        const { service, editor, panel, notifier } = createPanelService();
        await service.generate(editor.id);

        service.reportProposals(editor.id, new ElementIdProposalsCommand("unsupported", [], []));
        service.reportProposals(editor.id, LISTED);

        expect(notifier.infos).toEqual([SWITCH_MODE]);
        expect(panel.shown).toEqual([]);
    });

    it("says so in the panel when the editor switches to View mode during the review", async () => {
        const { service, editor, panel, notifier } = await openReview();

        service.reportProposals(editor.id, new ElementIdProposalsCommand("unsupported", [], []));

        expect(panel.last).toMatchObject({ message: SWITCH_MODE, groups: [], renameCount: 0 });
        expect(notifier.infos).toEqual([]);
    });

    it("keeps the choices of a hidden editor and asks the user to show it", async () => {
        const { service, editor, panel } = await openReview();
        editor.hidden = true;

        await service.setChecked(["Activity_1"], false);
        await service.apply();
        editor.hidden = false;
        await service.resume(editor.id);

        expect(panel.last?.message).toBe("Show order.bpmn to change its IDs.");
        expect(editor.posted).toEqual([new ElementIdProposalsQuery(["Process_1", "Activity_1"])]);
    });

    it("asks a restarted page for the rows again, and no page without a review", async () => {
        const { service, host, editor } = await openReview();
        const other = host.openEditor("/work/other.bpmn");

        await service.resume(editor.id);
        await service.resume(other.id);

        expect(editor.posted).toEqual([new ElementIdProposalsQuery(["Process_1"])]);
        expect(other.posted).toEqual([]);
    });

    it("keeps the choices when the review runs again on the same diagram", async () => {
        const { service, editor } = await openReview();
        await service.setChecked(["Activity_1"], false);
        editor.posted.length = 0;

        await service.generate(editor.id);

        expect(editor.posted).toEqual([new ElementIdProposalsQuery(["Process_1", "Activity_1"])]);
    });

    it("moves the review to another diagram, and the first one stops listing", async () => {
        const { service, host, editor } = await openReview();
        const other = host.openEditor("/work/other.bpmn");

        await service.generate(other.id);

        expect(editor.posted).toEqual([new CloseElementIdReviewQuery()]);
        expect(other.posted).toEqual([new ElementIdProposalsQuery(null)]);
    });

    it("closes the panel when the review's editor closes", async () => {
        const { service, host, editor, panel } = await openReview();

        service.end(host.openEditor("/work/other.bpmn").id);
        service.end(editor.id);

        expect(panel.closed).toBe(1);
    });

    it("has no review to act on for a host without a panel", async () => {
        const { service, editor } = createService();

        await service.apply();
        await service.discard();
        await service.reveal("Activity_1");

        expect(editor.posted).toEqual([]);
    });
});
