/**
 * Per-instance theme controller for the modeler.
 *
 * The authoritative mechanism is a `data-bpmn-theme="light" | "dark"` attribute
 * the controller toggles on the scope roots it is handed (a modeler's canvas
 * container + its `propertiesPanel.parent`). The dark stylesheet's rules are all
 * scoped under `[data-bpmn-theme="dark"]`, so theming one instance never leaks
 * onto another on the same page.
 *
 * {@link applyLegacyThemeLink} keeps the pre-attribute `#theme-link` href swap
 * alive as a permanent, page-global compatibility fallback for consumers that
 * still link `lightTheme.css` / `darkTheme.css` themselves. It is a silent no-op
 * when no `#theme-link` is present — the attribute mechanism stands on its own.
 *
 * `"automatic"` resolves the kind from the OS/browser `prefers-color-scheme` and
 * keeps following it live; `"light"` / `"dark"` force a fixed kind and stop
 * following. A host's own light/dark chrome (e.g. VS Code's `<body>` classes) is
 * host policy: the host adapter maps that signal to a forced mode — the package
 * never reads host chrome.
 *
 * @internal Not part of the public handle; reached through
 *   {@link BpmnModeler.setTheme}, and reusable by the viewer/design-mode surfaces
 *   that take plain scope roots rather than a modeler.
 */
import type { ThemeMode } from "./publicApi";

export type ResolvedThemeKind = "light" | "dark";

/** The attribute the dark stylesheet's `[data-bpmn-theme="dark"]` rules key off. */
export const THEME_ATTRIBUTE = "data-bpmn-theme";

export class ThemeController {
    // `undefined` (not `"automatic"`) until the first setMode so that an initial
    // setMode("automatic") actually engages instead of hitting the same-mode
    // early return.
    private mode: ThemeMode | undefined;
    private mediaQuery?: MediaQueryList;
    private mediaListener?: (event: MediaQueryListEvent) => void;

    constructor(private readonly scopeRoots: readonly HTMLElement[]) {}

    /**
     * Switches the theme mode. `"automatic"` applies the current
     * `prefers-color-scheme` and installs a `change` listener so a later
     * OS/browser theme switch is reflected live; a forced `"light"`/`"dark"`
     * stops that listener so the fixed choice is not overwritten on the next
     * scheme change. A no-op when the mode is unchanged.
     */
    setMode(mode: ThemeMode): void {
        if (mode === this.mode) {
            return;
        }
        this.mode = mode;

        if (mode === "automatic") {
            this.startFollowingPreferredScheme();
        } else {
            this.stopFollowingPreferredScheme();
            this.apply(mode);
        }
    }

    /** Detaches the scheme listener and removes the attribute from every root. */
    dispose(): void {
        this.stopFollowingPreferredScheme();
        for (const root of this.scopeRoots) {
            root.removeAttribute(THEME_ATTRIBUTE);
        }
    }

    /** Sets the attribute on every scope root and mirrors it to the legacy link. */
    private apply(kind: ResolvedThemeKind): void {
        for (const root of this.scopeRoots) {
            root.setAttribute(THEME_ATTRIBUTE, kind);
        }
        applyLegacyThemeLink(kind);
    }

    /**
     * Applies the current `prefers-color-scheme` and installs a single live
     * `change` listener for it (idempotent — a second automatic entry re-applies
     * but does not stack listeners).
     */
    private startFollowingPreferredScheme(): void {
        const query = window.matchMedia("(prefers-color-scheme: dark)");
        this.apply(query.matches ? "dark" : "light");

        if (this.mediaListener) {
            return;
        }
        this.mediaQuery = query;
        this.mediaListener = (event: MediaQueryListEvent) => {
            if (this.mode === "automatic") {
                this.apply(event.matches ? "dark" : "light");
            }
        };
        this.mediaQuery.addEventListener("change", this.mediaListener);
    }

    private stopFollowingPreferredScheme(): void {
        if (this.mediaQuery && this.mediaListener) {
            this.mediaQuery.removeEventListener("change", this.mediaListener);
        }
        this.mediaQuery = undefined;
        this.mediaListener = undefined;
    }
}

/**
 * Swaps the legacy `#theme-link` stylesheet between `lightTheme.css` and
 * `darkTheme.css`, comparing the current href first to avoid a redundant DOM
 * mutation. A silent no-op when no `#theme-link` is present — the attribute
 * mechanism is authoritative, so a missing legacy link is not an error.
 *
 * @param kind `"dark"` to apply the dark stylesheet, `"light"` for the light one.
 */
function applyLegacyThemeLink(kind: ResolvedThemeKind): void {
    const theme = document.querySelector<HTMLLinkElement>("#theme-link");
    if (!theme) {
        return;
    }

    const href = theme.href;
    const css = href.split("/").pop();

    if (kind === "dark" && css === "lightTheme.css") {
        theme.href = href.replace(/lightTheme\.css$/, "darkTheme.css");
    } else if (kind === "light" && css === "darkTheme.css") {
        theme.href = href.replace(/darkTheme\.css$/, "lightTheme.css");
    }
}
