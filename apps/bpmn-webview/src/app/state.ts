import { debounce } from "lodash";

import { SelectionChangedCommand, VsCodeApi } from "@miragon/bpmn-modeler-shared";
import { WebviewState } from "./vscode";
import { BpmnModeler } from "./modeler";

/**
 * Millisecond debounce for posting selection changes to the extension host.
 * 100 ms is long enough to collapse drag-select floods while still feeling
 * instant for the bpmn-iq Editor Bridge (active element preview).
 */
const SELECTION_POST_DEBOUNCE_MS = 100;

/**
 * Manages webview state persistence and restoration across VS Code tab switches.
 *
 * Lifecycle phases (call in order):
 * 1. {@link restoreViewport}  — after importXML (canvas must exist)
 * 2. {@link restoreSelection} — after element templates + settings applied
 * 3. {@link startPersisting}  — subscribes to change events for ongoing persistence
 */
export class WebviewStateManager {
    private postSelection: ReturnType<typeof debounce> | null = null;

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
     *
     * Also forwards selection changes to the extension host via
     * {@link SelectionChangedCommand} so the bpmn-iq editor bridge can keep
     * the daemon's active-element session in sync.  The post is debounced so
     * that drag-rubber-band selections don't flood the host.
     */
    startPersisting(): void {
        // Cancel a pre-existing debounce on re-init so we never have two
        // pending posts racing into a possibly-disposed extension host.
        this.postSelection?.cancel();
        this.postSelection = debounce((ids: string[]) => {
            this.vscode.postMessage(new SelectionChangedCommand(ids));
        }, SELECTION_POST_DEBOUNCE_MS);

        this.modeler.viewport.onViewportChanged((viewport) => {
            this.persistPartialState({ viewport });
        });

        this.modeler.selection.onSelectionChanged((selectedElementIds) => {
            this.persistPartialState({ selectedElementIds });
            this.postSelection?.(selectedElementIds);
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
