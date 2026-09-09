/**
 * VS Code `<body>`-class theme adapter shared by the BPMN and DMN webview hosts.
 *
 * `@miragon/bpmn-modeler` / `@miragon/dmn-modeler` theme each modeler instance
 * through a per-instance attribute (`data-bpmn-theme` / `data-dmn-theme`) and
 * never read host chrome. This adapter is the host half of that contract: it
 * resolves the IDE's light/dark signal from the `vscode-*` body classes (VS Code
 * injects them; the IntelliJ host impersonates them) and drives two sinks — the
 * page-level scope on `<html>` (for host chrome and any surface with no modeler
 * instance) and the modeler instance's own `setTheme`. The scope attribute name
 * is injected by the caller so each webview keeps its package's CSS self-contained.
 *
 * App code may read `vscode-*` classes; the packages' architecture gates only
 * forbid them inside the published package sources.
 */

export type HostThemeKind = "light" | "dark";
export type HostThemeMode = "automatic" | "light" | "dark";

/** Resolves the IDE theme from the VS Code `<body>` classes. */
export function resolveHostThemeKind(): HostThemeKind {
    const isDark =
        document.body.classList.contains("vscode-dark") ||
        document.body.classList.contains("vscode-high-contrast");
    return isDark ? "dark" : "light";
}

/**
 * Sets the page-level scope attribute on `<html>`, scoping the host chrome (page
 * background, panel dividers) and any surface that has no live modeler instance
 * to theme. `attribute` is the package's scope attribute
 * (`data-bpmn-theme` / `data-dmn-theme`).
 */
export function applyPageThemeScope(attribute: string, kind: HostThemeKind): void {
    document.documentElement.setAttribute(attribute, kind);
}

export interface HostThemeAdapter {
    /**
     * `"automatic"` follows the VS Code `<body>` class live via a
     * MutationObserver; a forced `"light"`/`"dark"` stops the observer so the
     * fixed choice is not overwritten on the next `<body>`-class mutation.
     */
    setMode(mode: HostThemeMode): void;
    dispose(): void;
}

/**
 * Builds an adapter that invokes `apply` with the resolved kind whenever the
 * mode or (in automatic mode) the live `<body>` class changes. `mode` starts
 * `undefined`, so a first `setMode("automatic")` engages rather than
 * short-circuiting on the same-mode guard.
 */
export function createHostThemeAdapter(apply: (kind: HostThemeKind) => void): HostThemeAdapter {
    let currentMode: HostThemeMode | undefined;
    let observer: MutationObserver | undefined;

    const startObserver = (): void => {
        if (observer) {
            return;
        }
        observer = new MutationObserver(() => {
            if (currentMode === "automatic") {
                apply(resolveHostThemeKind());
            }
        });
        observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    };

    const stopObserver = (): void => {
        observer?.disconnect();
        observer = undefined;
    };

    return {
        setMode(mode: HostThemeMode): void {
            if (mode === currentMode) {
                return;
            }
            currentMode = mode;

            if (mode === "automatic") {
                apply(resolveHostThemeKind());
                startObserver();
            } else {
                stopObserver();
                apply(mode);
            }
        },
        dispose(): void {
            stopObserver();
        },
    };
}
