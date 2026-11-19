/// <reference types="vite/client" />
import { computeDiff } from "@miragon/bpmn-modeler-diff";
import { describe, expect, it } from "vitest";

import { parseWithoutWarnings } from "./__fixtures__/parseWithoutWarnings";
import { seededRandom } from "./__fixtures__/randomMergeVersions";
import { type BuildNote, buildMerged, buildMergedWith } from "./buildMerged";
import { prepareMergeSources } from "./buildMergedSources";
import { computeMerge, type MergeVersions } from "./computeMerge";
import { BUILD_LAYOUT_REPAIRS, type LayoutRepairPlanners } from "./layoutDrawingRepair";
import { liesWithin, sameBounds } from "./layoutGeometry";
import { type LayoutModel, isFrame, nodeShapeIn, placedByBuild } from "./layoutModel";
import { layoutModelOf } from "./layoutModelReader";
import { segmentsCross, segmentsOf } from "./layoutPolyline";
import { introducedLayoutSpots } from "./layoutSpotDetection";
import { type LayoutSpot, sameSpot } from "./layoutSpots";
import { MergeDecisions } from "./mergeDecisions";
import { type MergeSide, otherSide } from "./mergeResult";

/** Fuzz seeds from the design harvest of #2565, each version as `randomMergeVersions` wrote it then. */
const HARVEST = import.meta.glob<string>("./__fixtures__/harvest/*.bpmn", {
    query: "?raw",
    import: "default",
    eager: true,
});

type Strategy = "conflictsToCurrent" | "conflictsToIncoming" | "conflictsAtRandom";

const NO_REPAIRS: LayoutRepairPlanners = {
    stackLanes: (layout) => ({ layout, stacked: [] }),
    moveIntoContainers: (layout) => ({ layout, repairs: [], movedShapes: [] }),
    moveShapes: (layout) => ({ layout, repairs: [] }),
    repairFlows: () => [],
};

const FLOW_REPAIRS_ONLY: LayoutRepairPlanners = {
    ...BUILD_LAYOUT_REPAIRS,
    stackLanes: NO_REPAIRS.stackLanes,
    moveIntoContainers: NO_REPAIRS.moveIntoContainers,
    moveShapes: NO_REPAIRS.moveShapes,
};

const CONTAINER_REPAIRS_ONLY: LayoutRepairPlanners = {
    ...NO_REPAIRS,
    moveIntoContainers: BUILD_LAYOUT_REPAIRS.moveIntoContainers,
};

const WITHOUT_CONTAINER_REPAIRS: LayoutRepairPlanners = {
    ...BUILD_LAYOUT_REPAIRS,
    stackLanes: NO_REPAIRS.stackLanes,
    moveIntoContainers: NO_REPAIRS.moveIntoContainers,
};

const WITHOUT_LANE_STACKING: LayoutRepairPlanners = {
    ...BUILD_LAYOUT_REPAIRS,
    stackLanes: NO_REPAIRS.stackLanes,
};

function versionsOf(seed: number): MergeVersions {
    const version = (part: string) => HARVEST[`./__fixtures__/harvest/seed-${seed}.${part}.bpmn`];
    const base = version("base");
    return {
        ...(base === undefined ? {} : { base }),
        current: version("current")!,
        incoming: version("incoming")!,
    };
}

/** Decides every open conflict as the harvest did: for one side, else the other, with its contents when it must. */
async function decisionsOf(versions: MergeVersions, seed: number, strategy: Strategy) {
    const decisions = MergeDecisions.from(await computeMerge(versions));
    const random = seededRandom(seed * 7919);
    const preferredSide = (): MergeSide => {
        if (strategy === "conflictsAtRandom") return random() < 0.5 ? "current" : "incoming";
        return strategy === "conflictsToCurrent" ? "current" : "incoming";
    };
    while (decisions.openConflicts.length > 0) {
        const { id } = decisions.openConflicts[0]!;
        const side = preferredSide();
        const applied =
            decisions.pick(id, side).applied ||
            decisions.pick(id, otherSide(side)).applied ||
            decisions.pickWithContents(id, side).applied ||
            decisions.pickWithContents(id, otherSide(side)).applied;
        expect(applied, id).toBe(true);
    }
    return decisions;
}

