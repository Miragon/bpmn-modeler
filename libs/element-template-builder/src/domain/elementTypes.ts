import type { Translate } from "./translate";

// The shared translations' own spellings: `translate()` looks keys up exactly.
const NAMES: Readonly<Record<string, string>> = {
    "bpmn:ServiceTask": "Service task",
    "bpmn:SendTask": "Send task",
    "bpmn:UserTask": "User task",
    "bpmn:ScriptTask": "Script task",
    "bpmn:BusinessRuleTask": "Business rule task",
    // Its sentence-case twin translates to plain "task" in some languages.
    "bpmn:ReceiveTask": "Receive Task",
    "bpmn:CallActivity": "Call activity",
    "bpmn:Task": "Task",
    "bpmn:Activity": "Activity",
    "bpmn:Event": "Event",
    "bpmn:Gateway": "Gateway",
    "bpmn:StartEvent": "Start event",
    "bpmn:IntermediateThrowEvent": "Intermediate throw event",
    "bpmn:IntermediateCatchEvent": "Intermediate Catch Event",
    "bpmn:EndEvent": "End event",
    "bpmn:BoundaryEvent": "Boundary event",
    "bpmn:SubProcess": "Sub-process",
    "bpmn:Process": "Process",
    "bpmn:SequenceFlow": "Sequence flow",
};

/** What people call an element type, or its identifier for one the builder does not know. */
export function elementTypeName(type: string, translate: Translate): string {
    const name = NAMES[type];
    return name ? translate(name) : type;
}
