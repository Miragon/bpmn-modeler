import type { PropertiesPanelHandle } from "./propertiesPanelResizer";
import type { PropertiesPanelUiState } from "./propertiesPanelUiState";
import { restorablePanelWidth } from "./propertiesPanelWidth";
import type { WebviewStateStore } from "./webviewStateStore";

/** Bind before the panel visibility, so a saved-open panel reveals at its saved width. */
export function bindPanelWidth(
    handle: PropertiesPanelHandle,
    store: WebviewStateStore<PropertiesPanelUiState>,
): void {
    const savedWidth = restorablePanelWidth(store.read()?.panelWidth);
    if (savedWidth !== undefined) {
        handle.setOpenWidth(savedWidth);
    }
    handle.onOpenWidthChanged((panelWidth) => store.merge({ panelWidth }));
}
