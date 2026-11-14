import type { Engine } from "@miragon/bpmn-modeler-types/engine";

import type { BpmnFixtureModel, FixtureNode, XmlElement } from "./bpmnModelBuilder";

const CHECK_TASK_EXTENSIONS: Readonly<Record<Engine, XmlElement[]>> = {
    c7: [
        {
            tag: "camunda:inputOutput",
            children: [
                {
                    tag: "camunda:inputParameter",
                    attributes: { name: "amount" },
                    text: "${order.amount}",
                },
            ],
        },
    ],
    c8: [
        { tag: "zeebe:taskDefinition", attributes: { type: "check-order", retries: "3" } },
        {
            tag: "zeebe:ioMapping",
            children: [
                { tag: "zeebe:input", attributes: { source: "=order.amount", target: "amount" } },
            ],
        },
    ],
};

const CHECK_TASK_ENGINE_ATTRIBUTES: Readonly<Record<Engine, Record<string, string>>> = {
    c7: { "camunda:delegateExpression": "${checkOrder}" },
    c8: {},
};

/** Camunda Modeler sets a history time to live on every new Camunda 7 process. */
const PROCESS_ENGINE_ATTRIBUTES: Readonly<Record<Engine, Record<string, string>>> = {
    c7: { "camunda:historyTimeToLive": "180" },
    c8: {},
};

/**
 * The shared base: a pool with two lanes, a message start, a service task with engine extensions and an unknown
 * attribute, a non-interrupting timer on it, a gateway with a default flow, an expanded sub-process, an error end,
 * a data object read by the task and an annotation. Small enough to enumerate picks over.
 */
export function baseModel(platform: Engine): BpmnFixtureModel {
    return {
        platform,
        namespaces: { custom: "urn:miragon:custom" },
        roots: [
            { type: "message", id: "Message_Order", name: "Order placed" },
            { type: "error", id: "Error_Stock", name: "Out of stock", code: "STOCK" },
        ],
        pools: [
            {
                id: "Participant_Shop",
                name: "Shop",
                process: "Process_1",
                x: 120,
                y: 60,
                width: 1100,
                height: 400,
            },
        ],
        lanes: [
            { id: "Lane_Clerk", name: "Clerk", x: 150, y: 60, width: 1070, height: 200 },
            { id: "Lane_Manager", name: "Manager", x: 150, y: 260, width: 1070, height: 200 },
        ],
        dataObjects: [{ id: "DataObject_Order" }],
        nodes: [
            {
                id: "Start_Order",
                type: "startEvent",
                name: "Order placed",
                x: 200,
                y: 142,
                lane: "Lane_Clerk",
                eventDefinition: {
                    kind: "message",
                    id: "MessageEventDefinition_1",
                    ref: "Message_Order",
                },
            },
            {
                id: "Task_Check",
                type: "serviceTask",
                name: "Check order",
                x: 290,
                y: 120,
                lane: "Lane_Clerk",
                attributes: {
                    ...CHECK_TASK_ENGINE_ATTRIBUTES[platform],
                    "custom:owner": "billing",
                },
                extensionElements: structuredCopy(CHECK_TASK_EXTENSIONS[platform]),
            },
            {
                id: "Boundary_Timeout",
                type: "boundaryEvent",
                name: "1h",
                x: 322,
                y: 182,
                lane: "Lane_Clerk",
                attachedTo: "Task_Check",
                interrupting: false,
                eventDefinition: { kind: "timer", id: "TimerEventDefinition_1", duration: "PT1H" },
            },
            {
                id: "Gateway_Ok",
                type: "exclusiveGateway",
                name: "OK?",
                x: 445,
                y: 135,
                lane: "Lane_Clerk",
                default: "Flow_No",
            },
            {
                id: "Sub_Ship",
                type: "subProcess",
                name: "Ship",
                x: 560,
                y: 80,
                width: 300,
                height: 160,
                lane: "Lane_Clerk",
            },
            { id: "Sub_Ship_Start", type: "startEvent", x: 590, y: 142, parent: "Sub_Ship" },
            { id: "Task_Pack", type: "userTask", name: "Pack", x: 670, y: 120, parent: "Sub_Ship" },
            { id: "Sub_Ship_End", type: "endEvent", x: 802, y: 142, parent: "Sub_Ship" },
            { id: "End_Done", type: "endEvent", name: "Done", x: 932, y: 142, lane: "Lane_Clerk" },
            {
                id: "Task_Reject",
                type: "userTask",
                name: "Reject",
                x: 560,
                y: 320,
                lane: "Lane_Manager",
            },
            {
                id: "End_Rejected",
                type: "endEvent",
                name: "Rejected",
                x: 732,
                y: 342,
                lane: "Lane_Manager",
                eventDefinition: {
                    kind: "error",
                    id: "ErrorEventDefinition_1",
                    ref: "Error_Stock",
                },
            },
            {
                id: "DataRef_Order",
                type: "dataObjectReference",
                name: "Order",
                x: 322,
                y: 290,
                lane: "Lane_Manager",
                dataObject: "DataObject_Order",
            },
            { id: "Note_Check", type: "textAnnotation", text: "Four-eyes rule", x: 400, y: 280 },
        ],
        processAttributes: { ...PROCESS_ENGINE_ATTRIBUTES[platform] },
        flows: [
            { id: "Flow_Start", source: "Start_Order", target: "Task_Check" },
            { id: "Flow_Checked", source: "Task_Check", target: "Gateway_Ok" },
            { id: "Flow_Yes", source: "Gateway_Ok", target: "Sub_Ship", condition: "${ok}" },
            { id: "Flow_No", source: "Gateway_Ok", target: "Task_Reject" },
            { id: "Flow_Shipped", source: "Sub_Ship", target: "End_Done" },
            { id: "Flow_Rejected", source: "Task_Reject", target: "End_Rejected" },
            { id: "Flow_Timeout", source: "Boundary_Timeout", target: "Task_Reject" },
            { id: "Flow_Ship_1", source: "Sub_Ship_Start", target: "Task_Pack" },
            { id: "Flow_Ship_2", source: "Task_Pack", target: "Sub_Ship_End" },
            {
                id: "DataInput_Order",
                kind: "dataInput",
                source: "DataRef_Order",
                target: "Task_Check",
            },
            {
                id: "Association_Check",
                kind: "association",
                source: "Task_Check",
                target: "Note_Check",
            },
        ],
    };
}