async function layoutOf(xml: string) {
    return layoutModelOf((await parseWithoutWarnings(xml)).rootElement);
}

/** What the repair changes in a result: nothing, only flows, or shapes too. */
type Repairs = "none" | "flows" | "shapes";

interface HarvestCase {
    readonly seed: number;
    readonly strategy: Strategy;
    readonly repairs: Repairs;
    /** How many crossings between flows the repair may add. */
    readonly crossingBudget: number;
    /** The shapes left outside a container, whose notes say the build could not repair them. */
    readonly leftOutside?: readonly string[];
}

/**
 * The harvest results the design prototype changed although no spot was introduced, four the
 * flow repair re-routes, those with shapes on top of each other, those with shapes outside
 * their sub-process or lane (#2565), and those with lanes on top of each other (#2567).
 */
const CASES: readonly HarvestCase[] = [
    ...(
        [
            [1, "conflictsAtRandom"],
            [5, "conflictsToCurrent"],
            [20, "conflictsToCurrent"],
            [22, "conflictsToCurrent"],
            [41, "conflictsToCurrent"],
            [50, "conflictsAtRandom"],
            [53, "conflictsToCurrent"],
            [58, "conflictsToIncoming"],
            [71, "conflictsToCurrent"],
            [76, "conflictsToCurrent"],
            [76, "conflictsToIncoming"],
            [78, "conflictsToCurrent"],
            [78, "conflictsToIncoming"],
            [89, "conflictsAtRandom"],
            [96, "conflictsAtRandom"],
            [106, "conflictsToCurrent"],
            [111, "conflictsToIncoming"],
            [116, "conflictsToCurrent"],
            [116, "conflictsToIncoming"],
            [119, "conflictsToCurrent"],
            [119, "conflictsToIncoming"],
            [130, "conflictsToCurrent"],
            [142, "conflictsToCurrent"],
            [144, "conflictsToCurrent"],
            [171, "conflictsToCurrent"],
            [173, "conflictsToCurrent"],
            [192, "conflictsToCurrent"],
        ] as const
    ).map(([seed, strategy]) => ({ seed, strategy, repairs: "none", crossingBudget: 0 }) as const),
    ...(
        [
            [5, "conflictsToIncoming", 1],
            [89, "conflictsToIncoming", 0],
        ] as const
    ).map(([seed, strategy, crossingBudget]) => ({
        seed,
        strategy,
        repairs: "flows" as const,
        crossingBudget,
    })),
    ...(
        [
            [28, "conflictsToCurrent", 0],
            [33, "conflictsToCurrent", 2],
            [36, "conflictsToCurrent", 0],
            [36, "conflictsToIncoming", 0],
            [69, "conflictsToIncoming", 0],
            [74, "conflictsToCurrent", 0],
            [74, "conflictsToIncoming", 0],
            [113, "conflictsToCurrent", 0],
            [135, "conflictsToCurrent", 0],
            [135, "conflictsToIncoming", 0],
            [153, "conflictsAtRandom", 0],
            [191, "conflictsToCurrent", 0],
        ] as const
    ).map(([seed, strategy, crossingBudget]) => ({
        seed,
        strategy,
        repairs: "shapes" as const,
        crossingBudget,
    })),
    ...(
        [
            [6, "conflictsToIncoming", 1, []],
            [32, "conflictsToCurrent", 0, []],
            [32, "conflictsToIncoming", 0, []],
            [75, "conflictsAtRandom", 0, ["Task_Reject"]],
            [112, "conflictsToCurrent", 2, []],
            [112, "conflictsToIncoming", 1, ["Boundary_Timeout"]],
            [153, "conflictsAtRandom", 0, []],
            [21, "conflictsToIncoming", 0, ["Boundary_Timeout"]],
            [38, "conflictsToCurrent", 0, ["Boundary_Timeout", "Boundary_N2"]],
            [47, "conflictsToIncoming", 2, []],
            [47, "conflictsAtRandom", 0, []],
            [135, "conflictsAtRandom", 0, ["Boundary_Timeout"]],
        ] as const
    ).map(([seed, strategy, crossingBudget, leftOutside]) => ({
        seed,
        strategy,
        repairs: "shapes" as const,
        crossingBudget,
        leftOutside,
    })),
    // One side dropped a lane the other draws: the lanes come from the side without it.
    ...(["conflictsToIncoming", "conflictsAtRandom"] as const).map((strategy) => ({
        seed: 159,
        strategy,
        repairs: "none" as const,
        crossingBudget: 0,
    })),
];

