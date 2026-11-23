import type { Translate } from "../../surface/domain/translate";

// The translations' own spellings, shared or overlay: `translate()` looks keys up exactly.
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
    // What a merge pane lists for want of a shape: the root element types and the data object.
    "bpmn:Collaboration": "Collaboration",
    "bpmn:Message": "Message",
    "bpmn:Error": "Error",
    "bpmn:Escalation": "Escalation",
    "bpmn:Signal": "Signal",
    "bpmn:DataStore": "Data store",
    // The overlay may not add a casing variant of the shared key.
    "bpmn:DataObject": "Data Object",
    "bpmn:ItemDefinition": "Item definition",
    "bpmn:Category": "Category",
    "bpmn:Interface": "Interface",
    "bpmn:EndPoint": "End point",
    "bpmn:PartnerEntity": "Partner entity",
    "bpmn:PartnerRole": "Partner role",
    "bpmn:Resource": "Resource",
    "bpmn:CorrelationProperty": "Correlation property",
    "bpmn:GlobalTask": "Global task",
};

/** What people call an element type, or its identifier for one the modeler does not name. */
export function elementTypeName(type: string, translate: Translate): string {
    const name = NAMES[type];
    return name ? translate(name) : type;
}
