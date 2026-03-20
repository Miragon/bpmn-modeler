/**
 * Detects the active VS Code theme and applies the matching stylesheet.
 * Installs a MutationObserver on `<body>` to react to live theme changes.
 *
 * VS Code injects `vscode-dark`, `vscode-light`, or `vscode-high-contrast`
 * onto `<body>` in every webview.
 */
export function initTheme(): void {
    const isDark =
        document.body.classList.contains("vscode-dark") ||
        document.body.classList.contains("vscode-high-contrast");
    applyTheme(isDark);

    new MutationObserver(() => {
        const dark =
            document.body.classList.contains("vscode-dark") ||
            document.body.classList.contains("vscode-high-contrast");
        applyTheme(dark);
    }).observe(document.body, { attributes: true, attributeFilter: ["class"] });
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
