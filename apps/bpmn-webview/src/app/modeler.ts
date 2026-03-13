import Modeler from "camunda-bpmn-js/lib/base/Modeler";
import BpmnModeler7 from "camunda-bpmn-js/lib/camunda-platform/Modeler";
import BpmnModeler8 from "camunda-bpmn-js/lib/camunda-cloud/Modeler";
import { ImportXMLError, ImportXMLResult, SaveXMLResult } from "bpmn-js/lib/BaseViewer";
import TokenSimulationModule from "bpmn-js-token-simulation";
import ElementTemplateChooserModule from "@bpmn-io/element-template-chooser";
import TransactionBoundariesModule from "camunda-transaction-boundaries";
import { CreateAppendElementTemplatesModule } from "bpmn-js-create-append-anything";
import { BpmnModelerSetting, NoModelerError } from "@bpmn-modeler/shared";
import { createReviver } from "bpmn-js-native-copy-paste/lib/PasteUtil.js";
import { ViewportData } from "./vscode";

const DEFAULT_SETTINGS: BpmnModelerSetting = {
    alignToOrigin: false,
    showTransactionBoundaries: true,
};

const MODELER_OPTIONS = {
    container: "#js-canvas",
    propertiesPanel: {
        parent: "#js-properties-panel",
    },
    alignToOrigin: {
        alignOnSave: false,
        offset: 150,
        tolerance: 50,
    },
};

/**
 * Encapsulates the bpmn-js modeler instance and all operations on it.
 *
 * A single instance is created at application startup and shared via the
 * module-level export in {@link index.ts}.  All methods throw
 * {@link NoModelerError} if called before {@link create}.
 */
export class BpmnModeler {
    private modeler: Modeler | undefined = undefined;

    private settings: BpmnModelerSetting = { ...DEFAULT_SETTINGS };

    /** Tracks the current VS Code theme kind; used to re-apply grid opacity after diagram init. */
    private isDark: boolean = false;

    /** Tracks the active engine so transaction-boundary calls are gated to C7 only. */
    private engine: "c7" | "c8" | undefined = undefined;

    /**
     * Creates and mounts a new bpmn-js modeler for the given execution engine.
     *
     * @param engine Camunda engine version — `"c7"` for Camunda Platform 7,
     *   `"c8"` for Camunda Cloud 8.
     * @throws {UnsupportedEngineError} If the engine string is not recognised.
     */
    create(engine: "c7" | "c8"): void {
        const commonModules = [TokenSimulationModule, ElementTemplateChooserModule];

        this.engine = engine;

        // Get the css variables for fill and stroke color
        const fill = getComputedStyle(document.documentElement).getPropertyValue(
            "--canvas-fill-color",
        );
        const stroke = getComputedStyle(document.documentElement).getPropertyValue(
            "--palette-entry-color",
        );
        const MODELER_OPTIONS_WITH_COLORS = {
            ...MODELER_OPTIONS,
            bpmnRenderer: {
                defaultFillColor: fill,
                defaultStrokeColor: stroke,
            },
        };

        switch (engine) {
            case "c7": {
                this.modeler = new BpmnModeler7({
                    ...MODELER_OPTIONS_WITH_COLORS,
                    additionalModules: [
                        ...commonModules,
                        CreateAppendElementTemplatesModule,
                        TransactionBoundariesModule,
                    ],
                });
                break;
            }
            case "c8": {
                this.modeler = new BpmnModeler8({
                    ...MODELER_OPTIONS_WITH_COLORS,
                    additionalModules: [...commonModules],
                });
                break;
            }
            default: {
                throw new UnsupportedEngineError(engine);
            }
        }
    }

    /**
     * Subscribes to the `elementTemplates.errors` event.
     *
     * @param cb Callback invoked with the array of template errors.
     * @throws {NoModelerError} If the modeler has not been created yet.
     */
    onElementTemplatesErrors(cb: (errors: any) => void): void {
        this.getModeler().on("elementTemplates.errors", (event: any) => {
            const { errors } = event;
            cb(errors);
        });
    }

