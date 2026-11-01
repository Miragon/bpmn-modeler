/**
 * A moddle package for the modeler namespace, shaped like Camunda's
 * `modeler-moddle`: it reads the execution platform into typed properties.
 */
export const MODELER_MODDLE = {
    name: "Camunda Modeler",
    prefix: "modeler",
    uri: "http://camunda.org/schema/modeler/1.0",
    xml: { tagAlias: "lowerCase" },
    types: [
        {
            name: "Definitions",
            isAbstract: true,
            extends: ["bpmn:Definitions"],
            properties: [
                { name: "executionPlatform", isAttr: true, type: "String" },
                { name: "executionPlatformVersion", isAttr: true, type: "String" },
            ],
        },
    ],
};

/** Declares Camunda 8.7 on the diagram's definitions under `prefix`, bound to the modeler namespace. */
export function declaringCamunda87Under(prefix: string, xml: string): string {
    return xml.replace(
        "<bpmn:definitions ",
        `<bpmn:definitions xmlns:${prefix}="${MODELER_MODDLE.uri}" ${prefix}:executionPlatform="Camunda Cloud" ${prefix}:executionPlatformVersion="8.7.0" `,
    );
}
