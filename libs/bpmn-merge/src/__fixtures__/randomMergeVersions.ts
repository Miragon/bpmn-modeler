import type { Engine } from "@miragon/bpmn-modeler-types/domain";

import { baseModel, cloneModel, removeFlow, removeNode, removeRoot } from "./baseModel";
import {
    type BpmnFixtureModel,
    type FixtureNode,
    type XmlElement,
    renderBpmn,
} from "./bpmnModelBuilder";

/** Mulberry32: a seeded generator, so a failing seed replays the same versions. */
export function seededRandom(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let mixed = state;
        mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
        mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
        return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
    };
}

export type Random = () => number;

export const randomIndex = (random: Random, length: number) => Math.floor(random() * length);

export const randomItem = <Item>(random: Random, items: readonly Item[]): Item | undefined =>
    items.length === 0 ? undefined : items[randomIndex(random, items.length)];

type Edit =
    | { kind: "rename"; id: string; name: string }
    | { kind: "move"; id: string; dx: number; dy: number; withContents: boolean }
    | { kind: "addTask"; id: string; flowId: string; from: string }
    | { kind: "addTaskBefore"; id: string; flowId: string; flow: string }
    | { kind: "removeNode"; id: string }
    | { kind: "removeFlow"; id: string }
    | { kind: "reconnect"; id: string; end: "source" | "target"; node: string }
    | { kind: "lane"; id: string; lane: string }
    | { kind: "intoSubProcess"; id: string; subProcess: string }
    | { kind: "outOfSubProcess"; id: string }
    | { kind: "condition"; id: string; condition?: string }
    | { kind: "extension"; which: "owner" | "engine"; value: string }
    | { kind: "addMessage"; rootId: string; nodeId: string }
    | { kind: "retargetStart"; rootId: string }
    | { kind: "removeRoot"; rootId: string }
    | {
          kind: "addBoundary";
          id: string;
          host: string;
          definition: "timer" | "message" | "error";
          interrupting: boolean;
      }
    | { kind: "collapse"; id: string }
    | { kind: "expand"; id: string }
    | { kind: "default"; gateway: string; flow?: string }
    | { kind: "addAnnotation"; id: string; associationId: string; target: string }
    | { kind: "addDataInput"; id: string; target: string; withProperty: boolean }
    | { kind: "removeLane"; lane: string }
    | { kind: "addLane"; lane: string }
    | { kind: "removePool" }
    | { kind: "timer"; id: string; duration: string }
    | { kind: "addSubProcess"; id: string; parent?: string }
    | { kind: "addPool" }
    | { kind: "addCustomer"; flowId: string; target: string; message: boolean }
    | { kind: "removeDataObject" }
    | { kind: "processAttribute"; value: string }
    | { kind: "laneName"; lane: string; name: string }
    | { kind: "rootName"; rootId: string; name: string };

const NEW_TASKS = ["Task_N1", "Task_N2"];
const NEW_FLOWS = ["Flow_N1", "Flow_N2", "Flow_N3"];
const NEW_BOUNDARIES = ["Boundary_N1", "Boundary_N2"];
const NEW_MESSAGES = ["Message_N1", "Message_N2"];
const NEW_CATCHES = ["Catch_N1", "Catch_N2"];
const NEW_INPUTS = ["DataInput_N1", "DataInput_N2"];
const NAMES = ["Alpha", "Beta"];

const ENGINE_EXTENSIONS_OF_CHECK_TASK: Readonly<Record<Engine, (value: string) => XmlElement[]>> = {
    c7: (value) => [
        {
            tag: "camunda:inputOutput",
            children: [
                { tag: "camunda:inputParameter", attributes: { name: "amount" }, text: value },
            ],
        },
    ],
    c8: (value) => [
        { tag: "zeebe:taskDefinition", attributes: { type: "check-order", retries: value } },
    ],
};

const PROCESS_ATTRIBUTE: Readonly<Record<Engine, string>> = {
    c7: "camunda:historyTimeToLive",
    c8: "custom:tag",
};

const ACTIVITY_TYPES = new Set(["task", "serviceTask", "userTask", "subProcess"]);
const NO_FLOW_SOURCE_TYPES = new Set([
    "endEvent",
    "dataObjectReference",
    "dataStoreReference",
    "textAnnotation",
]);
const NO_FLOW_TARGET_TYPES = new Set([
    "startEvent",
    "boundaryEvent",
    "dataObjectReference",
    "dataStoreReference",
    "textAnnotation",
]);
const UNMOVABLE_TYPES = new Set(["boundaryEvent", "textAnnotation"]);

