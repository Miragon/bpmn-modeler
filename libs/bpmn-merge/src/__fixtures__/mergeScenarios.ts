import type { Engine } from "@miragon/bpmn-modeler-types/engine";

import { baseModel, cloneModel, nodeById, removeFlow, removeNode, removeRoot } from "./baseModel";
import { renderBpmn } from "./bpmnModelBuilder";
import type { BpmnFixtureModel, FixtureNode } from "./bpmnModelBuilder";

export interface MergeScenario {
    readonly name: string;
    readonly platform: Engine;
    readonly base?: string;
    readonly current: string;
    readonly incoming: string;
    /** What the scenario is for, in short. */
    readonly expect?: string;
}

type ModelEdit = (model: BpmnFixtureModel) => void;

/** Its base and current declare no engine namespace. */
export const PLATFORM_ONLY_SCENARIO = "engine: Camunda 8 named by the platform only";

interface ScenarioEdits {
    readonly name: string;
    readonly expect?: string;
    readonly platform?: Engine;
    readonly withoutBase?: boolean;
    /** Applied to the base before the sides are derived from it. */
    readonly base?: ModelEdit;
    readonly current?: ModelEdit;
    readonly incoming?: ModelEdit;
}

function scenario({
    name,
    expect,
    platform = "c7",
    withoutBase,
    base,
    current,
    incoming,
}: ScenarioEdits): MergeScenario {
    const baseVersion = baseModel(platform);
    base?.(baseVersion);
    const sideVersion = (edit: ModelEdit | undefined) => {
        const model = cloneModel(baseVersion);
        edit?.(model);
        return renderBpmn(model);
    };
    return {
        name,
        platform,
        expect,
        base: withoutBase ? undefined : renderBpmn(baseVersion),
        current: sideVersion(current),
        incoming: sideVersion(incoming),
    };
}

const editsInOrder =
    (...edits: (ModelEdit | undefined)[]): ModelEdit =>
    (model) => {
        for (const edit of edits) {
            edit?.(model);
        }
    };

const changeNode =
    (id: string, change: Partial<FixtureNode>): ModelEdit =>
    (model) => {
        Object.assign(nodeById(model, id), change);
    };

const renameNode = (id: string, name: string): ModelEdit => changeNode(id, { name });

const moveNode =
    (id: string, deltaX: number): ModelEdit =>
    (model) => {
        nodeById(model, id).x += deltaX;
    };

const addNode =
    (node: FixtureNode): ModelEdit =>
    (model) => {
        model.nodes.push(node);
    };

const addTask = (id: string, name: string, x = 1000, y = 320): ModelEdit =>
    addNode({ id, type: "task", name, x, y, lane: "Lane_Manager" });

const deleteNode =
    (id: string): ModelEdit =>
    (model) => {
        removeNode(model, id);
    };

const deleteRoot =
    (id: string): ModelEdit =>
    (model) => {
        removeRoot(model, id);
    };

const addAuditTaskAfterReject = (name: string): ModelEdit =>
    editsInOrder(addTask("Task_Audit", name), (model) => {
        model.flows.push({ id: "Flow_ToAudit", source: "Task_Reject", target: "Task_Audit" });
    });

const addCustomerPool =
    (process?: string): ModelEdit =>
    (model) => {
        model.pools.push({
            id: "Participant_Customer",
            name: "Customer",
            process,
            x: 120,
            y: 500,
            width: 1100,
            height: 120,
        });
    };

// The name changes too: computeDiff does not see a changed timer duration alone.
const retimeBoundaryTimeout = changeNode("Boundary_Timeout", {
    name: "2h",
    eventDefinition: { kind: "timer", id: "TimerEventDefinition_1", duration: "PT2H" },
});

