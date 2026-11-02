import { beforeEach, describe, expect, it, vi } from "vitest";

const settings = new Map<string, unknown>();
const writes: { key: string; value: unknown; target: number }[] = [];

vi.mock("vscode", () => ({
    workspace: {
        getConfiguration: () => ({
            get: (key: string) => settings.get(key),
            update: (key: string, value: unknown, target: number) => {
                writes.push({ key, value, target });
                settings.set(key, value);
                return Promise.resolve();
            },
        }),
    },
    ConfigurationTarget: { Global: 1, Workspace: 2, WorkspaceFolder: 3 },
}));

import { ConfigurationTarget } from "vscode";

import { VsCodeLintingPreference } from "./VsCodeLintingPreference";

beforeEach(() => {
    settings.clear();
    writes.length = 0;
});

describe("VsCodeLintingPreference", () => {
    it("writes the choice to the user settings", async () => {
        settings.set("linting.enabled", true);

        await new VsCodeLintingPreference().setLintingEnabled(false);

        expect(writes).toEqual([
            { key: "linting.enabled", value: false, target: ConfigurationTarget.Global },
        ]);
    });
});
