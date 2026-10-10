import BpmnModeler8 from "camunda-bpmn-js/lib/camunda-cloud/Modeler";
import type { EngineStack } from "./engineStack";

export const c8Stack: EngineStack = {
    Modeler: BpmnModeler8,
    engineModules: [],
};
