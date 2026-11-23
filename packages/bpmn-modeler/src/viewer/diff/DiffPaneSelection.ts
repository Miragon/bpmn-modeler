import type Canvas from "diagram-js/lib/core/Canvas";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type EventBus from "diagram-js/lib/core/EventBus";
import type Selection from "diagram-js/lib/features/selection/Selection";

import { DisposableStore, type Disposer, subscribe } from "@miragon/bpmn-modeler-types";

import { singleSelectedElementId, type BpmnDiagramElement } from "./diffSelection";
import { armKeepSelectionVisible, type UserChangeGuard } from "./selectionPolicy";

/**
 * One diff pane's selection: the user's, reported by BPMN id, the partner's it
 * mirrors and a step's. The pane's {@link UserChangeGuard} tells them apart, for
 * the listeners and for keeping a selection in view on resize alike.
 */
export class DiffPaneSelection {
    private readonly changes: UserChangeGuard;

    private readonly store = new DisposableStore();

    constructor(
        private readonly diagram: {
            eventBus: EventBus;
            canvas: Canvas;
            selection: Selection;
            elementRegistry: ElementRegistry;
        },
        pane: { changes: UserChangeGuard; isPaneSized(): boolean },
    ) {
        this.changes = pane.changes;
        this.store.add(...armKeepSelectionVisible(diagram, pane));
    }

    mirrorSelection(elementId: string | undefined): boolean {
        // Selecting it again would rebuild its context pad.
        if (
            elementId !== undefined &&
            singleSelectedElementId(this.diagram.selection.get()) === elementId
        ) {
            return true;
        }
        return this.selectOnShownPlane(elementId, (select) =>
            this.changes.selectProgrammatically(select),
        );
    }

    selectStep(elementId: string | undefined, { keepInView }: { keepInView: boolean }): boolean {
        return this.selectOnShownPlane(elementId, (select) =>
            keepInView
                ? this.changes.selectForUser(select)
                : this.changes.selectProgrammatically(select),
        );
    }

    onSelectedElementChanged(listener: (elementId: string | undefined) => void): Disposer {
        return subscribe(
            this.diagram.eventBus,
            "selection.changed",
            (event: { newSelection: BpmnDiagramElement[] }) => {
                if (this.changes.isUserSelectionChange()) {
                    listener(singleSelectedElementId(event.newSelection));
                }
            },
        );
    }

    dispose(): void {
        this.store.dispose();
    }

    private selectOnShownPlane(
        elementId: string | undefined,
        runSelection: (select: () => void) => void,
    ): boolean {
        const { canvas, selection, elementRegistry } = this.diagram;
        const element = elementId === undefined ? undefined : elementRegistry.get(elementId);
        const shown = !!element && canvas.findRoot(element) === canvas.getRootElement();
        runSelection(() => selection.select(shown ? element : null));
        return shown || elementId === undefined;
    }
}