/** One edit per row of #2450's table, each on an element of its own, so the rows also combine into one scenario. */
const TABLE_ROWS: readonly {
    readonly state: string;
    readonly current?: ModelEdit;
    readonly incoming?: ModelEdit;
}[] = [
    { state: "unchanged" },
    { state: "taken from current", current: renameNode("Task_Check", "Check order now") },
    { state: "taken from incoming", incoming: renameNode("Task_Reject", "Reject order") },
    {
        state: "same change",
        current: renameNode("Gateway_Ok", "Valid?"),
        incoming: renameNode("Gateway_Ok", "Valid?"),
    },
    {
        state: "both changed",
        current: renameNode("Task_Pack", "Pack parcel"),
        incoming: renameNode("Task_Pack", "Pack box"),
    },
    {
        state: "added by current",
        current: addTask("Task_AddedByCurrent", "Added by current", 1000, 140),
    },
    {
        state: "added by incoming",
        incoming: addTask("Task_AddedByIncoming", "Added by incoming", 850, 300),
    },
    {
        state: "same addition",
        current: addTask("Task_SameAddition", "Added by both", 1000, 300),
        incoming: addTask("Task_SameAddition", "Added by both", 1000, 300),
    },
    {
        state: "both added",
        current: addTask("Task_BothAdded", "Added here", 850, 380),
        incoming: addTask("Task_BothAdded", "Added there", 850, 380),
    },
    { state: "removed by current", current: deleteNode("Note_Check") },
    { state: "removed by incoming", incoming: deleteNode("End_Done") },
    {
        state: "removed by both",
        current: deleteNode("DataRef_Order"),
        incoming: deleteNode("DataRef_Order"),
    },
    {
        state: "removed and changed",
        current: deleteNode("End_Rejected"),
        incoming: renameNode("End_Rejected", "Refused"),
    },
    {
        state: "changed and removed",
        current: retimeBoundaryTimeout,
        incoming: deleteNode("Boundary_Timeout"),
    },
];

const TABLE_EXPECTATIONS =
    "Start_Order unchanged, Task_Check takenFromCurrent, Task_Reject takenFromIncoming, Gateway_Ok sameChange, " +
    "Task_Pack bothChanged, Task_AddedByCurrent addedByCurrent, Task_AddedByIncoming addedByIncoming, " +
    "Task_SameAddition sameAddition, Task_BothAdded bothAdded, Note_Check (and Association_Check) removedByCurrent, " +
    "End_Done (and Flow_Shipped) removedByIncoming, DataRef_Order (and DataInput_Order) removedByBoth, " +
    "End_Rejected removedAndChanged (Flow_Rejected removedByCurrent), " +
    "Boundary_Timeout changedAndRemoved (Flow_Timeout removedByIncoming)";

const tableScenarios = TABLE_ROWS.map((row) =>
    scenario({ name: `table: ${row.state}`, current: row.current, incoming: row.incoming }),
);

const everyTableRow = (platform: Engine) =>
    scenario({
        name: `table: every row (${platform})`,
        platform,
        expect: TABLE_EXPECTATIONS,
        current: editsInOrder(...TABLE_ROWS.map((row) => row.current)),
        incoming: editsInOrder(...TABLE_ROWS.map((row) => row.incoming)),
    });

const tableBulletScenarios = [
    scenario({
        name: "unknown namespaced attribute changed",
        expect: "Task_Check takenFromIncoming: only custom:owner differs",
        incoming: (model) => {
            nodeById(model, "Task_Check").attributes = {
                ...nodeById(model, "Task_Check").attributes,
                "custom:owner": "shipping",
            };
        },
    }),
    scenario({
        name: "both moved the same way",
        expect: "Task_Reject unchanged, its layout changed alike on both sides (no conflict, either side's layout)",
        current: moveNode("Task_Reject", 40),
        incoming: moveNode("Task_Reject", 40),
    }),
    scenario({
        name: "both moved differently",
        expect: "Task_Reject unchanged, layout bothChanged (current wins, no conflict)",
        current: moveNode("Task_Reject", 40),
        incoming: moveNode("Task_Reject", -40),
    }),
    scenario({
        name: "moved into another lane",
        expect: "Task_Reject takenFromIncoming: its lanes change from Lane_Manager to Lane_Clerk",
        incoming: changeNode("Task_Reject", { lane: "Lane_Clerk", x: 1000, y: 150 }),
    }),
    scenario({
        name: "moved into a sub-process",
        expect: "Task_Label takenFromIncoming: its parent changes from Process_1 to Sub_Ship",
        base: addTask("Task_Label", "Print label", 850, 320),
        incoming: changeNode("Task_Label", { parent: "Sub_Ship", lane: undefined, x: 700, y: 210 }),
    }),
];

