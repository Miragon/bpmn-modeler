import { describe, expect, it } from "vitest";

import { conventionalRoutes, expandRoute } from "./engineRoutes";

const C7_DEPLOY = "<endpoint>/deployment/create";
const C7_START = "<endpoint>/process-definition/key/{processDefinitionKey}/start";

describe("conventionalRoutes", () => {
    it.each([
        { engine: "c7", c8ApiVersion: "v2", deployUrl: C7_DEPLOY, startInstanceUrl: C7_START },
        { engine: "c7", c8ApiVersion: "v1", deployUrl: C7_DEPLOY, startInstanceUrl: C7_START },
        {
            engine: "c8",
            c8ApiVersion: "v2",
            deployUrl: "<endpoint>/v2/deployments",
            startInstanceUrl: "<endpoint>/v2/process-instances",
        },
        {
            engine: "c8",
            c8ApiVersion: "v1",
            deployUrl: "<endpoint>/v1/deployments",
            startInstanceUrl: "<endpoint>/v1/process-instances",
        },
    ] as const)(
        "routes $engine with the C8 API version $c8ApiVersion",
        ({ engine, c8ApiVersion, deployUrl, startInstanceUrl }) => {
            expect(conventionalRoutes(c8ApiVersion)[engine]).toEqual({
                deployUrl,
                startInstanceUrl,
            });
        },
    );
});

describe("expandRoute", () => {
    it.each([
        {
            case: "appends the route to an endpoint with a trailing slash",
            template: C7_DEPLOY,
            endpoint: "https://host/engine-rest/",
            processDefinitionKey: undefined,
            url: "https://host/engine-rest/deployment/create",
        },
        {
            case: "percent-encodes the key so it cannot escape its path segment",
            template: C7_START,
            endpoint: "https://host/engine-rest",
            processDefinitionKey: "a/b?c",
            url: "https://host/engine-rest/process-definition/key/a%2Fb%3Fc/start",
        },
        {
            case: "inserts an endpoint holding a replacement pattern verbatim",
            template: C7_DEPLOY,
            endpoint: "https://host/$&/engine-rest",
            processDefinitionKey: undefined,
            url: "https://host/$&/engine-rest/deployment/create",
        },
        {
            case: "leaves a key placeholder inside the endpoint alone",
            template: C7_START,
            endpoint: "https://gw/{processDefinitionKey}",
            processDefinitionKey: "order",
            url: "https://gw/{processDefinitionKey}/process-definition/key/order/start",
        },
    ])("$case", ({ template, endpoint, processDefinitionKey, url }) => {
        expect(expandRoute(template, { endpoint, processDefinitionKey })).toBe(url);
    });
});
