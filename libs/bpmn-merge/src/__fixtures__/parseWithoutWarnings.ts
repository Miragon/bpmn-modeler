import { loadBpmnModdle, loadExecutionPackage } from "@miragon/bpmn-modeler-diff";
import type { BpmnModdleFactory, ExecutionEngine } from "@miragon/bpmn-modeler-diff";

export type EnginePlatform = "c7" | "c8";

type BpmnModdle = ReturnType<BpmnModdleFactory>;
type ParsedBpmn = Awaited<ReturnType<BpmnModdle["fromXML"]>>;

export const ENGINE_NAMESPACES: Readonly<Record<EnginePlatform, string>> = {
    c7: "http://camunda.org/schema/1.0/bpmn",
    c8: "http://camunda.org/schema/zeebe/1.0",
};

function platformOf(xml: string): EnginePlatform | undefined {
    if (xml.includes(`"${ENGINE_NAMESPACES.c8}"`)) {
        return "c8";
    }
    return xml.includes(`"${ENGINE_NAMESPACES.c7}"`) ? "c7" : undefined;
}

const EXECUTION_ENGINES: Readonly<Record<EnginePlatform, ExecutionEngine>> = {
    c7: "camunda",
    c8: "zeebe",
};

async function engineModdle(xml: string): Promise<BpmnModdle> {
    const createBpmnModdle = await loadBpmnModdle();
    const platform = platformOf(xml);
    if (platform === undefined) {
        return createBpmnModdle();
    }
    const { prefix, descriptor } = await loadExecutionPackage(EXECUTION_ENGINES[platform]);
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
