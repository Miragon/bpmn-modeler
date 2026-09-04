import { MODELS, getActiveModel, modelHref, type ModelType } from "./registry";

export interface DemoHeaderLinks {
    vscode: string;
    intellij: string;
    docs: string;
}

// The demo has four views: the single-model modeler (bpmn/dmn), the two-pane
// diff, the readonly viewer, and the engine-neutral design surface. `"diff"`,
// `"viewer"`, and `"design"` are not `ModelType`s — they have no active model —
// so the model dropdown is hidden there; the view switcher is how users cross
// between them.
export type DemoPage = ModelType | "diff" | "viewer" | "design";

// The header's single theme control. `"automatic"` follows the OS
// `prefers-color-scheme`; `"light"`/`"dark"` force a fixed choice.
export type DemoThemeMode = "automatic" | "light" | "dark";
type DemoThemeKind = "light" | "dark";

export interface MountDemoHeaderOptions {
    // Fired with the raw mode on every user theme change. The viewer page uses
    // it to drive the public `viewer.setTheme`; the modeler/diff pages theme
    // ambiently via `data-bpmn-theme` + the `vscode-dark` body class and need no
    // callback.
    onThemeChange?: (mode: DemoThemeMode) => void;
}

const THEME_STORAGE_KEY = "miragon-demo-theme";

function readThemeMode(): DemoThemeMode {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "light" || stored === "dark" || stored === "automatic" ? stored : "automatic";
}

function prefersDark(): boolean {
    return (
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches
    );
}

function resolveThemeKind(mode: DemoThemeMode): DemoThemeKind {
    if (mode === "automatic") {
        return prefersDark() ? "dark" : "light";
    }
    return mode;
}

// Live OS-preference listener, active only while the mode is `"automatic"`.
let mediaQuery: MediaQueryList | undefined;
let mediaListener: ((event: MediaQueryListEvent) => void) | undefined;

function applyThemeKind(kind: DemoThemeKind): void {
    // `data-bpmn-theme` themes every canvas, panel, and the demo chrome via CSS;
    // the `vscode-dark` body class drives the BPMN webview's HostThemeAdapter and
    // the DMN webview's `#theme-link` swap (both left in `"automatic"` mode) plus
    // the package's existing `body.vscode-dark .diff-legend*` rules.
    document.documentElement.setAttribute("data-bpmn-theme", kind);
    document.body.classList.toggle("vscode-dark", kind === "dark");
}

/**
 * Resolves the mode to a concrete kind, applies it to `<html>`/`<body>`, and —
 * while `"automatic"` — installs a live `prefers-color-scheme` listener (tearing
 * down any prior one first) so the demo follows the OS in real time.
 */
function applyDemoTheme(mode: DemoThemeMode): void {
    if (mediaQuery && mediaListener) {
        mediaQuery.removeEventListener("change", mediaListener);
        mediaQuery = undefined;
        mediaListener = undefined;
    }

    applyThemeKind(resolveThemeKind(mode));

    if (mode === "automatic" && typeof window.matchMedia === "function") {
        mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
        mediaListener = (event) => applyThemeKind(event.matches ? "dark" : "light");
        mediaQuery.addEventListener("change", mediaListener);
    }
}

const DIFF_HREF = "/bpmn/diff.html";

// Where the "Modeler" view link points from the diff page — the first bpmn model.
const DEFAULT_MODELER_HREF = modelHref(MODELS.find((m) => m.type === "bpmn") ?? MODELS[0]);

// IntelliJ URL is a placeholder — confirm before launch.
const DEFAULT_LINKS: DemoHeaderLinks = {
    vscode: "https://marketplace.visualstudio.com/items?itemName=miragon-gmbh.vs-code-bpmn-modeler",
    intellij: "https://plugins.jetbrains.com/search?search=miragon%20bpmn",
    docs: "https://miragon.github.io/bpmn-modeler/",
};

