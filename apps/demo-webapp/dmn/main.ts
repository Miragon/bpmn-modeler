import "@miragon/dmn-modeler"; // side-effect CSS (dmn-js vendor + scoped dark theme)
import "./modeler.css";
import { createModeler, type DmnModelerHandle, type DmnThemeMode } from "@miragon/dmn-modeler";
import { initResizer, installPanelShortcuts } from "@miragon/bpmn-modeler-shared";
import { getActiveModel, mountDemoHeader } from "../src";

/**
 * Composition root for the DMN modeler page — the in-repo consumer of the
 * `@miragon/dmn-modeler` package, mirroring the BPMN pages. Instead of the
 * webview `bootstrap()` + private host protocol, it stands up one
 * {@link DmnModelerHandle} over a registry model. Theme comes from the shared
 * demo header, which seeds the initial `createModeler` mode and routes later
 * changes to the public `setTheme` API (a forced mode must override the
 * package's own `data-dmn-theme`, which "automatic" drives off the OS).
 */
async function main(): Promise<void> {
    // The header's theme callback fires before the handle exists (createModeler
    // is async), so it routes through a ref — the pattern the bpmn pages use.
    const handleRef: { current?: DmnModelerHandle } = {};
    const { themeMode } = mountDemoHeader(
        "dmn",
        {},
        { onThemeChange: (mode) => handleRef.current?.setTheme(mode as DmnThemeMode) },
    );

    const canvas = document.getElementById("js-canvas");
    const propertiesPanel = document.getElementById("js-properties-panel");
    if (!canvas || !propertiesPanel) {
        throw new Error("dmn modeler demo: missing host elements");
    }

    const panelHandle = initResizer({
        getToggleLabel: (state) =>
            (state === "collapsed" ? "Open properties panel" : "Close properties panel") +
            " (Shift+P)",
    });

    const handle = await createModeler(canvas, {
        propertiesPanel: { parent: propertiesPanel },
        theme: themeMode as DmnThemeMode,
    });
    handleRef.current = handle;
    await handle.loadDiagram(getActiveModel("dmn").xml);

    // `p` / `Shift+P` / Escape shortcuts, gated to the DRD view so they stay
    // inert in decision-table and literal-expression cell editing.
    installPanelShortcuts({
        handle: panelHandle,
        focusCanvas: () => handle.focusCanvas(),
        isCanvasFocused: () => handle.isCanvasFocused(),
        isEnabled: () => handle.isDrdViewActive(),
        escapeToCanvas: true,
    });
}

void main();
