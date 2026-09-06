import "@miragon/bpmn-modeler"; // side-effect CSS shared by all three surfaces
import "./modeler.css";
import type { ThemeMode } from "@miragon/bpmn-modeler";
import {
    initResizer,
    installPanelShortcuts,
    mountModeStrip,
    resolveInitialMode,
} from "@miragon/bpmn-modeler-shared";
import { mountDemoHeader } from "../src";
import { getActiveModel } from "../src/registry";
import { ModeSession } from "./modeSwitch/ModeSession";
import { readRequestedMode, writeModeToUrl } from "./modeSwitch/modeUrl";

/**
 * Composition root for the BPMN modeler page. Instead of the webview
 * `bootstrap()`, it hosts all three package surfaces (viewer / design / modeler)
 * behind a canvas-side mode strip (#1446): one {@link ModeSession} owns the live
 * instance and swaps it as the strip selects a mode.
 */
async function main(): Promise<void> {
    // The session is created after the header + strip, whose callbacks reference
    // it, so it lives behind a ref (the same pattern viewer.ts / design.ts use).
    const sessionRef: { current?: ModeSession } = {};

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
    const initialMode = resolveInitialMode(readRequestedMode(), engine);

    const strip = mountModeStrip({
        host,
        stripEl,
        resizerEl,
        panelHandle,
        // The demo ships no i18n; labels pass through unchanged.
        translate: (template) => template,
        onSelect: (mode) => sessionRef.current?.requestMode(mode),
        onEscape: focusCanvas,
    });
    strip.render({ mode: initialMode, engine, busy: true });

    sessionRef.current = await ModeSession.start(initialMode, model.xml, {
        canvas,
        panelMount,
        engine,
        initialTheme: themeMode as ThemeMode,
        onModeApplied: (mode) => {
            writeModeToUrl(mode);
            strip.render({ mode, engine, busy: false });
        },
        onSwitchStateChanged: (busy) => {
            if (sessionRef.current) {
                strip.render({ mode: sessionRef.current.getMode(), engine, busy });
            }
        },
        onError: (error) => console.error("[demo] mode switch failed", error),
    });

    // `p` focuses the panel mount (not the strip); `Shift+P` toggles the panel —
    // in every mode, since the session always exposes a canvas handle.
    installPanelShortcuts(
        { handle: panelHandle, focusCanvas, isCanvasFocused },
        { getPanelRoot: () => panelMount },
    );
}

void main();
