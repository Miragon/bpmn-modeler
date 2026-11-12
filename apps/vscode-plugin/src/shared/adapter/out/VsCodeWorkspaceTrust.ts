import { workspace } from "vscode";

import { WorkspaceTrustPort } from "@miragon/bpmn-modeler-core";

/**
 * Workspace Trust. The extension declares no support for untrusted
 * workspaces, so VS Code does not run it in Restricted Mode, and the
 * standalone turns Workspace Trust off, where `isTrusted` is true. VS Code
 * reloads the window when the user withdraws trust, so only a grant arrives.
 */
export class VsCodeWorkspaceTrust implements WorkspaceTrustPort {
    isTrusted(): boolean {
        return workspace.isTrusted;
    }

    onDidChange(listener: () => void): { dispose(): void } {
        return workspace.onDidGrantWorkspaceTrust(listener);
    }
}
