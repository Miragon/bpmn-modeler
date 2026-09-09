/**
 * Forked from bpmn-js-properties-panel v5.65.0 (MIT). See LICENSE-upstream.
 * Neutral-mode deltas (applied to every forked entry): `modeling` /
 * `bpmnFactory` / `commandStack` are resolved optionally (absent on a
 * NavigatedViewer), the `disabled` entry flag is forwarded into the primitive
 * options, and setters early-return when their write service is missing.
 */
import { getBusinessObject, is } from "bpmn-js/lib/util/ModelUtil";

import { isAny } from "bpmn-js/lib/features/modeling/util/ModelingUtil";

import { add as collectionAdd } from "diagram-js/lib/util/Collections";

import { TextAreaEntry, isTextAreaEntryEdited } from "@bpmn-io/properties-panel";

import { useService } from "../../hooks/useService";

export function NameProps(props: any): any[] {
    const { element } = props;

    if (isAny(element, ["bpmn:Collaboration", "bpmn:DataAssociation", "bpmn:Association"])) {
        return [];
    }

    return [
        {
            id: "name",
            component: Name,
            isEdited: isTextAreaEntryEdited,
        },
    ];
}

function Name(props: any) {
    const { element, disabled } = props;

    const modeling = useService("modeling", false);
    const debounce = useService("debounceInput");
    const canvas = useService("canvas");
    const bpmnFactory = useService("bpmnFactory", false);
    const translate = useService("translate");

    // (1) default: name
    let options: any = {
        element,
        id: "name",
        label: translate("Name"),
        debounce,
        disabled,
        setValue: (value: string) => {
            if (!modeling) return;
            modeling.updateProperties(element, {
                name: value,
            });
        },
        getValue: (element: any) => {
            return element.businessObject.name;
        },
        autoResize: true,
    };

    // (2) text annotations
    if (is(element, "bpmn:TextAnnotation")) {
        options = {
            ...options,
            setValue: (value: string) => {
                if (!modeling) return;
                modeling.updateProperties(element, {
                    text: value,
                });
            },
            getValue: (element: any) => {
                return element.businessObject.text;
            },
        };
    }

    // (3) groups
    else if (is(element, "bpmn:Group")) {
        options = {
            ...options,
            setValue: (value: string) => {
                if (!modeling) return;
                const businessObject = getBusinessObject(element),
                    categoryValueRef = businessObject.categoryValueRef;

                if (!categoryValueRef) {
                    initializeCategory(businessObject, canvas.getRootElement(), bpmnFactory);
                }

                modeling.updateLabel(element, value);
            },
            getValue: (element: any) => {
                const businessObject = getBusinessObject(element),
                    categoryValueRef = businessObject.categoryValueRef;

                return categoryValueRef && categoryValueRef.value;
            },
        };
    }

    // (4) participants (only update label)
    else if (is(element, "bpmn:Participant")) {
        options.label = translate("Participant Name");
    }

    return TextAreaEntry(options);
}

// helpers ////////////////////////

function initializeCategory(businessObject: any, rootElement: any, bpmnFactory: any): void {
    const definitions = getBusinessObject(rootElement).$parent;

    const categoryValue = createCategoryValue(definitions, bpmnFactory);

    businessObject.categoryValueRef = categoryValue;
}

function createCategoryValue(definitions: any, bpmnFactory: any): any {
    const categoryValue = bpmnFactory.create("bpmn:CategoryValue");

    const category = bpmnFactory.create("bpmn:Category", {
        categoryValue: [categoryValue],
    });

    // add to correct place
    collectionAdd(definitions.get("rootElements"), category);
    getBusinessObject(category).$parent = definitions;
    getBusinessObject(categoryValue).$parent = category;

    return categoryValue;
}
