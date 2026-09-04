/**
 * Forked from bpmn-js-properties-panel v5.65.0 (MIT). See LICENSE-upstream.
 * Verbatim: upsert/remove a `bpmn:FormalExpression` on a moddle element — used
 * by the multi-instance and ad-hoc completion entries.
 */
import { createElement } from "./ElementUtil";

export function createOrUpdateFormalExpression(
    element: any,
    moddleElement: any,
    propertyName: string,
    newValue: string,
    bpmnFactory: any,
    commandStack: any,
): any {
    return commandStack.execute(
        "element.updateModdleProperties",
        createOrUpdateFormalExpressionCommand(
            element,
            moddleElement,
            propertyName,
            newValue,
            bpmnFactory,
        ),
    );
}

function createOrUpdateFormalExpressionCommand(
    element: any,
    moddleElement: any,
    propertyName: string,
    newValue: string,
    bpmnFactory: any,
): any {
    const expressionProps: any = {};

    if (!newValue) {
        // remove formal expression
        expressionProps[propertyName] = undefined;

        return {
            element,
            moddleElement,
            properties: expressionProps,
        };
    }

    const existingExpression = moddleElement.get(propertyName);
    if (existingExpression) {
        // edit existing formal expression
        return {
            element,
            moddleElement: existingExpression,
            properties: {
                body: newValue,
            },
        };
    }

    // add formal expression
    expressionProps[propertyName] = createElement(
        "bpmn:FormalExpression",
        { body: newValue },
        moddleElement,
        bpmnFactory,
    );

    return {
        element,
        moddleElement,
        properties: expressionProps,
    };
}
