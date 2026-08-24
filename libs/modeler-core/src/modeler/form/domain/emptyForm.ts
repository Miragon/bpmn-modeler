import { getLatestVersion } from "../../../shared/domain/engineVersions";

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
            executionPlatform: "Camunda Cloud",
            executionPlatformVersion: getLatestVersion("c8"),
        },
        null,
        2,
    );
}
