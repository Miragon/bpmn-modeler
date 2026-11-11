import type { ColorThemeSetting, ResolvedThemeKind } from "@miragon/bpmn-modeler-types";

/** The IDE theme a host reports, high contrast kept apart from its brightness. */
export const HOST_COLOR_THEME_KINDS = [
    "light",
    "dark",
    "highContrast",
    "highContrastLight",
] as const;

export type HostColorThemeKind = (typeof HOST_COLOR_THEME_KINDS)[number];

/**
 * The Miragon brand mode a page shows: the brand's own light or dark roles,
 * never the IDE's colours, and its high contrast roles on top when the IDE
 * runs a high contrast theme.
 */
export interface BrandMode {
    readonly theme: ResolvedThemeKind;
    readonly contrast?: "hoch";
}

export const BRAND_THEME_ATTRIBUTE = "data-cd-theme";
export const BRAND_CONTRAST_ATTRIBUTE = "data-cd-kontrast";

const MODE_OF_HOST_THEME: Record<HostColorThemeKind, BrandMode> = {
    light: { theme: "light" },
    dark: { theme: "dark" },
    highContrast: { theme: "dark", contrast: "hoch" },
    highContrastLight: { theme: "light", contrast: "hoch" },
};

// High contrast is an accessibility need, so a forced light theme keeps it.
const MODE_UNDER_SETTING: Record<ColorThemeSetting, (followed: BrandMode) => BrandMode> = {
    automatic: (followed) => followed,
    light: (followed) => ({ ...followed, theme: "light" }),
};

/**
 * The mode for the IDE's theme and the user's `colorTheme` setting.
 * `brandMode.cases.json` holds the IntelliJ host's copy to the same rows.
 */
export function brandModeOf(
    hostThemeKind: HostColorThemeKind,
    colorThemeSetting: ColorThemeSetting,
): BrandMode {
    return MODE_UNDER_SETTING[colorThemeSetting](MODE_OF_HOST_THEME[hostThemeKind]);
}

/** The `<html>` attributes the brand tokens switch on; no contrast attribute means normal contrast. */
export function brandModeAttributes(mode: BrandMode): Readonly<Record<string, string>> {
    return {
        [BRAND_THEME_ATTRIBUTE]: mode.theme,
        ...(mode.contrast === undefined ? {} : { [BRAND_CONTRAST_ATTRIBUTE]: mode.contrast }),
    };
}
