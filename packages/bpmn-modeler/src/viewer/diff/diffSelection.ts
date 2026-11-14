/** The slice of a diagram-js element that names its BPMN element. */
export interface BpmnDiagramElement {
    id: string;
    businessObject?: { id?: string };
}

/**
 * The id of the BPMN element a diagram element shows: a label names the element
 * it labels, as bpmn-js gives it that element's business object, and a
 * subprocess plane the subprocess. An element without a named business object,
 * such as diagram-js's implicit root, keeps its diagram id.
 */
export function bpmnElementIdOf(element: BpmnDiagramElement): string {
    return element.businessObject?.id ?? element.id;
}

/** The one selected element; `undefined` for an empty or a multiple selection. */
export function singleSelected<E>(selection: readonly E[]): E | undefined {
    return selection.length === 1 ? selection[0] : undefined;
}

/** The BPMN id of the {@link singleSelected} element. */
export function singleSelectedElementId(
    selection: readonly BpmnDiagramElement[],
): string | undefined {
    const element = singleSelected(selection);
    return element && bpmnElementIdOf(element);
}
