import "@fontsource-variable/geist/wght.css";
import "../adapter/in/styles.css";
import "../adapter/in/diff.css";

import {
    applyPageThemeScope,
    createHostThemeAdapter,
    installGlobalErrorForwarding,
    resolveHostThemeKind,
} from "@miragon/bpmn-modeler-shared";
import { createDiffViewer } from "@miragon/dmn-modeler";

import { DiffMode } from "../adapter/in/diffMode";
import type { DmnDiffPaneHost } from "../port/dmnHost";

/**
 * Starts the page as one side of a DMN diff: a read-only viewer in
 * `#js-canvas`, the legend over it, and the theme following the IDE.
 *
 * @returns Stops the pane and destroys its viewer.
 */
export function bootstrapDiffPane(host: DmnDiffPaneHost): () => void {
    const canvas = requireElement("#js-canvas");
    const chrome = requireElement("#js-drop-zone");
    document.body.classList.add("dmn-diff-page");
    const stopErrorForwarding = installGlobalErrorForwarding((command) =>
        host.postMessage(command),
    );

    const viewer = createDiffViewer(canvas, {
        theme: resolveHostThemeKind(),
        // The legend floats there: the file name and one row on a pane of usual width.
        topInset: 96,
    });
    const themeAdapter = createHostThemeAdapter((kind) => {
        applyPageThemeScope("data-dmn-theme", kind);
        viewer.setTheme(kind);
    });
    themeAdapter.setMode("automatic");

    const stopMode = new DiffMode(viewer, chrome, host).start();
    return () => {
        stopMode();
        themeAdapter.dispose();
        stopErrorForwarding();
        viewer.destroy();
    };
}

function requireElement(selector: string): HTMLElement {
    const element = document.querySelector<HTMLElement>(selector);
    if (!element) {
        throw new Error(`Missing required DMN diff element <${selector}>`);
    }
    return element;
}
