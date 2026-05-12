import { window } from "vscode";

import type { WorkspacePrompts } from "./BpmnIqWorkspaceContextResolver";

/**
 * Default {@link WorkspacePrompts} implementation that talks to VS Code's
 * `window` API.  Lives in its own file so the resolver itself can be
 * imported by Vitest specs without dragging in the vscode runtime.
 */
export const vscodeWorkspacePrompts: WorkspacePrompts = {
    async pickWorkspaceMode() {
        const choice = await window.showQuickPick(
            [
                { label: "$(add) Create new workspace", value: "new" as const },
                { label: "$(link) Join existing Workspace ID…", value: "join" as const },
            ],
            {
                placeHolder: "No .bpmn-iq/workspace.json found — how should we sync?",
                ignoreFocusOut: true,
            },
        );
        return choice?.value ?? null;
    },
    async inputWorkspaceId() {
        const value = await window.showInputBox({
            prompt: "Existing Workspace ID",
            placeHolder: "Paste the Workspace ID a teammate shared with you",
            ignoreFocusOut: true,
        });
        return value ?? null;
    },
    async inputWorkspaceName(defaultName: string) {
        const value = await window.showInputBox({
            prompt: "Workspace name",
            value: defaultName,
            ignoreFocusOut: true,
        });
        return value ?? null;
    },
};
