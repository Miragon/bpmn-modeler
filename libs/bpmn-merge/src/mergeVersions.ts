import {
    type ModdleElement,
    type ModdleParseResult,
    type PrefixedModdle,
    createDocumentModdle,
    isType,
    loadExecutionPackage,
    moddleElements,
    parseWarningMessages,
    walkContainment,
} from "@miragon/bpmn-modeler-diff";
import { detectEngineWithNamespaceFallback } from "@miragon/bpmn-modeler-types/engine";

import { executionEngineOf } from "./executionEngine";
import { mergeRefusal, parseFailure } from "./mergeRefusal";
import { type MergeVersions, VERSION_NAMES, type VersionName } from "./versionNames";

export { VERSION_NAMES } from "./versionNames";
export type { MergeVersions, VersionName } from "./versionNames";

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
        throw mergeRefusal({
            kind: "mixedEngines",
            current: currentEngine,
            incoming: incomingEngine,
        });
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
        throw mergeRefusal({
            kind: "elementWithoutId",
            version: name,
            elementType: withoutId.$type,
        });
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
        throw parseFailure(name, error);
    }
    const warnings = parseWarningMessages(parsed.warnings);
    if (warnings.length > 0) {
        throw mergeRefusal({
            kind: "parsesWithWarnings",
            version: name,
            detail: warnings.join("; "),
        });
    }
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
