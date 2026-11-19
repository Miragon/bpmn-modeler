/**
 * Host-adapter surface — the VS Code protocol adapter (Query/Command wiring,
 * `bootstrap`'s host handshake). Lives in the app, outside the publishable
 * `@miragon/bpmn-modeler` boundary.
 */
import { HostApiImpl } from "@miragon/bpmn-modeler-shared";

import type { BpmnWebviewCommand, BpmnWebviewHost } from "../../port/hostChannel";
import type { WebviewState } from "../../port/webviewState";
import { PreviewHost } from "./browserPreview/previewHost";

declare const process: { env: { NODE_ENV: string } };

/**
 * Returns the channel to the host application embedding this webview. In
 * `development` mode a {@link PreviewHost} is returned for standalone browser
 * runs (dead-code-eliminated in production); otherwise the real
 * {@link HostApiImpl} is used (VS Code, IntelliJ, and the desktop app all
 * inject the same `acquireVsCodeApi()` shim, so they share this path).
 */
export function getHostApi(): BpmnWebviewHost {
    if (process.env.NODE_ENV === "development") {
        return new PreviewHost();
    }
    return new HostApiImpl<WebviewState, BpmnWebviewCommand>();
}
