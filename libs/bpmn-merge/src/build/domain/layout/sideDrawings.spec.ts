import { describe, expect, it } from "vitest";

import { box, lane as buildLane, layoutOf, node } from "../../../__fixtures__/layoutShapes";
import { rootPlane, subProcessPlane } from "../../../__fixtures__/shapePlane";
import type { NodeShape } from "./layoutModel";
import {
    drawingOfSameSize,
    drawnByOneSideOnly,
    drawsAt,
    drawsWhereItLies,
    placeOf,
    placedByBuild,
    placedByBuildOutside,
} from "./sideDrawings";

/** The node as a layout draws its element on a collapsed sub-process's plane. */
function onSubProcessPlane(shape: NodeShape): NodeShape {
    return { ...shape, ...subProcessPlane("Sub_1") };
}

/** The node as a layout draws its element on a process's root plane, in the slot the merge gives that plane. */
function onProcessPlane(shape: NodeShape, process: string, slotOwner = process): NodeShape {
    return { ...shape, ...rootPlane(process, slotOwner) };
}

describe("placeOf and drawsAt", () => {
    const task = node("Task_1", { bounds: { x: 100, y: 100, width: 100, height: 80 } });

    it.each([
        { label: "where the node lies", drawn: task, place: task.bounds, at: true },
        {
            label: "elsewhere at the node's size",
            drawn: { ...task, bounds: { ...task.bounds, x: 300 } },
            place: { ...task.bounds, x: 300 },
            at: false,
        },
        {
            label: "at another size",
            drawn: { ...task, bounds: { ...task.bounds, width: 200 } },
            place: undefined,
            at: false,
        },
        {
            label: "on a sub-process's plane",
            drawn: onSubProcessPlane(task),
            place: undefined,
            at: false,
        },
        {
            label: "where the node lies on the same sub-process's plane",
            node: onSubProcessPlane(task),
            drawn: onSubProcessPlane(task),
            place: task.bounds,
            at: true,
        },
        {
            label: "where the node lies on a root plane named after the process, not the collaboration",
            drawn: onProcessPlane(task, "Process_1", "Collaboration_1"),
            place: task.bounds,
            at: true,
        },
        {
            label: "elsewhere on a root plane named after the process, not the collaboration",
            drawn: {
                ...onProcessPlane(task, "Process_1", "Collaboration_1"),
                bounds: { ...task.bounds, x: 300 },
            },
            place: { ...task.bounds, x: 300 },
            at: false,
        },
        {
            label: "where the node lies on another process's root plane",
            node: onProcessPlane(task, "Process_B"),
            drawn: onProcessPlane(task, "Process_A"),
            place: undefined,
            at: false,
        },
        {
            label: "where the node lies on a collaboration's plane the merge joins with the node's",
            node: onProcessPlane(task, "Process_B", "Collaboration_1"),
            drawn: task,
            place: task.bounds,
            at: true,
        },
        {
            label: "where the node lies on another process's plane the merge joins with the node's",
            node: onProcessPlane(task, "Process_B", "Collaboration_1"),
            drawn: onProcessPlane(task, "Process_A", "Collaboration_1"),
            place: task.bounds,
            at: true,
        },
    ])("a layout drawing the node $label", ({ node: onPlane = task, drawn, place, at }) => {
        const layout = layoutOf([drawn]);

        expect(placeOf(layout, onPlane)).toEqual(place);
        expect(drawsAt(layout, onPlane)).toBe(at);
    });

    it("has no place for a node it does not draw", () => {
        expect(placeOf(layoutOf([]), task)).toBeUndefined();
        expect(drawsAt(layoutOf([]), task)).toBe(false);
    });
});

describe("drawingOfSameSize and drawsWhereItLies", () => {
    const task = node("Task_1", { bounds: { x: 100, y: 100, width: 100, height: 80 } });

    it.each([
        { label: "where the node lies", drawn: task, found: true, there: true },
        {
            label: "where the node lies on another plane",
            drawn: onSubProcessPlane(task),
            found: true,
            there: true,
        },
        {
            label: "elsewhere at the node's size",
            drawn: { ...task, bounds: { ...task.bounds, x: 300 } },
            found: true,
            there: false,
        },
        {
            label: "at another size",
            drawn: { ...task, bounds: { ...task.bounds, width: 200 } },
            found: false,
            there: false,
        },
    ])("a layout drawing the node $label", ({ drawn, found, there }) => {
        const layout = layoutOf([drawn]);

        expect(drawingOfSameSize(layout, task)).toBe(found ? drawn : undefined);
        expect(drawsWhereItLies(layout, task)).toBe(there);
    });

    it("tells whether a layout draws a frame where it lies", () => {
        const lane = buildLane("Lane_1", box(30, 0, 870, 200));
        const moved = { ...lane, bounds: { ...lane.bounds, y: 200 } };

        expect(drawsWhereItLies(layoutOf([lane]), lane)).toBe(true);
        expect(drawsWhereItLies(layoutOf([moved]), lane)).toBe(false);
    });

    it("finds no drawing of a node the layout does not draw", () => {
        expect(drawingOfSameSize(layoutOf([]), task)).toBeUndefined();
        expect(drawsWhereItLies(layoutOf([]), task)).toBe(false);
    });
});

