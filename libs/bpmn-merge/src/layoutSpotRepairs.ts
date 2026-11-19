import type {
    MergeContainerRepair,
    MergeFlowRepair,
    MergeOverlapRepair,
} from "@miragon/bpmn-modeler-types/mergeBuildNotes";

import type { RepairOf } from "./buildNotes";
import type { FlowRepair } from "./layoutFlowRepair";
import { type FlowSpot, type LayoutSpot, isFlowSpot, repairedTogether } from "./layoutSpots";

/** What the build did about a shape outside its sub-process, pool or lane. */
export type ContainerRepair = RepairOf<MergeContainerRepair>;

/** What the build did about two shapes on top of each other. */
export type OverlapRepair = RepairOf<MergeOverlapRepair>;

interface FlowSpotRepair {
    readonly kind: MergeFlowRepair;
}

interface RepairsBySpotKind {
    readonly shapeOutsideContainer: ContainerRepair;
    readonly shapesOverlap: OverlapRepair;
    readonly flowEndOffShape: FlowSpotRepair;
    readonly flowThroughShape: FlowSpotRepair;
}

type RepairedSpotKind = keyof RepairsBySpotKind;

type SpotOf<Kind extends RepairedSpotKind> = Extract<LayoutSpot, { readonly kind: Kind }>;

/** What a repair step did about one broken spot, as the spot's note carries it. */
export type SpotRepair =
    | { readonly spot: SpotOf<"shapeOutsideContainer">; readonly repair: ContainerRepair }
    | { readonly spot: SpotOf<"shapesOverlap">; readonly repair: OverlapRepair }
    | { readonly spot: FlowSpot; readonly repair: FlowSpotRepair };

/** Each flow's repair keyed by every spot of the flow, as a re-route acts on the whole flow. */
export function flowSpotRepairs(
    spots: readonly LayoutSpot[],
    flowRepairs: readonly FlowRepair[],
): SpotRepair[] {
    return spots.filter(isFlowSpot).flatMap((spot) => {
        const repair = flowRepairs.find(({ flow }) => flow === spot.flow);
        return repair === undefined ? [] : [{ spot, repair: { kind: repair.kind } }];
    });
}

const NOT_REPAIRED = { kind: "notRepaired" } as const;

/** The repairs of the steps in the order they ran, looked up by the spot they acted on. */
export class SpotRepairs {
    constructor(private readonly repairs: readonly SpotRepair[]) {}

    /** The repair of the last step that acted on the spot; not repaired when none did. */
    of<Kind extends RepairedSpotKind>(spot: SpotOf<Kind>): RepairsBySpotKind[Kind] {
        return this.lastActedOn(spot) as RepairsBySpotKind[Kind];
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