describe("the layout repair on harvested merges", () => {
    it.each(CASES)(
        "seed $seed, $strategy: repairs $repairs, changes only the layout, breaks nothing new, adds at most $crossingBudget crossings",
        { timeout: 20_000 },
        async ({ seed, strategy, repairs, crossingBudget, leftOutside = [] }) => {
            const versions = versionsOf(seed);
            const sources = await prepareMergeSources(versions);
            const buildWith = async (planners: LayoutRepairPlanners) =>
                buildMergedWith(sources, await decisionsOf(versions, seed, strategy), planners);
            const unrepaired = await buildWith(NO_REPAIRS);
            const flowsRepaired = await buildWith(FLOW_REPAIRS_ONLY);
            const withoutContainers = await buildWith(WITHOUT_CONTAINER_REPAIRS);
            const withoutStacking = await buildWith(WITHOUT_LANE_STACKING);
            const repaired = await buildMerged(
                sources,
                await decisionsOf(versions, seed, strategy),
            );
            const sides = await Promise.all([versions.current, versions.incoming].map(layoutOf));
            const unrepairedLayout = await layoutOf(unrepaired.xml);
            const repairedLayout = await layoutOf(repaired.xml);
            const before = introducedLayoutSpots(unrepairedLayout, sides);
            const after = introducedLayoutSpots(repairedLayout, sides);

            if (before.length === 0) expect(repaired.xml).toBe(unrepaired.xml);
            const hasSpot = (kind: LayoutSpot["kind"]) => before.some((spot) => spot.kind === kind);
            if (!hasSpot("lanesOverlap")) expect(repaired.xml).toBe(withoutStacking.xml);
            const framesHeld = !hasSpot("lanesOverlap") && !hasSpot("shapeOutsideContainer");
            if (framesHeld) expect(repaired.xml).toBe(withoutContainers.xml);
            if (hasSpot("shapeOutsideContainer")) {
                const containersRepaired = await buildWith(CONTAINER_REPAIRS_ONLY);
                expect(
                    unaccountedContainerMoves(
                        unrepairedLayout,
                        await layoutOf(containersRepaired.xml),
                        containersRepaired.notes,
                        sides,
                    ),
                ).toEqual([]);
            }
            if (framesHeld && !hasSpot("shapesOverlap")) {
                expect(repaired.xml).toBe(flowsRepaired.xml);
            }
            expect(repairsOf(unrepaired.xml, flowsRepaired.xml, repaired.xml)).toBe(repairs);
            const { added, removed, changed } = await computeDiff(unrepaired.xml, repaired.xml);
            expect({ added, removed, changed }).toEqual({ added: [], removed: [], changed: [] });
            // A boundary event in another lane than its host lay in both while the lanes overlapped.
            const carriedOutOfItsLane = (spot: LayoutSpot) =>
                spot.kind === "shapeOutsideContainer" && leftOutside.includes(spot.shape);
            const afterBeyondLanes = after.filter((spot) => !carriedOutOfItsLane(spot));
            expect(
                afterBeyondLanes.filter((spot) => !before.some((known) => sameSpot(known, spot))),
            ).toEqual([]);
            expect(
                kindsOf(afterBeyondLanes).filter((kind) => !kindsOf(before).includes(kind)),
            ).toEqual([]);
            expect(afterBeyondLanes.length).toBeLessThanOrEqual(before.length);
            expect(after.filter(({ kind }) => kind === "lanesOverlap")).toEqual([]);
            expect(crossingsOf(repairedLayout) - crossingsOf(unrepairedLayout)).toBeLessThanOrEqual(
                crossingBudget,
            );
            expect(after.filter(({ kind }) => kind === "shapesOverlap")).toEqual([]);
            expect(
                repaired.notes.flatMap((note) =>
                    "repair" in note && note.repair === "notRepaired" ? [note.kind] : [],
                ),
            ).toEqual(leftOutside.map(() => "shapeOutsideContainer"));
            expect(
                after.flatMap((spot) =>
                    spot.kind === "shapeOutsideContainer" ? [spot.shape] : [],
                ),
            ).toEqual(leftOutside);
        },
    );
});

