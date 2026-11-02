import { describe, expect, it } from "vitest";

import { isEntry, roleOf } from "./roleFolders";

describe("roleOf", () => {
    it.each([
        { path: "deployment/domain/envRef.ts", context: "deployment", role: "domain" },
        { path: "kernel/port/Settings.ts", context: "kernel", role: "port" },
        {
            path: "modeler/bpmn/service/BpmnModelerService.ts",
            context: "modeler/bpmn",
            role: "service",
        },
        { path: "deployment/adapter/in/handlers.ts", context: "deployment", role: "adapter/in" },
        {
            path: "deployment/adapter/out/camunda/Camunda7RestClient.ts",
            context: "deployment",
            role: "adapter/out",
        },
        { path: "composition/activate.ts", context: "", role: "composition" },
        {
            path: "deployment/composition/DeploymentFeature.ts",
            context: "deployment",
            role: "composition",
        },
        { path: "testing/createTestHost.ts", context: "", role: "testing" },
        { path: "deployment/service/domain/x.ts", context: "deployment", role: "service" },
    ])("places $path in $context as $role", ({ path, context, role }) => {
        expect(roleOf(path)).toEqual({ context, role });
    });

    it.each([
        "index.ts",
        "deployment/helpers/format.ts",
        "deployment/adapter/format.ts",
        "deployment/adapter/sideways/format.ts",
        "deployment/domain.ts",
        "deployment/adapter/in.ts",
    ])("places %s in no role folder", (path) => {
        expect(roleOf(path)).toBeUndefined();
    });
});

describe("isEntry", () => {
    it.each(["index.ts", "main.ts"])("treats %s as an entry", (path) => {
        expect(isEntry(path)).toBe(true);
    });

    it("does not treat a nested index.ts as an entry", () => {
        expect(isEntry("testing/index.ts")).toBe(false);
    });
});
