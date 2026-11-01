import { beforeEach, describe, expect, it, vi } from "vitest";

const updateMock = vi.fn();
const getMock = vi.fn();
const getConfigurationMock = vi.fn((_section: string) => ({ get: getMock, update: updateMock }));
const subscription = { dispose: vi.fn() };
let configurationListener: (event: {
    affectsConfiguration(section: string): boolean;
}) => void = () => undefined;

vi.mock("vscode", () => ({
    workspace: {
        getConfiguration: (section: string) => getConfigurationMock(section),
        onDidChangeConfiguration: (listener: typeof configurationListener) => {
            configurationListener = listener;
            return subscription;
        },
    },
    ConfigurationTarget: { Global: 1, Workspace: 2, WorkspaceFolder: 3 },
}));

import { ConfigurationTarget } from "vscode";

import { DEFAULT_MODELER_SETTINGS, SettingChange } from "@miragon/bpmn-modeler-core";

import {
    lintingEnabled,
    onDidChangeModelerSetting,
    setLanguage,
    setLintingEnabled,
} from "./modelerConfiguration";

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
        { stored: undefined, enabled: DEFAULT_MODELER_SETTINGS.lintingEnabled },
        { stored: "off", enabled: DEFAULT_MODELER_SETTINGS.lintingEnabled },
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

    it("names a changed setting by its key below miragon.bpmnModeler", () => {
        const received: SettingChange[] = [];
        const disposable = onDidChangeModelerSetting((change) => received.push(change));

        configurationListener({
            affectsConfiguration: (section) => section === "miragon.bpmnModeler.scripting.spin",
        });

        expect(disposable).toBe(subscription);
        expect(received.map((change) => change.affects("scripting.spin"))).toEqual([true]);
        expect(received.map((change) => change.affects("language"))).toEqual([false]);
    });
});
