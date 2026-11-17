import type { ElementIdConvention } from "@miragon/bpmn-modeler";
import type { ElementIdConventionOptions } from "@miragon/bpmn-modeler-types";

import { loadLintModule } from "./surfaceModules";

/** The lint rule's convention for IDs generated from names; it lives behind `/lint`, which the editable surfaces load anyway. */
export async function loadElementIdConvention(
    options: ElementIdConventionOptions | undefined,
): Promise<ElementIdConvention> {
    const { createElementIdConvention } = await loadLintModule();
    return createElementIdConvention(options);
}
