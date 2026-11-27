// Deep imports: the library's root entry brings the forked panel, whose
// `propertiesPanel` would replace the engine feature's.
import { CustomGroupsModule } from "@miragon/bpmn-modeler-properties-panel/customGroups/CustomGroupsRegistry";
import { ModeFilterModule } from "@miragon/bpmn-modeler-properties-panel/modeFilter/ModeFilterProvider";
import type { EditableSurfaceMode } from "@miragon/bpmn-modeler-types/domain";

import type { BpmnFeature } from "../../../kernel/domain/bpmnFeature";

export interface PropertiesPanelFeatureOptions {
    readonly parent: HTMLElement;
    /** Keeps FEEL popups inside the surface's theme scope instead of `document.body`. */
    readonly feelPopupContainer?: HTMLElement;
    /** The panel shows Design entries without one. */
    readonly mode?: EditableSurfaceMode;
}

/**
 * @experimental What every panel shares: where it renders, the mode filter and
 * the custom groups. The panel itself comes from the engine feature.
 */
export function propertiesPanel({
    parent,
    feelPopupContainer,
    mode,
}: PropertiesPanelFeatureOptions): BpmnFeature {
    return {
        id: "propertiesPanel",
        modules: [
            // Script controls look their panel up here, never in a sibling surface's.
            { propertiesPanelRoot: ["value", parent] },
            ModeFilterModule,
            CustomGroupsModule,
        ],
        config: { propertiesPanel: { parent, feelPopupContainer }, propertiesPanelMode: mode },
        requires: ["propertiesPanel"],
    };
}