function repairsOf(unrepaired: string, flowsRepaired: string, repaired: string): Repairs {
    if (repaired === unrepaired) return "none";
    return repaired === flowsRepaired ? "flows" : "shapes";
}

/**
 * The shapes the container step changed that no container note accounts for, and the shapes it
 * moved into a container although both sides draw them where they lay. A note accounts for the
 * shape it moved, with its boundary events and contents, the containers it grew and the shapes it
 * shifted; a growth may widen the frames around.
 */
function unaccountedContainerMoves(
    before: LayoutModel,
    after: LayoutModel,
    notes: readonly BuildNote[],
    sides: readonly LayoutModel[],
): string[] {
    const repaired = notes.flatMap((note) =>
        note.kind === "shapeOutsideContainer" && note.repair !== "notRepaired" ? [note] : [],
    );
    const accounted = new Set(
        repaired.flatMap((note) => [
            note.id,
            ...(note.repair === "movedIntoContainer" ? [] : note.shapes),
            ...(note.repair === "grewContainerAndShifted" ? note.shifted : []),
        ]),
    );
    const grew = repaired.some(({ repair }) => repair !== "movedIntoContainer");
    const changed = [...before.shapes.values()].flatMap((shape) => {
        const now = after.shapes.get(shape.id);
        return now === undefined || sameBounds(now.bounds, shape.bounds) ? [] : [{ shape, now }];
    });
    const goesWithANote = ({ shape, now }: (typeof changed)[number]) =>
        accounted.has(shape.id) ||
        (shape.kind === "node" &&
            [shape.host, ...shape.subProcesses].some(
                (id) => id !== undefined && accounted.has(id),
            )) ||
        (grew && isFrame(shape) && liesWithin(shape.bounds, now.bounds));
    const drawnThereByBoth = repaired.flatMap((note) => {
        const node =
            note.repair === "movedIntoContainer" ? nodeShapeIn(before, note.id) : undefined;
        const carried = [node?.host, ...(node?.subProcesses ?? [])].some(
            (id) => id !== undefined && accounted.has(id),
        );
        return node === undefined || carried || placedByBuild(node, sides)
            ? []
            : [`${note.id} drawn there by both sides`];
    });
    return [
        ...changed.filter((change) => !goesWithANote(change)).map(({ shape }) => shape.id),
        ...drawnThereByBoth,
    ];
}

function kindsOf(spots: readonly LayoutSpot[]): LayoutSpot["kind"][] {
    return [...new Set(spots.map(({ kind }) => kind))];
}

/** How often two flows of one plane cross. */
function crossingsOf(layout: LayoutModel): number {
    const edges = [...layout.edges.values()];
    const segmentPairs = edges.flatMap((edge, index) =>
        edges
            .slice(index + 1)
            .filter((other) => other.plane === edge.plane)
            .flatMap((other) =>
                segmentsOf(edge.waypoints).flatMap((own) =>
                    segmentsOf(other.waypoints).map((theirs) => [own, theirs] as const),
                ),
            ),
    );
    return segmentPairs.filter(([own, theirs]) => segmentsCross(own, theirs)).length;
}
