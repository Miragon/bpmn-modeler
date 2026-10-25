import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    BpmnModelerSettingQuery,
    CleanupDiagramQuery,
    type Command,
    ElementTemplatesQuery,
    GetDiagramAsSVGCommand,
    ImplementationStatusQuery,
    type Query,
    UpdateOpenScriptEditorsQuery,
    UpdateScriptContentQuery,
    UpdateScriptFormatQuery,
} from "@miragon/bpmn-modeler-shared";

import type { SurfaceHandle } from "../surface";
import { createSurfaceRequests, elementTemplateRejectionReport } from "./surfaceRequests";

const scriptTaskDefinitions = {
    rootElements: [
        {
            $type: "bpmn:Process",
            flowElements: [{ $type: "bpmn:ScriptTask", id: "Task_1", resultVariable: "total" }],
        },
    ],
};

function createHost() {
    const sent: (Command | Query)[] = [];
    return {
        sent,
        postMessage: vi.fn((message: Command | Query) => {
            sent.push(message);
        }),
        sentTypes: () => sent.map((message) => message.type),
    };
}

function modelerSurface() {
    return {
        setMode: vi.fn(),
        newDiagram: vi.fn(),
        getDiagramSvg: vi.fn(async () => "<svg />"),
        getDefinitions: vi.fn(() => scriptTaskDefinitions),
        collectInlineScriptTasks: vi.fn(() => [
            { elementId: "Task_1", scriptFormat: "javascript", content: "total = 1" },
        ]),
        formatDiagram: vi.fn(async () => undefined),
        cleanupDiagram: vi.fn(() => ({ status: "clean", items: [] })),
        updateScriptContent: vi.fn(),
        updateScriptFormat: vi.fn(),
        applyOpenScriptEditors: vi.fn(),
        applyImplementationStatus: vi.fn(),
        setElementTemplates: vi.fn(),
        setSettings: vi.fn(),
    };
}

function designerSurface() {
    return {
        newDiagram: vi.fn(),
        formatDiagram: vi.fn(async () => undefined),
        cleanupDiagram: vi.fn(() => ({ status: "clean", items: [] })),
        setFavouriteBpmnElements: vi.fn(),
    };
}

function viewerSurface() {
    return { getDiagramSvg: vi.fn(async () => "<svg viewer />") };
}

function surfaceRequestsOn<Surface extends object>(surface: Surface) {
    const host = createHost();
    const hostModelerState = { rememberSettings: vi.fn(), rememberOpenScripts: vi.fn() };
    const theme = { setMode: vi.fn() };
    const replies = { elementTemplates: { done: vi.fn() }, settings: { done: vi.fn() } };
    const requests = createSurfaceRequests(host, () => surface as unknown as SurfaceHandle, {
        hostModelerState,
        theme,
        replies,
    });
    return { host, surface, hostModelerState, theme, replies, ...requests };
}

const openScriptTask = {
    elementId: "Task_1",
    kind: "script-task" as const,
    listenerIndex: undefined,
    fileName: "Task_1.js",
};

const hostSettings = {
    alignToOrigin: true,
    showTransactionBoundaries: false,
    colorTheme: "light" as const,
    favouriteBpmnElements: ["bpmn:UserTask"],
};

describe("elementTemplateRejectionReport", () => {
    it.each([
        ["no errors", []],
        ["a missing error list", undefined],
    ])("reports nothing for %s", (_case, errors) => {
        expect(elementTemplateRejectionReport(errors)).toEqual({ logLines: [], notice: undefined });
    });

    it("logs a single rejection and announces it once", () => {
        expect(elementTemplateRejectionReport([new Error("bad id")])).toEqual({
            logLines: ["Element template rejected: bad id"],
            notice: "An element template was rejected and is ignored. See the log for details.",
        });
    });

    it("logs every rejection and announces their count", () => {
        expect(elementTemplateRejectionReport([new Error("bad"), "worse"])).toEqual({
            logLines: ["Element template rejected: bad", "Element template rejected: worse"],
            notice: "2 element templates were rejected and are ignored. See the log for details.",
        });
    });
});

