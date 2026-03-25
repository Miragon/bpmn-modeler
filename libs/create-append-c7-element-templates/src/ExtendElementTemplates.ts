/**
 * Polyfills `elementTemplates.createElement()` on the C7 element templates
 * service if the method does not already exist.
 *
 * The `bpmn-js-create-append-anything` plugin calls `createElement()` to
 * produce a shape preconfigured with a template, but the Camunda 7
 * properties panel does not ship this method.  This class bridges the gap
 * by delegating to {@link TemplateElementFactory}.
 */
import type { TemplateElementFactory } from "./TemplateElementFactory";

/**
 * DI initialiser that patches `createElement` onto the C7 element templates
 * service instance at startup.
 */
export class ExtendElementTemplates {
    static $inject = ["elementTemplates", "templateElementFactory"];

    /**
     * Checks whether `createElement` already exists on the element templates
     * service.  If not, assigns it as an instance method that delegates to
     * the {@link TemplateElementFactory}.
     *
     * @param elementTemplates The bpmn-js element templates service.
     * @param templateElementFactory The factory that creates template-preconfigured shapes.
     */
    constructor(elementTemplates: any, templateElementFactory: TemplateElementFactory) {
        if (typeof elementTemplates.createElement === "function") {
            return;
        }

        elementTemplates.createElement = (template: any) => {
            if (!template) {
                throw new Error("template is missing");
            }

            return templateElementFactory.create(template);
        };
    }
}
