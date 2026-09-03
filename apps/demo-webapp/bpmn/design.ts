import { createDesigner } from "@miragon/bpmn-modeler/design";
import type { ThemeMode } from "@miragon/bpmn-modeler/design";
import { mountDemoHeader } from "../src";
import { MODELS } from "../src/registry";

// The design surface ships its own lean stylesheet
// (`@miragon/bpmn-modeler/design.css`), separate from the modeler's `styles.css`.
// A JS import lets Vite process it (and its node_modules `@import`s) in dev and
// build. This is the epic's regression check: the design page must edit
// (palette / context pad / append menu), show only the engine-neutral panel (no
// Camunda tabs), and export XML carrying no `modeler:executionPlatform`.
import "../../../packages/bpmn-modeler/src/styles/design.css";

/**
 * In-page engine-neutral design demo — the in-repo consumer of the `/design`
 * subpath. No host, no bootstrap: one `createDesigner` handle over a registry
 * model. Theme comes from the shared demo header, which seeds the initial mode
 * and routes later changes to the public `designer.setTheme` API.
 */
async function main(): Promise<void> {
    const designerRef: { current?: Awaited<ReturnType<typeof createDesigner>> } = {};
    const { themeMode } = mountDemoHeader(
        "design",
        {},
        { onThemeChange: (mode) => designerRef.current?.setTheme(mode as ThemeMode) },
    );

    const canvas = document.getElementById("canvas");
    const panel = document.getElementById("properties");
    if (!canvas || !panel) {
        throw new Error("design demo: missing host elements");
    }

    const model = MODELS.find((m) => m.type === "bpmn") ?? MODELS[0];

    const designer = await createDesigner(canvas, {
        propertiesPanel: { parent: panel },
        theme: themeMode as ThemeMode,
    });
    designerRef.current = designer;
    await designer.loadDiagram(model.xml);
}

void main();
