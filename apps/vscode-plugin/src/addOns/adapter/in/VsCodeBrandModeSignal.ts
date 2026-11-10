import { ColorThemeKind, window } from "vscode";

import type { SettingChange } from "@miragon/bpmn-modeler-core";
import { type BrandMode, brandModeOf, type HostColorThemeKind } from "@miragon/bpmn-modeler-shared";
import type { ColorThemeSetting } from "@miragon/bpmn-modeler-types";

const HOST_THEME_OF_KIND: Record<ColorThemeKind, HostColorThemeKind> = {
    [ColorThemeKind.Light]: "light",
    [ColorThemeKind.Dark]: "dark",
    [ColorThemeKind.HighContrast]: "highContrast",
    [ColorThemeKind.HighContrastLight]: "highContrastLight",
};

/**
 * The Add-ons view's brand mode from VS Code's colour theme and the
 * `colorTheme` setting, and each change of either.
 */
export class VsCodeBrandModeSignal {
    constructor(
        private readonly readColorTheme: () => ColorThemeSetting,
        private readonly onDidChangeSetting: (listener: (change: SettingChange) => void) => {
            dispose(): unknown;
        },
    ) {}

    current(): BrandMode {
        return brandModeOf(HOST_THEME_OF_KIND[window.activeColorTheme.kind], this.readColorTheme());
    }

    onDidChange(listener: (mode: BrandMode) => void): { dispose(): void } {
        const themeChanges = window.onDidChangeActiveColorTheme(() => listener(this.current()));
        const settingChanges = this.onDidChangeSetting((change) => {
            if (change.affects("colorTheme")) listener(this.current());
        });
        return {
            dispose: () => {
                themeChanges.dispose();
                settingChanges.dispose();
            },
        };
    }
}
