import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    BpmnModelerSettingQuery,
    CleanupDiagramQuery,
    type Command,
    ElementIdConventionQuery,
    ElementTemplatesQuery,
    GetDiagramAsSVGCommand,
    HiddenElementTemplatesQuery,
    ImplementationStatusQuery,
    type Query,
    UpdateOpenScriptEditorsQuery,
    UpdateScriptContentQuery,
    UpdateScriptFormatQuery,
} from "@miragon/bpmn-modeler-shared";

import type { SurfaceHandle } from "../../domain/surface";
import { createSurfaceRequests } from "./surfaceRequests";

const conventions = vi.hoisted(() => ({
    load: vi.fn(async (options?: object) => ({ convention: options })),
}));

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
        setHiddenElementTemplates: vi.fn(),
        setSettings: vi.fn(),
    };
}

function designerSurface() {
    return {
        newDiagram: vi.fn(),
        formatDiagram: vi.fn(async () => undefined),
        cleanupDiagram: vi.fn(() => ({ status: "clean", items: [] })),
        setFavouriteBpmnElements: vi.fn(),
        setElementIdSettings: vi.fn(),
    };
}

function viewerSurface() {
    return { getDiagramSvg: vi.fn(async () => "<svg viewer />") };
}

function surfaceRequestsOn<Surface extends object>(surface: Surface) {
    const host = createHost();
    const hostModelerState = {
        rememberSettings: vi.fn(),
        rememberOpenScripts: vi.fn(),
        rememberElementIdConvention: vi.fn(),
    };
    const theme = { setMode: vi.fn() };
    const replies = { elementTemplates: { done: vi.fn() }, settings: { done: vi.fn() } };
    const setFormPreviewAutomatic = vi.fn();
    const requests = createSurfaceRequests(host, () => surface as unknown as SurfaceHandle, {
        hostModelerState,
        theme,
        replies,
        setFormPreviewAutomatic,
        loadElementIdConvention: conventions.load as never,
    });
    return {
        host,
        surface,
        hostModelerState,
        theme,
        replies,
        setFormPreviewAutomatic,
        ...requests,
    };
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

describe("createSurfaceRequests", () => {
    it("releases startup settings waiters even if applying preview policy fails", () => {
        const fixture = surfaceRequestsOn(viewerSurface());
        fixture.setFormPreviewAutomatic.mockImplementationOnce(() => {
            throw new Error("preview failed");
        });
        const query = new BpmnModelerSettingQuery(hostSettings, false);
        expect(() => fixture.handlers.BpmnModelerSettingQuery(query)).toThrow("preview failed");
        expect(fixture.replies.settings.done).toHaveBeenCalledWith(query);
    });
    it("defaults to automatic preview for an older sender with no metadata", () => {
        const fixture = surfaceRequestsOn(viewerSurface());
        const legacy = new BpmnModelerSettingQuery(hostSettings, false);
        Reflect.deleteProperty(legacy, "formPreviewAutomatic");
        fixture.handlers.BpmnModelerSettingQuery(legacy);
        expect(fixture.setFormPreviewAutomatic).toHaveBeenCalledWith(true);
    });
    it.each([
        { mode: "View", surface: viewerSurface },
        { mode: "Design", surface: designerSurface },
        { mode: "Implement", surface: modelerSurface },
    ])("applies preview policy independently of the $mode setting bag", ({ surface }) => {
        const fixture = surfaceRequestsOn(surface());
        fixture.handlers.BpmnModelerSettingQuery(new BpmnModelerSettingQuery(hostSettings, false));
        expect(fixture.setFormPreviewAutomatic).toHaveBeenLastCalledWith(false);
        fixture.handlers.BpmnModelerSettingQuery(new BpmnModelerSettingQuery(hostSettings));
        expect(fixture.setFormPreviewAutomatic).toHaveBeenLastCalledWith(true);
        expect(fixture.replies.settings.done).toHaveBeenCalledTimes(2);
    });
    beforeEach(() => {
        vi.spyOn(console, "debug").mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
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

    describe("element IDs", () => {
        it("keeps the lint rule options and hands the editable surface their convention", async () => {
            const { surface, handlers, hostModelerState } = surfaceRequestsOn(designerSurface());

            await handlers.ElementIdConventionQuery(
                new ElementIdConventionQuery({ case: "snake_case" }),
            );

            expect(hostModelerState.rememberElementIdConvention).toHaveBeenCalledWith({
                case: "snake_case",
            });
            expect(surface.setElementIdSettings).toHaveBeenCalledWith({
                convention: { convention: { case: "snake_case" } },
            });
        });

        it("keeps the options for later surfaces when the viewer is showing", async () => {
            const { handlers, hostModelerState } = surfaceRequestsOn(viewerSurface());

            await handlers.ElementIdConventionQuery(new ElementIdConventionQuery({}));

            expect(hostModelerState.rememberElementIdConvention).toHaveBeenCalledWith({});
        });

        it("logs a convention that did not load instead of failing", async () => {
            conventions.load.mockRejectedValueOnce(new Error("chunk failed"));
            const { host, surface, handlers } = surfaceRequestsOn(designerSurface());

            await handlers.ElementIdConventionQuery(new ElementIdConventionQuery({}));

            expect(surface.setElementIdSettings).not.toHaveBeenCalled();
            expect(host.sent).toEqual([
                expect.objectContaining({
                    type: "LogWarningCommand",
                    message: expect.stringContaining("chunk failed"),
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
        handlers.ElementTemplatesQuery(new ElementTemplatesQuery([{ id: "tpl" }], []));
        handlers.HiddenElementTemplatesQuery(new HiddenElementTemplatesQuery([{ id: "tpl" }]));

        expect(host.postMessage).not.toHaveBeenCalled();
        expect(hostModelerState.rememberOpenScripts).toHaveBeenCalledWith(openScripts);
    });

    describe("element templates", () => {
        it("loads the templates into the modeler and answers the wait", () => {
            const { surface, replies, handlers } = surfaceRequestsOn(modelerSurface());
            const query = new ElementTemplatesQuery([{ id: "tpl" }], []);

            handlers.ElementTemplatesQuery(query);

            expect(surface.setElementTemplates).toHaveBeenCalledWith([{ id: "tpl" }]);
            expect(replies.elementTemplates.done).toHaveBeenCalledWith(query);
        });

        it("hides the templates the host keeps out before it loads the list", () => {
            const { surface, handlers } = surfaceRequestsOn(modelerSurface());

            handlers.ElementTemplatesQuery(
                new ElementTemplatesQuery([{ id: "tpl" }, { id: "mail" }], [{ id: "mail" }]),
            );

            expect(surface.setHiddenElementTemplates).toHaveBeenCalledExactlyOnceWith([
                { id: "mail" },
            ]);
            expect(surface.setHiddenElementTemplates.mock.invocationCallOrder[0]).toBeLessThan(
                surface.setElementTemplates.mock.invocationCallOrder[0],
            );
        });

        it("replaces only the hidden templates on a hidden-templates change", () => {
            const { surface, replies, handlers } = surfaceRequestsOn(modelerSurface());

            handlers.HiddenElementTemplatesQuery(
                new HiddenElementTemplatesQuery([{ id: "mail", version: 2 }]),
            );

            expect(surface.setHiddenElementTemplates).toHaveBeenCalledExactlyOnceWith([
                { id: "mail", version: 2 },
            ]);
            expect(surface.setElementTemplates).not.toHaveBeenCalled();
            expect(replies.elementTemplates.done).not.toHaveBeenCalled();
        });

        it("answers the wait even when the modeler rejects the hidden templates", () => {
            const surface = modelerSurface();
            surface.setHiddenElementTemplates.mockImplementation(() => {
                throw new Error("destroyed");
            });
            const { replies, handlers } = surfaceRequestsOn(surface);
            const query = new ElementTemplatesQuery([{ id: "tpl" }], [{ id: "tpl" }]);

            expect(() => handlers.ElementTemplatesQuery(query)).toThrow("destroyed");
            expect(replies.elementTemplates.done).toHaveBeenCalledWith(query);
        });

        it("answers the wait even when the modeler rejects the templates", () => {
            const surface = modelerSurface();
            surface.setElementTemplates.mockImplementation(() => {
                throw new Error("invalid templates");
            });
            const { replies, handlers } = surfaceRequestsOn(surface);
            const query = new ElementTemplatesQuery([{ id: "tpl" }], []);

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

        it("hands a modeler its favourites only through setSettings", () => {
            const surface = { ...modelerSurface(), setFavouriteBpmnElements: vi.fn() };
            const { handlers } = surfaceRequestsOn(surface);

            handlers.BpmnModelerSettingQuery(new BpmnModelerSettingQuery(hostSettings));

            expect(surface.setSettings).toHaveBeenCalledWith(hostSettings);
            expect(surface.setFavouriteBpmnElements).not.toHaveBeenCalled();
        });

        it("hands the designer the favourites and the element ID settings", () => {
            const { surface, handlers } = surfaceRequestsOn(designerSurface());

            handlers.BpmnModelerSettingQuery(
                new BpmnModelerSettingQuery({ ...hostSettings, elementIdsFollowName: true }),
            );

            expect(surface.setFavouriteBpmnElements).toHaveBeenCalledWith(["bpmn:UserTask"]);
            expect(surface.setElementIdSettings).toHaveBeenCalledWith({ followName: true });
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