    /**
     * Subscribes to the `commandStack.changed` event on the modeler's event bus.
     *
     * @param cb Callback invoked whenever the command stack changes.
     * @throws {NoModelerError} If the modeler has not been created yet.
     */
    onCommandStackChanged(cb: () => void): void {
        this.getModeler().get<any>("eventBus").on("commandStack.changed", cb);
    }

    /**
     * Creates a new, empty BPMN diagram in the modeler.
     *
     * @returns {@link ImportXMLResult} with any warnings produced during import.
     * @throws {NoModelerError} If the modeler has not been created yet.
     */
    async newDiagram(): Promise<ImportXMLResult> {
        return this.getModeler().createDiagram();
    }

    /**
     * Loads the given BPMN XML into the modeler, replacing any current diagram.
     *
     * @param bpmn Raw BPMN 2.0 XML string.
     * @returns {@link ImportXMLResult} with any warnings produced during import.
     * @throws {NoModelerError} If the modeler has not been created yet.
     * @throws {Error} If the XML cannot be parsed.
     */
    async loadDiagram(bpmn: string): Promise<ImportXMLResult> {
        try {
            return await this.getModeler()
                .importXML(bpmn)
                .then((result: ImportXMLResult) => {
                    // Transaction boundaries are only available for the C7 modeler.
                    if (
                        this.engine === "c7" &&
                        this.settings.showTransactionBoundaries
                    ) {
                        this.getModeler().get<any>("transactionBoundaries").show();
                    }
                    return result;
                });
        } catch (error: unknown) {
            if ((error as ImportXMLError).warnings) {
                const importError = error as ImportXMLError;
                throw new Error(`${importError.message} ${importError.warnings}`, {
                    cause: error,
                });
            }
            throw error;
        }
    }

    /**
     * Serialises the current diagram to a BPMN 2.0 XML string.
     *
     * @returns Formatted XML string.
     * @throws {NoModelerError} If the modeler has not been created yet.
     * @throws {Error} If the diagram cannot be serialised.
     */
    async exportDiagram(): Promise<string> {
        const result: SaveXMLResult = await this.getModeler().saveXML({ format: true });
        if (result.xml) {
            return result.xml;
        } else if (result.error) {
            throw result.error;
        }
        throw new Error("Failed to save changes made to the diagram!");
    }

    /**
     * Exports the current diagram as an SVG string.
     *
     * @returns SVG markup string.
     * @throws {NoModelerError} If the modeler has not been created yet.
     */
    async getDiagramSvg(): Promise<string> {
        const result = await this.getModeler().saveSVG();
        return result.svg;
    }

    /**
     * Pushes a new set of element templates to the modeler's template loader.
     *
     * @param templates Array of element template objects, or `undefined` (no-op).
     * @throws {NoModelerError} If the modeler has not been created yet.
     */
    setElementTemplates(templates: JSON[] | undefined): void {
        if (!templates) {
            return;
        }
        this.getModeler().get<any>("elementTemplatesLoader").setTemplates(templates);
    }

    /**
     * Applies a partial settings update.
     *
     * @param settings Partial settings object to merge, or `undefined` (no-op).
     * @throws {NoModelerError} If the modeler has not been created yet.
     */
    setSettings(settings: Partial<BpmnModelerSetting> | undefined): void {
        if (!settings) {
            return;
        }
        // Ensure the modeler exists before applying any settings.
        this.getModeler();
        this.settings = { ...this.settings, ...settings };

        // Apply transaction boundary visibility change immediately for C7.
        if (this.engine === "c7") {
            const tb = this.getModeler().get<any>("transactionBoundaries");
            // eslint-disable-next-line @typescript-eslint/no-unused-expressions
            this.settings.showTransactionBoundaries ? tb.show() : tb.hide();
        }
    }

