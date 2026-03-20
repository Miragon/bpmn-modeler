import { VsCodeApi } from "@bpmn-modeler/shared";
import { WebviewState } from "./vscode";
import { BpmnModeler } from "./modeler";

/**
 * Manages webview state persistence and restoration across VS Code tab switches.
 *
 * Lifecycle phases (call in order):
 * 1. {@link restoreViewport}  — after importXML (canvas must exist)
 * 2. {@link restoreSelection} — after element templates + settings applied
 * 3. {@link startPersisting}  — subscribes to change events for ongoing persistence
 */
export class WebviewStateManager {
    constructor(
        private readonly vscode: VsCodeApi<WebviewState, any>,
        private readonly modeler: BpmnModeler,
    ) {}

    /**
     * Restores the saved viewport (pan/zoom) if one exists in webview state.
     * Must be called after importXML because the canvas does not exist before that.
     */
    restoreViewport(): void {
        const saved = this.getSavedState();
        if (saved?.viewport) {
            this.modeler.viewport.setViewport(saved.viewport);
        }
    }

    /**
     * Restores the saved element selection if one exists in webview state.
     * Must be called after element templates and settings have been applied
     * so their side-effects do not clear the restored selection.
     */
    restoreSelection(): void {
        const saved = this.getSavedState();
        if (saved?.selectedElementIds && saved.selectedElementIds.length > 0) {
            this.modeler.selection.selectElementsByIds(
                saved.selectedElementIds,
            );
        }
    }

    /**
     * Subscribes to viewport and selection change events and persists them
     * to webview state so they survive the next tab switch.
     */
    startPersisting(): void {
        this.modeler.viewport.onViewportChanged((viewport) => {
            this.persistPartialState({ viewport });
        });

        this.modeler.selection.onSelectionChanged((selectedElementIds) => {
            this.persistPartialState({ selectedElementIds });
        });
    }

    /**
     * Reads previously saved webview state, returning `undefined` when no
     * state has been set yet (first open).
     */
    private getSavedState(): WebviewState | undefined {
        try {
            return this.vscode.getState();
        } catch {
            return undefined;
        }
    }

    /**
     * Merges a partial update into the persisted webview state.
     * Falls back to a full `setState` when no prior state exists.
     *
     * @param partial The state fields to persist.
     */
    private persistPartialState(partial: Partial<WebviewState>): void {
        try {
            this.vscode.updateState(partial);
        } catch {
            this.vscode.setState(partial as WebviewState);
        }
    }
}
