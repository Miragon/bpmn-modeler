import { i18n, type SupportedLocale } from "@miragon/bpmn-modeler-i18n";
import type { Engine } from "@miragon/bpmn-modeler-types";

import { createModeler } from "../createModeler";
import type { BpmnModeler } from "../modeler";
import type { ThemeMode } from "../publicApi";
import { previewTargetOf } from "./previewTarget";

export interface TemplatePreviewOptions {
    /** Defaults to `"automatic"`. */
    theme?: ThemeMode;
    /** Page-global like the modeler's; omit to keep the host's current language. */
    locale?: string;
}

export interface TemplatePreviewOutcome {
    /** Whether the panel now shows this template; otherwise it keeps the last one that did. */
    rendered: boolean;
    /** Why the template was rejected or could not be shown. */
    errors: string[];
}

/** The handle {@link createTemplatePreview} resolves to. */
export interface TemplatePreviewHandle {
    /** Renders the properties panel `template` produces on a fresh element of its type. */
    show(template: object, engine: Engine): Promise<TemplatePreviewOutcome>;
    setTheme(theme: ThemeMode): void;
    /** Page-global; re-renders the shown template in the new language. */
    setLocale(locale: string): void;
    destroy(): void;
}

interface ElementTemplatesService {
    get(id: unknown, version?: unknown): object | null;
    setEngines(engines: object): void;
    createElement(template: object): unknown;
}

interface Shown {
    template: object;
    engine: Engine;
}

const SHAPE_POSITION = { x: 200, y: 150 };

/**
 * Creates a properties-panel-only preview of element templates in `panelParent`.
 * The diagram behind it lives on an offscreen canvas and is never exported.
 */
export async function createTemplatePreview(
    panelParent: HTMLElement,
    options: TemplatePreviewOptions = {},
): Promise<TemplatePreviewHandle> {
    let theme = options.theme ?? "automatic";
    let current: { engine: Engine; modeler: BpmnModeler } | undefined;
    let lastGood: Shown | undefined;
    let reportedErrors: unknown[] = [];
    // Each render re-imports the diagram, so overlapping calls must not interleave.
    let queue: Promise<unknown> = Promise.resolve();
    let destroyed = false;

    const canvas = panelParent.ownerDocument.createElement("div");
    canvas.setAttribute("aria-hidden", "true");
    canvas.style.cssText = "position:absolute;width:0;height:0;overflow:hidden;visibility:hidden";
    panelParent.ownerDocument.body.appendChild(canvas);

    if (options.locale) {
        i18n.setLanguage(options.locale as SupportedLocale);
    }

    async function modelerFor(engine: Engine): Promise<BpmnModeler> {
        if (current?.engine === engine) {
            return current.modeler;
        }
        if (current) {
            await afterPanelEffects();
            current.modeler.destroy();
            current = undefined;
        }
        const modeler = await createModeler(canvas, {
            engine,
            theme,
            propertiesPanel: { parent: panelParent },
            linting: false,
            onElementTemplatesErrors: (errors) => {
                reportedErrors.push(...errors);
            },
        });
        current = { engine, modeler };
        return modeler;
    }

    async function render({ template, engine }: Shown): Promise<TemplatePreviewOutcome> {
        const modeler = await modelerFor(engine);
        await modeler.newDiagram();

        const elementTemplates = modeler.getService<ElementTemplatesService>("elementTemplates");
        // The fresh diagram pins the latest engine version; a template written for
        // another version must still preview.
        elementTemplates.setEngines({});
        reportedErrors = [];
        try {
            modeler.setElementTemplates([template]);
        } catch (error) {
            // The validator assumes the shape of some fields before checking them.
            return { rendered: false, errors: [...reportedErrors, error].map(errorMessage) };
        }
        const errors = reportedErrors.map(errorMessage);

        const fields = template as Record<string, unknown>;
        const registered = elementTemplates.get(fields.id, fields.version);
        if (!registered) {
            return { rendered: false, errors };
        }
        const target = previewTargetOf(fields);
        if (target.kind === "unsupported") {
            return {
                rendered: false,
                errors: [...errors, `Templates for ${target.type} cannot be previewed yet.`],
            };
        }
        const shape = modeler
            .getService("modeling")
            .createShape(
                elementTemplates.createElement(registered) as never,
                SHAPE_POSITION,
                modeler.getService("canvas").getRootElement() as never,
            );
        modeler.getService("selection").select(shape);
        return { rendered: true, errors };
    }

    async function renderOrRestore(shown: Shown): Promise<TemplatePreviewOutcome> {
        if (destroyed) {
            return { rendered: false, errors: [] };
        }
        const outcome = await render(shown);
        if (outcome.rendered) {
            lastGood = shown;
        } else if (lastGood) {
            await render(lastGood);
        }
        return outcome;
    }

    function enqueue(shown: Shown): Promise<TemplatePreviewOutcome> {
        const next = queue.then(() => renderOrRestore(shown));
        queue = next.catch(() => undefined);
        return next;
    }

    return {
        show: (template, engine) => enqueue({ template, engine }),
        setTheme(next) {
            theme = next;
            current?.modeler.setTheme(next);
        },
        setLocale(locale) {
            if (i18n.getLocale() === locale) {
                return;
            }
            i18n.setLanguage(locale as SupportedLocale);
            // Rendered labels only pick up the language on the next render.
            if (lastGood) {
                void enqueue(lastGood);
            }
        },
        destroy() {
            destroyed = true;
            current?.modeler.destroy();
            current = undefined;
            canvas.remove();
        },
    };
}

// The panel runs its effects a frame plus a task after rendering; destroying
// its modeler before then trips them on a destroyed canvas.
function afterPanelEffects(): Promise<void> {
    return new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve)));
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
