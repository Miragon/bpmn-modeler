import { vi } from "vitest";

// A user scope every window shares, and a workspace scope per window, both keyed by the full setting path.
const scopes = { user: new Map<string, unknown>(), workspace: new Map<string, unknown>() };

vi.mock("vscode", () => {
    const ConfigurationTarget = { Global: 1, Workspace: 2, WorkspaceFolder: 3 };
    return {
        workspace: {
            getConfiguration: (section: string) => ({
                get: (key: string) => {
                    const path = `${section}.${key}`;
                    return scopes.workspace.has(path)
                        ? scopes.workspace.get(path)
                        : scopes.user.get(path);
                },
                // VS Code lands a write only when the Thenable resolves, never during the call.
                update: async (key: string, value: unknown, target: number) => {
                    await new Promise((landed) => setTimeout(landed));
                    (target === ConfigurationTarget.Global ? scopes.user : scopes.workspace).set(
                        `${section}.${key}`,
                        value,
                    );
                },
            }),
        },
        ConfigurationTarget,
    };
});

import { describeLintingPreferenceContract } from "@miragon/bpmn-modeler-core/testing";

import { VsCodeSettings } from "../../../../shared/adapter/out/VsCodeSettings";
import { VsCodeLintingPreference } from "./VsCodeLintingPreference";

describeLintingPreferenceContract(
    "VsCodeLintingPreference read back through VsCodeSettings",
    async () => {
        scopes.user.clear();
        scopes.workspace.clear();
        return {
            preference: new VsCodeLintingPreference(),
            settings: new VsCodeSettings(),
            // Another window shares the user scope and brings its own workspace scope.
            openAnotherProject: async () => {
                scopes.workspace.clear();
                return new VsCodeSettings();
            },
        };
    },
);
