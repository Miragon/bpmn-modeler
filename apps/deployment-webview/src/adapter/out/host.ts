import { HostApiImpl, type DeploymentSidebarCommand } from "@miragon/bpmn-modeler-shared";

import type { DeploymentHost, WebviewState } from "../../port/deploymentHost";
import { PreviewHost } from "./browserPreview/previewHost";

declare const process: { env: { NODE_ENV: string } };

/**
 * Returns the channel to the host application embedding this webview. In
 * `development` mode a {@link PreviewHost} is returned for standalone browser
 * runs (dead-code-eliminated in production); otherwise the real
 * {@link HostApiImpl} is used (VS Code, IntelliJ, and the desktop app all
 * inject the same `acquireVsCodeApi()` shim, so they share this path).
 */
export function getHostApi(): DeploymentHost {
    if (process.env.NODE_ENV === "development") {
        return new PreviewHost();
    }
    return new HostApiImpl<WebviewState, DeploymentSidebarCommand>();
}
