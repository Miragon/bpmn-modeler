import type Modeler from "camunda-bpmn-js/lib/base/Modeler";
import type { BaseViewerOptions } from "bpmn-js/lib/BaseViewer";

export interface EngineStack {
    readonly Modeler: new (options: BaseViewerOptions) => Modeler;
    /** DI modules only this engine registers, placed right after the common modules. */
    readonly engineModules: readonly unknown[];
}
