import * as ReplaceOptions from "bpmn-js/lib/features/replace/ReplaceOptions";
import type { ReplaceOption } from "bpmn-js/lib/features/replace/ReplaceOptions";
import { isDifferentType } from "bpmn-js/lib/features/popup-menu/util/TypeUtil";
import type { Element } from "bpmn-js/lib/model/Types";

import {
    annotateEntry,
    popupEntryKeyOf,
    type AnnotatableEntry,
    type PopupEntryKey,
    type PopupMenuAnnotation,
    type PopupMenuAnnotations,
} from "./popupMenuAnnotations";

interface PopupMenuRegistry {
    registerProvider(menuId: string, priority: number, provider: object): void;
}

// Below the default priority, so the entries of every other provider already exist.
const ANNOTATION_PRIORITY = 500;

const ANNOTATED_MENUS = ["bpmn-create", "bpmn-append", "bpmn-replace"] as const;

// Replaces the element with its own type minus the template, so it carries no type in its id.
const REMOVE_TEMPLATE_ENTRY_ID = "replace-remove-element-template";

const ALL_REPLACE_OPTIONS: readonly ReplaceOption[] = Object.values(ReplaceOptions)
    .filter((options): options is ReplaceOption[] => Array.isArray(options))
    .flat();

function ownTypeKeyOf(element: Element): PopupEntryKey | undefined {
    const differsFromElement = isDifferentType(element) as unknown as (
        option: ReplaceOption,
    ) => boolean;
    const ownTypeOption = ALL_REPLACE_OPTIONS.find(
        (option) => option.target !== undefined && !differsFromElement(option),
    );
    return ownTypeOption && popupEntryKeyOf(ownTypeOption.actionName);
}

export class PopupMenuAnnotationProvider {
    static $inject = ["popupMenu", "translate", "popupMenuAnnotations"];

    constructor(
        popupMenu: PopupMenuRegistry,
        private readonly translate: (text: string) => string,
        private readonly annotations: PopupMenuAnnotations,
    ) {
        for (const menuId of ANNOTATED_MENUS) {
            popupMenu.registerProvider(menuId, ANNOTATION_PRIORITY, this);
        }
    }

    getPopupMenuEntries(target: Element) {
        return <Entries extends Record<string, AnnotatableEntry>>(entries: Entries): Entries => {
            const annotatedEntries: Record<string, AnnotatableEntry> = {};
            for (const [entryId, entry] of Object.entries(entries)) {
                const annotation = this.annotationOf(entryId, target);
                annotatedEntries[entryId] = annotation
                    ? annotateEntry(entry, annotation, this.translate)
                    : entry;
            }
            return annotatedEntries as Entries;
        };
    }

    private annotationOf(entryId: string, target: Element): PopupMenuAnnotation | undefined {
        if (entryId !== REMOVE_TEMPLATE_ENTRY_ID) {
            return this.annotations.forEntry(entryId);
        }
        const ownTypeKey = ownTypeKeyOf(target);
        return ownTypeKey === undefined ? undefined : this.annotations.forKey(ownTypeKey);
    }
}
