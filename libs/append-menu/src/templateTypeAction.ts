/**
 * Places an element-template element as a specific BPMN type chosen from the
 * template's `appliesTo` list.
 *
 * The upstream template action bakes in `elementType.value || appliesTo[0]`, so
 * a multi-type template always yields the first type. Cloning the template with
 * `appliesTo` narrowed to the chosen type makes `elementTemplates.createElement`
 * produce that type with the template bound, then places it exactly as the
 * upstream append/create providers do.
 *
 * The clone deliberately narrows `appliesTo` instead of setting `elementType`:
 * C7's `changeTemplate` handler compares `element.$type` (undefined on a shape)
 * against `elementType.value` and would `bpmnReplace` the still-detached shape,
 * crashing in the ordering provider.
 */
import type { ElementTemplate } from "@miragon/bpmn-modeler-element-template-chooser";

export interface TemplateTypeActionServices {
    elementTemplates: { createElement(template: ElementTemplate): unknown };
    autoPlace?: { append(source: unknown, element: unknown): void };
    create: { start(event: Event, element: unknown, context?: { source?: unknown }): void };
    mouse?: { getLastMoveEvent(): Event };
}

export interface TemplateTypeActionContext {
    providerId: "bpmn-append" | "bpmn-create";
    target: unknown;
}

// `bpmn:BoundaryEvent` cannot be auto-placed (it must attach to a host), so it
// always falls through to interactive `create.start`, matching upstream's
// `canAutoPlaceElement`.
const NON_AUTO_PLACEABLE = new Set(["bpmn:BoundaryEvent"]);

export function executeTemplateTypeAction(
    services: TemplateTypeActionServices,
    context: TemplateTypeActionContext,
    template: ElementTemplate,
    bpmnType: string,
    event: Event,
): void {
    const { elementTemplates, autoPlace, create, mouse } = services;
    const { providerId, target } = context;

    const { elementType: _dropped, ...rest } = template;
    const typed: ElementTemplate = { ...rest, appliesTo: [bpmnType] };
    const newElement = elementTemplates.createElement(typed);

    if (providerId === "bpmn-append" && autoPlace && !NON_AUTO_PLACEABLE.has(bpmnType)) {
        autoPlace.append(target, newElement);
        return;
    }

    // `KeyboardEvent` guarded with `typeof` because the modeler runs in browsers
    // where it is global, but not in the node test environment.
    const isKeyboard = typeof KeyboardEvent !== "undefined" && event instanceof KeyboardEvent;
    const startEvent = isKeyboard ? (mouse?.getLastMoveEvent() ?? event) : event;

    create.start(
        startEvent,
        newElement,
        providerId === "bpmn-append" ? { source: target } : undefined,
    );
}
