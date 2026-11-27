import { CreateAppendAnythingModule } from "bpmn-js-create-append-anything";
import { AppendMenuModule } from "@miragon/bpmn-modeler-append-menu";

import type { BpmnFeature } from "../../../kernel/domain/bpmnFeature";

/** @experimental The upstream create and append menus, palette and context-pad entries. */
export function createAppendAnything(): BpmnFeature {
    return { id: "createAppendAnything", modules: [CreateAppendAnythingModule] };
}

/**
 * @experimental The two-panel append menu over the upstream one, with favourites
 * a host sets with `appendMenuOf`.
 */
export function appendMenu(): BpmnFeature {
    return { id: "appendMenu", modules: [AppendMenuModule], requires: ["appendMenuProvider"] };
}
