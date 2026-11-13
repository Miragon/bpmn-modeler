import type { PropertiesPanelHandle } from "@miragon/bpmn-modeler-shared";

import { fitPreview, INITIAL_PREVIEW_FIT } from "../../domain/previewFit";

type PreviewPane = Pick<PropertiesPanelHandle, "isVisible" | "setVisible">;

/** Returns what fits the preview pane to each new width of the editor. */
export function createPreviewPaneFit(pane: PreviewPane): (width: number) => void {
    let previewFit = INITIAL_PREVIEW_FIT;
    return (width) => {
        const { fit, show } = fitPreview(previewFit, width, pane.isVisible());
        previewFit = fit;
        if (show !== undefined) {
            pane.setVisible(show);
        }
    };
}
