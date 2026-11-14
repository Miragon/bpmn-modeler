import {
    type ModdleElement,
    isModdleElement,
    isType,
    trackedElementOf,
} from "@miragon/bpmn-modeler-diff";

/** Elements the diff folds into their container that are no root elements, which a merge decides on separately. */
const OWN_MERGE_ELEMENT_TYPES = [
    "bpmn:TextAnnotation",
    "bpmn:Association",
    "bpmn:Group",
    "bpmn:DataObject",
];

/** The units a merge classifies and decides on: the diff's tracked elements, every root element and the artifacts the diff folds away. */
export function isMergeElement(element: ModdleElement): boolean {
    return (
        isRootElement(element) ||
        OWN_MERGE_ELEMENT_TYPES.some((type) => isType(element, type)) ||
        trackedElementOf(element) === element
    );
}

/** An event definition is a root element type too, but only one in `definitions` is a root element. */
function isRootElement(element: ModdleElement): boolean {
    return (
        isType(element, "bpmn:RootElement") &&
        isModdleElement(element.$parent) &&
        isType(element.$parent, "bpmn:Definitions")
    );
}
