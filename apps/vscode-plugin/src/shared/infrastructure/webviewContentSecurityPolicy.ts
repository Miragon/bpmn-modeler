export type WebviewShell = "bpmn" | "dmn" | "form" | "deployment";

/** The directives a bundle may widen; the others read the same in every shell. */
type BundleDirective =
    "script-src" | "img-src" | "font-src" | "connect-src" | "frame-src" | "object-src";

type BundleSources = Partial<Record<BundleDirective, string[]>>;

const BUNDLE_SOURCES: Record<WebviewShell, (cspSource: string) => BundleSources> = {
    // The chunk loader's modulepreload links carry no nonce, and element-template
    // icons are data: URIs or remote URLs.
    bpmn: (cspSource) => ({
        "script-src": [cspSource],
        "img-src": [cspSource, "data:", "https:"],
        "font-src": [cspSource, "data:"],
    }),
    dmn: (cspSource) => ({
        "script-src": [cspSource],
        "img-src": [cspSource, "data:"],
        "font-src": [cspSource, "data:"],
    }),
    // form-js components show remote images and iframes; a document preview
    // fetches its file and shows it from a blob: URL, a PDF in an <embed>.
    form: (cspSource) => ({
        "img-src": [cspSource, "data:", "blob:", "https:"],
        "font-src": [cspSource, "data:"],
        "connect-src": ["https:"],
        "frame-src": ["https:"],
        "object-src": ["blob:"],
    }),
    deployment: () => ({}),
};

/**
 * The Content-Security-Policy of a VS Code webview shell: its nonced entry
 * script and its own styles, plus what the shell's bundle loads at runtime.
 */
export function webviewContentSecurityPolicy(
    shell: WebviewShell,
    { cspSource, nonce }: { cspSource: string; nonce: string },
): string {
    const { "script-src": scriptSources = [], ...loads } = BUNDLE_SOURCES[shell](cspSource);
    const directives: string[][] = [
        ["default-src", "'none'"],
        ["script-src", `'nonce-${nonce}'`, ...scriptSources],
        // diagram-js, the properties panel and CodeMirror set style attributes and
        // inject <style> elements without a nonce.
        ["style-src", cspSource, "'unsafe-inline'"],
        ...Object.entries(loads).map(([directive, sources]) => [directive, ...sources]),
        // default-src does not cover these two.
        ["base-uri", "'none'"],
        ["form-action", "'none'"],
    ];
    return directives.map((directive) => directive.join(" ")).join("; ");
}
