import { Engine } from "@miragon/bpmn-modeler-types";

import { expandUrlTemplate, stripTrailingSlash } from "./urlTemplate";

const ENDPOINT = "<endpoint>";

/**
 * Where an engine takes a deployment and a process start when the target
 * overrides neither: `<endpoint>` stands for the target's endpoint and
 * `{processDefinitionKey}` for the key, as in a start-URL override.
 */
export interface EngineRoutes {
    readonly deployUrl: string;
    readonly startInstanceUrl: string;
}

export type ConventionalRoutes = Readonly<Record<Engine, EngineRoutes>>;

export function conventionalRoutes(c8ApiVersion: string): ConventionalRoutes {
    return {
        c7: {
            deployUrl: `${ENDPOINT}/deployment/create`,
            startInstanceUrl: `${ENDPOINT}/process-definition/key/{processDefinitionKey}/start`,
        },
        c8: {
            deployUrl: `${ENDPOINT}/${c8ApiVersion}/deployments`,
            startInstanceUrl: `${ENDPOINT}/${c8ApiVersion}/process-instances`,
        },
    };
}

/**
 * The endpoint goes in last and through a function, so a
 * `{processDefinitionKey}` or `$&` in it stays as typed.
 */
export function expandRoute(
    template: string,
    values: { endpoint: string; processDefinitionKey?: string },
): string {
    const endpoint = stripTrailingSlash(values.endpoint);
    return expandUrlTemplate(template, {
        processDefinitionKey: values.processDefinitionKey ?? "",
    }).replace(ENDPOINT, () => endpoint);
}
