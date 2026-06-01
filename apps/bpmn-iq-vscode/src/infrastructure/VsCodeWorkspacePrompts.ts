import { window } from "vscode";

import type { WorkspacePrompts } from "./BpmnIqWorkspaceContextResolver";

/**
 * Default {@link WorkspacePrompts} implementation that talks to VS Code's
 * `window` API.  Tests substitute a different implementation of the same
 * interface so the resolver can be driven with deterministic answers
 * without mocking the entire vscode namespace.
 */
export class VsCodeWorkspacePrompts implements WorkspacePrompts {
    async pickWorkspaceMode(): Promise<"new" | "join" | null> {
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
    }

    async inputWorkspaceId(): Promise<string | null> {
        const value = await window.showInputBox({
            prompt: "Existing Workspace ID",
            placeHolder: "Paste the Workspace ID a teammate shared with you",
            ignoreFocusOut: true,
        });
        return value ?? null;
    }

    async inputWorkspaceName(defaultName: string): Promise<string | null> {
        const value = await window.showInputBox({
            prompt: "Workspace name",
            value: defaultName,
            ignoreFocusOut: true,
        });
        return value ?? null;
    }
}
