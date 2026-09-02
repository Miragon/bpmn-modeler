import { createViewer } from "@miragon/bpmn-modeler/viewer";
import type { ThemeMode } from "@miragon/bpmn-modeler/viewer";
import { mountDemoHeader } from "../src";
import { MODELS } from "../src/registry";

// The viewer ships its own lean stylesheet (`@miragon/bpmn-modeler/viewer.css`),
// separate from the modeler's `styles.css`. A JS import lets Vite process it (and
// its node_modules `@import`s) in dev and build — a raw `<link>` to the package
// source escapes the dev-server root and 404s. This is the epic's regression
// check: the viewer page must render, select, hover, zoom/pan, and switch themes
// with no editing affordance (no palette, context pad, or keyboard delete).
import "../../../packages/bpmn-modeler/src/styles/viewer.css";

/**
 * In-page readonly viewer demo — the in-repo consumer of the `/viewer` subpath.
 * No host, no bootstrap: one `createViewer` handle over a registry model, a theme
 * `<select>` wired to `setTheme`, and a live selection readout.
 */
async function main(): Promise<void> {
    mountDemoHeader("viewer");

    const canvas = document.getElementById("canvas");
    const themeSelect = document.getElementById("theme") as HTMLSelectElement | null;
    const selectionOut = document.getElementById("selection");
    if (!canvas || !themeSelect || !selectionOut) {
        throw new Error("viewer demo: missing host elements");
    }

    const model = MODELS.find((m) => m.type === "bpmn") ?? MODELS[0];

    const viewer = await createViewer(canvas, { theme: themeSelect.value as ThemeMode });
    await viewer.loadDiagram(model.xml);

    themeSelect.addEventListener("change", () => {
        viewer.setTheme(themeSelect.value as ThemeMode);
    });

    viewer.selection.onSelectionChanged((ids) => {
        selectionOut.textContent = ids.length > 0 ? ids.join(", ") : "Nothing selected";
    });
}

void main();
