import { MODELS, getActiveModel, modelHref, type ModelType } from "./registry";

export interface DemoHeaderLinks {
    vscode: string;
    intellij: string;
    docs: string;
}

// The demo has two views: the single-model modeler (bpmn/dmn) and the two-pane
// diff. `"diff"` is not a `ModelType` — it has no active model — so the model
// dropdown is hidden there; the view switcher is how users cross between them.
export type DemoPage = ModelType | "diff";

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

export function mountDemoHeader(page: DemoPage, links: Partial<DemoHeaderLinks> = {}): void {
    const l = { ...DEFAULT_LINKS, ...links };
    const isDiff = page === "diff";
    // The diff view has no active model; its "Modeler" link falls back to the
    // default bpmn model so users always land somewhere sensible.
    const modelerHref = isDiff ? DEFAULT_MODELER_HREF : modelHref(getActiveModel(page));

    // The webview shells strip the shell's #theme-link; add a no-op so the
    // shared applyTheme() lookup succeeds silently (the demo is light-only).
    if (!document.getElementById("theme-link")) {
        const themeLink = document.createElement("link");
        themeLink.id = "theme-link";
        themeLink.rel = "stylesheet";
        themeLink.href = "data:text/css,";
        document.head.appendChild(themeLink);
    }

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
    `;
    document.head.appendChild(style);

    const activeId = isDiff ? null : getActiveModel(page).id;
    const options = MODELS.map(
        (m) =>
            `<option value="${m.id}"${m.id === activeId ? " selected" : ""}>` +
            `${m.title} (${m.type.toUpperCase()})</option>`,
    ).join("");

    // The diff view has no active model, so it omits the model dropdown; both
    // views share the switcher. All hrefs here are internal string literals.
    const modelPicker = isDiff
        ? ""
        : `<label for="miragon-demo-model">Modell:</label>
           <select id="miragon-demo-model" aria-label="Modell wählen">${options}</select>`;
    const views = `
        <nav class="views" aria-label="Ansicht wählen">
            <a href="${modelerHref}"${isDiff ? "" : ' class="active" aria-current="page"'}>Modeler</a>
            <a href="${DIFF_HREF}"${isDiff ? ' class="active" aria-current="page"' : ""}>Diff</a>
        </nav>`;

    const header = document.createElement("header");
    header.className = "miragon-demo-header";
    header.innerHTML = `
        <span class="brand">${KOMET_SVG}Miragon Modeler Demo</span>
        ${views}
        ${modelPicker}
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
}
