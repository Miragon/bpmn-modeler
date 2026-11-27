import {
    createModelNavigationModule,
    type ModelNavigationPort,
} from "@miragon/bpmn-model-navigation";

import type { BpmnFeature } from "../../../kernel/domain/bpmnFeature";

/** @experimental Opens a referenced model through the host. */
export function modelNavigation(port: ModelNavigationPort): BpmnFeature {
    return { id: "modelNavigation", modules: [createModelNavigationModule(port)] };
}
