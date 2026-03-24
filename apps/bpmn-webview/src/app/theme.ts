/**
 * Manages the BPMN modeler color theme based on VS Code theme or user preference.
 *
 * Supports two modes:
 * - `"automatic"`: follows the VS Code theme via a MutationObserver on `<body>`.
 * - `"light"`: always uses the default bpmn-js light theme.
 *
 * VS Code injects `vscode-dark`, `vscode-light`, or `vscode-high-contrast`
 * onto `<body>` in every webview.
 */

let currentMode: "automatic" | "light" = "automatic";
let observer: MutationObserver | undefined;

/**
 * Initialises theme handling with `"automatic"` mode.
 *
 * Detects the active VS Code theme and applies the matching stylesheet,
 * then installs a MutationObserver to react to live theme changes.
 * Call {@link setColorThemeMode} later to switch modes when the user
 * setting arrives.
 */
export function initTheme(): void {
    applyThemeFromVsCode();
    startObserver();
}

/**
 * Switches the color theme mode.
 *
 * @param mode `"automatic"` to follow VS Code theme, `"light"` to force light.
 */
export function setColorThemeMode(mode: "automatic" | "light"): void {
    if (mode === currentMode) {
        return;
    }
    currentMode = mode;

    if (mode === "light") {
        stopObserver();
        applyTheme(false);
    } else {
        applyThemeFromVsCode();
        startObserver();
    }
}

/**
 * Reads the VS Code body classes and applies the corresponding theme.
 */
function applyThemeFromVsCode(): void {
    const isDark =
        document.body.classList.contains("vscode-dark") ||
        document.body.classList.contains("vscode-high-contrast");
    applyTheme(isDark);
}

/**
 * Installs the MutationObserver that reacts to VS Code theme changes.
 */
function startObserver(): void {
    if (observer) {
        return;
    }
    observer = new MutationObserver(() => {
        if (currentMode === "automatic") {
            applyThemeFromVsCode();
        }
    });
    observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });
}

/**
 * Disconnects the MutationObserver.
 */
function stopObserver(): void {
    if (observer) {
        observer.disconnect();
        observer = undefined;
    }
}

/**
 * Swaps the `#theme-link` stylesheet between `lightTheme.css` and
 * `darkTheme.css`.  Compares the current href to avoid unnecessary DOM
 * mutations.
 *
 * @param isDark `true` to apply the dark theme, `false` for the light theme.
 */
function applyTheme(isDark: boolean): void {
    const theme = document.querySelector<HTMLLinkElement>("#theme-link");
    if (!theme) {
        console.error("Theme link element not found.");
        return;
    }

    const href = theme.href;
    const css = href.split("/").pop();

    if (isDark && css === "lightTheme.css") {
        theme.href = href.replace(/lightTheme\.css$/, "darkTheme.css");
    } else if (!isDark && css === "darkTheme.css") {
        theme.href = href.replace(/darkTheme\.css$/, "lightTheme.css");
    }
}
