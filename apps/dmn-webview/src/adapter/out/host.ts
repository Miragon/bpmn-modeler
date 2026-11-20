/**
 * Host-adapter surface — the VS Code protocol adapter (Query/Command wiring,
 * `bootstrap`'s host handshake). Lives in the app, outside the publishable
 * `@miragon/dmn-modeler` boundary.
 */
import { HostApiImpl } from "@miragon/bpmn-modeler-shared";
import type { DmnDiffPaneCommand, DmnEditorCommand, WebviewSurface } from "@miragon/bpmn-modeler-shared";
import type { DiffSide } from "@miragon/bpmn-modeler-types";

import type { DmnDiffPaneHost, DmnHost, WebviewState } from "../../port/dmnHost";
import { DiffPanePreviewHost } from "./browserPreview/diffPanePreviewHost";
import { PreviewHost } from "./browserPreview/previewHost";
import { previewDiffSide } from "./browserPreview/previewMode";

declare const process: { env: { NODE_ENV: string } };

/**
 * Returns the channel to the host application embedding this webview. In
 * `development` mode a {@link PreviewHost} is returned for standalone browser
 * runs (dead-code-eliminated in production); otherwise the real
 * {@link HostApiImpl} is used (VS Code, IntelliJ, and the desktop app all
 * inject the same `acquireVsCodeApi()` shim, so they share this path).
 */
export function getHostApi(): DmnHost {
    if (process.env.NODE_ENV === "development") {
        return new PreviewHost();
    }
    return new HostApiImpl<WebviewState, DmnEditorCommand>();
}

const DIFF_PANE: WebviewSurface = "dmnDiffPane";

/**
 * Whether this page is one side of a DMN diff: the host's HTML names it on
 * `<body data-surface>`, or the preview's `?mode=diff-before|diff-after` asks.
 */
export function isDiffPane(): boolean {
    return document.body.dataset.surface === DIFF_PANE || requestedPreviewDiffSide() !== undefined;
}

/** The channel of a diff pane; the preview serves the shipping change itself. */
export function getDiffPaneHostApi(): DmnDiffPaneHost {
    if (process.env.NODE_ENV === "development") {
        return new DiffPanePreviewHost(requestedPreviewDiffSide() ?? "after");
    }
    return new HostApiImpl<WebviewState, DmnDiffPaneCommand>();
}

function requestedPreviewDiffSide(): DiffSide | undefined {
    if (process.env.NODE_ENV !== "development") {
        return undefined;
    }
    return previewDiffSide(location.search);
}