const isActivity = (node: FixtureNode) => ACTIVITY_TYPES.has(node.type);
const canBeSource = (node: FixtureNode) => !NO_FLOW_SOURCE_TYPES.has(node.type);
const canBeTarget = (node: FixtureNode) => !NO_FLOW_TARGET_TYPES.has(node.type);
const nodeIn = (model: BpmnFixtureModel, id: string | undefined) =>
    model.nodes.find((candidate) => candidate.id === id);
const sequenceFlowsOf = (model: BpmnFixtureModel) =>
    model.flows.filter((flow) => (flow.kind ?? "sequence") === "sequence");
const subProcessesOf = (model: BpmnFixtureModel) =>
    model.nodes.filter((node) => node.type === "subProcess");
const attachedTo = (model: BpmnFixtureModel, host: string) =>
    model.nodes.filter((node) => node.attachedTo === host);

function isIdTaken(model: BpmnFixtureModel, id: string): boolean {
    return (
        model.nodes.some((node) => node.id === id || node.eventDefinition?.id === id) ||
        model.flows.some((flow) => flow.id === id || flow.targetProperty === id) ||
        model.roots.some((root) => root.id === id) ||
        model.lanes.some((lane) => lane.id === id) ||
        model.pools.some((pool) => pool.id === id) ||
        model.dataObjects.some((dataObject) => dataObject.id === id)
    );
}

function descendantsOf(model: BpmnFixtureModel, id: string): FixtureNode[] {
    const children = model.nodes.filter((node) => node.parent === id);
    return [...children, ...children.flatMap((child) => descendantsOf(model, child.id))];
}

function laneAt(model: BpmnFixtureModel, y: number): string | undefined {
    return (
        model.lanes.find((lane) => y >= lane.y && y < lane.y + lane.height)?.id ??
        model.lanes[0]?.id
    );
}

function removeFlowsOf(model: BpmnFixtureModel, nodeIds: ReadonlySet<string>): void {
    for (const flow of sequenceFlowsOf(model)) {
        if (nodeIds.has(flow.source) || nodeIds.has(flow.target)) removeFlow(model, flow.id);
    }
}

function moveBy(nodes: readonly FixtureNode[], dx: number, dy: number): void {
    for (const node of new Set(nodes)) {
        node.x += dx;
        node.y += dy;
    }
}

