import {
    createModeler,
    type BpmnModelerHandle,
    type DetectedEngine,
    type ModelerMode,
    type ThemeMode,
} from "@miragon/bpmn-modeler";
import { createViewer, type BpmnViewerHandle } from "@miragon/bpmn-modeler/viewer";
import { createDesigner, type BpmnDesignerHandle } from "@miragon/bpmn-modeler/design";
import * as lintModule from "@miragon/bpmn-modeler/lint";
import type { SurfaceMode } from "@miragon/bpmn-modeler-shared";
import { openReference } from "../../src";
import { registerDemoCustomGroup } from "../../src/demoCustomGroup";

/** Any of the three demo surfaces. The modeler handle is the superset. */
export type DemoSurfaceHandle = BpmnViewerHandle | BpmnDesignerHandle | BpmnModelerHandle;

/** Narrows a surface to the full modeler handle (the only one with `setMode`). */
export function isModelerHandle(handle: DemoSurfaceHandle): handle is BpmnModelerHandle {
    return "setMode" in handle;
}

export interface SurfaceContext {
    canvas: HTMLElement;
    panelMount: HTMLElement;
    theme: ThemeMode;
    engine: DetectedEngine;
    /** Forwarded from the modeler's `onModeChanged` — never fires on other surfaces. */
    onModelerModeChanged: (mode: ModelerMode) => void;
}

/**
 * Stands up the surface for `mode`, bound to the shared canvas + panel mount.
 * The one host capability wired on every surface is model navigation; the
 * modeler additionally lints in-page (the `/lint` subpath) and reports its live
 * mode changes. The demo custom group is registered on every surface so the
 * host slot is observable in all three modes.
 */
export async function createSurface(
    mode: SurfaceMode,
    ctx: SurfaceContext,
): Promise<DemoSurfaceHandle> {
    const { canvas, panelMount, theme, engine, onModelerModeChanged } = ctx;
    const propertiesPanel = { parent: panelMount };
    const capabilities = { modelNavigation: { openReference } };

    if (mode === "view") {
        const handle = await createViewer(canvas, { theme, propertiesPanel, capabilities });
        registerDemoCustomGroup(handle);
        return handle;
    }

    if (engine === undefined) {
        // Untagged model: Design is the editable engine-neutral surface. (View
        // returned above; Implement is unavailable and never reaches here.)
        const handle = await createDesigner(canvas, { theme, propertiesPanel, capabilities });
        registerDemoCustomGroup(handle);
        return handle;
    }

    // Tagged model in Design or Implement: one `createModeler` instance whose
    // `mode` toggles live — no `clipboard` option means the native browser
    // clipboard (the bootstrap-only `"native"` alias is gone).
    const handle = await createModeler(canvas, {
        engine,
        mode,
        theme,
        propertiesPanel,
        capabilities,
        linting: { module: lintModule },
        onLintResults: ({ results, unresolved }) => {
            console.debug("[demo] in-page lint", { results, unresolved });
        },
        onModeChanged: (m) => onModelerModeChanged(m),
    });
    registerDemoCustomGroup(handle);
    return handle;
}
