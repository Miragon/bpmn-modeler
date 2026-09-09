import { createViewer } from "@miragon/bpmn-modeler/viewer";
import type { ThemeMode } from "@miragon/bpmn-modeler/viewer";
import { mountDemoHeader, openReference } from "../src";
import { MODELS } from "../src/registry";

// The viewer ships its own lean stylesheet (`@miragon/bpmn-modeler/viewer.css`),
// separate from the modeler's `styles.css`. A JS import lets Vite process it (and
// its node_modules `@import`s) in dev and build — a raw `<link>` to the package
// source escapes the dev-server root and 404s. This is the epic's regression
// check: the viewer page must render, select, hover, zoom/pan, switch themes,
// and show a readonly properties panel (every entry disabled) with no editing
// affordance (no palette, no keyboard delete). The one context-pad entry is
// navigate, opted into via `capabilities.modelNavigation` below.
import "../../../packages/bpmn-modeler/src/styles/viewer.css";

/**
 * In-page readonly viewer demo — the in-repo consumer of the `/viewer` subpath.
 * No host, no bootstrap: one `createViewer` handle over a registry model and a
 * live selection readout. Theme comes from the shared demo header, which seeds
 * the initial `createViewer` mode and routes later changes to the public
 * `viewer.setTheme` API (the epic's regression check).
 */
async function main(): Promise<void> {
    // The header seeds the initial theme (below) and routes later changes to
    // this handle, which only exists after createViewer resolves — hence the ref.
    const viewerRef: { current?: Awaited<ReturnType<typeof createViewer>> } = {};
    const { themeMode } = mountDemoHeader(
        "viewer",
        {},
        { onThemeChange: (mode) => viewerRef.current?.setTheme(mode as ThemeMode) },
    );

    const canvas = document.getElementById("canvas");
    const properties = document.getElementById("properties");
    const selectionOut = document.getElementById("selection");
    if (!canvas || !properties || !selectionOut) {
        throw new Error("viewer demo: missing host elements");
    }

    const model = MODELS.find((m) => m.type === "bpmn") ?? MODELS[0];

    const viewer = await createViewer(canvas, {
        theme: themeMode as ThemeMode,
        propertiesPanel: { parent: properties },
        // The one engine-neutral host capability on /viewer (#1445): a Call
        // Activity / Business Rule Task gets a "Navigate to referenced model"
        // context-pad entry — the single interaction a readonly surface still
        // offers. Omitting `capabilities` renders no entry.
        capabilities: { modelNavigation: { openReference } },
    });
    viewerRef.current = viewer;
    await viewer.loadDiagram(model.xml);

    viewer.selection.onSelectionChanged((ids) => {
        selectionOut.textContent = ids.length > 0 ? ids.join(", ") : "Nothing selected";
    });
}

void main();