/** Applies the edit when its preconditions hold on this model; returns whether it did. */
function applyEdit(model: BpmnFixtureModel, edit: Edit): boolean {
    switch (edit.kind) {
        case "rename": {
            const node = nodeIn(model, edit.id);
            if (!node || node.type === "textAnnotation") return false;
            node.name = edit.name;
            return true;
        }
        case "move": {
            const node = nodeIn(model, edit.id);
            if (!node) return false;
            const moved = edit.withContents ? [node, ...descendantsOf(model, node.id)] : [node];
            const boundaries = moved.flatMap((movedNode) => attachedTo(model, movedNode.id));
            moveBy([...moved, ...boundaries], edit.dx, edit.dy);
            return true;
        }
        case "addTask": {
            const from = nodeIn(model, edit.from);
            if (!from || !canBeSource(from)) return false;
            if (isIdTaken(model, edit.id) || isIdTaken(model, edit.flowId)) return false;
            model.nodes.push({
                id: edit.id,
                type: "task",
                name: "New",
                x: from.x + 60,
                y: from.y + 100,
                parent: from.parent,
                lane: from.parent ? undefined : from.lane,
            });
            model.flows.push({ id: edit.flowId, source: from.id, target: edit.id });
            return true;
        }
        case "addTaskBefore": {
            const flow = sequenceFlowsOf(model).find((candidate) => candidate.id === edit.flow);
            const target = nodeIn(model, flow?.target);
            if (!flow || !target) return false;
            if (isIdTaken(model, edit.id) || isIdTaken(model, edit.flowId)) return false;
            model.nodes.push({
                id: edit.id,
                type: "task",
                name: "Between",
                x: target.x - 60,
                y: target.y + 90,
                parent: target.parent,
                lane: target.parent ? undefined : target.lane,
            });
            model.flows.push({ id: edit.flowId, source: edit.id, target: target.id });
            flow.target = edit.id;
            return true;
        }
        case "removeNode": {
            if (!nodeIn(model, edit.id)) return false;
            removeNode(model, edit.id);
            return true;
        }
        case "removeFlow": {
            if (!model.flows.some((flow) => flow.id === edit.id)) return false;
            removeFlow(model, edit.id);
            return true;
        }
        case "reconnect": {
            const flow = sequenceFlowsOf(model).find((candidate) => candidate.id === edit.id);
            const node = nodeIn(model, edit.node);
            if (!flow || !node) return false;
            const otherEnd = nodeIn(model, edit.end === "source" ? flow.target : flow.source);
            if (!otherEnd || otherEnd.parent !== node.parent || otherEnd.id === node.id) {
                return false;
            }
            if (edit.end === "source" ? !canBeSource(node) : !canBeTarget(node)) return false;
            if (edit.end === "source") {
                const formerSource = nodeIn(model, flow.source);
                if (formerSource?.default === flow.id) delete formerSource.default;
                flow.source = node.id;
            } else {
                flow.target = node.id;
            }
            delete flow.waypoints;
            return true;
        }
        case "lane": {
            const node = nodeIn(model, edit.id);
            const lane = model.lanes.find((candidate) => candidate.id === edit.lane);
            if (!node || !lane || node.parent || UNMOVABLE_TYPES.has(node.type)) return false;
            if (node.lane === lane.id) return false;
            const dy = lane.y + 40 - node.y;
            node.lane = lane.id;
            for (const boundary of attachedTo(model, node.id)) boundary.lane = lane.id;
            moveBy([node, ...attachedTo(model, node.id), ...descendantsOf(model, node.id)], 0, dy);
            return true;
        }
        case "intoSubProcess": {
            const node = nodeIn(model, edit.id);
            const subProcess = nodeIn(model, edit.subProcess);
            if (!node || subProcess?.type !== "subProcess" || node.id === subProcess.id) {
                return false;
            }
            if (node.parent || UNMOVABLE_TYPES.has(node.type)) return false;
            if (model.nodes.some((child) => child.parent === node.id)) return false;
            const moved = [node, ...attachedTo(model, node.id)];
            removeFlowsOf(model, new Set(moved.map(({ id }) => id)));
            const [x, y] = subProcess.collapsed
                ? [subProcess.x - 300, subProcess.y + 400]
                : [subProcess.x + 20, subProcess.y + 40];
            moveBy(moved, x - node.x, y - node.y);
            for (const movedNode of moved) {
                movedNode.parent = subProcess.id;
                delete movedNode.lane;
            }
            return true;
        }
        case "outOfSubProcess": {
            const node = nodeIn(model, edit.id);
            const subProcess = nodeIn(model, node?.parent);
            if (!node || !subProcess || subProcess.parent || UNMOVABLE_TYPES.has(node.type)) {
                return false;
            }
            if (model.nodes.some((child) => child.parent === node.id)) return false;
            const moved = [node, ...attachedTo(model, node.id)];
            removeFlowsOf(model, new Set(moved.map(({ id }) => id)));
            moveBy(moved, 950 - node.x, 360 - node.y);
            for (const movedNode of moved) {
                delete movedNode.parent;
                movedNode.lane = laneAt(model, 360);
            }
            return true;
        }
        case "condition": {
            const flow = sequenceFlowsOf(model).find((candidate) => candidate.id === edit.id);
            if (!flow || nodeIn(model, flow.source)?.type !== "exclusiveGateway") return false;
            if (edit.condition === undefined) delete flow.condition;
            else flow.condition = edit.condition;
            return true;
        }
        case "extension": {
            const node = nodeIn(model, "Task_Check");
            if (!node) return false;
            if (edit.which === "owner") {
                node.attributes = { ...node.attributes, "custom:owner": edit.value };
            } else {
                node.extensionElements = ENGINE_EXTENSIONS_OF_CHECK_TASK[model.platform](
                    edit.value,
                );
            }
            return true;
        }
        case "addMessage": {
            if (isIdTaken(model, edit.rootId) || isIdTaken(model, edit.nodeId)) return false;
            model.roots.push({ type: "message", id: edit.rootId, name: "M" });
            model.nodes.push({
                id: edit.nodeId,
                type: "intermediateCatchEvent",
                name: "Wait",
                x: 1000,
                y: 300,
                lane: laneAt(model, 300),
                eventDefinition: {
                    kind: "message",
                    id: `MessageEventDefinition_${edit.nodeId}`,
                    ref: edit.rootId,
                },
            });
            return true;
        }
        case "retargetStart": {
            const start = nodeIn(model, "Start_Order");
            if (start?.eventDefinition?.kind !== "message") return false;
            if (!model.roots.some(({ id, type }) => id === edit.rootId && type === "message")) {
                return false;
            }
            start.eventDefinition = { ...start.eventDefinition, ref: edit.rootId };
            return true;
        }
        case "removeRoot": {
            if (!model.roots.some((root) => root.id === edit.rootId)) return false;
            removeRoot(model, edit.rootId);
            for (const node of model.nodes) {
                const definition = node.eventDefinition;
                if (definition && "ref" in definition && definition.ref === edit.rootId) {
                    node.eventDefinition = { ...definition, ref: undefined };
                }
            }
            for (const flow of model.flows) if (flow.message === edit.rootId) delete flow.message;
            return true;
        }
        case "addBoundary": {
            const host = nodeIn(model, edit.host);
            if (!host || !isActivity(host) || isIdTaken(model, edit.id)) return false;
            const referenced =
                edit.definition === "timer"
                    ? undefined
                    : model.roots.find((root) => root.type === edit.definition)?.id;
            model.nodes.push({
                id: edit.id,
                type: "boundaryEvent",
                x: host.x + (host.width ?? 100) - 30,
                y: host.y + (host.height ?? 80) - 18,
                parent: host.parent,
                lane: host.parent ? undefined : host.lane,
                attachedTo: host.id,
                interrupting: edit.definition === "error" ? true : edit.interrupting,
                eventDefinition:
                    edit.definition === "timer"
                        ? { kind: "timer", id: `TimerDefinition_${edit.id}`, duration: "PT5M" }
                        : { kind: edit.definition, id: `Definition_${edit.id}`, ref: referenced },
            });
            return true;
        }
        case "collapse": {
            const subProcess = nodeIn(model, edit.id);
            if (subProcess?.type !== "subProcess" || subProcess.collapsed) return false;
            const contents = descendantsOf(model, subProcess.id);
            Object.assign(subProcess, { collapsed: true, width: 100, height: 80 });
            moveBy(contents, -400, 0);
            for (const boundary of attachedTo(model, subProcess.id)) {
                boundary.x = subProcess.x + 60;
                boundary.y = subProcess.y + 62;
            }
            return true;
        }
        case "expand": {
            const subProcess = nodeIn(model, edit.id);
            if (!subProcess?.collapsed) return false;
            delete subProcess.collapsed;
            Object.assign(subProcess, { width: 300, height: 160 });
            moveBy(descendantsOf(model, subProcess.id), 400, 0);
            return true;
        }
        case "default": {
            const gateway = nodeIn(model, edit.gateway);
            if (gateway?.type !== "exclusiveGateway") return false;
            if (edit.flow === undefined) {
                if (!gateway.default) return false;
                delete gateway.default;
                return true;
            }
            const outgoing = sequenceFlowsOf(model).filter((flow) => flow.source === gateway.id);
            if (!outgoing.some((flow) => flow.id === edit.flow)) return false;
            gateway.default = edit.flow;
            return true;
        }
        case "addAnnotation": {
            const target = nodeIn(model, edit.target);
            if (!target || target.type === "textAnnotation") return false;
            if (isIdTaken(model, edit.id) || isIdTaken(model, edit.associationId)) return false;
            model.nodes.push({
                id: edit.id,
                type: "textAnnotation",
                text: "Note",
                x: target.x + 40,
                y: target.y - 60,
                parent: target.parent,
            });
            model.flows.push({
                id: edit.associationId,
                kind: "association",
                source: target.id,
                target: edit.id,
            });
            return true;
        }
        case "addDataInput": {
            const target = nodeIn(model, edit.target);
            const data = nodeIn(model, "DataRef_Order");
            if (!target || !data || !isActivity(target) || isIdTaken(model, edit.id)) return false;
            const property = edit.withProperty ? `Property_${edit.id}` : undefined;
            if (property && isIdTaken(model, property)) return false;
            model.flows.push({
                id: edit.id,
                kind: "dataInput",
                source: data.id,
                target: target.id,
                targetProperty: property,
            });
            return true;
        }
        case "removeLane": {
            const lane = model.lanes.find((candidate) => candidate.id === edit.lane);
            if (!lane) return false;
            model.lanes = model.lanes.filter((candidate) => candidate.id !== edit.lane);
            const remaining = model.lanes[0];
            if (remaining) {
                remaining.y = Math.min(remaining.y, lane.y);
                remaining.height += lane.height;
            }
            for (const node of model.nodes) {
                if (node.lane !== edit.lane) continue;
                if (remaining) node.lane = remaining.id;
                else delete node.lane;
            }
            return true;
        }
        case "addLane": {
            const pool = model.pools[0];
            if (!pool || isIdTaken(model, edit.lane) || model.lanes.length === 0) return false;
            const y = pool.y + pool.height;
            pool.height += 120;
            model.lanes.push({
                id: edit.lane,
                name: "Extra",
                x: pool.x + 30,
                y,
                width: pool.width - 30,
                height: 120,
            });
            return true;
        }
        case "removePool": {
            if (model.pools.length === 0) return false;
            model.pools = [];
            model.flows = model.flows.filter((flow) => flow.kind !== "message");
            return true;
        }
        case "timer": {
            const node = nodeIn(model, edit.id);
            if (node?.eventDefinition?.kind !== "timer") return false;
            node.eventDefinition = { ...node.eventDefinition, duration: edit.duration };
            return true;
        }
        case "addSubProcess": {
            if (isIdTaken(model, edit.id) || isIdTaken(model, `${edit.id}_Start`)) return false;
            const parent = edit.parent === undefined ? undefined : nodeIn(model, edit.parent);
            if (edit.parent !== undefined && parent?.type !== "subProcess") return false;
            const [x, y] = !parent
                ? [900, 300]
                : parent.collapsed
                  ? [parent.x - 300, parent.y + 300]
                  : [parent.x + 20, parent.y + 90];
            model.nodes.push({
                id: edit.id,
                type: "subProcess",
                name: "Sub",
                x,
                y,
                width: 200,
                height: 120,
                parent: parent?.id,
                lane: parent ? undefined : laneAt(model, 300),
            });
            model.nodes.push({
                id: `${edit.id}_Start`,
                type: "startEvent",
                x: x + 30,
                y: y + 40,
                parent: edit.id,
            });
            return true;
        }
        case "addPool": {
            if (model.pools.length > 0) return false;
            model.pools.push({
                id: "Participant_Shop",
                name: "Shop",
                process: "Process_1",
                x: 120,
                y: 60,
                width: 1100,
                height: 400,
            });
            return true;
        }
        case "addCustomer": {
            if (model.pools.length === 0 || isIdTaken(model, "Participant_Customer")) return false;
            const target = nodeIn(model, edit.target);
            if (!target || target.parent || isIdTaken(model, edit.flowId)) return false;
            if (target.type === "textAnnotation" || target.type.startsWith("data")) return false;
            model.pools.push({
                id: "Participant_Customer",
                name: "Customer",
                x: 120,
                y: 700,
                width: 1100,
                height: 120,
            });
            model.flows.push({
                id: edit.flowId,
                kind: "message",
                source: "Participant_Customer",
                target: target.id,
                message: edit.message
                    ? model.roots.find((root) => root.type === "message")?.id
                    : undefined,
            });
            return true;
        }
        case "removeDataObject": {
            if (!model.dataObjects.some(({ id }) => id === "DataObject_Order")) return false;
            for (const node of model.nodes.filter(
                (candidate) => candidate.dataObject === "DataObject_Order",
            )) {
                removeNode(model, node.id);
            }
            model.dataObjects = model.dataObjects.filter(({ id }) => id !== "DataObject_Order");
            return true;
        }
        case "processAttribute": {
            model.processAttributes = { [PROCESS_ATTRIBUTE[model.platform]]: edit.value };
            return true;
        }
        case "laneName": {
            const lane = model.lanes.find((candidate) => candidate.id === edit.lane);
            if (!lane) return false;
            lane.name = edit.name;
            return true;
        }
        case "rootName": {
            const root = model.roots.find((candidate) => candidate.id === edit.rootId);
            if (!root) return false;
            root.name = edit.name;
            return true;
        }
    }
}

