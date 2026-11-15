import {
    type ModdleElement,
    type ModdleParseResult,
    type PrefixedModdle,
    createDocumentModdle,
    isType,
    loadExecutionPackage,
    moddleElements,
    walkContainment,
} from "@miragon/bpmn-modeler-diff";
import {
    ENGINE_LABEL,
    detectEngineWithNamespaceFallback,
} from "@miragon/bpmn-modeler-types/engine";

import { executionEngineOf } from "./executionEngine";

export interface MergeVersions {
    readonly base?: string;
    readonly current: string;
    readonly incoming: string;
}

export type VersionName = keyof MergeVersions;

export const VERSION_NAMES: readonly VersionName[] = ["base", "current", "incoming"];

type BpmnModdle = PrefixedModdle["moddle"];

/** Current first, so current keeps its prefixes and the others get a fresh one on a clash. */
export function prefixSourcesOf(versions: MergeVersions): string[] {
    return [versions.current, versions.incoming, versions.base].filter(
        (xml): xml is string => xml !== undefined,
    );
}

/**
 * Refuses, naming the version: sides for different engines, a version that
 * parses with any warning under the merge's engine descriptor, and a root
 * element or lane without an id.
 */
export async function requireMergeableVersions(versions: MergeVersions): Promise<void> {
    requireOneEngine(versions);
    const engineName = executionEngineOf(versions.current) ?? executionEngineOf(versions.incoming);
    const engine = engineName === undefined ? undefined : await loadExecutionPackage(engineName);
    const { moddle } = await createDocumentModdle(prefixSourcesOf(versions), engine);
    await Promise.all(
        VERSION_NAMES.map(async (name) => {
            const xml = versions[name];
            if (xml !== undefined) await requireMergeableVersion(moddle, name, xml);
        }),
    );
}

/** A side whose engine is not detected merges with either. */
function requireOneEngine({ current, incoming }: MergeVersions): void {
    const currentEngine = detectEngineWithNamespaceFallback(current);
    const incomingEngine = detectEngineWithNamespaceFallback(incoming);
    if (currentEngine && incomingEngine && currentEngine !== incomingEngine) {
        throw new Error(
            `current is for ${ENGINE_LABEL[currentEngine]} and incoming for ${ENGINE_LABEL[incomingEngine]}: a merge needs one engine`,
        );
    }
}

async function requireMergeableVersion(
    moddle: BpmnModdle,
    name: VersionName,
    xml: string,
): Promise<void> {
    const definitions = await cleanlyParsed(moddle, name, xml);
    const withoutId = elementWithoutId(definitions);
    if (withoutId) {
        throw new Error(
            `${name} holds a ${withoutId.$type} without an id: the merge matches root elements and lanes by id`,
        );
    }
}

async function cleanlyParsed(
    moddle: BpmnModdle,
    name: VersionName,
    xml: string,
): Promise<ModdleElement> {
    let parsed: ModdleParseResult;
    try {
        parsed = await moddle.fromXML(xml);
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(`${name} does not parse: ${reason}`, { cause: error });
    }
    const warnings = (parsed.warnings ?? []).map(({ message }) => message ?? "unnamed warning");
    if (warnings.length > 0) throw new Error(`${name} does not parse: ${warnings.join("; ")}`);
    return parsed.rootElement;
}

function elementWithoutId(definitions: ModdleElement): ModdleElement | undefined {
    const rootElementWithoutId = moddleElements(definitions["rootElements"]).find(
        (rootElement) => !rootElement.id,
    );
    if (rootElementWithoutId) return rootElementWithoutId;
    let laneWithoutId: ModdleElement | undefined;
    walkContainment(definitions, (element) => {
        if (!laneWithoutId && !element.id && isType(element, "bpmn:Lane")) laneWithoutId = element;
    });
    return laneWithoutId;
}
