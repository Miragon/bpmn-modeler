// IntelliJ's NewModelFileDialogTest holds the Kotlin BPMN and DMN dialogs to these titles, descriptions and extensions.
export interface NewModelFilePrompt {
    readonly title: string;
    /** Shown under the title where the host's save dialog has room for it; VS Code's has none. */
    readonly description: string;
    readonly filterLabel: string;
    readonly extension: string;
    readonly defaultFileName: string;
}

export function newBpmnModelFilePrompt(): NewModelFilePrompt {
    return {
        title: "New BPMN Model",
        description: "Create a new empty BPMN diagram",
        filterLabel: "BPMN",
        extension: "bpmn",
        defaultFileName: "new-diagram.bpmn",
    };
}

export function newDmnModelFilePrompt(): NewModelFilePrompt {
    return {
        title: "New DMN Model",
        description: "Create a new empty DMN decision",
        filterLabel: "DMN",
        extension: "dmn",
        defaultFileName: "new-diagram.dmn",
    };
}

export function newFormModelFilePrompt(): NewModelFilePrompt {
    return {
        title: "New Camunda Form",
        description: "Create a new empty Camunda form",
        filterLabel: "Camunda Form",
        extension: "form",
        defaultFileName: "new-form.form",
    };
}
