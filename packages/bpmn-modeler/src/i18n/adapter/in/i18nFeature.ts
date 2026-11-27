import { i18n as translations, TranslateModule } from "@miragon/bpmn-modeler-i18n";
import { extras } from "@miragon/bpmn-modeler-i18n-extras";

import type { BpmnFeature } from "../../../kernel/domain/bpmnFeature";

/**
 * @experimental The translator. Adds the local translations when the list is
 * built, so they are in place before construction renders a label.
 */
export function i18n(): BpmnFeature {
    translations.extend(extras);
    return { id: "i18n", modules: [TranslateModule] };
}