function structuredCopy<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
}

export function cloneModel(model: BpmnFixtureModel): BpmnFixtureModel {
    return structuredCopy(model);
}

export function nodeById(model: BpmnFixtureModel, id: string): FixtureNode {
    const node = model.nodes.find((candidate) => candidate.id === id);
    if (!node) {
        throw new Error(`no node ${id} in the fixture model`);
    }
    return node;
}

/** Removes the node with what cannot outlive it: its descendants, attached events, their flows and stale defaults. */
export function removeNode(model: BpmnFixtureModel, id: string): BpmnFixtureModel {
    const removed = new Set([id]);
    let size = 0;
    while (removed.size !== size) {
        size = removed.size;
        for (const node of model.nodes) {
            if (
                (node.parent && removed.has(node.parent)) ||
                (node.attachedTo && removed.has(node.attachedTo))
            ) {
                removed.add(node.id);
            }
        }
    }
    model.nodes = model.nodes.filter((node) => !removed.has(node.id));
    model.flows = model.flows.filter(
        (flow) => !removed.has(flow.source) && !removed.has(flow.target),
    );
    model.dataObjects = model.dataObjects.filter(
        (dataObject) => !dataObject.parent || !removed.has(dataObject.parent),
    );
    for (const node of model.nodes) {
        if (node.default && !model.flows.some((flow) => flow.id === node.default)) {
            delete node.default;
        }
        node.boundaryEventRefs = node.boundaryEventRefs?.filter((ref) => !removed.has(ref));
        if (node.boundaryEventRefs?.length === 0) {
            delete node.boundaryEventRefs;
        }
    }
    return model;
}

export function removeFlow(model: BpmnFixtureModel, id: string): BpmnFixtureModel {
    model.flows = model.flows.filter((flow) => flow.id !== id);
    for (const node of model.nodes) {
        if (node.default === id) {
            delete node.default;
        }
    }
    return model;
}

export function removeRoot(model: BpmnFixtureModel, id: string): BpmnFixtureModel {
    model.roots = model.roots.filter((root) => root.id !== id);
    return model;
}
