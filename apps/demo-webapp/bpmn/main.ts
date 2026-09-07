import "@miragon/bpmn-modeler"; // side-effect CSS shared by all three surfaces
import "./modeler.css";
import type { ThemeMode } from "@miragon/bpmn-modeler";
import { initResizer, installPanelShortcuts } from "@miragon/bpmn-modeler-shared";
import {
    createModeSession,
    mountModeStrip,
    type ModeSession,
    type ModeStrip,
} from "@miragon/bpmn-modeler/mode";
import { mountDemoHeader } from "../src";
import { getActiveModel } from "../src/registry";
import { buildDemoSurfaces } from "./modeSwitch/surfaces";
import { readRequestedMode, writeModeToUrl } from "./modeSwitch/modeUrl";

/**
 * Composition root for the BPMN modeler page. Instead of the webview
 * `bootstrap()`, it hosts all three package surfaces (viewer / design / modeler)
 * behind a canvas-side mode strip (#1446): one {@link ModeSession} from
 * `@miragon/bpmn-modeler/mode` owns the live instance and swaps it as the strip
 * selects a mode.
 */
async function main(): Promise<void> {
    // The session + strip reference each other from callbacks created before both
    // exist (the header's theme callback, the session's render hooks, the strip's
    // onSelect), so each lives behind a ref — the pattern the webview bootstrap
    // and the old demo ModeSession used.
    const sessionRef: { current?: ModeSession } = {};
    const stripRef: { current?: ModeStrip } = {};

    const { themeMode } = mountDemoHeader(
        "bpmn",
        {},
        { onThemeChange: (mode) => sessionRef.current?.setTheme(mode as ThemeMode) },
    );

    const canvas = document.getElementById("js-canvas");
    const host = document.getElementById("js-properties-panel");
    const panelMount = document.getElementById("js-properties-panel-mount");
    const stripEl = document.getElementById("js-mode-strip");
    const resizerEl = document.getElementById("js-panel-resizer");
    if (!canvas || !host || !panelMount || !stripEl || !resizerEl) {
        throw new Error("bpmn modeler demo: missing host elements");
    }

    const panelHandle = initResizer({
        getToggleLabel: (state) =>
            (state === "collapsed" ? "Open properties panel" : "Close properties panel") +
            " (Shift+P)",
    });

    const focusCanvas = (): void =>
        sessionRef.current?.getHandle().getService<{ focus(): void }>("canvas").focus();
    const isCanvasFocused = (): boolean =>
        sessionRef.current
            ?.getHandle()
            .getService<{ isFocused(): boolean }>("canvas")
            .isFocused() ?? false;

    const model = getActiveModel("bpmn");
    const engine = model.engine;

    const session = await createModeSession({
        container: canvas,
        engine,
        surfaces: buildDemoSurfaces(panelMount),
        initialMode: readRequestedMode(),
        theme: themeMode as ThemeMode,
        onModeChanged: (mode) => {
            writeModeToUrl(mode);
            stripRef.current?.render({ mode, engine, busy: false });
        },
        onSwitchStateChanged: (busy) => {
            stripRef.current?.render({ mode: session.getMode(), engine, busy });
        },
        onError: (error) => console.error("[demo] mode switch failed", error),
    });
    sessionRef.current = session;

    const strip = mountModeStrip({
        host,
        stripEl,
        resizerEl,
        revealPanel: () => panelHandle.setVisible(true),
        // The demo ships no i18n; labels pass through unchanged.
        translate: (template) => template,
        onSelect: (mode) => void session.requestMode(mode),
        onEscape: focusCanvas,
    });
    stripRef.current = strip;
    strip.render({ mode: session.getMode(), engine, busy: true });

    // The session builds the initial surface without loading a diagram; the demo
    // owns the first import + fit. bpmn-js does not auto-fit on import and there
    // is no saved view state on the first open, so a diagram authored off-origin
    // would render off-screen. Recreate switches restore a captured viewbox instead.
    const handle = session.getHandle();
    await handle.loadDiagram(model.xml);
    handle.viewport.fitViewport();
    writeModeToUrl(session.getMode());
    strip.render({ mode: session.getMode(), engine, busy: false });

    // `p` focuses the panel mount (not the strip); `Shift+P` toggles the panel —
    // in every mode, since the session always exposes a canvas handle.
    installPanelShortcuts(
        { handle: panelHandle, focusCanvas, isCanvasFocused },
        { getPanelRoot: () => panelMount },
    );
}

void main();
