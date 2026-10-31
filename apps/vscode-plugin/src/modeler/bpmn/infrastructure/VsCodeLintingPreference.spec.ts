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
    it("writes a changed choice to the user settings and reports the change", async () => {
        settings.set("linting.enabled", true);

        const changed = await new VsCodeLintingPreference().setLintingEnabled(false);

        expect(changed).toBe(true);
        expect(writes).toEqual([
            { key: "linting.enabled", value: false, target: ConfigurationTarget.Global },
        ]);
    });

    it.each([true, false])(
        "keeps a stored choice of %s and reports it unchanged, so the editor re-sends the lint state",
        async (stored) => {
            settings.set("linting.enabled", stored);

            const changed = await new VsCodeLintingPreference().setLintingEnabled(stored);

            expect(changed).toBe(false);
            expect(writes).toEqual([]);
        },
    );
});