const withoutBaseScenarios = [
    scenario({
        name: "no base: sides equal",
        expect: "every element unchanged",
        withoutBase: true,
    }),
    scenario({
        name: "no base: sides differ",
        expect: "Task_Check differs; Task_Reject only moved: layout bothChanged, no decision",
        withoutBase: true,
        current: renameNode("Task_Check", "Check order now"),
        incoming: editsInOrder(
            renameNode("Task_Check", "Check order later"),
            moveNode("Task_Reject", 40),
        ),
    }),
    scenario({
        name: "no base: only one side",
        expect: "Task_Audit onlyInCurrent, Task_Extra onlyInIncoming",
        withoutBase: true,
        current: addTask("Task_Audit", "Audit"),
        incoming: addTask("Task_Extra", "Extra", 850, 300),
    }),
];

const danglingScenarios = [
    scenario({
        name: "dangling: current removes a task, incoming adds a flow from it",
        expect: "Task_Reject removedByCurrent and Flow_Escalate addedByIncoming would dangle: open danglingReference on both",
        current: deleteNode("Task_Reject"),
        incoming: editsInOrder(
            addNode({
                id: "End_Escalated",
                type: "endEvent",
                name: "Escalated",
                x: 732,
                y: 412,
                lane: "Lane_Manager",
            }),
            changeNode("Task_Reject", { y: 300 }),
            (model) => {
                model.flows.push({
                    id: "Flow_Escalate",
                    source: "Task_Reject",
                    target: "End_Escalated",
                });
            },
        ),
    }),
    scenario({
        name: "dangling: boundary event kept, host dropped",
        expect: "Boundary_Timeout changedAndRemoved; picking current needs Task_Check, which incoming removed",
        current: retimeBoundaryTimeout,
        incoming: editsInOrder(deleteNode("Task_Check"), (model) => {
            model.flows.push({ id: "Flow_Direct", source: "Start_Order", target: "Gateway_Ok" });
        }),
    }),
];

