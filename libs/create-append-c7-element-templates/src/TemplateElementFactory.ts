/**
 * Creates bpmn-js shapes preconfigured with a Camunda 7 element template.
 *
 * Handles the three-step process:
 * 1. Create the base shape from the template's `appliesTo` / `elementType`.
 * 2. Stamp `camunda:modelerTemplate` and version onto the business object.
 * 3. Execute the properties-panel command to apply template bindings.
 */
import { getBusinessObject } from "bpmn-js/lib/util/ModelUtil";

/**
 * Subset of the element template schema needed to create a preconfigured shape.
 */
interface C7ElementTemplate {
    id: string;
    version?: number;
    appliesTo: string[];
    elementType?: {
        value?: string;
        eventDefinition?: string;
    };
}

/**
 * Factory that produces bpmn-js shapes with a Camunda 7 element template
 * already applied, ready for placement on the canvas.
 */
export class TemplateElementFactory {
    static $inject = ["commandStack", "elementFactory"];

    private readonly commandStack: any;

    private readonly elementFactory: any;

    /**
     * @param commandStack The bpmn-js command stack service.
     * @param elementFactory The bpmn-js element factory service.
     */
    constructor(commandStack: any, elementFactory: any) {
        this.commandStack = commandStack;
        this.elementFactory = elementFactory;
    }

    /**
     * Creates a shape with the given element template applied.
     *
     * @param template The element template to apply.
     * @returns The created bpmn-js shape with template bindings applied.
     */
    create(template: C7ElementTemplate): any {
        const element = this.createShape(template);
        this.setModelerTemplate(element, template);

        this.commandStack.execute("propertiesPanel.camunda.changeTemplate", {
            element,
            oldTemplate: null,
            newTemplate: template,
        });

        return element;
    }

    /**
     * Creates the base shape from the template's type information.
     *
     * Uses `elementType.value` if specified, otherwise falls back to the
     * first entry in `appliesTo`.
     *
     * @param template The element template.
     * @returns The created bpmn-js shape.
     */
    private createShape(template: C7ElementTemplate): any {
        const { appliesTo, elementType } = template;

        const type = elementType?.value ?? appliesTo[0];
        const attrs: Record<string, string> = { type };

        if (elementType?.eventDefinition) {
            attrs.eventDefinitionType = elementType.eventDefinition;
        }

        return this.elementFactory.createShape(attrs);
    }

    /**
     * Stamps the template ID and version onto the element's business object.
     *
     * @param element The bpmn-js shape.
     * @param template The element template.
     */
    private setModelerTemplate(element: any, template: C7ElementTemplate): void {
        const businessObject = getBusinessObject(element);

        businessObject.set("camunda:modelerTemplate", template.id);
        businessObject.set("camunda:modelerTemplateVersion", template.version);
    }
}
