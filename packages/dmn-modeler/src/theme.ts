import type { DmnThemeMode } from "./publicApi";

export type ResolvedThemeKind = "light" | "dark";

export const THEME_ATTRIBUTE = "data-dmn-theme";

/** @internal */
export class ThemeController {
    // Leave unset so the first automatic mode applies instead of returning early.
    private mode: DmnThemeMode | undefined;
    private mediaQuery?: MediaQueryList;
    private mediaListener?: (event: MediaQueryListEvent) => void;

    constructor(private readonly scopeRoots: readonly HTMLElement[]) {}

    setMode(mode: DmnThemeMode): void {
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

    dispose(): void {
        this.stopFollowingPreferredScheme();
        for (const root of this.scopeRoots) {
            root.removeAttribute(THEME_ATTRIBUTE);
        }
    }

    private apply(kind: ResolvedThemeKind): void {
        for (const root of this.scopeRoots) {
            root.setAttribute(THEME_ATTRIBUTE, kind);
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

// Keep compatibility with consumers that switch themes through #theme-link.
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
