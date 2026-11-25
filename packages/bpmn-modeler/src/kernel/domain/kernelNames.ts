import { SURFACE_MODE_SERVICE } from "@miragon/bpmn-modeler-types/domain";

/**
 * The four DI names a feature may get from the kernel, and nothing beyond them.
 * `surfaceMode` and `surfaceRoots` only the kernel provides; `debounceInput` and
 * `diagramTemplate` are slots a feature fills and the kernel reads.
 */
export { SURFACE_MODE_SERVICE };

/** The canvas container, then the extra roots, known before construction. */
export const SURFACE_ROOTS = "surfaceRoots";

/** The panel input that still waits in its debounce. */
export const DEBOUNCE_INPUT = "debounceInput";

/** Optional: the XML `newDiagram` opens, asked before bpmn-js `createDiagram`. */
export const DIAGRAM_TEMPLATE = "diagramTemplate";

/** The names a feature may never provide. */
export const RESERVED_KERNEL_NAMES: readonly string[] = [SURFACE_MODE_SERVICE, SURFACE_ROOTS];
