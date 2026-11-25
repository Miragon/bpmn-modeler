import type { Translate } from "@miragon/bpmn-modeler-types";
import {
    type FittableCanvas,
    fitCanvasToContent,
    installFitViewportButton,
    installForDiagramLifetime,
    type LifetimeEventBus,
} from "@miragon/bpmn-modeler-browser";

interface FitButtonCanvas extends FittableCanvas {
    focus(): void;
    isFocused(): boolean;
}

interface FocusChangeEventBus extends LifetimeEventBus {
    on(event: string, priority: number, listener: () => void): void;
    on(event: "canvas.focus.changed", listener: (event: { focused: boolean }) => void): void;
}

/** The canvas's fit-to-view button, marked while the canvas holds the keyboard. */
class FitViewportButton {
    static $inject = ["eventBus", "canvas", "translate"];

    constructor(eventBus: FocusChangeEventBus, canvas: FitButtonCanvas, translate: Translate) {
        installForDiagramLifetime(eventBus, () =>
            installFitViewportButton({
                parent: canvas.getContainer(),
                label: translate("Fit diagram to view"),
                // The fit the viewport manager's `fitViewport` runs.
                fit: () => fitCanvasToContent(canvas),
                focusCanvas: () => canvas.focus(),
                isCanvasFocused: () => canvas.isFocused(),
                onCanvasFocusChanged: (listener) =>
                    eventBus.on("canvas.focus.changed", (event) => listener(event.focused)),
            }),
        );
    }
}

export const FitViewportButtonModule = {
    __init__: ["fitViewportButton"],
    fitViewportButton: ["type", FitViewportButton],
};
