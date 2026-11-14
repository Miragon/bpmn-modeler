import { describe, expect, it, vi } from "vitest";

import {
    ApplyElementIdsQuery,
    type Command,
    ElementIdProposalsCommand,
    ElementIdProposalsQuery,
    ElementIdsAppliedCommand,
    type Query,
} from "@miragon/bpmn-modeler-shared";
import type { ElementIdProposals, ElementIdRow } from "@miragon/bpmn-modeler-types";

import type { SurfaceHandle } from "../domain/surface";
import { createHostElementIdReview } from "./hostElementIdReview";

const row: ElementIdRow = {
    id: "Activity_1",
    name: "Check stock",
    type: "bpmn:ServiceTask",
    kind: "activity",
    status: "rename",
    newId: "serviceTask_checkStock",
    clash: false,
    shownId: "Activity_1",
};

function setUp() {
    const posted: (Command | Query)[] = [];
    const editable = {
        proposeElementIds: vi.fn((unchecked?: readonly string[]): ElementIdProposals => ({
            rows: [row],
            unchecked: unchecked ?? ["Process_1"],
        })),
        renameElementIds: vi.fn(() => 2),
    };
    let surface: object = editable;
    const review = createHostElementIdReview(
        { postMessage: (message) => posted.push(message) },
        () => surface as SurfaceHandle,
    );
    return {
        posted,
        editable,
        review,
        switchToViewer: () => {
            surface = { exportDiagram: vi.fn() };
        },
        switchToModeler: () => {
            surface = editable;
        },
    };
}

describe("createHostElementIdReview", () => {
    it("lists the rows the review starts with when the host opens it", () => {
        const { posted, editable, review } = setUp();

        review.handlers.ElementIdProposalsQuery(new ElementIdProposalsQuery(null));

        expect(editable.proposeElementIds).toHaveBeenCalledWith(undefined);
        expect(posted).toEqual([new ElementIdProposalsCommand("listed", [row], ["Process_1"])]);
    });

    it("lists the rows again after a change, with the IDs the host unchecked", () => {
        const { posted, editable, review } = setUp();
        review.handlers.ElementIdProposalsQuery(new ElementIdProposalsQuery(null));
        review.handlers.ElementIdProposalsQuery(new ElementIdProposalsQuery(["Activity_1"]));

        review.refresh();

        expect(editable.proposeElementIds).toHaveBeenLastCalledWith(["Activity_1"]);
        expect(posted).toHaveLength(3);
    });

    it("lists nothing while no review is open", () => {
        const { posted, review } = setUp();

        review.refresh();

        expect(posted).toEqual([]);
    });

    it("renames the checked rows, reports how many changed and stops listing", () => {
        const { posted, editable, review } = setUp();
        review.handlers.ElementIdProposalsQuery(new ElementIdProposalsQuery(null));

        review.handlers.ApplyElementIdsQuery(new ApplyElementIdsQuery(["Process_1"]));
        review.refresh();

        expect(editable.renameElementIds).toHaveBeenCalledWith(["Process_1"]);
        expect(posted.at(-1)).toEqual(new ElementIdsAppliedCommand(2));
        expect(posted).toHaveLength(2);
    });

    it("stops listing once the host closes the review", () => {
        const { posted, review } = setUp();
        review.handlers.ElementIdProposalsQuery(new ElementIdProposalsQuery(null));

        review.handlers.CloseElementIdReviewQuery();
        review.refresh();

        expect(posted).toHaveLength(1);
    });

    it("says View mode cannot rename, and lists the rows again once it can", () => {
        const { posted, editable, review, switchToViewer, switchToModeler } = setUp();
        review.handlers.ElementIdProposalsQuery(new ElementIdProposalsQuery(["Activity_1"]));
        switchToViewer();

        review.refresh();
        review.handlers.ApplyElementIdsQuery(new ApplyElementIdsQuery([]));
        switchToModeler();
        review.refresh();

        expect(editable.renameElementIds).not.toHaveBeenCalled();
        expect(posted.slice(1)).toEqual([
            new ElementIdProposalsCommand("unsupported", [], []),
            new ElementIdProposalsCommand("unsupported", [], []),
            new ElementIdProposalsCommand("listed", [row], ["Activity_1"]),
        ]);
    });
});
