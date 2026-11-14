/** The slice of a diagram-js element that names its BPMN element. */
export interface BpmnDiagramElement {
    businessObject: { id: string };
}

/**
 * The id of the BPMN element a diagram element shows: a label names the element
 * it labels, as bpmn-js gives it that element's business object, and a
 * subprocess plane the subprocess.
 */
export function bpmnElementIdOf(element: BpmnDiagramElement): string {
    return element.businessObject.id;
}

/**
 * The BPMN id of the one selected element; `undefined` for an empty or a
 * multiple selection.
 */
export function singleSelectedElementId(
    selection: readonly BpmnDiagramElement[],
): string | undefined {
    return selection.length === 1 ? bpmnElementIdOf(selection[0]) : undefined;
}
