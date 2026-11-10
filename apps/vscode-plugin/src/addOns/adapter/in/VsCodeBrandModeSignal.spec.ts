import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("vscode", () => import("../../../__fixtures__/vscodeWindowFake"));

import { ColorThemeKind } from "vscode";

import type { SettingChange, SettingKey } from "@miragon/bpmn-modeler-core";
import type { BrandMode } from "@miragon/bpmn-modeler-shared";
import type { ColorThemeSetting } from "@miragon/bpmn-modeler-types";

import { changeColorTheme, resetVscodeWindow } from "../../../__fixtures__/vscodeWindowFake";
import { VsCodeBrandModeSignal } from "./VsCodeBrandModeSignal";

function createSignal(initialSetting: ColorThemeSetting = "automatic") {
    let colorTheme = initialSetting;
    const settingListeners = new Set<(change: SettingChange) => void>();
    const signal = new VsCodeBrandModeSignal(
        () => colorTheme,
        (listener) => {
            settingListeners.add(listener);
            return { dispose: () => settingListeners.delete(listener) };
        },
    );
    const changeSetting = (key: SettingKey, value: ColorThemeSetting = colorTheme) => {
        colorTheme = value;
        settingListeners.forEach((listener) => listener({ affects: (each) => each === key }));
    };
    return { signal, changeSetting };
}

function following(signal: VsCodeBrandModeSignal) {
    const modes: BrandMode[] = [];
    const subscription = signal.onDidChange((mode) => modes.push(mode));
    return { modes, subscription };
}

beforeEach(() => resetVscodeWindow());

describe("VsCodeBrandModeSignal.current", () => {
    it.each([
        { kind: ColorThemeKind.Light, setting: "automatic", mode: { theme: "light" } },
        { kind: ColorThemeKind.Dark, setting: "automatic", mode: { theme: "dark" } },
        {
            kind: ColorThemeKind.HighContrast,
            setting: "automatic",
            mode: { theme: "dark", contrast: "hoch" },
        },
        {
            kind: ColorThemeKind.HighContrastLight,
            setting: "automatic",
            mode: { theme: "light", contrast: "hoch" },
        },
        { kind: ColorThemeKind.Dark, setting: "light", mode: { theme: "light" } },
    ] as const)(
        "reads theme kind $kind with the $setting setting as $mode",
        ({ kind, setting, mode }) => {
            changeColorTheme(kind);

            expect(createSignal(setting).signal.current()).toEqual(mode);
        },
    );
});

describe("VsCodeBrandModeSignal.onDidChange", () => {
    it("tells the new mode when the user switches the theme", () => {
        const { signal } = createSignal();
        const { modes } = following(signal);

        changeColorTheme(ColorThemeKind.HighContrast);

        expect(modes).toEqual([{ theme: "dark", contrast: "hoch" }]);
    });

    it("tells the new mode when the colour theme setting changes", () => {
        changeColorTheme(ColorThemeKind.Dark);
        const { signal, changeSetting } = createSignal();
        const { modes } = following(signal);

        changeSetting("colorTheme", "light");

        expect(modes).toEqual([{ theme: "light" }]);
    });

    it("stays quiet when another setting changes", () => {
        const { signal, changeSetting } = createSignal();
        const { modes } = following(signal);

        changeSetting("language");

        expect(modes).toEqual([]);
    });

    it("stops telling once its subscription is disposed", () => {
        const { signal, changeSetting } = createSignal();
        const { modes, subscription } = following(signal);

        subscription.dispose();
        changeColorTheme(ColorThemeKind.Dark);
        changeSetting("colorTheme", "light");

        expect(modes).toEqual([]);
    });
});
