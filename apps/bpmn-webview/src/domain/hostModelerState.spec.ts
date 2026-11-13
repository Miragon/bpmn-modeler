import { describe, expect, it, vi } from "vitest";

import { elementIdSettingsOf, HostModelerState } from "./hostModelerState";

const settings = (alignToOrigin: boolean) => ({
    alignToOrigin,
    showTransactionBoundaries: false,
    colorTheme: "light" as const,
});

const openScript = (elementId: string) => ({
    elementId,
    kind: "script-task" as const,
    listenerIndex: undefined,
    fileName: `${elementId}.js`,
});

describe("HostModelerState", () => {
    it("has no settings before the host sent any", () => {
        expect(new HostModelerState().settings).toBeUndefined();
    });

    it("keeps the settings the host sent last", () => {
        const state = new HostModelerState();

        state.rememberSettings(settings(false));
        state.rememberSettings(settings(true));

        expect(state.settings).toEqual(settings(true));
    });

    it("hands a modeler the settings pushed after the ones it was built with", () => {
        const state = new HostModelerState();
        const modeler = { setSettings: vi.fn() };
        state.rememberSettings(settings(false));
        const builtWith = state.settings;

        state.rememberSettings(settings(true));
        state.applySettingsPushedSince(builtWith, modeler);

        expect(modeler.setSettings).toHaveBeenCalledExactlyOnceWith(settings(true));
    });

    it("leaves a modeler built with the latest settings alone", () => {
        const state = new HostModelerState();
        const modeler = { setSettings: vi.fn() };

        state.applySettingsPushedSince(state.settings, modeler);
        state.rememberSettings(settings(true));
        state.applySettingsPushedSince(state.settings, modeler);

        expect(modeler.setSettings).not.toHaveBeenCalled();
    });

    it("hands a designer the favourites and element ID settings pushed after it was built", () => {
        const state = new HostModelerState();
        const designer = { setFavouriteBpmnElements: vi.fn(), setElementIdSettings: vi.fn() };
        state.rememberSettings(settings(false));
        const builtWith = state.settings;

        state.rememberSettings({
            ...settings(false),
            favouriteBpmnElements: ["bpmn:UserTask"],
            elementIdStyle: "snakeCase",
            elementIdsFollowName: true,
        });
        state.applyDesignerSettingsPushedSince(builtWith, designer);

        expect(designer.setFavouriteBpmnElements).toHaveBeenCalledExactlyOnceWith([
            "bpmn:UserTask",
        ]);
        expect(designer.setElementIdSettings).toHaveBeenCalledExactlyOnceWith({
            style: "snakeCase",
            followName: true,
        });
    });

    it("leaves a designer alone when nothing was pushed since it was built", () => {
        const state = new HostModelerState();
        const designer = { setFavouriteBpmnElements: vi.fn(), setElementIdSettings: vi.fn() };

        state.applyDesignerSettingsPushedSince(state.settings, designer);
        state.rememberSettings({ ...settings(true), favouriteBpmnElements: ["bpmn:UserTask"] });
        state.applyDesignerSettingsPushedSince(state.settings, designer);

        expect(designer.setFavouriteBpmnElements).not.toHaveBeenCalled();
        expect(designer.setElementIdSettings).not.toHaveBeenCalled();
    });

    it("leaves a designer's favourites alone when a push carries none", () => {
        const state = new HostModelerState();
        const designer = { setFavouriteBpmnElements: vi.fn(), setElementIdSettings: vi.fn() };
        state.rememberSettings({ ...settings(true), favouriteBpmnElements: ["bpmn:UserTask"] });
        const builtWith = state.settings;

        state.rememberSettings(settings(false));
        state.applyDesignerSettingsPushedSince(builtWith, designer);

        expect(designer.setFavouriteBpmnElements).not.toHaveBeenCalled();
        expect(designer.setElementIdSettings).toHaveBeenCalledExactlyOnceWith({
            style: undefined,
            followName: undefined,
        });
    });

    it("reads a designer's element ID settings from the host settings", () => {
        expect(
            elementIdSettingsOf({
                ...settings(true),
                elementIdStyle: "typeSuffix",
                elementIdsFollowName: false,
            }),
        ).toEqual({ style: "typeSuffix", followName: false });
        expect(elementIdSettingsOf(undefined)).toEqual({ style: undefined, followName: undefined });
    });

    it("leaves a modeler's open-script locks alone before the host reported any", () => {
        const modeler = { applyOpenScriptEditors: vi.fn() };

        new HostModelerState().restoreOpenScripts(modeler);

        expect(modeler.applyOpenScriptEditors).not.toHaveBeenCalled();
    });

    it("restores the open script editors the host reported last, even when none are open", () => {
        const state = new HostModelerState();
        const modeler = { applyOpenScriptEditors: vi.fn() };

        state.rememberOpenScripts([openScript("Task_1")]);
        state.restoreOpenScripts(modeler);
        state.rememberOpenScripts([]);
        state.restoreOpenScripts(modeler);

        expect(modeler.applyOpenScriptEditors.mock.calls).toEqual([[[openScript("Task_1")]], [[]]]);
    });
});
