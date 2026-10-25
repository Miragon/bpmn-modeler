/**
 * Theme selection for one modeler instance. `"automatic"` follows the
 * OS/browser `prefers-color-scheme` live; `"light"`/`"dark"` force a fixed kind.
 */
export type SurfaceThemeMode = "light" | "dark" | "automatic";

export type ResolvedThemeKind = "light" | "dark";

/**
 * @internal Toggles one instance's theme attribute (`data-bpmn-theme`,
 * `data-dmn-theme`) on its scope roots, so two instances on one page can hold
 * different themes. Shared by the BPMN and DMN packages.
 */
export class ThemeController {
    // Leave unset so the first automatic-mode call applies the theme instead of returning early.
    private mode: SurfaceThemeMode | undefined;
    private mediaQuery?: MediaQueryList;
    private mediaListener?: (event: MediaQueryListEvent) => void;
    private disposed = false;

    constructor(
        private readonly scopeRoots: readonly HTMLElement[],
        private readonly attribute: string,
    ) {}

    setMode(mode: SurfaceThemeMode): void {
        if (this.disposed || mode === this.mode) {
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

    dispose(): void {
        this.disposed = true;
        this.stopFollowingPreferredScheme();
        for (const root of this.scopeRoots) {
            root.removeAttribute(this.attribute);
        }
    }

    private apply(kind: ResolvedThemeKind): void {
        for (const root of this.scopeRoots) {
            root.setAttribute(this.attribute, kind);
        }
        applyLegacyThemeLink(kind);
    }

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

// Preserve compatibility with consumers that still use a page-global #theme-link.
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
