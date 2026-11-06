import { vi } from "vitest";

// A user scope every window shares, and a workspace scope per window.
const scopes = { user: new Map<string, unknown>(), workspace: new Map<string, unknown>() };

vi.mock("vscode", () => {
    const ConfigurationTarget = { Global: 1, Workspace: 2, WorkspaceFolder: 3 };
    return {
        workspace: {
            getConfiguration: () => ({
                get: (key: string) =>
                    scopes.workspace.has(key) ? scopes.workspace.get(key) : scopes.user.get(key),
                update: async (key: string, value: unknown, target: number) => {
                    (target === ConfigurationTarget.Global ? scopes.user : scopes.workspace).set(
                        key,
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
