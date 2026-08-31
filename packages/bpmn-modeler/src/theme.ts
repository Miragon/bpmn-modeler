/**
 * Page-singleton theme controller for the modeler's `#theme-link` stylesheet.
 *
 * {@link setThemeMode} drives which of the consumer-linked `lightTheme.css` /
 * `darkTheme.css` the `#theme-link` element points at. `"automatic"` resolves
 * the kind from the OS/browser `prefers-color-scheme` and keeps following it
 * live; `"light"` / `"dark"` force a fixed stylesheet and stop following.
 *
 * A host's own light/dark chrome (e.g. VS Code's `<body>` classes) is host
 * policy: the host adapter maps that signal to a forced `setTheme("light")` /
 * `setTheme("dark")` — the package never reads host chrome.
 *
 * @internal Not part of the public handle; reached only through
 *   {@link BpmnModeler.setTheme}.
 */
import type { ThemeMode } from "./publicApi";

let currentMode: ThemeMode = "automatic";
let mediaQuery: MediaQueryList | undefined;
let mediaListener: ((event: MediaQueryListEvent) => void) | undefined;

/**
 * Swaps the `#theme-link` stylesheet between `lightTheme.css` and
 * `darkTheme.css`, comparing the current href first to avoid a redundant DOM
 * mutation. Logs (does not throw) when the consumer linked no `#theme-link`.
 *
 * @param kind `"dark"` to apply the dark stylesheet, `"light"` for the light one.
 */
export function applyResolvedTheme(kind: "light" | "dark"): void {
    const theme = document.querySelector<HTMLLinkElement>("#theme-link");
    if (!theme) {
        console.error("Theme link element not found.");
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

/**
 * Switches the page theme mode. `"automatic"` applies the current
 * `prefers-color-scheme` and installs a `change` listener so a later OS/browser
 * theme switch is reflected live; a forced `"light"`/`"dark"` stops that
 * listener so the fixed choice is not overwritten on the next scheme change.
 *
 * A no-op when the mode is unchanged.
 */
export function setThemeMode(mode: ThemeMode): void {
    if (mode === currentMode) {
        return;
    }
    currentMode = mode;

    if (mode === "automatic") {
        startFollowingPreferredScheme();
    } else {
        stopFollowingPreferredScheme();
        applyResolvedTheme(mode);
    }
}

/**
 * Applies the current `prefers-color-scheme` and installs a single live
 * `change` listener for it (idempotent — a second automatic entry re-applies
 * but does not stack listeners).
 */
function startFollowingPreferredScheme(): void {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    applyResolvedTheme(query.matches ? "dark" : "light");

    if (mediaListener) {
        return;
    }
    mediaQuery = query;
    mediaListener = (event: MediaQueryListEvent) => {
        if (currentMode === "automatic") {
            applyResolvedTheme(event.matches ? "dark" : "light");
        }
    };
    mediaQuery.addEventListener("change", mediaListener);
}

function stopFollowingPreferredScheme(): void {
    if (mediaQuery && mediaListener) {
        mediaQuery.removeEventListener("change", mediaListener);
    }
    mediaQuery = undefined;
    mediaListener = undefined;
}
