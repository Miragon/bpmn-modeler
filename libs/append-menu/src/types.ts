/**
 * Type definitions for popup menu entries and utilities to classify them
 * into element template entries vs. standard BPMN element entries.
 */
import type {
    ElementTemplate,
    TemplateProperty,
} from "@miragon/bpmn-modeler-element-template-chooser";

// Re-export for use in components.
export type { TemplateProperty };

/**
 * Action shape for a popup menu entry.
 *
 * Some entries use a plain function, others provide separate `click` and
 * `dragstart` handlers.  The helpers in this module normalise both shapes.
 */
export type PopupMenuEntryAction =
    | ((event: Event) => void)
    | { click?: (event: Event) => void; dragstart?: (event: Event) => void };

/**
 * A single entry returned by a diagram-js popup menu provider.
 *
 * Standard BPMN element entries carry a `className` for the bpmn-font icon.
 * Element template entries carry an `imageUrl` (base64 SVG) instead.
 */
export interface PopupMenuEntry {
    label: string;
    className?: string;
    description?: string;
    group?: { id: string; name: string };
    search?: string[];
    rank?: number;
    action: PopupMenuEntryAction;
    imageUrl?: string;
    documentationRef?: string;
    disabled?: boolean;
}

/**
 * A template popup menu entry enriched with the full `ElementTemplate`
 * object so the UI can display implementation details and properties.
 */
export interface EnrichedTemplateEntry {
    id: string;
    entry: PopupMenuEntry;
    template: ElementTemplate | undefined;
}

/**
 * A standard BPMN element entry keyed by its popup menu ID.
 */
export interface BpmnElementEntry {
    id: string;
    entry: PopupMenuEntry;
}

/**
 * BPMN element entries grouped by their `group.id`.
 */
export interface BpmnElementGroup {
    id: string;
    name: string;
    entries: BpmnElementEntry[];
}

/**
 * Result of classifying popup menu entries into templates vs. BPMN elements.
 */
export interface ClassifiedEntries {
    templates: EnrichedTemplateEntry[];
    bpmnGroups: BpmnElementGroup[];
}

/**
 * Determines whether a popup menu entry represents an element template.
 *
 * Template entries are identified by their key containing `template-`
 * or by having an `imageUrl` (which standard BPMN entries never have).
 *
 * @param key The popup menu entry key (e.g. `"append.template-my-tpl"`).
 * @param entry The popup menu entry object.
 * @returns `true` if the entry is a template entry.
 */
function isTemplateEntry(key: string, entry: PopupMenuEntry): boolean {
    return key.includes("template-") || !!entry.imageUrl;
}

/**
 * Extracts the template ID from a popup menu entry key.
 *
 * Keys follow the pattern `append.template-{templateId}` or
 * `create.template-{templateId}`.
 *
 * @param key The popup menu entry key.
 * @returns The extracted template ID, or `undefined` if not a template key.
 */
function extractTemplateId(key: string): string | undefined {
    const match = key.match(/template-(.+)$/);
    return match?.[1];
}

/**
 * Splits popup menu entries into element template entries and standard
 * BPMN element entries, grouping BPMN entries by their `group.id`.
 *
 * Template entries are optionally enriched with the full `ElementTemplate`
 * data for richer UI display (implementation detail, property preview).
 *
 * @param entries Record of popup menu entries keyed by ID.
 * @param allTemplates All available element templates (for enrichment).
 * @returns Classified entries split into templates and BPMN element groups.
 */
export function classifyEntries(
    entries: Record<string, PopupMenuEntry>,
    allTemplates: ElementTemplate[] = [],
): ClassifiedEntries {
    const templates: EnrichedTemplateEntry[] = [];
    const groupMap = new Map<string, BpmnElementGroup>();

    const templateIndex = new Map<string, ElementTemplate>();
    for (const t of allTemplates) {
        templateIndex.set(t.id, t);
    }

    for (const [key, entry] of Object.entries(entries)) {
        if (isTemplateEntry(key, entry)) {
            const templateId = extractTemplateId(key);
            templates.push({
                id: key,
                entry,
                template: templateId ? templateIndex.get(templateId) : undefined,
            });
        } else {
            const groupId = entry.group?.id ?? "other";
            const groupName = entry.group?.name ?? "Other";

            let group = groupMap.get(groupId);
            if (!group) {
                group = { id: groupId, name: groupName, entries: [] };
                groupMap.set(groupId, group);
            }
            group.entries.push({ id: key, entry });
        }
    }

    return {
        templates,
        bpmnGroups: Array.from(groupMap.values()),
    };
}

/**
 * Executes a popup menu entry action.
 *
 * Handles both the plain function form and the `{ click, dragstart }` object
 * form used by different providers.
 *
 * @param action The entry's action.
 * @param event The DOM event that triggered the action.
 */
export function executeEntryAction(action: PopupMenuEntryAction, event: Event): void {
    if (typeof action === "function") {
        action(event);
    } else if (action.click) {
        action.click(event);
    }
}

// ─── BPMN type → icon class mapping ──────────────────────────────────────

/**
 * Maps a BPMN element type string to its bpmn-font CSS icon class.
 *
 * Falls back to `"bpmn-icon-task"` for unknown types.
 *
 * @param bpmnType The BPMN type (e.g. `"bpmn:ServiceTask"`).
 * @returns The CSS class name for the bpmn-font icon.
 */
