// Keep the engine modeler alive across mode changes so replace/copy-paste preserves engine extensions.

export type ModelerMode = "design" | "implement";

export const MODE_ATTRIBUTE = "data-bpmn-mode";

// The panel defaults to design when its config is absent; the modeler must explicitly default to implement.
export function normalizeMode(mode: ModelerMode | undefined): ModelerMode {
    return mode ?? "implement";
}

export interface ModePorts {
    getFilterMode(): ModelerMode;
    // The filter emits providersChanged itself, so no separate panel refresh is needed.
    setFilterMode(mode: ModelerMode): void;
    setModeAttribute(mode: ModelerMode): void;
    setLintMode(mode: ModelerMode): void;
    onModeChanged?: (mode: ModelerMode) => void;
}

export function applyMode(ports: ModePorts, mode: ModelerMode): void {
    if (ports.getFilterMode() === mode) {
        return;
    }
    ports.setFilterMode(mode);
    ports.setModeAttribute(mode);
    ports.setLintMode(mode);
    ports.onModeChanged?.(mode);
}