const ruleScenarios = [
    scenario({
        name: "rule: parent",
        expect: "Sub_Ship removedByCurrent, Task_Label addedByIncoming inside it: dangling parent",
        current: deleteNode("Sub_Ship"),
        incoming: addNode({
            id: "Task_Label",
            type: "task",
            name: "Print label",
            x: 700,
            y: 210,
            parent: "Sub_Ship",
        }),
    }),
    scenario({
        name: "rule: default flow",
        expect: "Flow_Yes removedByCurrent, Gateway_Ok takenFromIncoming with default Flow_Yes: dangling default",
        current: (model) => {
            removeFlow(model, "Flow_Yes");
        },
        incoming: changeNode("Gateway_Ok", { default: "Flow_Yes" }),
    }),
    scenario({
        name: "rule: message reference",
        expect: "Message_Order removedByCurrent, Catch_Reminder addedByIncoming names it: dangling messageRef",
        current: editsInOrder(
            deleteRoot("Message_Order"),
            changeNode("Start_Order", { eventDefinition: undefined }),
        ),
        incoming: addNode({
            id: "Catch_Reminder",
            type: "intermediateCatchEvent",
            name: "Reminder",
            x: 1000,
            y: 342,
            lane: "Lane_Manager",
            eventDefinition: {
                kind: "message",
                id: "MessageEventDefinition_Reminder",
                ref: "Message_Order",
            },
        }),
    }),
    scenario({
        name: "rule: error reference",
        expect: "Error_Stock removedByCurrent, Boundary_Stock addedByIncoming names it: dangling errorRef",
        current: editsInOrder(
            deleteRoot("Error_Stock"),
            changeNode("End_Rejected", { eventDefinition: undefined }),
        ),
        incoming: addNode({
            id: "Boundary_Stock",
            type: "boundaryEvent",
            name: "Out of stock",
            x: 352,
            y: 102,
            lane: "Lane_Clerk",
            attachedTo: "Task_Check",
            eventDefinition: {
                kind: "error",
                id: "ErrorEventDefinition_Stock",
                ref: "Error_Stock",
            },
        }),
    }),
    scenario({
        name: "rule: signal reference",
        expect: "Signal_Alarm removedByCurrent, Throw_Alarm addedByIncoming names it: dangling signalRef",
        base: (model) => {
            model.roots.push({ type: "signal", id: "Signal_Alarm", name: "Alarm" });
        },
        current: deleteRoot("Signal_Alarm"),
        incoming: addNode({
            id: "Throw_Alarm",
            type: "intermediateThrowEvent",
            name: "Raise alarm",
            x: 1000,
            y: 342,
            lane: "Lane_Manager",
            eventDefinition: {
                kind: "signal",
                id: "SignalEventDefinition_Alarm",
                ref: "Signal_Alarm",
            },
        }),
    }),
    scenario({
        name: "rule: escalation reference",
        expect: "Escalation_Late removedByCurrent, Boundary_Late addedByIncoming names it: dangling escalationRef",
        base: (model) => {
            model.roots.push({
                type: "escalation",
                id: "Escalation_Late",
                name: "Late",
                code: "LATE",
            });
        },
        current: deleteRoot("Escalation_Late"),
        incoming: addNode({
            id: "Boundary_Late",
            type: "boundaryEvent",
            name: "Late",
            x: 692,
            y: 222,
            lane: "Lane_Clerk",
            attachedTo: "Sub_Ship",
            interrupting: false,
            eventDefinition: {
                kind: "escalation",
                id: "EscalationEventDefinition_Late",
                ref: "Escalation_Late",
            },
        }),
    }),
    scenario({
        name: "rule: data object reference",
        expect: "DataObject_Order removedByCurrent, DataRef_Copy addedByIncoming names it: dangling dataObjectRef",
        current: editsInOrder(deleteNode("DataRef_Order"), (model) => {
            model.dataObjects = model.dataObjects.filter(
                (dataObject) => dataObject.id !== "DataObject_Order",
            );
        }),
        incoming: addNode({
            id: "DataRef_Copy",
            type: "dataObjectReference",
            name: "Order copy",
            x: 1000,
            y: 380,
            lane: "Lane_Manager",
            dataObject: "DataObject_Order",
        }),
    }),
    scenario({
        name: "rule: data store reference",
        expect: "DataStore_Stock removedByCurrent, DataStoreRef_Stock addedByIncoming names it: dangling dataStoreRef",
        base: (model) => {
            model.roots.push({ type: "dataStore", id: "DataStore_Stock", name: "Stock" });
        },
        current: deleteRoot("DataStore_Stock"),
        incoming: addNode({
            id: "DataStoreRef_Stock",
            type: "dataStoreReference",
            name: "Stock",
            x: 1000,
            y: 380,
            lane: "Lane_Manager",
            dataStore: "DataStore_Stock",
        }),
    }),
    scenario({
        name: "rule: data association",
        expect: "DataRef_Order removedByCurrent, DataOutput_Order addedByIncoming targets it: dangling association end",
        current: deleteNode("DataRef_Order"),
        incoming: (model) => {
            model.flows.push({
                id: "DataOutput_Order",
                kind: "dataOutput",
                source: "Task_Check",
                target: "DataRef_Order",
            });
        },
    }),
    scenario({
        name: "rule: association end",
        expect: "Note_Check removedByCurrent, Association_Reject addedByIncoming targets it: dangling targetRef",
        current: deleteNode("Note_Check"),
        incoming: (model) => {
            model.flows.push({
                id: "Association_Reject",
                kind: "association",
                source: "Task_Reject",
                target: "Note_Check",
            });
        },
    }),
    scenario({
        name: "rule: compensation association end",
        expect: "Task_Refund removedByCurrent, Boundary_Compensate and Association_Compensate addedByIncoming: dangling targetRef",
        base: addNode({
            id: "Task_Refund",
            type: "task",
            name: "Refund",
            x: 1000,
            y: 150,
            lane: "Lane_Clerk",
            forCompensation: true,
        }),
        current: deleteNode("Task_Refund"),
        incoming: editsInOrder(
            addNode({
                id: "Boundary_Compensate",
                type: "boundaryEvent",
                x: 352,
                y: 102,
                lane: "Lane_Clerk",
                attachedTo: "Task_Check",
                eventDefinition: { kind: "compensate", id: "CompensateEventDefinition_Refund" },
            }),
            (model) => {
                model.flows.push({
                    id: "Association_Compensate",
                    kind: "association",
                    direction: "One",
                    source: "Boundary_Compensate",
                    target: "Task_Refund",
                });
            },
        ),
    }),
    scenario({
        name: "rule: compensation activity reference",
        expect: "Task_Archive removedByCurrent, Throw_Compensate addedByIncoming names it: dangling activityRef",
        base: addTask("Task_Archive", "Archive"),
        current: deleteNode("Task_Archive"),
        incoming: addNode({
            id: "Throw_Compensate",
            type: "intermediateThrowEvent",
            name: "Undo archive",
            x: 850,
            y: 342,
            lane: "Lane_Manager",
            eventDefinition: {
                kind: "compensate",
                id: "CompensateEventDefinition_Archive",
                ref: "Task_Archive",
            },
        }),
    }),
    scenario({
        name: "rule: message flow end",
        expect: "Participant_Customer removedByCurrent, MessageFlow_Order addedByIncoming starts at it: dangling sourceRef",
        base: addCustomerPool(),
        current: (model) => {
            model.pools = model.pools.filter((pool) => pool.id !== "Participant_Customer");
        },
        incoming: (model) => {
            model.flows.push({
                id: "MessageFlow_Order",
                kind: "message",
                source: "Participant_Customer",
                target: "Start_Order",
                message: "Message_Order",
            });
        },
    }),
    scenario({
        name: "rule: process reference",
        expect:
            "Participant_Customer bothChanged (current drops processRef and Process_Customer, incoming renames): " +
            "picking incoming needs Process_Customer, which current removed",
        base: addCustomerPool("Process_Customer"),
        current: (model) => {
            const customer = model.pools.find((pool) => pool.id === "Participant_Customer");
            delete customer?.process;
        },
        incoming: (model) => {
            const customer = model.pools.find((pool) => pool.id === "Participant_Customer");
            Object.assign(customer ?? {}, { name: "Client" });
        },
    }),
    scenario({
        name: "rule: lane",
        expect: "Lane_Manager removedByCurrent (its nodes moved to Lane_Clerk), Task_Audit addedByIncoming in it: dangling lane",
        current: (model) => {
            model.lanes = model.lanes.filter((lane) => lane.id !== "Lane_Manager");
            Object.assign(model.lanes[0], { height: 400 });
            for (const node of model.nodes.filter(
                (candidate) => candidate.lane === "Lane_Manager",
            )) {
                node.lane = "Lane_Clerk";
            }
        },
        incoming: addTask("Task_Audit", "Audit"),
    }),
];

