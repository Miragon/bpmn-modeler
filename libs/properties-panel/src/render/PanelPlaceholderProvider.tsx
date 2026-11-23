/** @jsxImportSource @bpmn-io/properties-panel/preact */
/**
 * Forked from bpmn-js-properties-panel v5.65.0 (MIT). See LICENSE-upstream.
 * Delta: drops the bundled empty/multiple SVG icons (they live only in the
 * upstream dist, which this lib must not import) — the placeholder text stands
 * on its own.
 */
import type { Translate } from "@miragon/bpmn-modeler-types";

export const PanelPlaceholderProvider = (translate?: Translate) => {
    const t = translate ?? ((text: string) => text);
    return {
        getEmpty: () => {
            return {
                text: t("Select an element to edit its properties."),
            };
        },

        getMultiple: () => {
            return {
                text: t(
                    "Multiple elements are selected. Select a single element to edit its properties.",
                ),
            };
        },
    };
};
