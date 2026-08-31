import DmnModeler, { DiagramWarning } from "dmn-js/lib/Modeler";
import {
    CamundaPropertiesProviderModule,
    DmnPropertiesPanelModule,
    DmnPropertiesProviderModule,
} from "dmn-js-properties-panel";
import DmnSimulationModule from "@emaarco/dmn-js-simulation";
import camundaModdleDescriptors from "camunda-dmn-moddle/resources/camunda.json";

import {
    NoModelerError,
    type ResizableCanvas,
    observeCanvasSize,
} from "@miragon/bpmn-modeler-types";

let modeler: DmnModeler | undefined;

export function createModeler(): DmnModeler {
    modeler = new DmnModeler({
        drd: {
            propertiesPanel: {
                parent: "#js-properties-panel",
            },
            additionalModules: [
                DmnPropertiesPanelModule,
                DmnPropertiesProviderModule,
                CamundaPropertiesProviderModule,
                DmnSimulationModule.decisionRequirementsDiagram,
            ],
        },
        decisionTable: {
            additionalModules: [DmnSimulationModule.decisionTable],
        },
        common: {
            expressionLanguages: {
                options: [
                    {
                        value: "feel",
                        label: "FEEL",
                    },
                    {
                        value: "juel",
                        label: "JUEL",
                    },
                    {
                        value: "javascript",
                        label: "JavaScript",
                    },
                    {
                        value: "groovy",
                        label: "Groovy",
                    },
                    {
                        value: "python",
                        label: "Python",
                    },
                    {
                        value: "jruby",
                        label: "JRuby",
                    },
                ],
                defaults: {
                    editor: "feel",
                },
            },
            dataTypes: ["string", "boolean", "integer", "long", "double", "date"],
        },
        container: "#js-canvas",
        keyboard: {
            bindTo: document,
        },
        moddleExtensions: {
            camunda: camundaModdleDescriptors,
        },
    });

    return modeler;
}

/** Imports the given DMN XML, collecting any import warnings into the thrown error. */
export async function loadDiagram(dmn: string): Promise<DiagramWarning> {
    try {
        const m = getModeler();
        return await m.importXML(dmn);
    } catch (error) {
        if ((error as DiagramWarning).warnings) {
            const diagramWarning: DiagramWarning = error as DiagramWarning;
            let errorMsg = "";
            diagramWarning.warnings.forEach((warning) => {
                errorMsg += `${warning.message}\n${warning.error.message}\n${warning.error.stack}\n`;
            });
            throw new Error(errorMsg, { cause: error });
        } else {
            throw error;
        }
    }
}

/** Serialises the current diagram to formatted DMN XML. */
export async function exportDiagram(): Promise<string> {
    const m = getModeler();
    const result = await m.saveXML({ format: true });
    if (result.xml) {
        return result.xml;
    }

    throw Error("Failed to save changes made to the diagram!");
}

/**
 * Keeps the active view's cached canvas size in sync with its container.
 *
 * dmn-js only re-measures when a view is attached, so a host that lays the
 * webview out after the open leaves the DRD canvas on a stale box, throwing
 * off hit-testing and drag coordinates.
 */
export function syncCanvasSize(container: Element): () => void {
    getModeler();
    return observeCanvasSize({ resized: () => getActiveCanvas()?.resized() }, container);
}

/** True only when the DRD (diagram) view is active — not decision-table or literal-expression. */
export function isDrdViewActive(): boolean {
    return modeler?.getActiveView()?.type === "drd";
}

/** DRD canvas with focus methods; `undefined` outside the DRD view. */
export function getActiveFocusableCanvas():
    | (ResizableCanvas & { focus(): void; isFocused(): boolean })
    | undefined {
    const viewer = getModeler().getActiveViewer();
    return viewer?.get("canvas", false) ?? undefined;
}

/** `undefined` for the decision-table and literal-expression views. */
function getActiveCanvas(): ResizableCanvas | undefined {
    const viewer = getModeler().getActiveViewer();
    return viewer?.get("canvas", false) ?? undefined;
}

export function onCommandStackChanged(cb: () => void): void {
    const m = getModeler();
    m.on("views.changed", () => {
        const activeEditor = getModeler().getActiveViewer();
        activeEditor.get("eventBus").on("commandStack.changed", cb);
    });
}

/** Returns the modeler instance, throwing {@link NoModelerError} before init. */
function getModeler(): DmnModeler {
    if (!modeler) {
        throw new NoModelerError();
    }

    return modeler;
}
