import type { SurfaceMode } from "@miragon/bpmn-modeler-types/domain";

/** What the host's file query says about the editor's modes. */
export interface HostModeOffer {
    /** `false`: the host offers no View / Design / Implement switch. Absent: it offers one. */
    readonly modeSwitch?: boolean;
    readonly defaultMode?: SurfaceMode;
}

export interface ModeEntry {
    readonly showsModeSwitch: boolean;
    /** The mode asked of `resolveInitialMode`; `null` lands on the engine's default mode. */
    readonly requestedMode: SurfaceMode | null;
}

/**
 * Without a switch the user could not leave a remembered or preset mode, so
 * the editor lands on the engine's default: Implement on a model with an
 * execution platform, Design on one without.
 */
export function modeEntry(
    host: HostModeOffer | undefined,
    savedMode: SurfaceMode | undefined,
): ModeEntry {
    if (host?.modeSwitch === false) {
        return { showsModeSwitch: false, requestedMode: null };
    }
    return { showsModeSwitch: true, requestedMode: savedMode ?? host?.defaultMode ?? null };
}
