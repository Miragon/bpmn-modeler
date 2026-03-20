import bpmnJs from "./bpmn-js";
import dmnJs from "./dmn-js";
import propertiesPanel from "./properties-panel";
import other from "./other";

/** Merged translation dictionary for this locale. */
const dictionary: Record<string, string> = {
    ...bpmnJs,
    ...dmnJs,
    ...propertiesPanel,
    ...other,
};

export default dictionary;