    /**
     * Reads the current VS Code theme from `document.body` class list, applies
     * the matching theme stylesheet immediately, then installs a
     * `MutationObserver` to react to live theme changes.
     *
     * VS Code injects `vscode-dark`, `vscode-light`, or
     * `vscode-high-contrast` onto `<body>` in every webview.
     */
    public initTheme(): void {
        const isDark =
            document.body.classList.contains("vscode-dark") ||
            document.body.classList.contains("vscode-high-contrast");
        this.applyTheme(isDark);

        new MutationObserver(() => {
            const dark =
                document.body.classList.contains("vscode-dark") ||
                document.body.classList.contains("vscode-high-contrast");
            this.applyTheme(dark);
        }).observe(document.body, { attributes: true, attributeFilter: ["class"] });
    }

    /**
     * Dims the diagram-js-grid layer when in dark mode.
     *
     * Must be called **after** the first diagram has been loaded, because the
     * grid `<g class="layer djs-grid">` element is created lazily by
     * `diagram-js-grid` during the `diagram.init` event — it does not exist in
     * the DOM before that point.  `initTheme()` runs too early to reach it, so
     * `main.ts` must call this explicitly once `openXml` has resolved.
     *
     * Live theme switches (handled by the `MutationObserver` in
     * `initTheme`) also call `applyGridFilter`, so those are covered
     * automatically without needing to call this method again.
     */
    public applyGridStyle(): void {
        this.applyGridFilter(this.isDark);
    }

    /**
     * Triggers the align-to-origin plugin if the setting is enabled.
     *
     * @throws {NoModelerError} If the modeler has not been created yet.
     */
    alignElementsToOrigin(): void {
        if (this.settings.alignToOrigin) {
            this.getModeler().get<any>("alignToOrigin").align();
        }
    }

    /**
     * Returns the current canvas viewbox (position and zoom level).
     *
     * @throws {NoModelerError} If the modeler has not been created yet.
     */
    getViewport(): ViewportData {
        const { x, y, width, height } = this.getModeler().get<any>("canvas").viewbox();
        return { x, y, width, height };
    }

    /**
     * Restores the canvas to a previously saved viewbox.
     *
     * @param viewport The viewbox to apply.
     * @throws {NoModelerError} If the modeler has not been created yet.
     */
    setViewport(viewport: ViewportData): void {
        this.getModeler().get<any>("canvas").viewbox(viewport);
    }

    /**
     * Subscribes to canvas viewbox changes with a 100 ms debounce.
     *
     * The debounce prevents a flood of state writes while the user is actively
     * panning or zooming; only the final position after the gesture is persisted.
     *
     * @param cb Callback invoked with the new {@link ViewportData} after each change.
     * @throws {NoModelerError} If the modeler has not been created yet.
     */
    onViewportChanged(cb: (viewport: ViewportData) => void): void {
        let timer: ReturnType<typeof setTimeout> | undefined;
        this.getModeler()
            .get<any>("eventBus")
            .on("canvas.viewbox.changed", (event: any) => {
                clearTimeout(timer);
                timer = setTimeout(() => {
                    const { x, y, width, height } = event.viewbox;
                    cb({ x, y, width, height });
                }, 100);
            });
    }

