/**
 * VS Code `<body>`-class theme adapter for the BPMN webview host.
 *
 * `@miragon/bpmn-modeler` themes each modeler instance through its
 * `data-bpmn-theme` attribute and never reads host chrome. This adapter is the
 * host half of that contract: it resolves the IDE's light/dark signal from the
 * `vscode-*` body classes (VS Code injects them; the IntelliJ host impersonates
 * them) and drives two sinks — the page-level scope on `<html>` (for the host
 * chrome and the viewer/diff branch, which has no modeler instance) and the
 * modeler instance's own `setTheme`.
 *
 * App code may read `vscode-*` classes; the package's architecture gate only
 * forbids them inside the published package source.
 */

export type HostThemeKind = "light" | "dark";
type HostThemeMode = "automatic" | "light" | "dark";

/** Resolves the IDE theme from the VS Code `<body>` classes. */
export function resolveHostThemeKind(): HostThemeKind {
    const isDark =
        document.body.classList.contains("vscode-dark") ||
        document.body.classList.contains("vscode-high-contrast");
    return isDark ? "dark" : "light";
}

/**
 * Sets the page-level `data-bpmn-theme` on `<html>`, scoping the host chrome
 * (page background, panel dividers) and — until #1405 gives it an instance — the
 * viewer/diff branch.
 */
export function applyPageThemeScope(kind: HostThemeKind): void {
    document.documentElement.setAttribute("data-bpmn-theme", kind);
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
