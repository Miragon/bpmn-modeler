/**
 * bpmn-js DI service that intercepts the `elementTemplates.select` event
 * from the properties panel and opens a modern overlay for template selection.
 *
 * Renders a Preact component tree into a container appended to the canvas
 * parent, providing search, category filtering, and a parameter preview
 * before applying a chosen template.
 */
import { render, h } from "preact";
import { ChooserOverlay } from "./components/ChooserOverlay";
import type { ElementTemplate } from "./types";
import { getBusinessObject } from "bpmn-js/lib/util/ModelUtil";
import type { Element } from "bpmn-js/lib/model/Types";
import type EventBus from "diagram-js/lib/core/EventBus";
import type Canvas from "diagram-js/lib/core/Canvas";

/** The `config.connectorsExtension` value injected into the chooser. */
interface ElementTemplateChooserConfig {
    elementTemplateChooser?: boolean;
}

/** Minimal surface of the bpmn-js element-templates service used by the chooser. */
interface ElementTemplatesService {
    getLatest(element: Element): ElementTemplate[];
    applyTemplate(element: Element, template: ElementTemplate): void;
}

interface InjectorLike {
    get<T = unknown>(name: string, strict: false): T | null;
}

type Translate = (template: string, replacements?: Record<string, string>) => string;

// Fallback when no TranslateModule is registered (third-party bpmn-js setups):
// echo the template while still resolving {placeholders}, matching diagram-js.
const fallbackTranslate: Translate = (template, replacements = {}) =>
    template.replace(/{([^}]+)}/g, (_, key) => replacements[key] ?? `{${key}}`);

/**
 * Opens the element template chooser overlay when the properties panel
 * fires an `elementTemplates.select` event.
 *
 * Resolves the matching templates for the selected element, renders the
 * overlay, and applies the chosen template when the user confirms.
 */
class ElementTemplateChooser {
    static $inject = [
        "config.connectorsExtension",
        "eventBus",
        "elementTemplates",
        "canvas",
        "injector",
    ];

    constructor(
        config: ElementTemplateChooserConfig | null,
        eventBus: EventBus,
        elementTemplates: ElementTemplatesService,
        canvas: Canvas,
        injector: InjectorLike,
    ) {
        const enableChooser = !config || config.elementTemplateChooser !== false;

        if (!enableChooser) {
            return;
        }

        const translate = injector.get<Translate>("translate", false) ?? fallbackTranslate;

        eventBus.on<{ element: Element }>("elementTemplates.select", (event) => {
            const { element } = event;

            this.open(element, elementTemplates, canvas, translate)
                .then((template) => {
                    elementTemplates.applyTemplate(element, template);
                })
                .catch((err: unknown) => {
                    if (err !== "user-canceled") {
                        console.error("elementTemplate.select :: error", err);
                    }
                });
        });
    }

    /**
     * Opens the chooser overlay for the given BPMN element.
     *
     * @param element The selected BPMN element.
     * @param elementTemplates The bpmn-js element templates service.
     * @param canvas The bpmn-js canvas service.
     * @returns A promise that resolves with the chosen template or rejects on cancel.
     */
    private open(
        element: Element,
        elementTemplates: ElementTemplatesService,
        canvas: Canvas,
        translate: Translate,
    ): Promise<ElementTemplate> {
        return new Promise((resolve, reject) => {
            const templates: ElementTemplate[] = elementTemplates
                .getLatest(element)
                .filter((t: ElementTemplate) => !isTemplateApplied(element, t));

            const container = document.createElement("div");
            container.className = "etc-overlay-root";
            const canvasContainer: HTMLElement = canvas.getContainer();
            // The overlay mounts on the canvas parent, outside the instance's
            // themed container, so copy the instance's `data-bpmn-theme` onto its
            // own root — otherwise a dark instance would show a light chooser.
            const themeKind = canvasContainer
                .closest("[data-bpmn-theme]")
                ?.getAttribute("data-bpmn-theme");
            if (themeKind) {
                container.setAttribute("data-bpmn-theme", themeKind);
            }
            canvasContainer.parentElement!.appendChild(container);

            const close = () => {
                render(null, container);
                container.remove();
            };

            const onSelect = (template: ElementTemplate) => {
                close();
                resolve(template);
            };

            const onCancel = () => {
                close();
                reject("user-canceled");
            };

            render(h(ChooserOverlay, { templates, translate, onSelect, onCancel }), container);
        });
    }
}

/**
 * Checks whether the given template is already applied to the element.
 *
 * @param element The BPMN element to check.
 * @param template The template to check against.
 * @returns `true` if the template is currently applied.
 */
function isTemplateApplied(element: Element, template: ElementTemplate): boolean {
    const bo = getBusinessObject(element);
    return bo ? bo.get("modelerTemplate") === template.id : false;
}

export { ElementTemplateChooser };
