import type Canvas from "diagram-js/lib/core/Canvas";
import type EventBus from "diagram-js/lib/core/EventBus";
import type Selection from "diagram-js/lib/features/selection/Selection";
import { getBBox } from "diagram-js/lib/util/Elements";

import { type Disposer, subscribe } from "@miragon/bpmn-modeler-types";

import {
    centreOf,
    liesWithin,
    type PositionedElement,
    viewboxCentredOn,
} from "../../elementGeometry";
import { singleSelected } from "./diffSelection";

/**
 * Tells a diff pane's own changes from the user's. The pane runs its fits,
 * steps, plane changes and partner sync through {@link positionProgrammatically},
 * and the selections it mirrors or an import drops through
 * {@link selectProgrammatically}; the events fired inside are not the user's.
 */
export class UserChangeGuard {
    private positioningDepth = 0;

    private selectionDepth = 0;

    /** Whether the viewport or plane change now firing came from the user. */
    isUserPositioning(): boolean {
        return this.positioningDepth === 0;
    }

    /**
     * Whether the selection change now firing came from the user. Entering a
     * plane drops the selection, which the user did not do either.
     */
    isUserSelectionChange(): boolean {
        return this.selectionDepth === 0 && this.positioningDepth === 0;
    }

    positionProgrammatically(action: () => void): void {
        this.positioningDepth += 1;
        try {
            action();
        } finally {
            this.positioningDepth -= 1;
        }
    }

    selectProgrammatically(action: () => void): void {
        this.selectionDepth += 1;
        try {
            action();
        } finally {
            this.selectionDepth -= 1;
        }
    }

    async selectProgrammaticallyUntilDone<T>(action: () => Promise<T>): Promise<T> {
        this.selectionDepth += 1;
        try {
            return await action();
        } finally {
            this.selectionDepth -= 1;
        }
    }
}

/**
 * Replaces diagram-js's KeepSelectionVisible in a diff pane. A pane that loses
 * height, as when an editor opens below the diff, can cut the selection off at
 * its bottom edge. As upstream did, only a selection that was fully in view is
 * brought back, so a user who panned away keeps their place. Only the pane the
 * user selected in centres it, as a user pan, so the partner follows through the
 * viewport sync; a mirroring pane's own scroll would post a competing viewport.
 */
export function armKeepUserSelectionVisible(
    diagram: { eventBus: EventBus; canvas: Canvas; selection: Selection },
    pane: { changes: UserChangeGuard; isPaneSized(): boolean },
): Disposer[] {
    const { eventBus, canvas, selection } = diagram;
    let selectionIsUsers = false;
    // Measured on every viewbox, selection and size change, so a resize can tell what it cut off.
    let selectionWasVisible = false;

    const isSelectionVisible = (): boolean => {
        const element = singleSelected(selection.get());
        return !!element && liesWithin(getBBox(element), canvas.viewbox());
    };
    const recordSelectionVisibility = () => {
        selectionWasVisible = isSelectionVisible();
    };
    // `canvas.resized()` drops the cached viewbox, so it measures the new size here.
    const centreSelectionCutOff = () => {
        if (!pane.isPaneSized()) {
            return;
        }
        const element = singleSelected(selection.get());
        const centre = element ? centreOf(element as PositionedElement) : undefined;
        if (centre && selectionIsUsers && selectionWasVisible && !isSelectionVisible()) {
            canvas.viewbox(viewboxCentredOn(centre, canvas.viewbox()));
        }
        recordSelectionVisibility();
    };

    return [
        subscribe(eventBus, "selection.changed", () => {
            selectionIsUsers = pane.changes.isUserSelectionChange();
            recordSelectionVisibility();
        }),
        subscribe(eventBus, "canvas.viewbox.changed", recordSelectionVisibility),
        subscribe(eventBus, "canvas.resized", centreSelectionCutOff),
    ];
}