    /**
     * Installs high-priority listeners on both `copyPaste.elementsCopied` and
     * `copyPaste.pasteElements` to mediate clipboard access through the
     * extension host.
     *
     * VS Code sandboxed webview iframes lack both `clipboard-read` and
     * `clipboard-write` permissions, so `navigator.clipboard` calls fail
     * silently.  These interceptors replace NativeCopyPaste (priority 2050)
     * by running at priority **2051**.
     *
     * **Copy** — serialises the copied element tree as a prefixed JSON string
     * and sends it to the extension host, which writes it to the system
     * clipboard via `vscode.env.clipboard.writeText()`.
     *
     * **Paste** — when the bpmn-js internal clipboard is empty (cross-editor
     * paste), requests clipboard text from the extension host, deserialises
     * the BPMN clip payload, and re-triggers the paste.
     *
     * @param requestClipboard Async callback that reads clipboard text via
     *   the extension host.
     * @param writeClipboard Callback that sends text to the extension host
     *   for writing to the system clipboard.
     * @throws {NoModelerError} If the modeler has not been created yet.
     */
    installClipboardInterceptor(
        requestClipboard: () => Promise<string>,
        writeClipboard: (text: string) => void,
    ): void {
        const modeler = this.getModeler();
        const eventBus = modeler.get<any>("eventBus");
        const copyPaste = modeler.get<any>("copyPaste");
        const moddle = modeler.get<any>("moddle");

        const CLIP_PREFIX = "bpmn-js-clip----";

        // ── Copy interceptor ─────────────────────────────────────────────
        eventBus.on("copyPaste.elementsCopied", 2051, (context: any) => {
            const serialized = CLIP_PREFIX + JSON.stringify(context.tree);
            writeClipboard(serialized);
            context.hints = context.hints || {};
            context.hints.clip = false;
        });

        // ── Paste interceptor ────────────────────────────────────────────
        eventBus.on("copyPaste.pasteElements", 2051, (context: any) => {
            if (context.tree) {
                return;
            }

            // Snapshot context NOW, before `return false` calls preventDefault()
            // which sets `defaultPrevented: true` on the same object.  If we spread
            // `context` asynchronously after that, the new pasteEvent inherits
            // `defaultPrevented: true` and CopyPaste.paste() sees canPaste===false,
            // silently aborting before any elements are created.
            const contextSnapshot = { ...context };

            requestClipboard().then((text) => {
                if (!text || !text.startsWith(CLIP_PREFIX)) {
                    return;
                }

                try {
                    const json = text.substring(CLIP_PREFIX.length);
                    const tree = JSON.parse(json, createReviver(moddle));
                    copyPaste.paste({ ...contextSnapshot, tree });
                } catch (error) {
                    console.error("Failed to deserialise clipboard content", error);
                }
            });

            return false;
        });
    }

    // ─── Private helpers ──────────────────────────────────────────────────────

    /**
     * Swaps the `#theme-link` stylesheet between `lightTheme.css` and
     * `darkTheme.css`.  Compares the current href to avoid unnecessary DOM
     * mutations, then applies the grid filter for the new theme kind.
     *
     * @param isDark `true` to apply the dark theme, `false` for the light theme.
     */
    private applyTheme(isDark: boolean): void {
        this.isDark = isDark;

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

        // The grid may already exist when the theme changes at runtime (e.g.
        // the user switches VS Code themes while a diagram is open).
        this.applyGridFilter(isDark);
    }

    /**
     * Sets the opacity of the `<g class="layer djs-grid">` SVG layer.
     *
     * diagram-js-grid hard-codes the dot colour to `#ccc`, which creates harsh
     * contrast against dark backgrounds.  Reducing the layer opacity to 25 %
     * makes the grid visible but unobtrusive.  Restores full opacity for light
     * themes.
     *
     * This is a no-op when the grid layer is not yet in the DOM — the caller
     * must retry after diagram initialisation via {@link applyGridStyle}.
     *
     * @param isDark `true` to dim the grid, `false` to restore full opacity.
     */
    private applyGridFilter(isDark: boolean): void {
        const grid = document.querySelector<SVGGElement>(".djs-grid");
        if (!grid) {
            return;
        }
        grid.style.opacity = isDark ? "0.25" : "";
    }

    /**
     * Returns the modeler instance, throwing if it has not been created yet.
     *
     * @throws {NoModelerError} If {@link create} has not been called.
     */
    private getModeler(): Modeler {
        if (!this.modeler) {
            throw new NoModelerError();
        }
        return this.modeler;
    }
}

/** Thrown by {@link BpmnModeler.create} when an unknown engine string is passed. */
export class UnsupportedEngineError extends Error {
    /** @param engine The unrecognised engine string. */
    constructor(engine: string) {
        super(`Unsupported engine: ${engine}`);
    }
}