const buildScenarios = [
    scenario({
        name: "independent changes (c7)",
        expect: "Task_Audit and Flow_ToAudit addedByCurrent, Task_Check takenFromIncoming (execution listener added)",
        current: addAuditTaskAfterReject("Audit"),
        incoming: (model) => {
            nodeById(model, "Task_Check").extensionElements?.push({
                tag: "camunda:executionListener",
                attributes: { class: "com.example.Audit", event: "start" },
            });
        },
    }),
    scenario({
        name: "independent changes (c8)",
        platform: "c8",
        expect: "Task_Audit and Flow_ToAudit addedByCurrent, Task_Check takenFromIncoming (ioMapping output added)",
        current: addAuditTaskAfterReject("Audit"),
        incoming: (model) => {
            const ioMapping = nodeById(model, "Task_Check").extensionElements?.find(
                (extension) => extension.tag === "zeebe:ioMapping",
            );
            Object.assign(ioMapping ?? {}, {
                children: [
                    ...(ioMapping?.children ?? []),
                    {
                        tag: "zeebe:output",
                        attributes: { source: "=approved", target: "orderApproved" },
                    },
                ],
            });
        },
    }),
    scenario({
        name: "namespace only incoming declares",
        expect: "Task_Pack takenFromIncoming with team:owner; the result must declare xmlns team",
        incoming: (model) => {
            model.namespaces.team = "urn:miragon:team";
            nodeById(model, "Task_Pack").attributes = { "team:owner": "warehouse" };
        },
    }),
    scenario({
        name: "prefix collision",
        expect:
            "Task_Pack takenFromCurrent (ext = urn:current:ext), Task_Reject takenFromIncoming (ext = urn:incoming:ext): " +
            "the result needs two prefixes",
        current: (model) => {
            model.namespaces.ext = "urn:current:ext";
            nodeById(model, "Task_Pack").attributes = { "ext:tag": "current" };
        },
        incoming: (model) => {
            model.namespaces.ext = "urn:incoming:ext";
            nodeById(model, "Task_Reject").attributes = { "ext:tag": "incoming" };
        },
    }),
    scenario({
        name: "root element only incoming adds",
        expect: "Message_Reminder and Catch_Reminder addedByIncoming, Task_Pack takenFromCurrent",
        current: renameNode("Task_Pack", "Pack parcel"),
        incoming: editsInOrder(
            (model) => {
                model.roots.push({ type: "message", id: "Message_Reminder", name: "Reminder" });
            },
            addNode({
                id: "Catch_Reminder",
                type: "intermediateCatchEvent",
                name: "Reminder",
                x: 1000,
                y: 342,
                lane: "Lane_Manager",
                eventDefinition: {
                    kind: "message",
                    id: "MessageEventDefinition_Reminder",
                    ref: "Message_Reminder",
                },
            }),
        ),
    }),
];