const EDIT_KINDS: readonly Edit["kind"][] = [
    "rename",
    "move",
    "addTask",
    "addTaskBefore",
    "removeNode",
    "removeNode",
    "removeFlow",
    "reconnect",
    "lane",
    "intoSubProcess",
    "outOfSubProcess",
    "condition",
    "extension",
    "addMessage",
    "retargetStart",
    "removeRoot",
    "addBoundary",
    "collapse",
    "expand",
    "default",
    "addAnnotation",
    "addDataInput",
    "removeLane",
    "addLane",
    "removePool",
    "timer",
    "addSubProcess",
    "addSubProcess",
    "processAttribute",
    "laneName",
    "rootName",
    "addPool",
    "addCustomer",
    "removeDataObject",
];

function editOfKind(
    random: Random,
    model: BpmnFixtureModel,
    kind: Edit["kind"],
    focus: readonly string[],
): Edit | undefined {
    const focused = model.nodes.filter((candidate) => focus.includes(candidate.id));
    const node =
        focused.length > 0 && random() < 0.6
            ? randomItem(random, focused)
            : randomItem(random, model.nodes);
    const sequenceFlows = sequenceFlowsOf(model);
    const flow = randomItem(random, sequenceFlows);
    const lane = randomItem(random, model.lanes);
    const root = randomItem(random, model.roots);
    const subProcess = randomItem(random, subProcessesOf(model));
    const newTask = randomItem(random, NEW_TASKS)!;
    const newFlow = randomItem(random, NEW_FLOWS)!;
    switch (kind) {
        case "rename":
            return node && { kind, id: node.id, name: randomItem(random, NAMES)! };
        case "move":
            return (
                node && {
                    kind,
                    id: node.id,
                    dx: randomItem(random, [20, -20, 40])!,
                    dy: randomItem(random, [0, 10])!,
                    withContents: random() < 0.5,
                }
            );
        case "addTask":
            return node && { kind, id: newTask, flowId: newFlow, from: node.id };
        case "addTaskBefore":
            return flow && { kind, id: newTask, flowId: newFlow, flow: flow.id };
        case "removeNode":
            return node && { kind, id: node.id };
        case "removeFlow": {
            const anyFlow = randomItem(random, model.flows);
            return anyFlow && { kind, id: anyFlow.id };
        }
        case "reconnect":
            return (
                flow &&
                node && {
                    kind,
                    id: flow.id,
                    end: random() < 0.5 ? "source" : "target",
                    node: node.id,
                }
            );
        case "lane":
            return node && lane && { kind, id: node.id, lane: lane.id };
        case "intoSubProcess":
            return node && subProcess && { kind, id: node.id, subProcess: subProcess.id };
        case "outOfSubProcess": {
            const inner = randomItem(
                random,
                model.nodes.filter((candidate) => candidate.parent),
            );
            return inner && { kind, id: inner.id };
        }
        case "condition": {
            const gatewayFlow = randomItem(
                random,
                sequenceFlows.filter(
                    (candidate) => nodeIn(model, candidate.source)?.type === "exclusiveGateway",
                ),
            );
            return (
                gatewayFlow && {
                    kind,
                    id: gatewayFlow.id,
                    condition: randomItem(random, ["=approved", "=rejected", undefined]),
                }
            );
        }
        case "extension":
            return {
                kind,
                which: random() < 0.5 ? "owner" : "engine",
                value: randomItem(random, ["5", "7"])!,
            };
        case "addMessage":
            return {
                kind,
                rootId: randomItem(random, NEW_MESSAGES)!,
                nodeId: randomItem(random, NEW_CATCHES)!,
            };
        case "retargetStart": {
            const message = randomItem(
                random,
                model.roots.filter((candidate) => candidate.type === "message"),
            );
            return message && { kind, rootId: message.id };
        }
        case "removeRoot":
            return root && { kind, rootId: root.id };
        case "addBoundary": {
            const host = randomItem(random, model.nodes.filter(isActivity));
            return (
                host && {
                    kind,
                    id: randomItem(random, NEW_BOUNDARIES)!,
                    host: host.id,
                    definition: randomItem(random, ["timer", "message", "error"] as const)!,
                    interrupting: random() < 0.5,
                }
            );
        }
        case "collapse":
        case "expand":
            return subProcess && { kind, id: subProcess.id };
        case "default": {
            const gateway = randomItem(
                random,
                model.nodes.filter((candidate) => candidate.type === "exclusiveGateway"),
            );
            if (!gateway) return undefined;
            const outgoing = sequenceFlows
                .filter((candidate) => candidate.source === gateway.id)
                .map(({ id }) => id);
            return {
                kind,
                gateway: gateway.id,
                flow: randomItem(random, [...outgoing, undefined]),
            };
        }
        case "addAnnotation":
            return (
                node && { kind, id: "Note_N1", associationId: "Association_N1", target: node.id }
            );
        case "addDataInput": {
            const target = randomItem(random, model.nodes.filter(isActivity));
            return (
                target && {
                    kind,
                    id: randomItem(random, NEW_INPUTS)!,
                    target: target.id,
                    withProperty: random() < 0.5,
                }
            );
        }
        case "removeLane":
            return lane && { kind, lane: lane.id };
        case "addLane":
            return { kind, lane: "Lane_N1" };
        case "timer": {
            const timer = randomItem(
                random,
                model.nodes.filter((candidate) => candidate.eventDefinition?.kind === "timer"),
            );
            return timer && { kind, id: timer.id, duration: randomItem(random, ["PT2H", "PT3H"])! };
        }
        case "addSubProcess":
            return { kind, id: "Sub_N1", parent: random() < 0.5 ? subProcess?.id : undefined };
        case "addCustomer":
            return (
                node && {
                    kind,
                    flowId: "MessageFlow_N1",
                    target: node.id,
                    message: random() < 0.5,
                }
            );
        case "processAttribute":
            return { kind, value: randomItem(random, ["90", "30"])! };
        case "laneName":
            return lane && { kind, lane: lane.id, name: randomItem(random, NAMES)! };
        case "rootName":
            return root && { kind, rootId: root.id, name: randomItem(random, NAMES)! };
        case "removePool":
        case "addPool":
        case "removeDataObject":
            return { kind };
    }
}

