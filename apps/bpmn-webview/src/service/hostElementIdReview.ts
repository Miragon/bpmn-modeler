import {
    type ApplyElementIdsQuery,
    ElementIdProposalsCommand,
    type ElementIdProposalsQuery,
    ElementIdsAppliedCommand,
} from "@miragon/bpmn-modeler-shared";
import { isEditableSurface } from "@miragon/bpmn-modeler/mode";

import type { SurfaceHandle } from "../domain/surface";
import type { HostChannel } from "../port/hostChannel";

interface HostElementIdReviewHandlers {
    ElementIdProposalsQuery(query: ElementIdProposalsQuery): void;
    ApplyElementIdsQuery(query: ApplyElementIdsQuery): void;
    CloseElementIdReviewQuery(): void;
}

export interface HostElementIdReview {
    readonly handlers: HostElementIdReviewHandlers;
    /** Lists the open review's rows again: after a diagram change, a host import or a new surface. */
    refresh(): void;
}

const UNSUPPORTED = new ElementIdProposalsCommand("unsupported", [], []);

/**
 * Serves the element ID review a host shows in its own panel. The host keeps
 * which rows are unchecked and sends them with every query; this lists the rows
 * for them until the host applies or closes the review.
 */
export function createHostElementIdReview(
    host: HostChannel,
    getSurface: () => SurfaceHandle,
): HostElementIdReview {
    let open = false;
    // `undefined` until the first listing settles the rows the review starts with.
    let unchecked: readonly string[] | undefined;

    function list(): void {
        const surface = getSurface();
        if (!isEditableSurface(surface)) {
            host.postMessage(UNSUPPORTED);
            return;
        }
        const proposals = surface.proposeElementIds(unchecked);
        unchecked = proposals.unchecked;
        host.postMessage(
            new ElementIdProposalsCommand("listed", proposals.rows, proposals.unchecked),
        );
    }

    return {
        handlers: {
            ElementIdProposalsQuery: (query) => {
                open = true;
                unchecked = query.unchecked ?? undefined;
                list();
            },
            ApplyElementIdsQuery: (query) => {
                const surface = getSurface();
                if (!isEditableSurface(surface)) {
                    host.postMessage(UNSUPPORTED);
                    return;
                }
                open = false;
                host.postMessage(
                    new ElementIdsAppliedCommand(surface.renameElementIds(query.unchecked)),
                );
            },
            CloseElementIdReviewQuery: () => {
                open = false;
            },
        },
        refresh: () => {
            if (open) {
                list();
            }
        },
    };
}
