/**
 * Type definitions for popup menu entries and utilities to classify them
 * into element template entries vs. standard BPMN element entries.
 */
import type {
    ElementTemplate,
    TemplateProperty,
} from "@miragon/bpmn-modeler-element-template-chooser";

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
    action?: PopupMenuEntryAction;
    imageUrl?: string;
    documentationRef?: string;
    disabled?: boolean;
    /**
     * Present on drill-in category entries produced by camunda-bpmn-js ≥5.33
     * grouping providers. Such entries carry no `action`; their leaf children
     * live here (and typically lost their own `group` marker).
     */
    entries?: Record<string, PopupMenuEntry>;
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

export interface BpmnElementEntry {
    id: string;
    entry: PopupMenuEntry;
}

/** BPMN element entries grouped by their `group.id`. */
export interface BpmnElementGroup {
    id: string;
    name: string;
    entries: BpmnElementEntry[];
}

export interface ClassifiedEntries {
    templates: EnrichedTemplateEntry[];
    bpmnGroups: BpmnElementGroup[];
}

/**
 * Determines whether a popup menu entry represents an element template.
 *
 * Template entries are identified by their key containing `template-`
 * or by having an `imageUrl` (which standard BPMN entries never have).
 */
function isTemplateEntry(key: string, entry: PopupMenuEntry): boolean {
    return key.includes("template-") || !!entry.imageUrl;
}

/**
 * Extracts the template ID from a popup menu entry key.
 *
 * Keys follow the pattern `append.template-{templateId}` or
 * `create.template-{templateId}`.
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

    // Classifies a single entry. `inheritedGroup` is the group synthesized from
    // an enclosing camunda-5.33 drill-in category, applied to children that lost
    // their own `group` marker when the upstream provider nested them.
    const classify = (
        key: string,
        entry: PopupMenuEntry,
        inheritedGroup?: { id: string; name: string },
    ): void => {
        if (entry.entries) {
            const categoryGroup = { id: key, name: entry.label };
            for (const [childKey, child] of Object.entries(entry.entries)) {
                classify(childKey, child, categoryGroup);
            }
            return;
        }

        if (isTemplateEntry(key, entry)) {
            const templateId = extractTemplateId(key);
            templates.push({
                id: key,
                entry,
                template: templateId ? templateIndex.get(templateId) : undefined,
            });
            return;
        }

        // A non-template entry with neither an action nor children is a tab
        // header or other non-selectable artifact — skip it.
        if (!entry.action) {
            return;
        }

        const group = entry.group ?? inheritedGroup;
        const groupId = group?.id ?? "other";
        const groupName = group?.name ?? "Other";

        let bpmnGroup = groupMap.get(groupId);
        if (!bpmnGroup) {
            bpmnGroup = { id: groupId, name: groupName, entries: [] };
            groupMap.set(groupId, bpmnGroup);
        }
        bpmnGroup.entries.push({ id: key, entry });
    };

    for (const [key, entry] of Object.entries(entries)) {
        classify(key, entry);
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
 */
export function executeEntryAction(
    action: PopupMenuEntryAction | undefined,
    event: Event,
): void {
    if (!action) {
        return;
    }
    if (typeof action === "function") {
        action(event);
    } else if (action.click) {
        action.click(event);
    }
}

// ─── BPMN type → icon class mapping ──────────────────────────────────────

/** Maps a BPMN element type to its bpmn-font CSS icon class (`"bpmn-icon-task"` for unknown types). */
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
 * patterns and returns the first match with its value, or `undefined` if no
 * implementation binding is found or the value is empty.
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

export type BindingDirection = "input" | "output" | "property" | "hidden";

/**
 * Classifies a template property binding into a direction category, used to
 * split properties into input, output, and property sections in the hover card
 * preview.
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
