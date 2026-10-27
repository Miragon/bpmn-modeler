import { beforeEach, describe, expect, it, vi } from "vitest";

const updateMock = vi.fn();
const getMock = vi.fn();
const getConfigurationMock = vi.fn((_section: string) => ({ get: getMock, update: updateMock }));

vi.mock("vscode", () => ({
    workspace: {
        getConfiguration: (section: string) => getConfigurationMock(section),
    },
    ConfigurationTarget: { Global: 1, Workspace: 2, WorkspaceFolder: 3 },
}));

import { ConfigurationTarget } from "vscode";

import { DEFAULT_LINTING_ENABLED } from "@miragon/bpmn-modeler-core";

import { lintingEnabled, setLanguage, setLintingEnabled } from "./modelerConfiguration";

beforeEach(() => {
    getConfigurationMock.mockClear();
    getMock.mockReset();
    updateMock.mockReset();
    updateMock.mockResolvedValue(undefined);
});

describe("modelerConfiguration", () => {
    it.each([
        { stored: false, enabled: false },
        { stored: true, enabled: true },
        { stored: undefined, enabled: DEFAULT_LINTING_ENABLED },
        { stored: "off", enabled: DEFAULT_LINTING_ENABLED },
    ])("reads a stored linting flag $stored as $enabled", ({ stored, enabled }) => {
        getMock.mockImplementation((key: string) => (key === "linting.enabled" ? stored : 0));

        expect(lintingEnabled()).toBe(enabled);
        expect(getConfigurationMock).toHaveBeenCalledWith("miragon.bpmnModeler");
    });

    it.each([
        {
            preference: "the language",
            write: () => setLanguage("de"),
            key: "language",
            value: "de",
        },
        {
            preference: "the linting switch",
            write: () => setLintingEnabled(false),
            key: "linting.enabled",
            value: false,
        },
    ])("writes $preference for the user, not the workspace", async ({ write, key, value }) => {
        await write();

        expect(getConfigurationMock).toHaveBeenCalledWith("miragon.bpmnModeler");
        expect(updateMock).toHaveBeenCalledWith(key, value, ConfigurationTarget.Global);
    });
});
