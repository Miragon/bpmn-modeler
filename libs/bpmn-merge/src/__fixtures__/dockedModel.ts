import type { Engine } from "@miragon/bpmn-modeler-types/engine";

import type { MergeVersions } from "../computeMerge";
import { cloneModel, nodeById } from "./baseModel";
import { type BpmnFixtureModel, type FixtureNode, renderBpmn } from "./bpmnModelBuilder";

type Edit = (model: BpmnFixtureModel) => void;

const EVENT_SIZE = 36;
const GATEWAY_SIZE = 50;

function sizeOf(node: FixtureNode): readonly [number, number] {
    if (node.type.endsWith("Event")) return [node.width ?? EVENT_SIZE, node.height ?? EVENT_SIZE];
    if (node.type.endsWith("Gateway")) {
        return [node.width ?? GATEWAY_SIZE, node.height ?? GATEWAY_SIZE];
    }
    return [node.width ?? 100, node.height ?? 80];
}

function boxOf(node: FixtureNode) {
    const [width, height] = sizeOf(node);
    return {
        left: node.x,
        top: node.y,
        right: node.x + width,
        bottom: node.y + height,
        centerX: node.x + width / 2,
        centerY: node.y + height / 2,
    };
}

/** Orthogonal routes docked on the outlines, as bpmn-js lays out a new or moved connection. */
function dockedWaypoints(source: FixtureNode, target: FixtureNode): [number, number][] {
    const from = boxOf(source);
    const to = boxOf(target);
    const down = to.centerY > from.centerY;
    if (from.centerY === to.centerY) {
        return from.centerX < to.centerX
            ? [
                  [from.right, from.centerY],
                  [to.left, to.centerY],
              ]
            : [
                  [from.left, from.centerY],
                  [to.right, to.centerY],
              ];
    }
    if (source.type.endsWith("Gateway") || source.type === "boundaryEvent") {
        return [
            [from.centerX, down ? from.bottom : from.top],
            [from.centerX, to.centerY],
            [from.centerX < to.centerX ? to.left : to.right, to.centerY],
        ];
    }
    if (from.centerX === to.centerX) {
        return [
            [from.centerX, down ? from.bottom : from.top],
            [to.centerX, down ? to.top : to.bottom],
        ];
    }
    return [
        [from.centerX < to.centerX ? from.right : from.left, from.centerY],
        [to.centerX, from.centerY],
        [to.centerX, down ? to.top : to.bottom],
    ];
}

/** Re-docks the flows touching `ids`, every flow when none are named. */
export function dock(model: BpmnFixtureModel, ids?: readonly string[]): void {
    for (const flow of model.flows) {
        if (ids && !ids.includes(flow.source) && !ids.includes(flow.target)) continue;
        flow.waypoints = dockedWaypoints(
            nodeById(model, flow.source),
            nodeById(model, flow.target),
        );
    }
}

export function moveNode(model: BpmnFixtureModel, id: string, dx: number, dy = 0): void {
    const node = nodeById(model, id);
    node.x += dx;
    node.y += dy;
}

/** Moves the nodes and re-docks their flows, as dragging them in bpmn-js does. */
export function dragNodes(model: BpmnFixtureModel, ids: readonly string[], dx: number, dy = 0) {
    for (const id of ids) moveNode(model, id, dx, dy);
    dock(model, ids);
}

/** Drops `node` onto a flow: the flow ends at the node and a new flow leaves it for the old target. */
export function insertIntoFlow(
    model: BpmnFixtureModel,
    flowId: string,
    node: FixtureNode,
    newFlowId: string,
): void {
    const flow = model.flows.find((candidate) => candidate.id === flowId)!;
    model.nodes.push(node);
    model.flows.push({ id: newFlowId, source: node.id, target: flow.target });
    flow.target = node.id;
    dock(model, [node.id]);
}

/**
 * A pool with two lanes, an order flow along the top lane and a reject branch
 * in the bottom one, every flow docked on its shapes as bpmn-js draws it.
 */
export function dockedModel(platform: Engine): BpmnFixtureModel {
    const model: BpmnFixtureModel = {
        platform,
        namespaces: {},
        roots: [],
        pools: [
            {
                id: "Participant_Order",
                name: "Order",
                process: "Process_1",
                x: 120,
                y: 60,
                width: 1000,
                height: 320,
            },
        ],
        lanes: [
            { id: "Lane_Sales", name: "Sales", x: 150, y: 60, width: 970, height: 160 },
            { id: "Lane_Back", name: "Back office", x: 150, y: 220, width: 970, height: 160 },
        ],
        dataObjects: [],
        nodes: [
            { id: "Start_Order", type: "startEvent", x: 182, y: 122, lane: "Lane_Sales" },
            { id: "Task_A", type: "task", name: "Check order", x: 260, y: 100, lane: "Lane_Sales" },
            {
                id: "Gateway_Ok",
                type: "exclusiveGateway",
                x: 415,
                y: 115,
                lane: "Lane_Sales",
                default: "Flow_No",
            },
            { id: "Task_C", type: "task", name: "Ship", x: 560, y: 100, lane: "Lane_Sales" },
            { id: "End_Done", type: "endEvent", x: 742, y: 122, lane: "Lane_Sales" },
            { id: "Task_R", type: "task", name: "Reject", x: 520, y: 260, lane: "Lane_Back" },
            { id: "End_Rejected", type: "endEvent", x: 892, y: 282, lane: "Lane_Back" },
        ],
        flows: [
            { id: "Flow_1", source: "Start_Order", target: "Task_A" },
            { id: "Flow_2", source: "Task_A", target: "Gateway_Ok" },
            { id: "Flow_Yes", source: "Gateway_Ok", target: "Task_C", name: "yes" },
            { id: "Flow_4", source: "Task_C", target: "End_Done" },
            { id: "Flow_No", source: "Gateway_Ok", target: "Task_R", name: "no" },
            { id: "Flow_6", source: "Task_R", target: "End_Rejected" },
        ],
    };
    dock(model);
    return model;
}

/** The docked model as base, each side with its edits. */
export function dockedVersions(platform: Engine, current: Edit, incoming: Edit): MergeVersions {
    const base = dockedModel(platform);
    const side = (edit: Edit) => {
        const model = cloneModel(base);
        edit(model);
        return renderBpmn(model);
    };
    return { base: renderBpmn(base), current: side(current), incoming: side(incoming) };
}