describe("createSurfaceRequests", () => {
    beforeEach(() => {
        vi.spyOn(console, "debug").mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("posts the rejection log lines before the notice", () => {
        const { host, reportElementTemplateErrors } = surfaceRequestsOn(modelerSurface());

        reportElementTemplateErrors([new Error("bad"), "worse"]);
        reportElementTemplateErrors([]);

        expect(host.sent).toEqual([
            expect.objectContaining({
                type: "LogWarningCommand",
                message: "Element template rejected: bad",
            }),
            expect.objectContaining({
                type: "LogWarningCommand",
                message: "Element template rejected: worse",
            }),
            expect.objectContaining({
                type: "ShowInfoCommand",
                message:
                    "2 element templates were rejected and are ignored. See the log for details.",
            }),
        ]);
    });

    it("echoes an SVG request with the rendered diagram of any surface", async () => {
        const { host, handlers } = surfaceRequestsOn(viewerSurface());
        const command = new GetDiagramAsSVGCommand();

        await handlers.GetDiagramAsSVGCommand(command);

        expect(host.sent).toEqual([command]);
        expect(command.svg).toBe("<svg viewer />");
    });

    it("hands every inline script task to the host with the diagram's variables", () => {
        const { host, handlers } = surfaceRequestsOn(modelerSurface());

        handlers.OpenAllScriptTasksQuery();

        expect(host.sent).toEqual([
            expect.objectContaining({
                type: "OpenScriptEditorsCommand",
                scripts: [
                    { elementId: "Task_1", scriptFormat: "javascript", content: "total = 1" },
                ],
                variables: [expect.objectContaining({ name: "total" })],
            }),
        ]);
    });

    describe("format", () => {
        it("leaves the outcome report of a format run to the layout event", async () => {
            const { host, surface, handlers } = surfaceRequestsOn(designerSurface());

            await handlers.FormatDiagramQuery();

            expect(surface.formatDiagram).toHaveBeenCalledOnce();
            expect(host.postMessage).not.toHaveBeenCalled();
        });

        it("answers a surface that cannot format with a failure", async () => {
            const { host, handlers } = surfaceRequestsOn(viewerSurface());

            await handlers.FormatDiagramQuery();

            expect(host.sent).toEqual([
                expect.objectContaining({
                    type: "DiagramFormattedCommand",
                    status: "failed",
                    diagnostics: [],
                    code: "UNSUPPORTED_SURFACE",
                }),
            ]);
        });

        it("answers a format run that throws with an engine failure", async () => {
            const surface = modelerSurface();
            surface.formatDiagram.mockRejectedValue(new Error("layout engine crashed"));
            const { host, handlers } = surfaceRequestsOn(surface);

            await handlers.FormatDiagramQuery();

            expect(host.sent).toEqual([
                expect.objectContaining({
                    type: "DiagramFormattedCommand",
                    status: "failed",
                    code: "ENGINE_FAILED",
                    message: "layout engine crashed",
                }),
            ]);
        });
    });

    describe("cleanup", () => {
        it("reports the outcome of the requested leg", () => {
            const { host, surface, handlers } = surfaceRequestsOn(modelerSurface());

            handlers.CleanupDiagramQuery(new CleanupDiagramQuery(true));

            expect(surface.cleanupDiagram).toHaveBeenCalledWith({ apply: true });
            expect(host.sent).toEqual([
                expect.objectContaining({
                    type: "CleanupReportCommand",
                    outcome: { status: "clean", items: [] },
                    applied: true,
                }),
            ]);
        });

        it("logs a failed cleanup before reporting it", () => {
            const surface = designerSurface();
            surface.cleanupDiagram.mockReturnValue({
                status: "failed",
                items: [],
                message: "no layout",
            } as never);
            const { host, handlers } = surfaceRequestsOn(surface);

            handlers.CleanupDiagramQuery(new CleanupDiagramQuery(false));

            expect(host.sent).toEqual([
                expect.objectContaining({
                    type: "LogErrorCommand",
                    message: "Error receiving message: CleanupDiagramQuery — no layout",
                }),
                expect.objectContaining({ type: "CleanupReportCommand", applied: false }),
            ]);
        });

        it("reports a surface that cannot be cleaned up as a failure, not a clean diagram", () => {
            const { host, handlers } = surfaceRequestsOn(viewerSurface());

            handlers.CleanupDiagramQuery(new CleanupDiagramQuery(false));

            expect(host.sent).toEqual([
                expect.objectContaining({
                    type: "LogErrorCommand",
                    message:
                        "Error receiving message: CleanupDiagramQuery — this surface cannot be cleaned up",
                }),
                expect.objectContaining({
                    type: "CleanupReportCommand",
                    outcome: {
                        status: "failed",
                        items: [],
                        message: "this surface cannot be cleaned up",
                    },
                    applied: false,
                }),
            ]);
        });

        it("still answers a cleanup that throws", () => {
            const surface = modelerSurface();
            surface.cleanupDiagram.mockImplementation(() => {
                throw new Error("cleanup crashed");
            });
            const { host, handlers } = surfaceRequestsOn(surface);

            handlers.CleanupDiagramQuery(new CleanupDiagramQuery(true));

            expect(host.sent).toEqual([
                expect.objectContaining({
                    type: "LogErrorCommand",
                    message: "Error receiving message: CleanupDiagramQuery — cleanup crashed",
                }),
                expect.objectContaining({
                    type: "CleanupReportCommand",
                    outcome: { status: "failed", items: [], message: "cleanup crashed" },
                    applied: true,
                }),
            ]);
        });
    });

    it("hands the host's script edits and implementation status to the modeler", () => {
        const { surface, handlers } = surfaceRequestsOn(modelerSurface());
        const resolved = { "com.example.Delegate": true };

        handlers.UpdateScriptContentQuery(
            new UpdateScriptContentQuery("Task_1", "script-task", undefined, "total = 2"),
        );
        handlers.UpdateScriptFormatQuery(
            new UpdateScriptFormatQuery("Task_1", "execution-listener", 0, "groovy"),
        );
        handlers.ImplementationStatusQuery(new ImplementationStatusQuery(resolved));

        expect(surface.updateScriptContent).toHaveBeenCalledExactlyOnceWith(
            "Task_1",
            "script-task",
            undefined,
            "total = 2",
        );
        expect(surface.updateScriptFormat).toHaveBeenCalledExactlyOnceWith(
            "Task_1",
            "execution-listener",
            0,
            "groovy",
        );
        expect(surface.applyImplementationStatus).toHaveBeenCalledExactlyOnceWith(resolved);
    });

    it("remembers the open script editors and locks them on the modeler", () => {
        const { surface, hostModelerState, handlers } = surfaceRequestsOn(modelerSurface());
        const openScripts = [openScriptTask];

        handlers.UpdateOpenScriptEditorsQuery(new UpdateOpenScriptEditorsQuery(openScripts));

        expect(hostModelerState.rememberOpenScripts).toHaveBeenCalledWith(openScripts);
        expect(surface.applyOpenScriptEditors).toHaveBeenCalledWith(openScripts);
    });

    it("still remembers the open script editors when the modeler rejects them", () => {
        const surface = modelerSurface();
        surface.applyOpenScriptEditors.mockImplementation(() => {
            throw new Error("Modeler is not initialized!");
        });
        const { hostModelerState, handlers } = surfaceRequestsOn(surface);
        const openScripts = [openScriptTask];

        expect(() =>
            handlers.UpdateOpenScriptEditorsQuery(new UpdateOpenScriptEditorsQuery(openScripts)),
        ).toThrow("Modeler is not initialized!");
        expect(hostModelerState.rememberOpenScripts).toHaveBeenCalledWith(openScripts);
    });

    it("leaves modeler-only requests unanswered on other surfaces but remembers host state", () => {
        const { host, hostModelerState, handlers } = surfaceRequestsOn(designerSurface());
        const openScripts = [openScriptTask];

        handlers.OpenAllScriptTasksQuery();
        handlers.UpdateScriptContentQuery(
            new UpdateScriptContentQuery("Task_1", "script-task", undefined, "x = 1"),
        );
        handlers.UpdateScriptFormatQuery(
            new UpdateScriptFormatQuery("Task_1", "script-task", undefined, "groovy"),
        );
        handlers.UpdateOpenScriptEditorsQuery(new UpdateOpenScriptEditorsQuery(openScripts));
        handlers.ImplementationStatusQuery(new ImplementationStatusQuery({}));
        handlers.ElementTemplatesQuery(new ElementTemplatesQuery([{ id: "tpl" }]));

        expect(host.postMessage).not.toHaveBeenCalled();
        expect(hostModelerState.rememberOpenScripts).toHaveBeenCalledWith(openScripts);
    });

    describe("element templates", () => {
        it("loads the templates into the modeler and answers the wait", () => {
            const { surface, replies, handlers } = surfaceRequestsOn(modelerSurface());
            const query = new ElementTemplatesQuery([{ id: "tpl" }]);

            handlers.ElementTemplatesQuery(query);

            expect(surface.setElementTemplates).toHaveBeenCalledWith([{ id: "tpl" }]);
            expect(replies.elementTemplates.done).toHaveBeenCalledWith(query);
        });

        it("answers the wait even when the modeler rejects the templates", () => {
            const surface = modelerSurface();
            surface.setElementTemplates.mockImplementation(() => {
                throw new Error("invalid templates");
            });
            const { replies, handlers } = surfaceRequestsOn(surface);
            const query = new ElementTemplatesQuery([{ id: "tpl" }]);

            expect(() => handlers.ElementTemplatesQuery(query)).toThrow("invalid templates");
            expect(replies.elementTemplates.done).toHaveBeenCalledWith(query);
        });
    });

    describe("settings", () => {
        it("remembers the settings, applies the theme and hands the rest to the modeler", () => {
            const { surface, hostModelerState, theme, replies, handlers } =
                surfaceRequestsOn(modelerSurface());
            const query = new BpmnModelerSettingQuery(hostSettings);

            handlers.BpmnModelerSettingQuery(query);

            expect(hostModelerState.rememberSettings).toHaveBeenCalledWith(hostSettings);
            expect(theme.setMode).toHaveBeenCalledWith("light");
            expect(surface.setSettings).toHaveBeenCalledWith(hostSettings);
            expect(replies.settings.done).toHaveBeenCalledWith(query);
        });

        it("hands the designer only the favourites", () => {
            const { surface, handlers } = surfaceRequestsOn(designerSurface());

            handlers.BpmnModelerSettingQuery(new BpmnModelerSettingQuery(hostSettings));

            expect(surface.setFavouriteBpmnElements).toHaveBeenCalledWith(["bpmn:UserTask"]);
        });

        it("leaves the designer's favourites alone when the settings carry none", () => {
            const { surface, handlers } = surfaceRequestsOn(designerSurface());

            handlers.BpmnModelerSettingQuery(
                new BpmnModelerSettingQuery({ ...hostSettings, favouriteBpmnElements: undefined }),
            );

            expect(surface.setFavouriteBpmnElements).not.toHaveBeenCalled();
        });

        it("still themes the page and answers the wait on the readonly viewer", () => {
            const { theme, replies, handlers } = surfaceRequestsOn(viewerSurface());
            const query = new BpmnModelerSettingQuery(hostSettings);

            handlers.BpmnModelerSettingQuery(query);

            expect(theme.setMode).toHaveBeenCalledWith("light");
            expect(replies.settings.done).toHaveBeenCalledWith(query);
        });

        it("still remembers the settings and answers the wait when the modeler rejects them", () => {
            const surface = modelerSurface();
            surface.setSettings.mockImplementation(() => {
                throw new Error("Modeler is not initialized!");
            });
            const { hostModelerState, replies, handlers } = surfaceRequestsOn(surface);
            const query = new BpmnModelerSettingQuery(hostSettings);

            expect(() => handlers.BpmnModelerSettingQuery(query)).toThrow(
                "Modeler is not initialized!",
            );
            expect(hostModelerState.rememberSettings).toHaveBeenCalledWith(hostSettings);
            expect(replies.settings.done).toHaveBeenCalledWith(query);
        });
    });
});
