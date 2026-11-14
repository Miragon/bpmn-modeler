import { loadBpmnModdle, loadExecutionPackage } from "@miragon/bpmn-modeler-diff";
import type { BpmnModdleFactory } from "@miragon/bpmn-modeler-diff";

import { executionEngineOf } from "../executionEngine";

type BpmnModdle = ReturnType<BpmnModdleFactory>;
type ParsedBpmn = Awaited<ReturnType<BpmnModdle["fromXML"]>>;

async function engineModdle(xml: string): Promise<BpmnModdle> {
    const createBpmnModdle = await loadBpmnModdle();
    const executionEngine = executionEngineOf(xml);
    if (executionEngine === undefined) {
        return createBpmnModdle();
    }
    const { prefix, descriptor } = await loadExecutionPackage(executionEngine);
    return createBpmnModdle({ [prefix]: descriptor });
}

/** Parses with the descriptor of the engine the document declares and rejects on any parser warning. */
export async function parseWithoutWarnings(xml: string): Promise<ParsedBpmn> {
    const parsed = await (await engineModdle(xml)).fromXML(xml);
    const warnings = parsed.warnings ?? [];
    if (warnings.length > 0) {
        throw new Error(
            `parsed with warnings: ${warnings.map((warning) => warning.message).join("; ")}`,
        );
    }
    return parsed;
}

/** What the modeler's save writes for this document: a moddle round trip with the engine descriptor. */
export async function serializeAsModeler(xml: string): Promise<string> {
    const moddle = await engineModdle(xml);
    const { rootElement } = await moddle.fromXML(xml);
    return (await moddle.toXML(rootElement, { format: true })).xml;
}
