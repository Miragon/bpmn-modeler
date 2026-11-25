import type { Disposer } from "@miragon/bpmn-modeler-types";

export interface LifetimeEventBus {
    on(event: string, priority: number, listener: () => void): void;
}

// After every other diagram.init listener, so chrome a module adds then (the palette) comes first.
const AFTER_EVERY_MODULE = -1000;
// Before Canvas removes its container at 500, so a disposer still finds its DOM.
const BEFORE_THE_CANVAS = 1500;

/**
 * Installs page-level behaviour for one diagram: once its modules have all
 * initialised, until `diagram.destroy`. A construction that throws earlier
 * installs nothing; for one that throws later, its owner fires `diagram.destroy`.
 */
export function installForDiagramLifetime(
    eventBus: LifetimeEventBus,
    install: () => Disposer,
): void {
    let dispose: Disposer | undefined;
    eventBus.on("diagram.init", AFTER_EVERY_MODULE, () => {
        dispose = install();
    });
    eventBus.on("diagram.destroy", BEFORE_THE_CANVAS, () => {
        dispose?.();
        dispose = undefined;
    });
}