/** An edit that applies to this model, trying a few kinds; undefined when none does. */
function randomEdit(
    random: Random,
    model: BpmnFixtureModel,
    focus: readonly string[],
): Edit | undefined {
    for (let attempt = 0; attempt < 12; attempt++) {
        const edit = editOfKind(random, model, randomItem(random, EDIT_KINDS)!, focus);
        if (edit && applyEdit(cloneModel(model), edit)) return edit;
    }
    return undefined;
}

export interface RandomMergeVersions {
    readonly base?: string;
    readonly current: string;
    readonly incoming: string;
}

/**
 * Three versions of the order process for one seed: an optional base with
 * at most one edit of its own, and two sides with one to five edits each,
 * which often touch the same few nodes and sometimes share their first edit.
 */
export function randomMergeVersions(seed: number): RandomMergeVersions {
    const random = seededRandom(seed);
    const platform: Engine = random() < 0.5 ? "c7" : "c8";
    const withBase = random() >= 0.2;
    const base = baseModel(platform);
    if (random() < 0.3) {
        const edit = randomEdit(random, base, []);
        if (edit) applyEdit(base, edit);
    }
    const focus =
        random() < 0.5 ? [0, 1, 2].map(() => randomItem(random, base.nodes)!.id) : ([] as string[]);
    const editedSide = (sharedEdits: readonly Edit[]) => {
        const model = cloneModel(base);
        const edits = sharedEdits.filter((edit) => applyEdit(model, edit));
        const count = 1 + randomIndex(random, 5);
        for (let index = 0; index < count; index++) {
            const edit = randomEdit(random, model, focus);
            if (!edit) continue;
            applyEdit(model, edit);
            edits.push(edit);
        }
        return { model, edits };
    };
    const current = editedSide([]);
    const shared = random() < 0.2 && current.edits.length > 0 ? [current.edits[0]!] : [];
    const incoming = editedSide(shared);
    return {
        ...(withBase ? { base: renderBpmn(base) } : {}),
        current: renderBpmn(current.model),
        incoming: renderBpmn(incoming.model),
    };
}