const BPMN_TYPE_ICON_MAP: Record<string, string> = {
    "bpmn:Task": "bpmn-icon-task",
    "bpmn:UserTask": "bpmn-icon-user",
    "bpmn:ServiceTask": "bpmn-icon-service",
    "bpmn:SendTask": "bpmn-icon-send",
    "bpmn:ReceiveTask": "bpmn-icon-receive",
    "bpmn:ManualTask": "bpmn-icon-manual",
    "bpmn:BusinessRuleTask": "bpmn-icon-business-rule",
    "bpmn:ScriptTask": "bpmn-icon-script",
    "bpmn:CallActivity": "bpmn-icon-call-activity",
    "bpmn:SubProcess": "bpmn-icon-subprocess-collapsed",
    "bpmn:Transaction": "bpmn-icon-transaction",
    "bpmn:StartEvent": "bpmn-icon-start-event-none",
    "bpmn:EndEvent": "bpmn-icon-end-event-none",
    "bpmn:IntermediateThrowEvent": "bpmn-icon-intermediate-event-none",
    "bpmn:IntermediateCatchEvent": "bpmn-icon-intermediate-event-none",
    "bpmn:BoundaryEvent": "bpmn-icon-intermediate-event-none",
    "bpmn:ExclusiveGateway": "bpmn-icon-gateway-xor",
    "bpmn:ParallelGateway": "bpmn-icon-gateway-parallel",
    "bpmn:InclusiveGateway": "bpmn-icon-gateway-or",
    "bpmn:ComplexGateway": "bpmn-icon-gateway-complex",
    "bpmn:EventBasedGateway": "bpmn-icon-gateway-eventbased",
    "bpmn:DataObjectReference": "bpmn-icon-data-object",
    "bpmn:DataStoreReference": "bpmn-icon-data-store",
    "bpmn:Participant": "bpmn-icon-participant",
};

export function bpmnTypeToIconClass(bpmnType: string): string {
    return BPMN_TYPE_ICON_MAP[bpmnType] ?? "bpmn-icon-task";
}

// ─── Implementation detail extraction ────────────────────────────────────

/**
 * An implementation detail extracted from template properties that
 * identifies the technical binding (topic, delegate, class, called element).
 */
export interface ImplementationDetail {
    label: string;
    value: string;
}

/**
 * Well-known bindings that identify the implementation of a template.
 *
 * Each entry defines a matcher: either a `property` binding with a specific
 * `name` (C7 pattern), or a direct `bindingType` match (C8 pattern where
 * the binding type itself carries the semantic).
 *
 * Checked in priority order — the first match wins.
 */
const IMPLEMENTATION_BINDINGS: {
    label: string;
    bindingType: string;
    bindingName?: string;
}[] = [
    { label: "Topic", bindingType: "property", bindingName: "camunda:topic" },
    {
        label: "Delegate",
        bindingType: "property",
        bindingName: "camunda:delegateExpression",
    },
    { label: "Java Class", bindingType: "property", bindingName: "camunda:class" },
    { label: "Expression", bindingType: "property", bindingName: "camunda:expression" },
    { label: "Called Element", bindingType: "property", bindingName: "calledElement" },
    { label: "Task Type", bindingType: "zeebe:taskDefinition:type" },
    { label: "Task Type", bindingType: "zeebe:taskDefinition" },
];

/**
 * Extracts the primary implementation detail from a template's properties.
 *
 * Searches for well-known binding types and names across both C7 and C8
 * patterns and returns the first match with its value.  Returns `undefined`
 * if no implementation binding is found or the value is empty.
 *
 * @param properties The template's property array.
 * @returns The implementation detail, or `undefined`.
 */
export function extractImplementationDetail(
    properties: TemplateProperty[],
): ImplementationDetail | undefined {
    for (const { label, bindingType, bindingName } of IMPLEMENTATION_BINDINGS) {
        const prop = properties.find((p) => {
            if (p.binding.type !== bindingType) {
                return false;
            }
            if (bindingName && p.binding.name !== bindingName) {
                return false;
            }
            return !!p.value;
        });
        if (prop) {
            return { label, value: prop.value! };
        }
    }
    return undefined;
}

// ─── Binding direction classification ─────────────────────────────────────

/** Direction category for a template property binding. */
export type BindingDirection = "input" | "output" | "property" | "hidden";

/**
 * Classifies a template property binding into a direction category.
 *
 * Used to split template properties into input, output, and property
 * sections in the hover card preview.
 *
 * @param binding The property's binding descriptor.
 * @returns The classified direction.
 */
export function classifyBinding(binding: TemplateProperty["binding"]): BindingDirection {
    const type = binding.type;

    if (type === "camunda:out" || type === "camunda:outputParameter" || type === "zeebe:output") {
        return "output";
    }

    if (
        type === "camunda:in" ||
        type === "camunda:inputParameter" ||
        type === "camunda:in:businessKey" ||
        type === "zeebe:input"
    ) {
        return "input";
    }

    if (type === "property" || type === "zeebe:property") {
        return "property";
    }

    if (type === "zeebe:taskHeader") {
        return "property";
    }

    return "hidden";
}
