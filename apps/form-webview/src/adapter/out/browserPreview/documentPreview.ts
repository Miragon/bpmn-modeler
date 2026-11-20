import { FormFileQuery, FormInputValuesQuery } from "@miragon/bpmn-modeler-shared";

export function emptyCamunda8Form(): FormFileQuery {
    return new FormFileQuery(
        JSON.stringify(
            {
                components: [],
                type: "default",
                id: "Form_1",
                executionPlatform: "Camunda Cloud",
                executionPlatformVersion: "8.8.0",
            },
            null,
            2,
        ),
    );
}

export function emptyInputValues(): FormInputValuesQuery {
    return new FormInputValuesQuery("{}");
}
