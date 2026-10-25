import * as ReplaceOptions from "bpmn-js/lib/features/replace/ReplaceOptions";
import type { ReplaceOption } from "bpmn-js/lib/features/replace/ReplaceOptions";
import {
    ALL_EVENTS,
    DATA_OBJECTS,
    GATEWAY,
    PARTICIPANT,
    SUBPROCESS,
    TASK,
} from "bpmn-js-create-append-anything";
import { describe, expect, it } from "vitest";

import { loadEngineStack } from "../engineStacks";
import { createPopupMenuAnnotationsModule } from "./index";
import type { PopupMenuAnnotationOverrides, PopupMenuAnnotations } from "./popupMenuAnnotations";

// bpmn-js and bpmn-js-create-append-anything are the source of the entries we annotate, so a
// bump that adds an element fails here until it is described.

// Entries we deliberately leave without a description.
const INTENDED_EXCEPTIONS: readonly string[] = [];

const REPLACE_ENTRY_IDS: readonly string[] = [
    ...new Set(
        Object.values(ReplaceOptions)
            .flatMap((options: ReplaceOption[] | Record<string, ReplaceOption[]>) =>
                Array.isArray(options) ? options : Object.values(options).flat(),
            )
            .map((option) => option.actionName),
    ),
];

const CREATE_ENTRY_IDS: readonly string[] = [
    ...new Set(
        [...TASK, ...GATEWAY, ...SUBPROCESS, ...ALL_EVENTS, ...DATA_OBJECTS, ...PARTICIPANT].map(
            ({ actionName }) => `create-${actionName}`,
        ),
    ),
];

const SURFACE_OVERRIDES: readonly (readonly [
    string,
    () => Promise<PopupMenuAnnotationOverrides>,
])[] = [
    ["Design", async () => ({})],
    ["C7", async () => (await loadEngineStack("c7")).popupMenuAnnotations],
    ["C8", async () => (await loadEngineStack("c8")).popupMenuAnnotations],
];

function annotationsWith(overrides: PopupMenuAnnotationOverrides): PopupMenuAnnotations {
    return createPopupMenuAnnotationsModule(overrides)
        .popupMenuAnnotations[1] as PopupMenuAnnotations;
}

function undescribedEntryIds(annotations: PopupMenuAnnotations): string[] {
    return [...REPLACE_ENTRY_IDS, ...CREATE_ENTRY_IDS].filter(
        (entryId) => annotations.forEntry(entryId)?.description === undefined,
    );
}

describe.each(SURFACE_OVERRIDES)("%s popup-menu annotations", (_surface, loadOverrides) => {
    it("describe every entry bpmn-js offers, bar the intended exceptions", async () => {
        const annotations = annotationsWith(await loadOverrides());

        expect(
            undescribedEntryIds(annotations).filter(
                (entryId) => !INTENDED_EXCEPTIONS.includes(entryId),
            ),
        ).toEqual([]);
    });

    it("list only exceptions that are still undescribed", async () => {
        const annotations = annotationsWith(await loadOverrides());

        expect(
            INTENDED_EXCEPTIONS.filter((entryId) => annotations.forEntry(entryId)?.description),
        ).toEqual([]);
    });
});

it("reads the entries from the upstream option lists", () => {
    expect(REPLACE_ENTRY_IDS).not.toHaveLength(0);
    expect(CREATE_ENTRY_IDS).not.toHaveLength(0);
});
