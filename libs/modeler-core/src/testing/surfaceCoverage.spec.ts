import { describe, expect, it } from "vitest";

import { WEBVIEW_SURFACE_COMMAND_TYPES, WebviewSurface } from "@miragon/bpmn-modeler-shared";

import { WebviewMessageRouter } from "../editorSession/service/WebviewMessageRouter";
import {
    absent,
    HANDLED,
    HostSurfaceCoverage,
    ignored,
    routesOf,
    servedSurfaceCoverage,
    SurfaceCoverage,
} from "./surfaceCoverage";

function coverageOf<TSurface extends WebviewSurface>(
    surface: TSurface,
    route: (type: string) => typeof HANDLED | ReturnType<typeof ignored>,
): SurfaceCoverage<TSurface> {
    return Object.fromEntries(
        WEBVIEW_SURFACE_COMMAND_TYPES[surface].map((type) => [type, route(type)]),
    ) as SurfaceCoverage<TSurface>;
}

function routerServing(surface: WebviewSurface): WebviewMessageRouter {
    const router = new WebviewMessageRouter();
    for (const type of WEBVIEW_SURFACE_COMMAND_TYPES[surface]) {
        if (type === "LogErrorCommand") {
            router.ignore(type, "no log");
        } else {
            router.on(type, () => undefined);
        }
    }
    return router;
}

const servedRoute = (type: string) => (type === "LogErrorCommand" ? ignored("no log") : HANDLED);

const declared: HostSurfaceCoverage = {
    bpmnEditor: coverageOf("bpmnEditor", servedRoute),
    bpmnDiffPane: coverageOf("bpmnDiffPane", servedRoute),
    dmnEditor: absent("no DMN editor"),
    dmnDiffPane: absent("no DMN diff pane"),
    formEditor: coverageOf("formEditor", servedRoute),
    templateEditor: absent("no template editor"),
    deploymentSidebar: absent("no deployment sidebar"),
    addOnsView: absent("no add-ons view"),
};

describe("routesOf", () => {
    it("reads each type's route, unrouted ones included", () => {
        const router = new WebviewMessageRouter()
            .on("LogInfoCommand", () => undefined)
            .ignore("LogErrorCommand", "no errors");

        expect(
            routesOf(router, ["LogInfoCommand", "LogErrorCommand", "LogWarningCommand"]),
        ).toEqual({
            LogInfoCommand: { kind: "handled" },
            LogErrorCommand: { kind: "ignored", reason: "no errors" },
            LogWarningCommand: { kind: "unrouted" },
        });
    });
});

describe("servedSurfaceCoverage", () => {
    it("matches the declared coverage when the host serves exactly its surfaces", () => {
        const served = servedSurfaceCoverage(
            {
                bpmnEditor: routerServing("bpmnEditor"),
                bpmnDiffPane: routerServing("bpmnDiffPane"),
                formEditor: routerServing("formEditor"),
            },
            declared,
        );

        expect(served).toEqual(declared);
    });

    it("reads a surface the host declares but does not route as unserved", () => {
        const served = servedSurfaceCoverage(
            {
                bpmnEditor: routerServing("bpmnEditor"),
                bpmnDiffPane: routerServing("bpmnDiffPane"),
            },
            declared,
        );

        expect(served.formEditor).toBe("unserved");
    });

    it("reads the routes of a surface the host declares absent", () => {
        const served = servedSurfaceCoverage(
            { dmnEditor: new WebviewMessageRouter().on("GetDmnFileCommand", () => undefined) },
            declared,
        );

        expect(served.dmnEditor).toMatchObject({
            GetDmnFileCommand: HANDLED,
            SyncDocumentCommand: { kind: "unrouted" },
        });
    });
});
