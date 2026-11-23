import { baseModel, cloneModel, nodeById, removeRoot } from "./baseModel";
import { type BpmnFixtureModel, renderBpmn } from "./bpmnModelBuilder";
import type { MergeVersions } from "../classify/service/mergeVersions";

const INPUT_PARAMETERS = "camunda:inputOutput";

function flowNamed(model: BpmnFixtureModel, id: string) {
    const flow = model.flows.find((candidate) => candidate.id === id);
    if (!flow) throw new Error(`no flow ${id} in the fixture model`);
    return flow;
}

/**
 * Both sides change different parts of Task_Check (current a listener and
 * its name, incoming an input parameter), and each its own way Sub_Ship,
 * Task_Pack, Start_Order and Flow_Yes's condition; both remove Message_Old,
 * incoming adds Message_New. Task_Check's data input targets the property
 * Property_Check inside it.
 */
export function handMergeVersions(): MergeVersions {
    const base = baseModel("c7");
    base.roots.push({ type: "message", id: "Message_Old", name: "Old" });
    flowNamed(base, "DataInput_Order").targetProperty = "Property_Check";
    const current = cloneModel(base);
    const incoming = cloneModel(base);

    nodeById(current, "Task_Check").name = "Check order now";
    nodeById(current, "Task_Check").extensionElements!.push({
        tag: "camunda:executionListener",
        attributes: { event: "start", expression: "${audit}" },
    });
    const incomingParameters = nodeById(incoming, "Task_Check").extensionElements!.find(
        ({ tag }) => tag === INPUT_PARAMETERS,
    )!;
    nodeById(incoming, "Task_Check").extensionElements = [
        {
            ...incomingParameters,
            children: [
                ...incomingParameters.children!,
                { tag: "camunda:inputParameter", attributes: { name: "currency" }, text: "EUR" },
            ],
        },
    ];
    nodeById(current, "Sub_Ship").name = "Ship now";
    nodeById(incoming, "Sub_Ship").name = "Ship later";
    nodeById(current, "Task_Pack").name = "Pack parcel";
    nodeById(incoming, "Task_Pack").name = "Pack box";
    nodeById(current, "Start_Order").name = "Order in";
    nodeById(incoming, "Start_Order").name = "Order arrived";
    flowNamed(current, "Flow_Yes").condition = "${ok == true}";
    flowNamed(incoming, "Flow_Yes").condition = "${valid}";
    removeRoot(current, "Message_Old");
    removeRoot(incoming, "Message_Old");
    incoming.roots.push({ type: "message", id: "Message_New", name: "New" });

    return { base: renderBpmn(base), current: renderBpmn(current), incoming: renderBpmn(incoming) };
}

/** Both sides change the process's history time to live and the pool's name, each its own way. */
export function containersChangedByBoth(): MergeVersions {
    const base = baseModel("c7");
    const current = cloneModel(base);
    const incoming = cloneModel(base);
    current.processAttributes = { "camunda:historyTimeToLive": "30" };
    incoming.processAttributes = { "camunda:historyTimeToLive": "90" };
    current.pools[0]!.name = "Shop now";
    incoming.pools[0]!.name = "Shop later";
    return { base: renderBpmn(base), current: renderBpmn(current), incoming: renderBpmn(incoming) };
}
