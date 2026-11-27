import { type Engine, getLatestVersion, initialDiagram } from "@miragon/bpmn-modeler-types";

import type { BpmnFeature } from "../../../kernel/domain/bpmnFeature";
import { DIAGRAM_TEMPLATE } from "../../../kernel/domain/kernelNames";
import {
    POPUP_MENU_ANNOTATION_OVERRIDES,
    type PopupMenuAnnotationOverrides,
} from "../../../kernel/domain/popupMenus";
import type { DiagramTemplate } from "../../../kernel/port/kernelServices";
import {
    C7_POPUP_MENU_ANNOTATIONS,
    C8_POPUP_MENU_ANNOTATIONS,
} from "../../domain/popupMenuAnnotationOverrides";
import type { EngineModules } from "./engineModules";

export interface EngineFeatureOptions {
    /** Stamped into a new diagram; the engine's latest version without one. */
    readonly engineVersion?: string;
}

function engineFeature(
    id: string,
    engine: Engine,
    { modules, moddleExtensions, propertiesPanelDefaults }: EngineModules,
    overrides: PopupMenuAnnotationOverrides,
    { engineVersion }: EngineFeatureOptions,
): BpmnFeature {
    const version = engineVersion ?? getLatestVersion(engine);
    const template: DiagramTemplate = { newDiagramXml: () => initialDiagram(engine, version) };
    return {
        id,
        modules: [
            ...modules,
            { [DIAGRAM_TEMPLATE]: ["value", template] },
            { [POPUP_MENU_ANNOTATION_OVERRIDES]: ["value", overrides] },
        ],
        moddleExtensions,
        config: { propertiesPanel: propertiesPanelDefaults },
    };
}

/**
 * @experimental Camunda 7: its moddle, behaviours and panel providers in the
 * upstream panel, the colour picker, variables, the annotation overrides and the
 * diagram `newDiagram` opens. Loaded on demand, so a page parses only its engine.
 */
export async function camunda7(options: EngineFeatureOptions = {}): Promise<BpmnFeature> {
    const { c7EngineModules } = await import("./c7EngineModules");
    return engineFeature("camunda7", "c7", c7EngineModules, C7_POPUP_MENU_ANNOTATIONS, options);
}

/** @experimental Camunda 8, as {@link camunda7}, with example data. */
export async function camunda8(options: EngineFeatureOptions = {}): Promise<BpmnFeature> {
    const { c8EngineModules } = await import("./c8EngineModules");
    return engineFeature("camunda8", "c8", c8EngineModules, C8_POPUP_MENU_ANNOTATIONS, options);
}