const KOMET_SVG = `<svg class="komet" viewBox="0 0 512 512" aria-hidden="true"><rect width="512" height="512" rx="112" fill="#335de5"/><g transform="translate(66 196.9) scale(1.31908)"><path fill="#00e676" d="M0,89.63l220.2-14.78c11.65-.78,23.38-2.66,33.31-5.14s22.92-8.94,29.16-19.41c3.65-6.12,5.09-13.73,5.38-18.91,.27-4.94-.99-10.2-2.54-13.33-2.76-5.55-6.11-8.42-8.55-10.26-2.45-1.84-7.55-5.77-18.08-7.35-10.53-1.58-29.62,1.2-44.31,5.84C199.87,10.92,0,89.63,0,89.63Z"/></g></svg>`;

export function mountDemoHeader(
    page: DemoPage,
    links: Partial<DemoHeaderLinks> = {},
    options: MountDemoHeaderOptions = {},
): { themeMode: DemoThemeMode } {
    const l = { ...DEFAULT_LINKS, ...links };
    const isDiff = page === "diff";
    const isViewer = page === "viewer";
    const isDesign = page === "design";
    // The diff/viewer/design views have no active model; their "Modeler" link
    // falls back to the default bpmn model so users always land somewhere sensible.
    const noModel = isDiff || isViewer || isDesign;
    const modelerHref = noModel ? DEFAULT_MODELER_HREF : modelHref(getActiveModel(page));

    const style = document.createElement("style");
    // Colour tokens mirror Miragon/corporate-identity (brand/tokens.json).
    style.textContent = `
        :root {
            --cd-blau: #335DE5;
            --cd-blau-link: #2B50D4;
            --cd-grau: #F9F7F7;
            --cd-schwarz: #1D1D1D;
            --cd-weiss: #FFFFFF;
            --cd-gradient-brand: linear-gradient(120deg, #335DE5 30%, #00E676);
            --cd-radius-sm: 6px;
            --cd-shadow-1: 0 1px 2px rgba(29, 29, 29, 0.06), 0 1px 3px rgba(29, 29, 29, 0.10);
            --miragon-demo-header-h: 52px;
            --miragon-demo-footer-h: 34px;
        }
        body { margin: 0; }
        /* Shells hardcode #app{height:100vh}; make room for header + footer. */
        #app {
            height: calc(100vh - var(--miragon-demo-header-h) - var(--miragon-demo-footer-h)) !important;
        }
        .miragon-demo-header {
            position: relative;
            height: var(--miragon-demo-header-h);
            box-sizing: border-box;
            display: flex; align-items: center; gap: 14px;
            padding: 0 16px;
            font: 500 13px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
            color: var(--cd-schwarz);
            background: var(--cd-weiss);
            box-shadow: var(--cd-shadow-1);
        }
        .miragon-demo-header::after {
            content: ""; position: absolute; inset: auto 0 0 0; height: 3px;
            background: var(--cd-gradient-brand);
        }
        .miragon-demo-header .brand { display: flex; align-items: center; gap: 9px; font-weight: 700; }
        .miragon-demo-header .brand .komet { width: 18px; height: 18px; display: block; }
        .miragon-demo-header .spacer { flex: 1; }
        .miragon-demo-header label { color: #6b7280; }
        .miragon-demo-header .views {
            display: flex; gap: 2px; padding: 2px;
            background: var(--cd-grau); border: 1px solid #d7d9de; border-radius: var(--cd-radius-sm);
        }
        .miragon-demo-header .views a {
            padding: 4px 12px; border: none; border-radius: 4px; background: transparent;
            color: #6b7280; font-weight: 600;
        }
        .miragon-demo-header .views a:hover { background: rgba(51, 93, 229, 0.06); }
        .miragon-demo-header .views a.active {
            background: var(--cd-weiss); color: var(--cd-blau); box-shadow: var(--cd-shadow-1);
        }
        .miragon-demo-header select {
            background: var(--cd-weiss); color: var(--cd-schwarz); cursor: pointer;
            border: 1px solid #d7d9de; border-radius: var(--cd-radius-sm); padding: 6px 10px; font: inherit;
        }
        .miragon-demo-header select:focus-visible {
            outline: 2px solid var(--cd-blau); outline-offset: 1px; border-color: var(--cd-blau);
        }
        .miragon-demo-header a {
            color: var(--cd-blau-link); text-decoration: none; font-weight: 600;
            padding: 7px 12px; border: 1px solid #d7d9de; border-radius: var(--cd-radius-sm);
            transition: background 150ms, border-color 150ms;
        }
        .miragon-demo-header a:hover { border-color: var(--cd-blau); background: rgba(51, 93, 229, 0.06); }
        .miragon-demo-header a.primary {
            color: var(--cd-weiss); background: var(--cd-blau); border-color: var(--cd-blau);
        }
        .miragon-demo-header a.primary:hover { background: var(--cd-blau-link); border-color: var(--cd-blau-link); }
        .miragon-demo-footer {
            height: var(--miragon-demo-footer-h);
            box-sizing: border-box;
            display: flex; align-items: center; gap: 16px;
            padding: 0 16px;
            font: 400 12px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
            color: #6b7280;
            background: var(--cd-grau);
            border-top: 1px solid #e9e9ec;
        }
        .miragon-demo-footer .spacer { flex: 1; }
        .miragon-demo-footer a { color: #6b7280; text-decoration: none; }
        .miragon-demo-footer a:hover { color: var(--cd-blau-link); text-decoration: underline; }
        .djs-context-pad .entry.entry-demo-disabled {
            opacity: .35; cursor: not-allowed; filter: grayscale(1);
        }

        /* Dark chrome, scoped on the same attribute the canvases theme off.
           The viewer page loads only viewer.css (no body-background rule), so
           the body fallback below paints its surround — value from the
           dark-theme --dt-surface-a0 family (#121212). */
        :root[data-bpmn-theme="dark"] body { background: #121212; }
        :root[data-bpmn-theme="dark"] .miragon-demo-header {
            background: var(--cd-schwarz); color: #f2f2f2;
            box-shadow: 0 1px 2px rgba(0, 0, 0, 0.4), 0 1px 3px rgba(0, 0, 0, 0.5);
        }
        :root[data-bpmn-theme="dark"] .miragon-demo-header label { color: #9aa0aa; }
        :root[data-bpmn-theme="dark"] .miragon-demo-header .views {
            background: #2a2a2a; border-color: #3a3a3a;
        }
        :root[data-bpmn-theme="dark"] .miragon-demo-header .views a { color: #9aa0aa; }
        :root[data-bpmn-theme="dark"] .miragon-demo-header .views a:hover {
            background: rgba(51, 93, 229, 0.18);
        }
        :root[data-bpmn-theme="dark"] .miragon-demo-header .views a.active {
            background: var(--cd-schwarz); color: #6f8cf0;
            box-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
        }
        :root[data-bpmn-theme="dark"] .miragon-demo-header select {
            background: #2a2a2a; color: #f2f2f2; border-color: #3a3a3a;
        }
        :root[data-bpmn-theme="dark"] .miragon-demo-header a {
            color: #6f8cf0; border-color: #3a3a3a;
        }
        :root[data-bpmn-theme="dark"] .miragon-demo-header a:hover {
            border-color: var(--cd-blau); background: rgba(51, 93, 229, 0.18);
        }
        :root[data-bpmn-theme="dark"] .miragon-demo-header a.primary {
            color: var(--cd-weiss); background: var(--cd-blau); border-color: var(--cd-blau);
        }
        :root[data-bpmn-theme="dark"] .miragon-demo-footer {
            background: #1a1a1a; color: #9aa0aa; border-top-color: #2a2a2a;
        }
        :root[data-bpmn-theme="dark"] .miragon-demo-footer a { color: #9aa0aa; }
        :root[data-bpmn-theme="dark"] .miragon-demo-footer a:hover { color: #6f8cf0; }
    `;
    document.head.appendChild(style);

    const activeId = noModel ? null : getActiveModel(page).id;
    const modelOptions = MODELS.map(
        (m) =>
            `<option value="${m.id}"${m.id === activeId ? " selected" : ""}>` +
            `${m.title} (${m.type.toUpperCase()})</option>`,
    ).join("");

    // The diff/viewer views have no active model, so they omit the model
    // dropdown; all views share the switcher. All hrefs here are internal
    // string literals.
    const modelPicker = noModel
        ? ""
        : `<label for="miragon-demo-model">Modell:</label>
           <select id="miragon-demo-model" aria-label="Modell wählen">${modelOptions}</select>`;

    const themeMode = readThemeMode();
    const themeOption = (value: DemoThemeMode, label: string): string =>
        `<option value="${value}"${value === themeMode ? " selected" : ""}>${label}</option>`;
    const themePicker = `<label for="miragon-demo-theme">Theme:</label>
        <select id="miragon-demo-theme" aria-label="Theme wählen">
            ${themeOption("automatic", "Automatic")}
            ${themeOption("light", "Light")}
            ${themeOption("dark", "Dark")}
        </select>`;
    const activeAttr = ' class="active" aria-current="page"';
    const views = `
        <nav class="views" aria-label="Ansicht wählen">
            <a href="${modelerHref}"${noModel ? "" : activeAttr}>Modeler</a>
            <a href="${DIFF_HREF}"${isDiff ? activeAttr : ""}>Diff</a>
        </nav>`;

    const header = document.createElement("header");
    header.className = "miragon-demo-header";
    header.innerHTML = `
        <span class="brand">${KOMET_SVG}Miragon Modeler Demo</span>
        ${views}
        ${modelPicker}
        ${themePicker}
        <span class="spacer"></span>
    `;
    // Build the action links via the DOM API instead of interpolating the
    // (externally-typed) link URLs into innerHTML — keeps CodeQL's
    // unsafe-HTML-construction sink out of reach.
    for (const { href, text, primary } of [
        { href: l.docs, text: "Zur Doku", primary: true },
        { href: l.intellij, text: "in IntelliJ installieren", primary: false },
        { href: l.vscode, text: "in VS Code installieren", primary: false },
    ]) {
        const link = document.createElement("a");
        link.href = href;
        link.textContent = text;
        link.target = "_blank";
        link.rel = "noopener";
        if (primary) {
            link.className = "primary";
        }
        header.appendChild(link);
    }
    document.body.prepend(header);

    const footer = document.createElement("footer");
    footer.className = "miragon-demo-footer";
    footer.innerHTML = `
        <span>© ${new Date().getFullYear()} Miragon</span>
        <span class="spacer"></span>
        <a href="https://www.miragon.io/impressum" target="_blank" rel="noopener">Impressum</a>
        <a href="https://www.miragon.io/datenschutz" target="_blank" rel="noopener">Datenschutz</a>
        <a href="https://www.miragon.io" target="_blank" rel="noopener">miragon.io</a>
    `;
    document.body.append(footer);

    const select = header.querySelector<HTMLSelectElement>("#miragon-demo-model");
    select?.addEventListener("change", () => {
        const model = MODELS.find((m) => m.id === select.value);
        if (model) {
            window.location.href = modelHref(model);
        }
    });

    // Apply the saved mode now — mountDemoHeader runs before each page's
    // bootstrap()/createViewer(), so the body class is in place before the
    // theme adapters initialise.
    applyDemoTheme(themeMode);

    const themeSelect = header.querySelector<HTMLSelectElement>("#miragon-demo-theme");
    themeSelect?.addEventListener("change", () => {
        const mode = themeSelect.value as DemoThemeMode;
        localStorage.setItem(THEME_STORAGE_KEY, mode);
        applyDemoTheme(mode);
        options.onThemeChange?.(mode);
    });

    return { themeMode };
}
