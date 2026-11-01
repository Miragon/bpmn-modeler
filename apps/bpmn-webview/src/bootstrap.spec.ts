import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";

import {
    BpmnFileQuery,
    BpmnModelerSettingQuery,
    ElementTemplatesQuery,
    FlushDocumentQuery,
    FocusElementQuery,
    GetDiagramAsSVGCommand,
    HOST_REPLY_TIMEOUT_MS,
    HOST_UPDATE_DEBOUNCE_MS,
    installCanvasAutoFocus,
    LanguageQuery,
    PropertiesPanelStateQuery,
    ReleaseDocumentFlushQuery,
    TakeFocusQuery,
    UpdateOpenScriptEditorsQuery,
} from "@miragon/bpmn-modeler-shared";
import { i18n } from "@miragon/bpmn-modeler-i18n";
import type { ModelerCapabilities } from "@miragon/bpmn-modeler";

const mocks = vi.hoisted(() => ({
    createModeler: vi.fn(),
    createViewer: vi.fn(),
    createDesigner: vi.fn(),
    locale: "en",
    reload: vi.fn(),
    flushViewport: vi.fn(),
    startPersisting: vi.fn(),
    savedMode: undefined as string | undefined,
    stateManagerCreated: vi.fn(),
    prefetchSurfaceModules: vi.fn(),
}));

vi.mock("./surfaceModules", () => ({
    loadModelerModule: vi.fn(async () => ({ createModeler: mocks.createModeler })),
    loadViewerModule: vi.fn(async () => ({ createViewer: mocks.createViewer })),
    loadDesignerModule: vi.fn(async () => ({ createDesigner: mocks.createDesigner })),
    loadLintModule: vi.fn(async () => ({})),
    prefetchSurfaceModules: mocks.prefetchSurfaceModules,
}));

vi.mock("@miragon/bpmn-modeler-i18n-extras", () => ({
    extras: {},
}));

vi.mock("@miragon/bpmn-modeler-shared", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@miragon/bpmn-modeler-shared")>();
    return {
        ...actual,
        installPanelShortcuts: vi.fn(),
        installCanvasAutoFocus: vi.fn(),
    };
});

vi.mock("@miragon/bpmn-modeler-i18n", () => ({
    i18n: {
        getLocale: vi.fn(() => mocks.locale),
        onChange: vi.fn(),
        setLanguage: vi.fn((locale: string) => {
            mocks.locale = locale;
        }),
        translate: vi.fn((value: string) => value),
        extend: vi.fn(),
    },
}));

vi.mock("./diffMode", () => ({
    DiffMode: class {
        startWith = vi.fn(async () => undefined);
    },
}));
vi.mock("./hostEditorActions", () => ({ installHostEditorActions: vi.fn() }));
vi.mock("./state", () => ({
    readSavedMode: vi.fn(() => mocks.savedMode),
    WebviewStateManager: class {
        constructor() {
            mocks.stateManagerCreated(this);
        }
        captureViewState = vi.fn(() => ({}));
        applyViewState = vi.fn();
        restoreViewport = vi.fn();
        restoreSelection = vi.fn();
        restorePanelUiState = vi.fn();
        persistMode = vi.fn();
        startPersisting = mocks.startPersisting;
        flushViewport = mocks.flushViewport;
    },
}));

import { bootstrap } from "./bootstrap";
import { installHostEditorActions } from "./hostEditorActions";
import { loadDesignerModule, loadViewerModule } from "./surfaceModules";
import type { WebviewState } from "./webviewState";

function dispatch(data: unknown): void {
    window.dispatchEvent(new MessageEvent("message", { data }));
}

// Flushes promise chains without firing the pending debounce and reply-timeout timers.
const settle = () => vi.advanceTimersByTimeAsync(0);

const settingsQuery = () =>
    new BpmnModelerSettingQuery({
        alignToOrigin: false,
        showTransactionBoundaries: false,
        colorTheme: "light",
    });

const tagged = (engine: "c7" | "c8" = "c7") =>
    new BpmnFileQuery("<tagged />", engine, "modeler", 1);

type Replies = Record<string, () => unknown[]>;

const unanswered = (): unknown[] => [];

/** Answers every boot request; without a `file` the test dispatches the document itself. */
function makeHost({
    file,
    replies = {},
    state = {},
}: { file?: BpmnFileQuery; replies?: Replies; state?: Partial<WebviewState> } = {}) {
    const answers: Replies = {
        GetBpmnFileCommand: () => (file ? [file] : []),
        GetElementTemplatesCommand: () => [new ElementTemplatesQuery([])],
        GetBpmnModelerSettingCommand: () => [settingsQuery()],
        GetPropertiesPanelStateCommand: () => [new PropertiesPanelStateQuery(true)],
        ...replies,
    };
    return {
        getState: vi.fn(() => state),
        setState: vi.fn(),
        updateState: vi.fn(),
        postMessage: vi.fn((message: { type: string }) => {
            answers[message.type]?.().forEach((reply) => dispatch(reply));
        }),
    };
}