const shiftNode =
    (id: string, deltaX: number, deltaY: number): ModelEdit =>
    (model) => {
        nodeById(model, id).x += deltaX;
        nodeById(model, id).y += deltaY;
    };

function descendantsOf(model: BpmnFixtureModel, id: string): FixtureNode[] {
    const children = model.nodes.filter((node) => node.parent === id);
    return [...children, ...children.flatMap((child) => descendantsOf(model, child.id))];
}

/** As bpmn-js moves an expanded sub-process: its contents move with it. */
const moveWithContents =
    (id: string, deltaX: number): ModelEdit =>
    (model) => {
        for (const node of [nodeById(model, id), ...descendantsOf(model, id)]) {
            node.x += deltaX;
        }
    };

/** As bpmn-js collapses a sub-process: a task-sized shape, its contents shifted onto a diagram of its own. */
const collapse =
    (id: string, contentsDeltaX: number): ModelEdit =>
    (model) => {
        Object.assign(nodeById(model, id), { collapsed: true, width: 100, height: 80 });
        for (const node of descendantsOf(model, id)) {
            node.x += contentsDeltaX;
        }
    };

const withoutLanes: ModelEdit = (model) => {
    model.lanes = [];
    for (const node of model.nodes) {
        delete node.lane;
    }
};

const withoutPool: ModelEdit = editsInOrder(withoutLanes, (model) => {
    model.pools = [];
});

