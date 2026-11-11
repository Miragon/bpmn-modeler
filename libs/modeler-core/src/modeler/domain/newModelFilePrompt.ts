export interface NewModelFilePrompt {
    readonly title: string;
    readonly filterLabel: string;
    readonly extension: string;
    readonly defaultFileName: string;
}

export function newBpmnModelFilePrompt(): NewModelFilePrompt {
    return {
        title: "New BPMN Model",
        filterLabel: "BPMN",
        extension: "bpmn",
        defaultFileName: "new-diagram.bpmn",
    };
}

export function newDmnModelFilePrompt(): NewModelFilePrompt {
    return {
        title: "New DMN Model",
        filterLabel: "DMN",
        extension: "dmn",
        defaultFileName: "new-diagram.dmn",
    };
}

export function newFormModelFilePrompt(): NewModelFilePrompt {
    return {
        title: "New Camunda Form",
        filterLabel: "Camunda Form",
        extension: "form",
        defaultFileName: "new-form.form",
    };
}
