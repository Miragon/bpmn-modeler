import { type EditableSurfaceMode, parseEditableMode } from "@miragon/bpmn-modeler-types/domain";

export type ModelerMode = EditableSurfaceMode;

export const MODE_ATTRIBUTE = "data-bpmn-mode";

export type SurfaceModeChange =
    | { readonly kind: "unchanged" }
    | { readonly kind: "changed"; readonly mode: EditableSurfaceMode };

// The panel filter alone defaults to design; the modeler opens in implement unless asked otherwise.
export function normalizeMode(mode: ModelerMode | undefined): ModelerMode {
    return mode === undefined ? "implement" : parseEditableMode(mode);
}

/** Asking for the mode the surface already holds changes nothing, so nobody is told. */
export function surfaceModeChange(
    current: EditableSurfaceMode,
    requested: EditableSurfaceMode,
): SurfaceModeChange {
    return requested === current ? { kind: "unchanged" } : { kind: "changed", mode: requested };
}