const withTheBaseLanes: ModelEdit = (model) => {
    const original = baseModel(model.platform);
    model.lanes = original.lanes;
    for (const node of model.nodes) {
        const lane = original.nodes.find((candidate) => candidate.id === node.id)?.lane;
        if (lane !== undefined) {
            node.lane = lane;
        }
    }
};

/** Inputs the review of the spike found the merge mishandling, one finding each. */
const hardeningScenarios = [
    scenario({
        name: "data association onto a task incoming renames",
        expect:
            "Task_Reject bothChanged (current adds the placeholder property Property_Reject, incoming renames it); " +
            "DataInput_Reject addedByCurrent targets Property_Reject inside Task_Reject",
        current: (model) => {
            model.flows.push({
                id: "DataInput_Reject",
                kind: "dataInput",
                source: "DataRef_Order",
                target: "Task_Reject",
                targetProperty: "Property_Reject",
            });
        },
        incoming: renameNode("Task_Reject", "Reject order"),
    }),
    scenario({
        name: "gateway removed with its default flow",
        expect:
            "Gateway_Ok changedAndRemoved (current renames it, incoming removes it with its flows); " +
            "Flow_No, its default, removedByIncoming names it as its source",
        current: renameNode("Gateway_Ok", "Valid?"),
        incoming: deleteNode("Gateway_Ok"),
    }),
    scenario({
        name: "lanes only incoming adds",
        expect:
            "Process_1 bothChanged (current changes its history time to live, incoming adds LaneSet_1); " +
            "Lane_Clerk and Lane_Manager addedByIncoming inside LaneSet_1",
        base: withoutLanes,
        current: (model) => {
            model.processAttributes = { "camunda:historyTimeToLive": "90" };
        },
        incoming: withTheBaseLanes,
    }),
    scenario({
        name: "no base: incoming wraps the process in a pool",
        expect:
            "Collaboration_1 and Participant_Shop onlyInIncoming; both root diagrams are BPMNDiagram_1, " +
            "current's draws Process_1, incoming's Collaboration_1",
        withoutBase: true,
        base: withoutPool,
        incoming: (model) => {
            model.pools.push({
                id: "Participant_Shop",
                name: "Shop",
                process: "Process_1",
                x: 120,
                y: 60,
                width: 1100,
                height: 400,
            });
        },
    }),
    scenario({
        name: "collapse: incoming collapses a sub-process current moves",
        expect:
            "Sub_Ship layout bothChanged (current moves it with its contents, incoming collapses it onto its own diagram); " +
            "its contents' layout takenFromIncoming",
        current: moveWithContents("Sub_Ship", 20),
        incoming: collapse("Sub_Ship", -400),
    }),
    scenario({
        name: "collapse: current adds a task inside a sub-process incoming collapses",
        expect: "Task_Label addedByCurrent inside Sub_Ship, drawn on the main diagram; Sub_Ship layout takenFromIncoming",
        current: addNode({
            id: "Task_Label",
            type: "task",
            name: "Print label",
            x: 700,
            y: 210,
            parent: "Sub_Ship",
        }),
        incoming: collapse("Sub_Ship", -400),
    }),
    scenario({
        name: "boundary event moved with its host",
        expect:
            "Task_Check layout bothChanged (current moves it, incoming moves it with Boundary_Timeout); " +
            "Boundary_Timeout layout takenFromIncoming",
        current: moveNode("Task_Check", 10),
        incoming: editsInOrder(
            shiftNode("Task_Check", 0, 30),
            shiftNode("Boundary_Timeout", 0, 30),
        ),
    }),
    scenario({
        name: "boundary event its host lists, removed by incoming",
        expect: "Boundary_Timeout removedByIncoming; Task_Check unchanged, since boundaryEventRefs is derived",
        base: (model) => {
            nodeById(model, "Task_Check").boundaryEventRefs = ["Boundary_Timeout"];
        },
        incoming: deleteNode("Boundary_Timeout"),
    }),
    scenario({
        name: "type: current replaces a task with a collapsed sub-process incoming renames",
        expect: "Task_Reject bothChanged, a bpmn:SubProcess on current and a bpmn:UserTask on base and incoming",
        current: changeNode("Task_Reject", {
            type: "subProcess",
            collapsed: true,
            width: 100,
            height: 80,
        }),
        incoming: renameNode("Task_Reject", "Reject order"),
    }),
    scenario({
        name: "type: incoming replaces a task with a collapsed sub-process current renames",
        expect: "Task_Reject bothChanged, a bpmn:SubProcess on incoming and a bpmn:UserTask on base and current",
        current: renameNode("Task_Reject", "Reject order"),
        incoming: changeNode("Task_Reject", {
            type: "subProcess",
            collapsed: true,
            width: 100,
            height: 80,
        }),
    }),
    scenario({
        name: "interface and operation reference only incoming adds",
        expect: "Interface_Orders addedByIncoming; Task_Check takenFromIncoming names Operation_Check inside it",
        incoming: (model) => {
            model.roots.push({
                type: "interface",
                id: "Interface_Orders",
                name: "Orders",
                operations: [{ id: "Operation_Check", name: "Check" }],
            });
            const task = nodeById(model, "Task_Check");
            task.attributes = { operationRef: "Operation_Check", ...task.attributes };
        },
    }),
    scenario({
        name: PLATFORM_ONLY_SCENARIO,
        platform: "c8",
        expect:
            "current declares Camunda 8 only through modeler:executionPlatform (nothing uses zeebe); " +
            "Task_Check takenFromIncoming with a zeebe task definition",
        base: (model) => {
            nodeById(model, "Task_Check").extensionElements = [];
        },
        incoming: (model) => {
            nodeById(model, "Task_Check").extensionElements = [
                { tag: "zeebe:taskDefinition", attributes: { type: "check-order" } },
            ];
        },
    }),
];

