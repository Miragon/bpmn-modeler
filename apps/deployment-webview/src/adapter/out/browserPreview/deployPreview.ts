import {
    AdditionalFilesQuery,
    DeploymentResultQuery,
    FormDefaultsQuery,
} from "@miragon/bpmn-modeler-shared";

export function previewFormDefaults(): FormDefaultsQuery {
    return new FormDefaultsQuery({
        deploymentName: "my-process",
        tenantId: "",
        endpoint: "http://localhost:8080/engine-rest",
        engine: "c7",
        authType: "none",
        conventionalRoutes: {
            c7: {
                deployUrl: "<endpoint>/deployment/create",
                startInstanceUrl: "<endpoint>/process-definition/key/{processDefinitionKey}/start",
            },
            c8: {
                deployUrl: "<endpoint>/v2/deployments",
                startInstanceUrl: "<endpoint>/v2/process-instances",
            },
        },
    });
}

/** The preview has no workspace to pick files from. */
export function noAdditionalFiles(): AdditionalFilesQuery {
    return new AdditionalFilesQuery([]);
}

/** The preview reaches no engine, so every deployment succeeds. */
export function succeededDeployment(): DeploymentResultQuery {
    return new DeploymentResultQuery(true, "Deployment succeeded (mock).");
}
