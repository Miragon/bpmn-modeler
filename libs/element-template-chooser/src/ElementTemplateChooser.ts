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

/**
 * Opens the element template chooser overlay when the properties panel
 * fires an `elementTemplates.select` event.
 *
 * Resolves the matching templates for the selected element, renders the
 * overlay, and applies the chosen template when the user confirms.
 */
class ElementTemplateChooser {
    static $inject = ["config.connectorsExtension", "eventBus", "elementTemplates", "canvas"];

    constructor(config: any, eventBus: any, elementTemplates: any, canvas: any) {
        const enableChooser = !config || config.elementTemplateChooser !== false;

        if (!enableChooser) {
            return;
        }

        eventBus.on("elementTemplates.select", (event: any) => {
            const { element } = event;

            this.open(element, elementTemplates, canvas)
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
    private open(element: any, elementTemplates: any, canvas: any): Promise<ElementTemplate> {
        return new Promise((resolve, reject) => {
            const templates: ElementTemplate[] = elementTemplates
                .getLatest(element)
                .filter((t: ElementTemplate) => !isTemplateApplied(element, t));

            const container = document.createElement("div");
            container.className = "etc-overlay-root";
            const canvasContainer: HTMLElement = canvas.getContainer();
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

            render(
                h(ChooserOverlay, { templates, onSelect, onCancel }),
                container,
            );
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
function isTemplateApplied(element: any, template: ElementTemplate): boolean {
    const bo = getBusinessObject(element);
    return bo ? bo.get("modelerTemplate") === template.id : false;
}

export { ElementTemplateChooser };
