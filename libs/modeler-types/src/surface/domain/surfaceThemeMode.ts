// Kept apart from ThemeController so the mode entry does not load it statically.

/**
 * Theme selection for one modeler instance. `"automatic"` follows the
 * OS/browser `prefers-color-scheme` live; `"light"`/`"dark"` force a fixed kind.
 */
export type SurfaceThemeMode = "light" | "dark" | "automatic";

/** The theme of every modeler surface whose consumer chose none. */
export const DEFAULT_THEME_MODE: SurfaceThemeMode = "automatic";

export type ResolvedThemeKind = "light" | "dark";
