import type {
    MergeContainerRepair,
    MergeFlowRepair,
    MergeOverlapRepair,
} from "@miragon/bpmn-modeler-types/mergeBuildNotes";

import type { RepairOf } from "./buildNotes";
import type { FlowRepair } from "./layoutFlowRepair";
import {
    type FlowSpot,
    type LayoutSpot,
    type SpotOf,
    isFlowSpot,
    repairedTogether,
} from "./layoutSpots";

/** What the build did about a shape outside its sub-process, pool or lane. */
export type ContainerRepair = RepairOf<MergeContainerRepair>;

/** What the build did about two shapes on top of each other. */
export type OverlapRepair = RepairOf<MergeOverlapRepair>;

interface FlowSpotRepair {
    readonly spot: FlowSpot;
    readonly repair: { readonly kind: MergeFlowRepair };
}

/** Each kind of spot a step repairs, with the repair its note carries; a re-route serves every spot of its flow. */
interface RepairsBySpotKind {
    readonly shapeOutsideContainer: {
        readonly spot: SpotOf<"shapeOutsideContainer">;
        readonly repair: ContainerRepair;
    };
    readonly shapesOverlap: {
        readonly spot: SpotOf<"shapesOverlap">;
        readonly repair: OverlapRepair;
    };
    readonly flowEndOffShape: FlowSpotRepair;
    readonly flowThroughShape: FlowSpotRepair;
}

type RepairedSpotKind = keyof RepairsBySpotKind;

/** What a repair step did about one broken spot, as the spot's note carries it. */
export type SpotRepair = RepairsBySpotKind[RepairedSpotKind];

/** Each flow's repair keyed by the flow's first spot, which `repairedTogether` extends to its other spots. */
export function flowSpotRepairs(
    spots: readonly LayoutSpot[],
    flowRepairs: readonly FlowRepair[],
): SpotRepair[] {
    const flowSpots = spots.filter(isFlowSpot);
    return flowRepairs.flatMap(({ flow, kind }) => {
        const spot = flowSpots.find((candidate) => candidate.flow === flow);
        return spot === undefined ? [] : [{ spot, repair: { kind } }];
    });
}

const NOT_REPAIRED = { kind: "notRepaired" } as const;

/** The repairs of the steps in the order they ran, looked up by the spot they acted on. */
export class SpotRepairs {
    constructor(private readonly repairs: readonly SpotRepair[]) {}

    /** The repair of the last step that acted on the spot; not repaired when none did. */
    of<Kind extends RepairedSpotKind>(spot: SpotOf<Kind>): RepairsBySpotKind[Kind]["repair"] {
        return this.lastActedOn(spot) as RepairsBySpotKind[Kind]["repair"];
    }

    /** Whether a step mended the spot, which its note then says though the spot is gone. */
    repaired(spot: LayoutSpot): boolean {
        return this.lastActedOn(spot).kind !== "notRepaired";
    }

    private lastActedOn(spot: LayoutSpot): SpotRepair["repair"] {
        for (let index = this.repairs.length - 1; index >= 0; index--) {
            const repair = this.repairs[index];
            if (repair !== undefined && repairedTogether(repair.spot, spot)) return repair.repair;
        }
        return NOT_REPAIRED;
    }
}
