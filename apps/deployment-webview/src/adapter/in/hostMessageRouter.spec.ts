import { describe, expect, it, vi } from "vitest";

import {
    AdditionalFilesQuery,
    DeploymentResultQuery,
    DeploymentTargetsQuery,
    FormDefaultsQuery,
    ProcessDefinitionKeyQuery,
    SelectedPayloadFileQuery,
    StartInstanceResultQuery,
    StoredCredentialsQuery,
    TargetSavedQuery,
    type Command,
    type Query,
} from "@miragon/bpmn-modeler-shared";

import { routeHostMessage } from "./hostMessageRouter";

describe("routeHostMessage", () => {
    function forms() {
        return {
            form: {
                populate: vi.fn(),
                setAdditionalFiles: vi.fn(),
                populateCredentials: vi.fn(),
                setTargets: vi.fn(),
                showTargetResult: vi.fn(),
                showResult: vi.fn(),
            },
            startForm: {
                setProcessDefinitionKey: vi.fn(),
                setPayloadFile: vi.fn(),
                showResult: vi.fn(),
            },
        };
    }

    const defaults = {
        deploymentName: "order",
        endpoint: "https://adhoc.test",
        tenantId: "",
        engine: "c7" as const,
        authType: "none" as const,
        conventionalRoutes: {
            c7: { deployUrl: "<endpoint>/deploy", startInstanceUrl: "<endpoint>/start" },
            c8: { deployUrl: "<endpoint>/v2/deploy", startInstanceUrl: "<endpoint>/v2/start" },
        },
    };
    const credentials = new StoredCredentialsQuery({ authType: "none" }, "dev", 1);
    const targets = new DeploymentTargetsQuery([], "");
    const deployed = new DeploymentResultQuery(true, "Deployed");
    const started = new StartInstanceResultQuery(true, "Started", "42");

    it.each<[Query, "form" | "startForm", string, unknown[]]>([
        [new FormDefaultsQuery(defaults), "form", "populate", [defaults]],
        [new AdditionalFilesQuery(["a.dmn"]), "form", "setAdditionalFiles", [["a.dmn"]]],
        [credentials, "form", "populateCredentials", [credentials]],
        [targets, "form", "setTargets", [targets]],
        [new TargetSavedQuery(false, "exists"), "form", "showTargetResult", [false, "exists"]],
        [deployed, "form", "showResult", [deployed]],
        [new ProcessDefinitionKeyQuery("P"), "startForm", "setProcessDefinitionKey", ["P"]],
        [
            new SelectedPayloadFileQuery("/ws/p.json", "p.json"),
            "startForm",
            "setPayloadFile",
            ["/ws/p.json", "p.json"],
        ],
        [started, "startForm", "showResult", [started]],
    ])("hands %o to %s.%s", (message, target, method, args) => {
        const routed = forms();

        routeHostMessage(message, routed.form, routed.startForm);

        const handler = (routed[target] as Record<string, ReturnType<typeof vi.fn>>)[method];
        expect(handler).toHaveBeenCalledExactlyOnceWith(...args);
        const otherCalls = [...Object.values(routed.form), ...Object.values(routed.startForm)]
            .filter((fn) => fn !== handler)
            .flatMap((fn) => fn.mock.calls);
        expect(otherCalls).toEqual([]);
    });

    it("ignores a message no form handles", () => {
        vi.spyOn(console, "debug").mockImplementation(() => undefined);
        const routed = forms();

        routeHostMessage(
            { type: "ThemeChangedQuery" } as unknown as Command,
            routed.form,
            routed.startForm,
        );

        const allCalls = [
            ...Object.values(routed.form),
            ...Object.values(routed.startForm),
        ].flatMap((fn) => fn.mock.calls);
        expect(allCalls).toEqual([]);
    });
});
