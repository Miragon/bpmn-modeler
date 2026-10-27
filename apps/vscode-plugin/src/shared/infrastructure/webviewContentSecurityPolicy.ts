export type WebviewShell = "bpmn" | "dmn" | "form" | "deployment";

/** What a bundle may load beyond its entry script, in the order the policy lists them. */
const BUNDLE_LOAD_DIRECTIVES = [
    "img-src",
    "font-src",
    "connect-src",
    "frame-src",
    "object-src",
] as const;

/** The directives a bundle may widen; the others read the same in every shell. */
type BundleDirective = "script-src" | (typeof BUNDLE_LOAD_DIRECTIVES)[number];

type BundleSources = Partial<Record<BundleDirective, string[]>>;

// Each entry declares its return type: a contextually typed arrow gets no
// excess-property check, so an entry could otherwise list a shared directive.
const BUNDLE_SOURCES: Record<WebviewShell, (cspSource: string) => BundleSources> = {
    // The chunk loader's modulepreload links carry no nonce, and element-template
    // icons are data: URIs or remote URLs.
    bpmn: (cspSource): BundleSources => ({
        "script-src": [cspSource],
        "img-src": [cspSource, "data:", "https:"],
        "font-src": [cspSource, "data:"],
    }),
    dmn: (cspSource): BundleSources => ({
        "script-src": [cspSource],
        "img-src": [cspSource, "data:"],
        "font-src": [cspSource, "data:"],
    }),
    // form-js components show remote images and iframes; a document preview
    // fetches its file and shows it from a blob: URL, a PDF in an <embed>.
    form: (cspSource): BundleSources => ({
        "img-src": [cspSource, "data:", "blob:", "https:"],
        "font-src": [cspSource, "data:"],
        "connect-src": ["https:"],
        "frame-src": ["https:"],
        "object-src": ["blob:"],
    }),
    deployment: (): BundleSources => ({}),
};

/**
 * The Content-Security-Policy of a VS Code webview shell: its nonced entry
 * script and its own styles, plus what the shell's bundle loads at runtime.
 */
export function webviewContentSecurityPolicy(
    shell: WebviewShell,
    { cspSource, nonce }: { cspSource: string; nonce: string },
): string {
    const bundleSources = BUNDLE_SOURCES[shell](cspSource);
    const loadDirectives = BUNDLE_LOAD_DIRECTIVES.flatMap((directive) => {
        const sources = bundleSources[directive];
        return sources === undefined ? [] : [[directive, ...sources]];
    });
    const directives: string[][] = [
        ["default-src", "'none'"],
        ["script-src", `'nonce-${nonce}'`, ...(bundleSources["script-src"] ?? [])],
        // diagram-js, the properties panel and CodeMirror set style attributes and
        // inject <style> elements without a nonce; the deployment form has a style attribute.
        ["style-src", cspSource, "'unsafe-inline'"],
        ...loadDirectives,
        // default-src does not cover these two.
        ["base-uri", "'none'"],
        ["form-action", "'none'"],
    ];
    return directives.map((directive) => directive.join(" ")).join("; ");
}
