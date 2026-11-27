import type { ElementIdProposals } from "@miragon/bpmn-modeler-types";

import type { ElementIdOptions, ElementIdsService } from "./ElementIdsService";

/** A surface's DI injector, such as `surface.getService("injector")`. */
export interface ElementIdsInjector {
    get<T>(name: string, strict: false): T | null;
}

const NO_ELEMENT_IDS: ElementIdProposals = { rows: [] };

function elementIdsOf(injector: ElementIdsInjector): ElementIdsService | null {
    return injector.get<ElementIdsService>("elementIds", false);
}

/** No rows on a surface built without the element-ID module. */
export function proposeSurfaceElementIds(
    injector: ElementIdsInjector,
    unchecked: readonly string[] | undefined,
): ElementIdProposals {
    return elementIdsOf(injector)?.list(unchecked && new Set(unchecked)) ?? NO_ELEMENT_IDS;
}

/** Renames nothing on a surface built without the element-ID module. */
export function renameSurfaceElementIds(
    injector: ElementIdsInjector,
    unchecked: readonly string[],
): number {
    return elementIdsOf(injector)?.rename(new Set(unchecked)) ?? 0;
}

export function applyElementIdSettings(
    injector: ElementIdsInjector,
    options: ElementIdOptions,
): void {
    elementIdsOf(injector)?.configure(options);
}