describe("drawnByOneSideOnly", () => {
    const task = node("Task_1", { bounds: box(100, 100) });
    const withTask = layoutOf([task]);
    const without = layoutOf([]);

    it.each([
        { label: "only current draws it", sides: [withTask, without], oneSided: true },
        { label: "only incoming draws it", sides: [without, withTask], oneSided: true },
        {
            label: "both draw it, in different places",
            sides: [withTask, layoutOf([{ ...task, bounds: box(300, 100) }])],
            oneSided: false,
        },
        { label: "neither draws it", sides: [without, without], oneSided: false },
    ])("is $oneSided when $label", ({ sides, oneSided }) => {
        expect(drawnByOneSideOnly("Task_1", sides)).toBe(oneSided);
    });
});

describe("placedByBuild", () => {
    const task = node("Task_1", { bounds: { x: 100, y: 100, width: 100, height: 80 } });
    const elsewhere = { ...task, bounds: { ...task.bounds, x: 300 } };

    it.each([
        { label: "both sides draw it where it lies", sides: [[task], [task]], placed: false },
        { label: "one side draws it elsewhere", sides: [[task], [elsewhere]], placed: true },
        { label: "one side lacks it", sides: [[task], []], placed: true },
        {
            label: "one side draws it on a sub-process's plane",
            sides: [[task], [onSubProcessPlane(task)]],
            placed: true,
        },
        {
            label: "one side draws it where it lies on a root plane named after the process",
            sides: [[task], [onProcessPlane(task, "Process_1", "Collaboration_1")]],
            placed: false,
        },
        {
            label: "one side draws it where it lies on another process's root plane",
            node: onProcessPlane(task, "Process_B"),
            sides: [[onProcessPlane(task, "Process_B")], [onProcessPlane(task, "Process_A")]],
            placed: true,
        },
        {
            label: "one side draws it where it lies on another process's plane the merge joins with its own",
            node: onProcessPlane(task, "Process_A", "Collaboration_1"),
            sides: [
                [onProcessPlane(task, "Process_A", "Collaboration_1")],
                [onProcessPlane(task, "Process_B", "Collaboration_1")],
            ],
            placed: false,
        },
        {
            label: "both sides draw it where it lies on the same sub-process's plane",
            node: onSubProcessPlane(task),
            sides: [[onSubProcessPlane(task)], [onSubProcessPlane(task)]],
            placed: false,
        },
    ])("is $placed when $label", ({ node: onPlane = task, sides, placed }) => {
        expect(
            placedByBuild(
                onPlane,
                sides.map((shapes) => layoutOf(shapes)),
            ),
        ).toBe(placed);
    });

    it("is false for a boundary event, which goes with its host", () => {
        const timer = node("Timer_1", { host: "Task_1" });

        expect(placedByBuild(timer, [layoutOf([]), layoutOf([])])).toBe(false);
    });
});

describe("placedByBuildOutside", () => {
    const lane = buildLane("Lane_1", box(30, 300, 870, 200));
    const sideLane = { ...lane, bounds: { ...lane.bounds, y: 100 } };
    const member = node("Task_1", { bounds: { x: 100, y: 120, width: 100, height: 80 } });

    it.each([
        {
            label: "the build moved the frame, though both sides draw the shape where it lies",
            sides: [[member, sideLane], [member]],
            placed: true,
        },
        {
            label: "a side draws the frame where it lies and both draw the shape where it lies",
            sides: [
                [member, lane],
                [member, sideLane],
            ],
            placed: false,
        },
        {
            label: "the build placed the shape",
            sides: [
                [member, lane],
                [{ ...member, bounds: { ...member.bounds, x: 400 } }, lane],
            ],
            placed: true,
        },
    ])("is $placed when $label", ({ sides, placed }) => {
        expect(
            placedByBuildOutside(
                member,
                [lane],
                sides.map((shapes) => layoutOf(shapes)),
            ),
        ).toBe(placed);
    });
});