type Host = ReturnType<typeof makeHost>;
type Posted = { type: string } & Record<string, unknown>;

const sentTypes = (host: Host): string[] =>
    host.postMessage.mock.calls.map(([message]) => (message as Posted).type);

const sentOfType = (host: Host, type: string): Posted[] =>
    host.postMessage.mock.calls
        .map(([message]) => message as Posted)
        .filter((message) => message.type === type);

function boot(host: Host, opts: Parameters<typeof bootstrap>[1] = {}): void {
    bootstrap(host as never, {
        capabilities: {},
        clipboard: "native",
        linting: false,
        reload: mocks.reload,
        ...opts,
    });
}

function makeCanvas() {
    return {
        focus: vi.fn(),
        getContainer: () => document.getElementById("js-canvas")!,
        isFocused: () => false,
    };
}

function makeModeler(overrides: Record<string, unknown> = {}) {
    const canvas = makeCanvas();
    return {
        loadDiagram: vi.fn(async (_xml: string) => ({ warnings: [] as unknown[] })),
        exportDiagram: vi.fn(async () => "<exported />"),
        alignElementsToOrigin: vi.fn(),
        newDiagram: vi.fn(async () => ({ warnings: [] })),
        onCommandStackChanged: vi.fn(),
        setElementTemplates: vi.fn(),
        setSettings: vi.fn(),
        setTheme: vi.fn(),
        setMode: vi.fn(),
        getMode: vi.fn(() => "implement"),
        captureViewState: vi.fn(() => ({})),
        applyViewState: vi.fn(),
        getDiagramSvg: vi.fn(),
        getDefinitions: vi.fn(() => ({})),
        applyLintResults: vi.fn(),
        applyLintingDisabled: vi.fn(),
        startInPageLinting: vi.fn(),
        destroy: vi.fn(),
        getService: vi.fn((_name: string) => canvas),
        viewport: { centerOnElement: vi.fn() },
        ...overrides,
    };
}

function makeViewer() {
    const canvas = makeCanvas();
    // No setMode, no newDiagram → the readonly viewer surface.
    return {
        loadDiagram: vi.fn(async () => ({ warnings: [] })),
        exportDiagram: vi.fn(async () => "<exported />"),
        getDiagramSvg: vi.fn(),
        captureViewState: vi.fn(() => ({})),
        applyViewState: vi.fn(),
        setTheme: vi.fn(),
        destroy: vi.fn(),
        getService: vi.fn((_name: string) => canvas),
        viewport: { centerOnElement: vi.fn() },
    };
}

function makeDesigner() {
    const canvas = makeCanvas();
    // Has newDiagram (editable) but no setMode → the designer surface.
    return {
        loadDiagram: vi.fn(async () => ({ warnings: [] })),
        exportDiagram: vi.fn(async () => "<exported />"),
        newDiagram: vi.fn(async () => ({ warnings: [] })),
        onCommandStackChanged: vi.fn(),
        getDiagramSvg: vi.fn(),
        setFavouriteBpmnElements: vi.fn(),
        captureViewState: vi.fn(() => ({})),
        applyViewState: vi.fn(),
        setTheme: vi.fn(),
        applyLintResults: vi.fn(),
        applyLintingDisabled: vi.fn(),
        startInPageLinting: vi.fn(),
        destroy: vi.fn(),
        getService: vi.fn((_name: string) => canvas),
        viewport: { centerOnElement: vi.fn() },
    };
}

function gateFirstImport(modeler: ReturnType<typeof makeModeler>): () => void {
    let releaseImport!: () => void;
    modeler.loadDiagram.mockImplementationOnce(
        () =>
            new Promise((resolve) => {
                releaseImport = () => resolve({ warnings: [] });
            }),
    );
    return () => releaseImport();
}

function deferredSurface<Surface>(): { surface: Promise<Surface>; finish(value: Surface): void } {
    let finish!: (value: Surface) => void;
    const surface = new Promise<Surface>((resolve) => {
        finish = resolve;
    });
    return { surface, finish };
}

function hidePage(): void {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
}

const modeButtons = () =>
    Array.from(document.querySelectorAll<HTMLButtonElement>(".mode-menu-item"));

