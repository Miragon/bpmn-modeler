/**
 * Type definitions for popup menu entries and utilities to classify them
 * into element template entries vs. standard BPMN element entries.
 */
import type { ElementTemplate, TemplateStep } from "@miragon/bpmn-modeler-element-template-chooser";

export type { Translate } from "@miragon/bpmn-modeler-element-template-chooser/types";

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
    search?: string | string[];
    rank?: number;
    action?: PopupMenuEntryAction;
    imageUrl?: string;
    documentationRef?: string;
    disabled?: boolean;
    /**
     * Replaces `action` on element templates and template steps that declare
     * `steps` (bpmn-js-create-append-anything), and on third-party drill-in
     * categories. Children carry no `group` and may nest further.
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
    presetId?: string;
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
    return isTemplateKey(key) || !!entry.imageUrl;
}

function isTemplateKey(key: string): boolean {
    return key.includes("template-");
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

// Step keys (`step-0`, …) repeat across templates, so ids carry the parent path.
// Steps match `node.steps` by position because upstream builds them from it in order.
function flattenTemplateEntry(
    id: string,
    entry: PopupMenuEntry,
    template: ElementTemplate | undefined,
    node: { presetId?: string; steps?: TemplateStep[] } | undefined = template,
): EnrichedTemplateEntry[] {
    if (!entry.entries) {
        return [{ id, entry, template, presetId: node?.presetId }];
    }
    return Object.entries(entry.entries).flatMap(([stepKey, step], index) =>
        flattenTemplateEntry(
            `${id}/${stepKey}`,
            {
                ...step,
                label: `${entry.label} › ${step.label}`,
                description: step.description ?? entry.description,
                documentationRef: step.documentationRef ?? entry.documentationRef,
                search: [...searchTermsOf(entry), ...searchTermsOf(step)],
            },
            template,
            node?.steps?.[index],
        ),
    );
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

    // Children of a drill-in category carry no `group`, so they fall under one named after it.
    const classify = (
        key: string,
        entry: PopupMenuEntry,
        inheritedGroup?: { id: string; name: string },
    ): void => {
        if (entry.entries && !isTemplateKey(key)) {
            const categoryGroup = { id: key, name: entry.label };
            for (const [childKey, child] of Object.entries(entry.entries)) {
                classify(childKey, child, categoryGroup);
            }
            return;
        }

        if (isTemplateEntry(key, entry)) {
            const templateId = extractTemplateId(key);
            const template = templateId ? templateIndex.get(templateId) : undefined;
            templates.push(...flattenTemplateEntry(key, entry, template));
            return;
        }

        // Only third-party providers emit such entries; they cannot be selected.
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

/** The entry's search keywords as a list, whichever of the two shapes its provider used. */
export function searchTermsOf(entry: PopupMenuEntry): string[] {
    if (entry.search === undefined) {
        return [];
    }
    return typeof entry.search === "string" ? [entry.search] : entry.search;
}

/**
 * Executes a popup menu entry action.
 *
 * Handles both the plain function form and the `{ click, dragstart }` object
 * form used by different providers.
 */
export function executeEntryAction(action: PopupMenuEntryAction | undefined, event: Event): void {
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
