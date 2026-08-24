import { getLatestVersion } from "../../../shared/domain/engineVersions";

export const EMPTY_FORM = JSON.stringify(
    {
        components: [],
        type: "default",
        id: "Form_1",
        executionPlatform: "Camunda Cloud",
        executionPlatformVersion: getLatestVersion("c8"),
    },
    null,
    2,
);