const firstCall = (fn: { mock: { invocationCallOrder: number[] } }) =>
    fn.mock.invocationCallOrder[0];

describe("bootstrap", () => {
    let windowAddEventListener: ReturnType<typeof vi.spyOn>;
    let documentAddEventListener: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        windowAddEventListener = vi.spyOn(window, "addEventListener");
        documentAddEventListener = vi.spyOn(document, "addEventListener");
        vi.useFakeTimers();
        document.body.innerHTML = `
            <div id="js-canvas"></div>
            <div id="js-panel-resizer"></div>
            <div id="js-properties-panel"></div>
            <div id="js-drop-zone"></div>
        `;
        Object.defineProperty(document, "readyState", { configurable: true, value: "complete" });
    });

    afterEach(() => {
        for (const [type, listener, options] of windowAddEventListener.mock.calls) {
            window.removeEventListener(type, listener as EventListener, options);
        }
        for (const [type, listener, options] of documentAddEventListener.mock.calls) {
            document.removeEventListener(type, listener as EventListener, options);
        }
        windowAddEventListener.mockRestore();
        documentAddEventListener.mockRestore();
        vi.useRealTimers();
        document.body.innerHTML = "";
        document.body.inert = false;
        mocks.locale = "en";
        mocks.savedMode = undefined;
        vi.clearAllMocks();
    });

    describe("host handshake", () => {
        it("requests settings and panel state together with the document", () => {
            const host = makeHost();

            boot(host);

            expect(sentTypes(host)).toEqual([
                "GetBpmnFileCommand",
                "GetBpmnModelerSettingCommand",
                "GetPropertiesPanelStateCommand",
            ]);
        });

        it("requests element templates and the lint config before the import completes", async () => {
            const modeler = makeModeler();
            gateFirstImport(modeler);
            mocks.createModeler.mockResolvedValue(modeler);
            const host = makeHost({ file: tagged() });

            boot(host);
            await settle();

            expect(modeler.loadDiagram).toHaveBeenCalled();
            expect(mocks.startPersisting).not.toHaveBeenCalled();
            expect(sentTypes(host)).toEqual(
                expect.arrayContaining(["GetElementTemplatesCommand", "GetBpmnlintConfigCommand"]),
            );
        });

        it("applies replies that overtake the document after the import, in arrival order", async () => {
            const applyOpenScriptEditors = vi.fn();
            const modeler = makeModeler({ applyOpenScriptEditors });
            mocks.createModeler.mockResolvedValue(modeler);
            const host = makeHost({
                replies: {
                    GetBpmnModelerSettingCommand: () => [
                        settingsQuery(),
                        new UpdateOpenScriptEditorsQuery([]),
                    ],
                },
            });

            boot(host);
            await settle();
            dispatch(tagged());
            await settle();

            expect(firstCall(modeler.loadDiagram)).toBeLessThan(firstCall(modeler.setSettings));
            expect(firstCall(modeler.setSettings)).toBeLessThan(firstCall(applyOpenScriptEditors));
            expect(firstCall(applyOpenScriptEditors)).toBeLessThan(
                firstCall(modeler.setElementTemplates),
            );
            expect(sentTypes(host)).not.toContain("LogErrorCommand");
        });

        it("clears busy without another host request after the import", async () => {
            const modeler = makeModeler();
            const releaseImport = gateFirstImport(modeler);
            mocks.createModeler.mockResolvedValue(modeler);
            const host = makeHost({ file: tagged() });
            boot(host);
            await settle();
            host.postMessage.mockClear();

            releaseImport();
            await settle();

            expect(sentTypes(host).filter((type) => type.startsWith("Get"))).toEqual([]);
            expect(document.getElementById("js-properties-panel")!.getAttribute("aria-busy")).toBe(
                "false",
            );
        });

        it("waits for the page to load before asking the host for the document", async () => {
            Object.defineProperty(document, "readyState", { configurable: true, value: "loading" });
            mocks.createModeler.mockResolvedValue(makeModeler());
            const host = makeHost({ file: tagged() });

            boot(host);
            await settle();
            expect(host.postMessage).not.toHaveBeenCalled();

            window.dispatchEvent(new Event("load"));
            await settle();

            expect(sentTypes(host)).toContain("GetBpmnFileCommand");
            expect(mocks.createModeler).toHaveBeenCalledOnce();
        });

        it("stops the boot when the initial document cannot be opened", async () => {
            mocks.createModeler.mockResolvedValue(
                makeModeler({ loadDiagram: vi.fn().mockRejectedValue(new Error("not BPMN")) }),
            );
            const host = makeHost({ file: tagged() });

            boot(host);
            await vi.runAllTimersAsync();

            expect(sentOfType(host, "LogErrorCommand")).toEqual([
                expect.objectContaining({ message: "Unable to open XML\nnot BPMN" }),
            ]);
            expect(sentTypes(host)).not.toContain("RequestFocusCommand");
            expect(mocks.startPersisting).not.toHaveBeenCalled();
        });
    });

    describe("initial mode", () => {
        it("opens an untagged model in Design with Implement disabled", async () => {
            mocks.createDesigner.mockResolvedValue(makeDesigner());

            boot(makeHost({ file: new BpmnFileQuery("<untagged />", undefined, "modeler", 1) }));
            await settle();

            expect(mocks.createModeler).not.toHaveBeenCalled();
            // The designer's panel mounts in the runtime-created mount, not the host.
            expect(mocks.createDesigner.mock.calls[0][1].propertiesPanel.parent.id).toBe(
                "js-properties-panel-mount",
            );
            const [view, design, implement] = modeButtons();
            expect(view.getAttribute("aria-disabled")).toBeNull();
            expect(design.getAttribute("aria-checked")).toBe("true");
            expect(implement.getAttribute("aria-disabled")).toBe("true");
        });

        it("opens a saved View mode as the readonly viewer without asking for templates", async () => {
            mocks.savedMode = "view";
            mocks.createViewer.mockResolvedValue(makeViewer());
            const host = makeHost({ file: tagged() });

            boot(host);
            await settle();
            dispatch(new ElementTemplatesQuery([{ id: "tpl" }]));
            await settle();

            expect(mocks.createModeler).not.toHaveBeenCalled();
            expect(modeButtons()[0].getAttribute("aria-checked")).toBe("true");
            expect(sentTypes(host)).not.toContain("GetElementTemplatesCommand");
            expect(sentTypes(host)).not.toContain("LogErrorCommand");
        });

        it("prefetches the saved surface before the host replies with the document", () => {
            mocks.savedMode = "implement";

            boot(makeHost(), { linting: undefined });

            expect(mocks.prefetchSurfaceModules).toHaveBeenCalledWith("implement", {
                linting: true,
            });
        });

        it("loads neither the viewer nor the designer for a tagged Implement open", async () => {
            mocks.createModeler.mockResolvedValue(makeModeler());

            boot(makeHost({ file: tagged() }));
            await settle();

            expect(mocks.createModeler).toHaveBeenCalledOnce();
            expect(mocks.prefetchSurfaceModules).not.toHaveBeenCalled();
            expect(loadViewerModule).not.toHaveBeenCalled();
            expect(loadDesignerModule).not.toHaveBeenCalled();
        });

        it("seeds the initial mode from the host defaultMode when nothing is saved", async () => {
            mocks.createViewer.mockResolvedValue(makeViewer());

            boot(makeHost({ file: new BpmnFileQuery("<tagged />", "c7", "modeler", 1, "view") }));
            await settle();

            expect(mocks.createViewer).toHaveBeenCalledOnce();
            expect(mocks.createModeler).not.toHaveBeenCalled();
        });
    });

    describe("locale", () => {
        it("applies the host locale before the first surface, so a matching LanguageQuery does not re-import", async () => {
            const modeler = makeModeler();
            mocks.createModeler.mockResolvedValue(modeler);
            const host = makeHost({
                replies: {
                    GetBpmnModelerSettingCommand: () => [settingsQuery(), new LanguageQuery("de")],
                },
            });

            boot(host);
            await settle();
            dispatch(new BpmnFileQuery("<tagged />", "c7", "modeler", 1, undefined, "de"));
            await settle();

            expect(firstCall(vi.mocked(i18n.setLanguage))).toBeLessThan(
                firstCall(mocks.createModeler),
            );
            expect(modeler.loadDiagram).toHaveBeenCalledOnce();
            expect(i18n.getLocale()).toBe("de");
        });

        it("ignores the locale on later host pushes", async () => {
            const modeler = makeModeler();
            mocks.createModeler.mockResolvedValue(modeler);

            boot(
                makeHost({
                    file: new BpmnFileQuery("<tagged />", "c7", "modeler", 1, undefined, "de"),
                }),
            );
            await settle();
            dispatch(new BpmnFileQuery("<pushed />", "c7", "modeler", 2, undefined, "fr"));
            await vi.advanceTimersByTimeAsync(HOST_UPDATE_DEBOUNCE_MS);

            expect(modeler.loadDiagram).toHaveBeenLastCalledWith("<pushed />");
            expect(i18n.setLanguage).not.toHaveBeenCalledWith("fr");
            expect(i18n.getLocale()).toBe("de");
        });

        it("holds focus and language changes sent during the initial import until it finished", async () => {
            const modeler = makeModeler();
            const releaseImport = gateFirstImport(modeler);
            mocks.createModeler.mockResolvedValue(modeler);
            boot(makeHost({ file: tagged() }));
            await settle();

            dispatch(new FocusElementQuery("Task_1"));
            dispatch(new LanguageQuery("de"));
            await settle();
            expect(modeler.viewport.centerOnElement).not.toHaveBeenCalled();
            expect(i18n.getLocale()).toBe("en");

            releaseImport();
            await settle();

            expect(i18n.getLocale()).toBe("de");
            expect(modeler.viewport.centerOnElement).toHaveBeenCalledExactlyOnceWith("Task_1");
        });
    });

    describe("page inert locks", () => {
        it.each([false, true])(
            "restores the page's inert state (%s) only once both a mode switch and a destructive flush ended",
            async (inertBeforeSwitch) => {
                const viewer = deferredSurface<ReturnType<typeof makeViewer>>();
                mocks.createModeler.mockResolvedValue(makeModeler());
                mocks.createViewer.mockReturnValueOnce(viewer.surface);
                boot(makeHost({ file: tagged() }));
                await settle();
                document.body.inert = inertBeforeSwitch;

                modeButtons()[0].click();
                await settle();
                expect(document.body.inert).toBe(true);
                dispatch(new FlushDocumentQuery(8, true));
                await settle();
                viewer.finish(makeViewer());
                await settle();
                expect(modeButtons()[0].getAttribute("aria-checked")).toBe("true");
                expect(document.body.inert).toBe(true);

                dispatch(new ReleaseDocumentFlushQuery(8));
                await settle();

                expect(document.body.inert).toBe(inertBeforeSwitch);
            },
        );

        it("keeps the page locked when an engine reload lands during a mode switch", async () => {
            const viewer = deferredSurface<ReturnType<typeof makeViewer>>();
            mocks.createModeler.mockResolvedValue(makeModeler());
            mocks.createViewer.mockReturnValueOnce(viewer.surface);
            boot(makeHost({ file: tagged() }));
            await settle();

            modeButtons()[0].click();
            await settle();
            dispatch(new BpmnFileQuery("<c8 />", "c8", "modeler", 2));
            await vi.advanceTimersByTimeAsync(HOST_UPDATE_DEBOUNCE_MS);
            viewer.finish(makeViewer());
            await settle();

            expect(mocks.reload).toHaveBeenCalledOnce();
            expect(document.body.inert).toBe(true);
        });
    });

    describe("engine change", () => {
        it("destroys the live surface, reloads through the host and skips the hide flush", async () => {
            const modeler = makeModeler();
            mocks.createModeler.mockResolvedValue(modeler);
            const host = makeHost({ file: tagged("c7") });
            boot(host);
            await settle();

            dispatch(new BpmnFileQuery("<c8 />", "c8", "modeler", 2));
            await vi.advanceTimersByTimeAsync(HOST_UPDATE_DEBOUNCE_MS);
            expect(modeler.loadDiagram).not.toHaveBeenCalledWith("<c8 />");
            expect(modeler.destroy).toHaveBeenCalledOnce();
            expect(mocks.reload).toHaveBeenCalledOnce();
            const viewportFlushes = mocks.flushViewport.mock.calls.length;

            hidePage();
            await settle();

            expect(mocks.flushViewport).toHaveBeenCalledTimes(viewportFlushes);
            expect(sentTypes(host)).not.toContain("SyncDocumentCommand");
        });

        it("stops the boot before binding the surface when another engine arrives behind a queued update", async () => {
            const modeler = makeModeler();
            const releaseImport = gateFirstImport(modeler);
            mocks.createModeler.mockResolvedValue(modeler);
            boot(makeHost({ file: tagged("c7") }));
            await settle();

            dispatch(new BpmnFileQuery("<queued />", "c7", "modeler", 2));
            releaseImport();
            await settle();
            dispatch(new BpmnFileQuery("<c8 />", "c8", "modeler", 3));
            await vi.advanceTimersByTimeAsync(HOST_UPDATE_DEBOUNCE_MS);

            expect(modeler.loadDiagram).toHaveBeenCalledExactlyOnceWith("<tagged />");
            expect(mocks.reload).toHaveBeenCalledOnce();
            expect(mocks.stateManagerCreated).not.toHaveBeenCalled();
            expect(installHostEditorActions).not.toHaveBeenCalled();
        });
    });

    describe("focus and keyboard", () => {
        it("asks the host for focus once ready and focuses the canvas when told to", async () => {
            const modeler = makeModeler();
            mocks.createModeler.mockResolvedValue(modeler);
            const host = makeHost({ file: tagged() });

            boot(host);
            await settle();
            expect(sentTypes(host)).toContain("RequestFocusCommand");
            expect(modeler.getService("canvas").focus).not.toHaveBeenCalled();

            dispatch(new TakeFocusQuery());
            await settle();

            expect(modeler.getService("canvas").focus).toHaveBeenCalledOnce();
        });

        it("auto-focuses the canvas of the current surface after a recreate", async () => {
            const modeler = makeModeler();
            const viewer = makeViewer();
            mocks.createModeler.mockResolvedValue(modeler);
            mocks.createViewer.mockResolvedValue(viewer);

            boot(makeHost({ file: tagged() }));
            await settle();
            modeButtons()[0].click();
            await settle();
            vi.mocked(installCanvasAutoFocus).mock.calls[0][0].focusCanvas();

            expect(installCanvasAutoFocus).toHaveBeenCalledOnce();
            expect(viewer.getService("canvas").focus).toHaveBeenCalledOnce();
            expect(modeler.getService("canvas").focus).not.toHaveBeenCalled();
        });

        it("lets the host trigger undo on an editable surface only", async () => {
            const editorActions = { trigger: vi.fn() };
            const canvas = makeCanvas();
            const modeler = makeModeler({
                getService: vi.fn((name: string) =>
                    name === "editorActions" ? editorActions : canvas,
                ),
            });
            const viewer = makeViewer();
            mocks.createModeler.mockResolvedValue(modeler);
            mocks.createViewer.mockResolvedValue(viewer);
            boot(makeHost({ file: tagged() }));
            await settle();
            const triggerHostAction = vi.mocked(installHostEditorActions).mock.calls[0][0];

            triggerHostAction("undo");
            modeButtons()[0].click();
            await settle();
            triggerHostAction("redo");

            expect(editorActions.trigger.mock.calls).toEqual([["undo"]]);
            expect(viewer.getService).not.toHaveBeenCalledWith("editorActions");
        });
    });

    it("flushes the pending sync and the viewport when the webview is hidden", async () => {
        let commandStackChanged!: () => void;
        mocks.createModeler.mockResolvedValue(
            makeModeler({
                onCommandStackChanged: vi.fn((listener: () => void) => {
                    commandStackChanged = listener;
                }),
            }),
        );
        const host = makeHost({ file: tagged() });
        boot(host);
        await settle();

        commandStackChanged();
        hidePage();
        await settle();

        expect(sentOfType(host, "SyncDocumentCommand")).toHaveLength(1);
        expect(mocks.flushViewport).toHaveBeenCalledOnce();
    });

    describe("properties panel", () => {
        const panelHost = () => document.getElementById("js-properties-panel")!;
        const isCollapsed = () => panelHost().classList.contains("collapsed");

        const panelReply = (visible: boolean) => () => [new PropertiesPanelStateQuery(visible)];

        it.each([
            ["the host default hides it", false, {}],
            ["the editor saved it hidden", true, { panelVisible: false }],
        ])(
            "collapses the panel without reporting it back when %s",
            async (_, replyVisible, state) => {
                mocks.createModeler.mockResolvedValue(makeModeler());
                const host = makeHost({
                    file: tagged(),
                    replies: { GetPropertiesPanelStateCommand: panelReply(replyVisible) },
                    state,
                });

                boot(host);
                await settle();

                expect(isCollapsed()).toBe(true);
                expect(sentOfType(host, "SetPropertiesPanelStateCommand")).toEqual([]);
                expect(host.updateState).not.toHaveBeenCalledWith({ panelVisible: false });
            },
        );

        it("persists a toggle per editor and as the new host default", async () => {
            mocks.createModeler.mockResolvedValue(makeModeler());
            const host = makeHost({ file: tagged() });
            boot(host);
            await settle();

            document.querySelector<HTMLButtonElement>(".panel-resizer-toggle")!.click();

            expect(isCollapsed()).toBe(true);
            expect(host.updateState).toHaveBeenCalledExactlyOnceWith({ panelVisible: false });
            expect(sentOfType(host, "SetPropertiesPanelStateCommand")).toEqual([
                expect.objectContaining({ visible: false }),
            ]);
        });

        it("opens a pre-collapsed panel without reporting it when the host never answers", async () => {
            panelHost().classList.add("collapsed");
            mocks.createModeler.mockResolvedValue(makeModeler());
            const host = makeHost({
                file: tagged(),
                replies: { GetPropertiesPanelStateCommand: unanswered },
            });
            boot(host);
            await settle();

            await vi.advanceTimersByTimeAsync(HOST_REPLY_TIMEOUT_MS - 1);
            expect(isCollapsed()).toBe(true);

            await vi.advanceTimersByTimeAsync(1);
            expect(isCollapsed()).toBe(false);
            expect(sentOfType(host, "SetPropertiesPanelStateCommand")).toEqual([]);
        });

        it("focuses a re-shown editor without waiting for the host default", async () => {
            mocks.createModeler.mockResolvedValue(makeModeler());
            const host = makeHost({
                file: tagged(),
                replies: { GetPropertiesPanelStateCommand: unanswered },
                state: { panelVisible: false },
            });
            boot(host);
            await settle();

            expect(isCollapsed()).toBe(true);
            expect(sentOfType(host, "RequestFocusCommand")).toHaveLength(1);
        });

        it("keeps and reports a toggle made while the host default is pending", async () => {
            mocks.createModeler.mockResolvedValue(makeModeler());
            const host = makeHost({
                file: tagged(),
                replies: { GetPropertiesPanelStateCommand: unanswered },
            });
            boot(host);
            await settle();

            document.querySelector<HTMLButtonElement>(".panel-resizer-toggle")!.click();
            await vi.advanceTimersByTimeAsync(HOST_REPLY_TIMEOUT_MS);

            expect(isCollapsed()).toBe(true);
            expect(host.updateState).toHaveBeenCalledWith({ panelVisible: false });
            expect(sentOfType(host, "SetPropertiesPanelStateCommand")).toEqual([
                expect.objectContaining({ visible: false }),
            ]);
        });

        it("keeps a toggle made during the import even when the host already answered", async () => {
            const modeler = makeModeler();
            const releaseImport = gateFirstImport(modeler);
            mocks.createModeler.mockResolvedValue(modeler);
            const host = makeHost({ file: tagged() });
            boot(host);
            await settle();

            document.querySelector<HTMLButtonElement>(".panel-resizer-toggle")!.click();
            releaseImport();
            await settle();

            expect(isCollapsed()).toBe(true);
            expect(host.updateState).toHaveBeenCalledWith({ panelVisible: false });
            expect(sentOfType(host, "SetPropertiesPanelStateCommand")).toEqual([
                expect.objectContaining({ visible: false }),
            ]);
        });
    });

    describe("boot restore chain", () => {
        type RestoringStateManager = Record<
            "restoreSelection" | "restorePanelUiState",
            ReturnType<typeof vi.fn>
        >;
        const stateManager = () =>
            mocks.stateManagerCreated.mock.calls[0][0] as RestoringStateManager;

        // A c8 file: the c7 process-variable publish would add its own 300 ms timer.
        async function bootAwaitingReplies() {
            const modeler = makeModeler();
            mocks.createModeler.mockResolvedValue(modeler);
            boot(
                makeHost({
                    file: tagged("c8"),
                    replies: {
                        GetElementTemplatesCommand: unanswered,
                        GetBpmnModelerSettingCommand: unanswered,
                    },
                }),
            );
            await settle();
            return modeler;
        }

        it("restores selection and panel UI only after templates and settings were applied", async () => {
            const modeler = await bootAwaitingReplies();
            expect(stateManager().restoreSelection).not.toHaveBeenCalled();

            dispatch(new ElementTemplatesQuery([]));
            await settle();
            expect(stateManager().restoreSelection).not.toHaveBeenCalled();

            dispatch(settingsQuery());
            await settle();

            const { restoreSelection, restorePanelUiState } = stateManager();
            expect(firstCall(modeler.setElementTemplates)).toBeLessThan(
                firstCall(restoreSelection),
            );
            expect(firstCall(modeler.setSettings)).toBeLessThan(firstCall(restoreSelection));
            expect(firstCall(restoreSelection)).toBeLessThan(firstCall(restorePanelUiState));
            expect(firstCall(restorePanelUiState)).toBeLessThan(firstCall(mocks.startPersisting));
        });

        it.each([
            ["ElementTemplatesQuery", settingsQuery],
            ["BpmnModelerSettingQuery", () => new ElementTemplatesQuery([])],
        ])("still starts persisting when the host drops the %s reply", async (_, answered) => {
            await bootAwaitingReplies();
            dispatch(answered());
            await settle();

            await vi.advanceTimersByTimeAsync(HOST_REPLY_TIMEOUT_MS - 1);
            expect(stateManager().restoreSelection).not.toHaveBeenCalled();
            expect(mocks.startPersisting).not.toHaveBeenCalled();

            await vi.advanceTimersByTimeAsync(1);
            expect(stateManager().restoreSelection).toHaveBeenCalledOnce();
            expect(mocks.startPersisting).toHaveBeenCalledOnce();
        });
    });

    describe("production defaults", () => {
        beforeEach(() => {
            vi.stubEnv("NODE_ENV", "production");
        });

        afterEach(() => {
            vi.unstubAllEnvs();
        });

        // Mirrors main.ts: no capabilities, clipboard or linting options.
        async function bootLikeMain() {
            mocks.createModeler.mockResolvedValue(makeModeler());
            const host = makeHost({ file: tagged() });
            bootstrap(host as never);
            await settle();
            const options = mocks.createModeler.mock.calls[0][1] as {
                capabilities: Required<ModelerCapabilities>;
                clipboard?: unknown;
            };
            return { host, options };
        }

        it("hands the modeler every protocol port", async () => {
            const { host, options } = await bootLikeMain();

            options.capabilities.modelNavigation.openReference({ id: "Form_1", kind: "form" });

            expect(Object.keys(options.capabilities).sort()).toEqual([
                "codeLink",
                "definitionSearch",
                "modelNavigation",
                "scripting",
            ]);
            expect(sentOfType(host, "NavigateToReferencedModelCommand")).toEqual([
                expect.objectContaining({ referenceId: "Form_1", referenceKind: "form" }),
            ]);
        });

        it.each([
            ["c8", 1],
            ["c7", 0],
        ] as const)(
            "asks for the form reference status of a %s diagram after the open",
            async (engine, requests) => {
                const modeler = makeModeler();
                const releaseImport = gateFirstImport(modeler);
                mocks.createModeler.mockResolvedValue(modeler);
                const host = makeHost({ file: tagged(engine) });
                bootstrap(host as never);
                await settle();
                expect(sentOfType(host, "GetFormReferenceStatusCommand")).toEqual([]);

                releaseImport();
                await settle();

                expect(sentOfType(host, "GetFormReferenceStatusCommand")).toHaveLength(requests);
            },
        );

        it("keeps the browser clipboard in the development preview", async () => {
            vi.stubEnv("NODE_ENV", "development");

            const { options } = await bootLikeMain();

            expect(options.clipboard).toBeUndefined();
        });
    });

    describe("diff pane", () => {
        const leftPane = () => new BpmnFileQuery("<left />", "c7", "viewer", 1);

        const deliverToSession = (data: unknown): Promise<unknown> =>
            Promise.all(
                (windowAddEventListener.mock.calls as Array<[string, unknown]>)
                    .filter(([type]) => type === "message")
                    .map(([, listener]) =>
                        (listener as (event: MessageEvent) => unknown)(
                            new MessageEvent("message", { data }),
                        ),
                    ),
            );

        it.each([
            ["BpmnModelerSettingQuery", settingsQuery],
            ["ElementTemplatesQuery", () => new ElementTemplatesQuery([])],
            ["GetDiagramAsSVGCommand", () => new GetDiagramAsSVGCommand()],
            ["TakeFocusQuery", () => new TakeFocusQuery()],
        ])("ignores %s without an error", async (_type, query) => {
            const host = makeHost({ file: leftPane() });
            boot(host);
            await settle();

            await deliverToSession(query());

            expect(sentOfType(host, "LogErrorCommand")).toEqual([]);
        });

        it("ignores session messages even when the diff view cannot start", async () => {
            document.getElementById("js-drop-zone")!.remove();
            const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
            onTestFinished(() => consoleError.mockRestore());
            const host = makeHost({ file: leftPane() });
            boot(host);
            await settle();

            await deliverToSession(new GetDiagramAsSVGCommand());

            expect(consoleError).toHaveBeenCalledWith(
                "Diff mode: missing #js-canvas or #js-drop-zone",
            );
            expect(sentOfType(host, "LogErrorCommand")).toEqual([]);
        });

        it("drops held replies and follows later language changes without a surface", async () => {
            const host = makeHost({
                replies: {
                    GetBpmnModelerSettingCommand: () => [settingsQuery(), new LanguageQuery("de")],
                },
            });
            boot(host);
            await settle();
            dispatch(leftPane());
            await settle();
            expect(i18n.setLanguage).not.toHaveBeenCalledWith("de");

            dispatch(new LanguageQuery("fr"));
            await settle();

            expect(i18n.getLocale()).toBe("fr");
            expect(sentTypes(host)).not.toContain("LogErrorCommand");
            expect(mocks.createViewer).not.toHaveBeenCalled();
            expect(mocks.createDesigner).not.toHaveBeenCalled();
            expect(mocks.createModeler).not.toHaveBeenCalled();
            expect(mocks.stateManagerCreated).not.toHaveBeenCalled();
        });
    });
});
