/**
 * Runtime **design / implement** mode for a live `createModeler` instance
 * (issue #1442, epic #1438 "one document, three modes").
 *
 * Unlike the `/design` subpath — a *separate* engine-neutral factory for
 * untagged models — this is a runtime toggle on the same Camunda-tagged
 * `createModeler` instance: same bpmn-js modeler, same moddle, same behaviours,
 * same command stack. Nothing in the DI module graph is added or removed on a
 * toggle, so `zeebe:*` / `camunda:*` extensions are never at risk (a re-created
 * engine-neutral instance would drop them through `ModdleCopy` on replace /
 * copy-paste). What changes is purely presentational: the properties panel is
 * filtered to its engine-neutral surface and the engine chrome (element-template
 * chooser, token-simulation toggle) is hidden.
 *
 * The single source of truth for the mode is the properties panel's
 * `propertiesPanelModeFilter` service — it already holds the mode and fires
 * `propertiesPanel.providersChanged` from its own `setMode`. This helper is a
 * pure orchestration layer over a small {@link ModePorts} seam (the
 * `viewState.ts` pattern), so it needs no live modeler to unit-test.
 */

export type ModelerMode = "design" | "implement";

/**
 * The attribute stamped on the container + panel parent so CSS can hide engine
 * chrome in design mode. Mirrors `data-bpmn-theme` (see `theme.ts`).
 */
export const MODE_ATTRIBUTE = "data-bpmn-mode";

/**
 * Resolves the caller's optional `mode` to a concrete one. The default is
 * `"implement"` — an engine-tagged model shows its full Camunda surface unless
 * a host opts into design. This must be applied at the `createModeler` seam:
 * the panel's `ModeFilterProvider` defaults to `"design"` when its config key is
 * absent, so omitting the key would silently flip every consumer to design.
 */
export function normalizeMode(mode: ModelerMode | undefined): ModelerMode {
    return mode ?? "implement";
}

/**
 * The DI-service seam {@link applyMode} drives, so the orchestration stays pure
 * and unit-testable. Consumers reach this through the composed
 * {@link BpmnModeler.setMode} handle method, never the services directly.
 */
export interface ModePorts {
    /** The panel filter's current mode — `propertiesPanelModeFilter.getMode()`. */
    getFilterMode(): ModelerMode;
    /**
     * Switches the panel filter's mode. The filter fires
     * `propertiesPanel.providersChanged` itself, so a live panel re-derives
     * immediately — no separate refresh here.
     */
    setFilterMode(mode: ModelerMode): void;
    /**
     * Stops any active token simulation — `toggleMode.toggleMode(false)`, a safe
     * no-op when inactive. Called only on the implement→design edge so the
     * simulation palette/context pad cleanly restore before the chrome hides.
     */
    stopTokenSimulation(): void;
    /** Stamps {@link MODE_ATTRIBUTE} on the container + panel parent, in both modes. */
    setModeAttribute(mode: ModelerMode): void;
    /** Optional outbound notification, fired once per actual change (the epic's `modeChanged`). */
    onModeChanged?: (mode: ModelerMode) => void;
}

/**
 * Applies `mode` to a live instance through {@link ModePorts}. A no-op when the
 * filter already holds `mode`, so the attribute stamp and the `onModeChanged`
 * callback never re-fire on a redundant call. Otherwise: flip the filter →
 * (design entry only) stop token simulation → stamp the attribute → notify.
 */
export function applyMode(ports: ModePorts, mode: ModelerMode): void {
    if (ports.getFilterMode() === mode) {
        return;
    }
    ports.setFilterMode(mode);
    if (mode === "design") {
        ports.stopTokenSimulation();
    }
    ports.setModeAttribute(mode);
    ports.onModeChanged?.(mode);
}