export const ALL_CONFLICTS_SCENARIO = "all conflicts";

const allConflictsScenario = scenario({
    name: ALL_CONFLICTS_SCENARIO,
    expect:
        "7 open conflicts: Task_Check, Task_Pack (inside Sub_Ship), Sub_Ship, Message_Order (shapeless), Lane_Manager " +
        "bothChanged; Task_Audit bothAdded; End_Rejected changedAndRemoved. Flow_ToAudit sameAddition",
    current: editsInOrder(
        renameNode("Task_Check", "Check order now"),
        renameNode("Task_Pack", "Pack parcel"),
        renameNode("Sub_Ship", "Ship order"),
        (model) => {
            Object.assign(model.roots[0], { name: "Order received" });
            Object.assign(model.lanes[1], { name: "Team lead" });
        },
        addAuditTaskAfterReject("Audit"),
        renameNode("End_Rejected", "Refused"),
    ),
    incoming: editsInOrder(
        renameNode("Task_Check", "Check order later"),
        renameNode("Task_Pack", "Pack box"),
        renameNode("Sub_Ship", "Deliver"),
        (model) => {
            Object.assign(model.roots[0], { name: "Order submitted" });
            Object.assign(model.lanes[1], { name: "Supervisor" });
        },
        addAuditTaskAfterReject("Audit twice"),
        deleteNode("End_Rejected"),
    ),
});

export const MERGE_SCENARIOS: readonly MergeScenario[] = [
    ...tableScenarios,
    everyTableRow("c7"),
    everyTableRow("c8"),
    ...tableBulletScenarios,
    ...withoutBaseScenarios,
    ...danglingScenarios,
    ...ruleScenarios,
    ...buildScenarios,
    ...hardeningScenarios,
    allConflictsScenario,
];

export function scenarioNamed(name: string): MergeScenario {
    const found = MERGE_SCENARIOS.find((candidate) => candidate.name === name);
    if (!found) {
        throw new Error(`no merge scenario named ${name}`);
    }
    return found;
}
