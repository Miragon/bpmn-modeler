import { ENGINE_EXECUTION_PLATFORM } from "@miragon/bpmn-modeler-types";
import { latestFormVersion } from "./formEngine";

const FORM_ID_CHARACTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

export function createEmptyForm(): string {
    let id = "Form_";
    for (let i = 0; i < 8; i++) {
        id += FORM_ID_CHARACTERS.charAt(Math.floor(Math.random() * FORM_ID_CHARACTERS.length));
    }

    return JSON.stringify(
        {
            components: [],
            type: "default",
            id,
            executionPlatform: ENGINE_EXECUTION_PLATFORM.c8,
            executionPlatformVersion: latestFormVersion("c8"),
        },
        null,
        2,
    );
}
