import { describe, expect, it } from "vitest";

import type { MergeBuildNoteContent } from "@miragon/bpmn-modeler-types";

import { buildNoteText } from "./mergeBuildNoteTexts";
import type { MergeTranslate } from "./mergeTranslate";

const untranslated: MergeTranslate = (key, replacements = {}) =>
    key.replace(/\{(\w+)\}/g, (_match, name: string) => replacements[name] ?? `{${name}}`);

describe("buildNoteText", () => {
    const nameOf = (id: string) => ({ Flow_2: "to packing", Task_Pack: "Pack box" })[id] ?? id;

    it.each<[MergeBuildNoteContent, string]>([
        [
            {
                kind: "flowEndOffShape",
                id: "Flow_2",
                shapes: ["Task_Check", "Task_Pack"],
                repair: "movedByBuild",
            },
            "The build moved to packing to meet Task_Check, Pack box",
        ],
        [
            {
                kind: "flowEndOffShape",
                id: "Flow_2",
                shapes: ["Task_Pack"],
                repair: "notRepaired",
            },
            "to packing does not meet Pack box; the build could not repair it",
        ],
        [
            {
                kind: "shapesOverlap",
                ids: ["Task_A", "Task_Pack"],
                repair: "movedByBuild",
                moved: "Task_Pack",
            },
            "The build moved Pack box off Task_A",
        ],
        [
            {
                kind: "shapesOverlap",
                ids: ["Task_Pack", "Task_A"],
                repair: "madeRoomByShifting",
                moved: "Task_Pack",
                shifted: ["Task_B", "End_1"],
            },
            "The build moved Pack box off Task_A and made room by shifting Task_B, End_1",
        ],
        [
            {
                kind: "shapesOverlap",
                ids: ["Task_Pack", "Task_A"],
                repair: "madeRoomByGrowing",
                moved: "Task_Pack",
                grown: ["Lane_1", "Pool_1"],
            },
            "The build moved Pack box off Task_A and grew Lane_1, Pool_1 to hold it",
        ],
        [
            {
                kind: "shapesOverlap",
                ids: ["Task_Pack", "Task_A"],
                repair: "madeRoomByGrowingAndShifting",
                moved: "Task_Pack",
                shifted: ["Task_B"],
                grown: ["Lane_1"],
            },
            "The build moved Pack box off Task_A, grew Lane_1 to hold it and shifted Task_B",
        ],
        [
            { kind: "shapesOverlap", ids: ["Task_A", "Task_Pack"], repair: "notRepaired" },
            "Task_A and Pack box lie on top of each other; the build could not repair it",
        ],
        [
            {
                kind: "flowThroughShape",
                id: "Flow_2",
                shapes: ["Task_Pack", "Task_B"],
                repair: "movedByBuild",
            },
            "The build moved to packing around Pack box, Task_B",
        ],
        [
            {
                kind: "flowThroughShape",
                id: "Flow_2",
                shapes: ["Task_Pack"],
                repair: "notRepaired",
            },
            "to packing runs through Pack box; the build could not repair it",
        ],
        [
            {
                kind: "shapeOutsideContainer",
                id: "Task_Pack",
                shapes: ["Sub_1"],
                repair: "movedIntoContainer",
            },
            "The build moved Pack box into Sub_1",
        ],
        [
            {
                kind: "shapeOutsideContainer",
                id: "Task_Pack",
                shapes: ["Pool_1", "Lane_1"],
                repair: "grewContainer",
            },
            "The build grew Pool_1, Lane_1 to hold Pack box",
        ],
        [
            {
                kind: "shapeOutsideContainer",
                id: "Task_Pack",
                shapes: ["Sub_1"],
                repair: "grewContainerAndShifted",
                shifted: ["Task_B", "End_1"],
            },
            "The build grew Sub_1 to hold Pack box and shifted Task_B, End_1",
        ],
        [
            {
                kind: "shapeOutsideContainer",
                id: "Task_Pack",
                shapes: ["Pool_1", "Lane_1"],
                repair: "notRepaired",
            },
            "Pack box lies outside Pool_1, Lane_1; the build could not repair it",
        ],
        [
            { kind: "boundaryEventOffHost", id: "Timer_1", host: "Task_Pack" },
            "Timer_1 is not on the border of Pack box",
        ],
        [
            { kind: "lanesOverlap", ids: ["Lane_1", "Lane_2"], repair: "notRepaired" },
            "Lane_1 and Lane_2 overlap; the build could not repair it",
        ],
        [
            {
                kind: "lanesOverlap",
                ids: ["Lane_2", "Lane_1"],
                repair: "movedByBuild",
                moved: "Lane_2",
                grown: ["Pool_1"],
            },
            "The build moved Lane_2 below the other lanes and grew Pool_1 to hold it",
        ],
        [
            {
                kind: "lanesOverlap",
                ids: ["Lane_2", "Lane_1"],
                repair: "movedByBuildAndShifted",
                moved: "Lane_2",
                grown: ["Pool_1", "Lane_0"],
                shifted: ["Pool_2", "Task_3"],
            },
            "The build moved Lane_2 below the other lanes, grew Pool_1, Lane_0 to hold it and shifted Pool_2, Task_3",
        ],
        [
            {
                kind: "restoredWithoutRemovedWith",
                id: "Task_Pack",
                connections: ["Flow_2", "Flow_3"],
            },
            "Pack box is kept without the flows the other side removed with it: to packing, Flow_3",
        ],
        [
            {
                kind: "restoredWithoutRemovedWith",
                id: "Task_Pack",
                connections: ["Flow_2", "Flow_3"],
                boundaryEvents: [],
            },
            "Pack box is kept without the flows the other side removed with it: to packing, Flow_3",
        ],
        [
            {
                kind: "restoredWithoutRemovedWith",
                id: "Task_Pack",
                connections: ["Flow_2"],
                boundaryEvents: ["Timer_1"],
            },
            "Pack box is kept without the 2 elements the other side removed with it: Timer_1, to packing",
        ],
        [
            {
                kind: "restoredWithoutRemovedWith",
                id: "Task_Pack",
                connections: [],
                boundaryEvents: ["Timer_1"],
            },
            "Pack box is kept without the boundary event the other side removed with it: Timer_1",
        ],
        [
            {
                kind: "defaultFlowNotRestored",
                id: "Task_Pack",
                flow: "Flow_2",
                keptDefault: "Flow_3",
            },
            "to packing is kept, but Pack box keeps Flow_3 as its default flow",
        ],
        [
            { kind: "defaultFlowNotRestored", id: "Task_Pack", flow: "Flow_2" },
            "to packing is kept but is no longer the default flow of Pack box",
        ],
        [
            { kind: "layoutChangedByBoth", ids: ["Task_Pack", "Flow_2"], keptSide: "current" },
            "Both sides changed the layout of Pack box, to packing; current's is kept",
        ],
        [
            { kind: "layoutChangedByBoth", ids: ["Task_Pack"], keptSide: "incoming" },
            "Both sides changed the layout of Pack box; incoming's is kept",
        ],
        [
            { kind: "frameDiffers", attribute: "exporterVersion" },
            "The file's exporterVersion differs between the sides; current's is kept",
        ],
        [
            { kind: "frameDiffers", attribute: "extensionElements" },
            "The file's extensionElements differs between the sides; current's is kept",
        ],
        [
            { kind: "flowNotDrawn", id: "Flow_2", source: "Task_Check", target: "Task_Pack" },
            "to packing is left out of the drawing: no diagram shows both Task_Check and Pack box",
        ],
        [
            { kind: "flowNotDrawn", id: "Flow_2", target: "Task_Pack" },
            "to packing is left out of the drawing: it lacks a source or a target",
        ],
        [
            { kind: "flowNotDrawn", id: "Flow_2", source: "Task_Check" },
            "to packing is left out of the drawing: it lacks a source or a target",
        ],
    ])("words a %o note with the canvas's names", (note, text) => {
        expect(buildNoteText(note, nameOf, untranslated)).toBe(text);
    });
});
