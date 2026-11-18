import type {
    ElementReference,
    ElementState,
    ElementVersion,
    LayoutState,
    MergeElement,
    MergeResult,
} from "../mergeResult";
import type { ShapelessValueSources } from "../shapelessValues";

type VersionName = "base" | "current" | "incoming";

interface VersionFacts {
    readonly parent?: string;
    readonly container?: string;
    readonly lanes?: readonly string[];
    readonly references?: readonly ElementReference[];
    readonly parts?: readonly string[];
    readonly drawn?: boolean;
    readonly plane?: string;
}

export interface ElementSpec extends VersionFacts {
    readonly type?: string;
    readonly layout?: LayoutState;
    /** Facts that differ in one version; they replace the shared ones there. */
    readonly base?: VersionFacts;
    readonly current?: VersionFacts;
    readonly incoming?: VersionFacts;
}

const VERSIONS_HOLDING_THE_ELEMENT: Record<ElementState, readonly VersionName[]> = {
    unchanged: ["base", "current", "incoming"],
    takenFromCurrent: ["base", "current", "incoming"],
    takenFromIncoming: ["base", "current", "incoming"],
    sameChange: ["base", "current", "incoming"],
    bothChanged: ["base", "current", "incoming"],
    addedByCurrent: ["current"],
    addedByIncoming: ["incoming"],
    sameAddition: ["current", "incoming"],
    bothAdded: ["current", "incoming"],
    removedByCurrent: ["base", "incoming"],
    removedByIncoming: ["base", "current"],
    removedByBoth: ["base"],
    removedAndChanged: ["base", "incoming"],
    changedAndRemoved: ["base", "current"],
    onlyInCurrent: ["current"],
    onlyInIncoming: ["incoming"],
    differs: ["current", "incoming"],
};

export function refersTo(property: string, target: string, targetPart?: string): ElementReference {
    return targetPart === undefined ? { property, target } : { property, target, targetPart };
}

export function mergeElement(
    id: string,
    state: ElementState,
    spec: ElementSpec = {},
): MergeElement {
    const shared: ElementVersion = {
        parent: spec.parent,
        container: spec.container,
        lanes: spec.lanes ?? [],
        references: spec.references ?? [],
        parts: spec.parts ?? [],
        drawn: spec.drawn ?? true,
        plane: spec.plane,
    };
    const versions: Partial<Record<VersionName, ElementVersion>> = {};
    for (const name of VERSIONS_HOLDING_THE_ELEMENT[state]) {
        versions[name] = { ...shared, ...spec[name] };
    }
    return {
        id,
        type: spec.type ?? "bpmn:Task",
        state,
        layout: spec.layout ?? "unchanged",
        versions,
    };
}

export function mergeResult(...elements: MergeElement[]): MergeResult {
    return {
        hasBase: true,
        versionKeys: { base: "base", current: "current", incoming: "incoming" },
        elements,
    };
}

export function mergeResultWithoutBase(...elements: MergeElement[]): MergeResult {
    return { hasBase: false, versionKeys: { current: "current", incoming: "incoming" }, elements };
}

/** Sources for a result built by hand: no side names or writes a value. */
export const NO_SOURCES: ShapelessValueSources = {
    names: { current: new Map(), incoming: new Map() },
    snapshots: { current: new Map(), incoming: new Map() },
    handMergeTexts: new Map(),
};
