import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";

import {
    BpmnFileQuery,
    BpmnLintDisabledQuery,
    BpmnlintInPageQuery,
    BpmnlintResultsQuery,
    BpmnModelerSettingQuery,
    CleanupDiagramQuery,
    ClipboardQuery,
    ElementTemplatesQuery,
    FlushDocumentQuery,
    FocusElementQuery,
    FormatDiagramQuery,
    FormReferenceStatusQuery,
    GetDiagramAsSVGCommand,
    HOST_REPLY_TIMEOUT_MS,
    ImplementationStatusQuery,
    installCanvasAutoFocus,
    LanguageQuery,
    OpenAllScriptTasksQuery,
    PropertiesPanelStateQuery,
    ReleaseDocumentFlushQuery,
    TakeFocusQuery,
    TextClipboardQuery,
    UpdateOpenScriptEditorsQuery,
    UpdateScriptContentQuery,
    UpdateScriptFormatQuery,
    WorkspaceDefinitionsQuery,
} from "@miragon/bpmn-modeler-shared";
import { i18n } from "@miragon/bpmn-modeler-i18n";
import { NoModelerError, UnsupportedEngineError } from "@miragon/bpmn-modeler-types";
import type { ClipboardOptions, ModelerCapabilities } from "@miragon/bpmn-modeler";

const mocks = vi.hoisted(() => ({
    createModeler: vi.fn(),
    createViewer: vi.fn(),
    createDesigner: vi.fn(),
    locale: "en",
    reload: vi.fn(),
    flushViewport: vi.fn(),
    persistMode: vi.fn(),
    startPersisting: vi.fn(),
    persistPanelVisibility: vi.fn(),
    restorePanelVisibility: vi.fn(),
    savedMode: undefined as string | undefined,
    initResizer: vi.fn(() => ({
        setVisible: vi.fn(),
        onVisibilityChanged: vi.fn(),
    })),
    stateManagerCreated: vi.fn(),
    prefetchSurfaceModules: vi.fn(),
    viewStateSnapshot: {
        rootElementId: "SubProcess_1_plane",
        viewport: { x: 40, y: 20, width: 800, height: 600, scale: 1.5 },
        selectedElementIds: ["Task_1"],
    },
}));

// The real loaders' first import resolves after the microtask drains these tests rely on.
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
        initResizer: mocks.initResizer,
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
        captureViewState = vi.fn(() => mocks.viewStateSnapshot);
        applyViewState = vi.fn();
        restoreViewport = vi.fn();
        restoreSelection = vi.fn();
        restorePanelUiState = vi.fn();
        restorePanelVisibility = mocks.restorePanelVisibility;
        persistPanelVisibility = mocks.persistPanelVisibility;
        persistMode = mocks.persistMode;
        startPersisting = mocks.startPersisting;
        flushViewport = mocks.flushViewport;
    },
}));

import { bootstrap } from "./bootstrap";
import { installHostEditorActions } from "./hostEditorActions";
import { DEFINITION_SEARCH_TIMEOUT_MS } from "./session/protocolCapabilities";
import { loadDesignerModule, loadViewerModule } from "./surfaceModules";

function dispatch(data: unknown): void {
    window.dispatchEvent(new MessageEvent("message", { data }));
}

async function drainAsyncWork(): Promise<void> {
    for (let index = 0; index < 10; index++) {
        await Promise.resolve();
        await vi.runOnlyPendingTimersAsync();
    }
}

async function drainMicrotasks(): Promise<void> {
    for (let index = 0; index < 10; index++) {
        await Promise.resolve();
    }
}

describe("bootstrap host document initialization", () => {
    let windowAddEventListener: ReturnType<typeof vi.spyOn>;
    let documentAddEventListener: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        windowAddEventListener = vi.spyOn(window, "addEventListener");
        documentAddEventListener = vi.spyOn(document, "addEventListener");
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

    it("recovers the latest host revision before applying queued session messages", async () => {
        vi.useFakeTimers();
        document.body.innerHTML = `
            <div id="js-canvas"></div>
            <div id="js-panel-resizer"></div>
            <div id="js-properties-panel"></div>
        `;
        Object.defineProperty(document, "readyState", {
            configurable: true,
            value: "complete",
        });

        let resolveCreate!: () => void;
        let modelerCreated = false;
        const createGate = new Promise<void>((resolve) => {
            resolveCreate = resolve;
        });
        let resolveInvalidImport!: () => void;
        let markInvalidImportStarted!: () => void;
        const invalidImportGate = new Promise<void>((resolve) => {
            resolveInvalidImport = resolve;
        });
        const invalidImportStarted = new Promise<void>((resolve) => {
            markInvalidImportStarted = resolve;
        });
        let resolveLatestImport!: () => void;
        let markLatestImportStarted!: () => void;
        const latestImportGate = new Promise<void>((resolve) => {
            resolveLatestImport = resolve;
        });
        const latestImportStarted = new Promise<void>((resolve) => {
            markLatestImportStarted = resolve;
        });
        let resolvePostInitImport!: () => void;
        let markPostInitImportStarted!: () => void;
        const postInitImportGate = new Promise<void>((resolve) => {
            resolvePostInitImport = resolve;
        });
        const postInitImportStarted = new Promise<void>((resolve) => {
            markPostInitImportStarted = resolve;
        });
        let resolveLanguageRefresh!: () => void;
        let markLanguageRefreshStarted!: () => void;
        const languageRefreshGate = new Promise<void>((resolve) => {
            resolveLanguageRefresh = resolve;
        });
        const languageRefreshStarted = new Promise<void>((resolve) => {
            markLanguageRefreshStarted = resolve;
        });
        let resolveHostImportDuringRefresh!: () => void;
        let hostImportDuringRefreshStarted = false;
        const hostImportDuringRefreshGate = new Promise<void>((resolve) => {
            resolveHostImportDuringRefresh = resolve;
        });
        const successfulImports: string[] = [];
        let postInitImportCount = 0;
        let commandStackChanged: (() => void) | undefined;
        const canvas = {
            focus: vi.fn(),
            getContainer: () => document.getElementById("js-canvas")!,
            isFocused: () => false,
        };
        const modeler = {
            loadDiagram: vi.fn(async (xml: string) => {
                if (!modelerCreated) {
                    throw new Error("modeler is not ready");
                }
                if (xml === "<invalid />") {
                    markInvalidImportStarted();
                    await invalidImportGate;
                    throw new Error("invalid host update");
                }
                if (xml === "<latest />") {
                    markLatestImportStarted();
                    await latestImportGate;
                }
                if (xml === "<post-init />") {
                    postInitImportCount++;
                    if (postInitImportCount === 1) {
                        markPostInitImportStarted();
                        await postInitImportGate;
                    } else {
                        markLanguageRefreshStarted();
                        await languageRefreshGate;
                    }
                }
                if (xml === "<during-refresh />") {
                    hostImportDuringRefreshStarted = true;
                    await hostImportDuringRefreshGate;
                }
                successfulImports.push(xml);
                return { warnings: [] };
            }),
            exportDiagram: vi.fn(async () => successfulImports.at(-1) ?? "<initial />"),
            alignElementsToOrigin: vi.fn(),
            newDiagram: vi.fn(async () => ({ warnings: [] })),
            setMode: vi.fn(),
            onCommandStackChanged: vi.fn((listener: () => void) => {
                commandStackChanged = listener;
            }),
            onElementTemplatesErrors: vi.fn(),
            onWarning: vi.fn(),
            setElementTemplates: vi.fn(),
            setSettings: vi.fn(),
            setTheme: vi.fn(),
            getService: vi.fn(() => canvas),
            viewport: { centerOnElement: vi.fn() },
        };
        mocks.createModeler.mockImplementation(async () => {
            await createGate;
            modelerCreated = true;
            return modeler;
        });

        const host = {
            getState: vi.fn(() => ({})),
            setState: vi.fn(),
            updateState: vi.fn(),
            postMessage: vi.fn((message: { type: string }) => {
                switch (message.type) {
                    case "GetBpmnFileCommand":
                        dispatch(new BpmnFileQuery("<initial />", "c8", "modeler", 1));
                        break;
                    case "GetElementTemplatesCommand":
                        dispatch(new ElementTemplatesQuery([]));
                        break;
                    case "GetBpmnModelerSettingCommand":
                        dispatch(
                            new BpmnModelerSettingQuery({
                                alignToOrigin: false,
                                showTransactionBoundaries: false,
                                colorTheme: "light",
                            }),
                        );
                        break;
                    case "GetPropertiesPanelStateCommand":
                        dispatch(new PropertiesPanelStateQuery(true));
                        break;
                }
            }),
        };

        bootstrap(host as never, {
            capabilities: {},
            clipboard: "native",
            linting: false,
            reload: mocks.reload,
        });
        await drainMicrotasks();
        expect(mocks.createModeler).toHaveBeenCalledOnce();

        dispatch(new BpmnFileQuery("<invalid />", "c8", "modeler", 2));
        resolveCreate();
        await drainMicrotasks();
        vi.advanceTimersByTime(100);
        await invalidImportStarted;

        dispatch(new BpmnFileQuery("<latest />", "c8", "modeler", 3));
        resolveInvalidImport();
        await drainMicrotasks();
        vi.advanceTimersByTime(100);
        await latestImportStarted;

        dispatch(new FocusElementQuery("Task_Latest"));
        dispatch(new LanguageQuery("de"));

        expect(modeler.viewport.centerOnElement).not.toHaveBeenCalled();
        expect(modeler.exportDiagram).not.toHaveBeenCalled();

        resolveLatestImport();
        await drainAsyncWork();

        expect(successfulImports.at(-1)).toBe("<latest />");
        expect(mocks.stateManagerCreated).toHaveBeenCalledOnce();
        expect(modeler.exportDiagram).toHaveBeenCalledOnce();
        expect(modeler.viewport.centerOnElement).toHaveBeenCalledWith("Task_Latest");

        dispatch(new BpmnFileQuery("<post-init />", "c8", "modeler", 4));
        vi.advanceTimersByTime(100);
        await postInitImportStarted;

        dispatch(new FocusElementQuery("Task_PostInit"));
        dispatch(new LanguageQuery("fr"));

        expect(modeler.viewport.centerOnElement).toHaveBeenCalledTimes(1);
        expect(modeler.exportDiagram).toHaveBeenCalledTimes(1);

        resolvePostInitImport();
        await languageRefreshStarted;

        dispatch(new BpmnFileQuery("<during-refresh />", "c8", "modeler", 5));
        vi.advanceTimersByTime(100);
        await drainMicrotasks();

        expect(hostImportDuringRefreshStarted).toBe(false);

        resolveLanguageRefresh();
        await drainMicrotasks();
        expect(hostImportDuringRefreshStarted).toBe(true);

        resolveHostImportDuringRefresh();
        await drainAsyncWork();

        expect(successfulImports.at(-1)).toBe("<during-refresh />");
        expect(modeler.exportDiagram).toHaveBeenCalledTimes(2);
        expect(modeler.viewport.centerOnElement).toHaveBeenLastCalledWith("Task_PostInit");
        expect(host.postMessage).toHaveBeenCalledWith(
            expect.objectContaining({
                type: "LogErrorCommand",
                message: expect.stringContaining("invalid host update"),
            }),
        );

        commandStackChanged?.();
        vi.advanceTimersByTime(300);
        await drainAsyncWork();

        expect(host.postMessage).toHaveBeenCalledWith(
            expect.objectContaining({
                type: "SyncDocumentCommand",
                documentRevision: 5,
            }),
        );
    });

    it("imports a newer valid revision instead of a stale invalid initial document", async () => {
        vi.useFakeTimers();
        document.body.innerHTML = `
            <div id="js-canvas"></div>
            <div id="js-panel-resizer"></div>
            <div id="js-properties-panel"></div>
        `;
        Object.defineProperty(document, "readyState", {
            configurable: true,
            value: "complete",
        });

        let resolveCreate!: () => void;
        const createGate = new Promise<void>((resolve) => {
            resolveCreate = resolve;
        });
        const canvas = {
            focus: vi.fn(),
            getContainer: () => document.getElementById("js-canvas")!,
            isFocused: () => false,
        };
        const modeler = {
            loadDiagram: vi.fn(async (xml: string) => {
                if (xml === "<invalid />") throw new Error("invalid initial document");
                return { warnings: [] };
            }),
            exportDiagram: vi.fn(async () => "<latest />"),
            alignElementsToOrigin: vi.fn(),
            newDiagram: vi.fn(async () => ({ warnings: [] })),
            setMode: vi.fn(),
            onCommandStackChanged: vi.fn(),
            setElementTemplates: vi.fn(),
            setSettings: vi.fn(),
            setTheme: vi.fn(),
            getService: vi.fn(() => canvas),
            viewport: { centerOnElement: vi.fn() },
        };
        mocks.createModeler.mockImplementation(async () => {
            await createGate;
            return modeler;
        });

        const host = {
            getState: vi.fn(() => ({})),
            setState: vi.fn(),
            updateState: vi.fn(),
            postMessage: vi.fn((message: { type: string }) => {
                switch (message.type) {
                    case "GetBpmnFileCommand":
                        dispatch(new BpmnFileQuery("<invalid />", "c8", "modeler", 1));
                        break;
                    case "GetElementTemplatesCommand":
                        dispatch(new ElementTemplatesQuery([]));
                        break;
                    case "GetBpmnModelerSettingCommand":
                        dispatch(
                            new BpmnModelerSettingQuery({
                                alignToOrigin: false,
                                showTransactionBoundaries: false,
                                colorTheme: "light",
                            }),
                        );
                        break;
                    case "GetPropertiesPanelStateCommand":
                        dispatch(new PropertiesPanelStateQuery(true));
                        break;
                }
            }),
        };

        bootstrap(host as never, {
            capabilities: {},
            clipboard: "native",
            linting: false,
            reload: mocks.reload,
        });
        await drainMicrotasks();

        dispatch(new BpmnFileQuery("<latest />", "c8", "modeler", 2));
        resolveCreate();
        await drainAsyncWork();

        expect(modeler.loadDiagram).toHaveBeenCalledTimes(1);
        expect(modeler.loadDiagram).toHaveBeenCalledWith("<latest />");
        expect(mocks.stateManagerCreated).toHaveBeenCalledOnce();
    });

    it("stops queued session work when an engine change reloads the webview", async () => {
        vi.useFakeTimers();
        document.body.innerHTML = `
            <div id="js-canvas"></div>
            <div id="js-panel-resizer"></div>
            <div id="js-properties-panel"></div>
        `;
        Object.defineProperty(document, "readyState", {
            configurable: true,
            value: "complete",
        });

        const canvas = {
            focus: vi.fn(),
            getContainer: () => document.getElementById("js-canvas")!,
            isFocused: () => false,
        };
        let initialImportCount = 0;
        let markLanguageRefreshStarted!: () => void;
        let resolveLanguageRefresh!: () => void;
        const languageRefreshStarted = new Promise<void>((resolve) => {
            markLanguageRefreshStarted = resolve;
        });
        const languageRefreshGate = new Promise<void>((resolve) => {
            resolveLanguageRefresh = resolve;
        });
        const centerOnElement = vi.fn();
        const commandStackListeners: Array<() => void> = [];
        const modeler = {
            loadDiagram: vi.fn(async (xml: string) => {
                if (xml === "<initial />" && ++initialImportCount === 2) {
                    markLanguageRefreshStarted();
                    await languageRefreshGate;
                }
                return { warnings: [] };
            }),
            exportDiagram: vi.fn(async () => "<initial />"),
            alignElementsToOrigin: vi.fn(),
            newDiagram: vi.fn(async () => ({ warnings: [] })),
            setMode: vi.fn(),
            onCommandStackChanged: vi.fn((listener: () => void) => {
                commandStackListeners.push(listener);
            }),
            setElementTemplates: vi.fn(),
            setSettings: vi.fn(),
            setTheme: vi.fn(),
            getService: vi.fn(() => canvas),
            getDefinitions: vi.fn(() => ({})),
            viewport: { centerOnElement },
            destroy: vi.fn(),
        };
        mocks.createModeler.mockResolvedValue(modeler);

        const host = {
            getState: vi.fn(() => ({})),
            setState: vi.fn(),
            updateState: vi.fn(),
            postMessage: vi.fn((message: { type: string }) => {
                switch (message.type) {
                    case "GetBpmnFileCommand":
                        dispatch(new BpmnFileQuery("<initial />", "c7", "modeler", 1));
                        break;
                    case "GetElementTemplatesCommand":
                        dispatch(new ElementTemplatesQuery([]));
                        break;
                    case "GetBpmnModelerSettingCommand":
                        dispatch(
                            new BpmnModelerSettingQuery({
                                alignToOrigin: false,
                                showTransactionBoundaries: false,
                                colorTheme: "light",
                            }),
                        );
                        break;
                    case "GetPropertiesPanelStateCommand":
                        dispatch(new PropertiesPanelStateQuery(true));
                        break;
                }
            }),
        };

        bootstrap(host as never, {
            capabilities: {
                scripting: {
                    openScriptEditor: vi.fn(),
                    scriptSourceChanged: vi.fn(),
                },
            },
            clipboard: "native",
            linting: false,
            reload: mocks.reload,
        });
        await drainAsyncWork();

        dispatch(new FlushDocumentQuery(99, true, true));
        await drainAsyncWork();
        expect(document.body.inert).toBe(true);

        dispatch(new LanguageQuery("de"));
        await languageRefreshStarted;

        const definitionReadsBeforeReload = modeler.getDefinitions.mock.calls.length;
        commandStackListeners.at(-1)?.();

        dispatch(new BpmnFileQuery("<c8 />", "c8", "modeler", 2));
        dispatch(new FocusElementQuery("Task_AfterReload"));
        dispatch(new LanguageQuery("fr"));
        dispatch(new ReleaseDocumentFlushQuery(99));
        resolveLanguageRefresh();
        await drainAsyncWork();

        expect(modeler.loadDiagram).not.toHaveBeenCalledWith("<c8 />");
        expect(modeler.destroy).toHaveBeenCalledOnce();
        expect(mocks.reload).toHaveBeenCalledOnce();
        expect(modeler.exportDiagram).toHaveBeenCalledTimes(2);
        expect(modeler.getDefinitions).toHaveBeenCalledTimes(definitionReadsBeforeReload);
        expect(centerOnElement).not.toHaveBeenCalled();
        expect(mocks.flushViewport).toHaveBeenCalledOnce();
        expect(document.body.inert).toBe(true);

        Object.defineProperty(document, "visibilityState", {
            configurable: true,
            value: "hidden",
        });
        document.dispatchEvent(new Event("visibilitychange"));
        await drainMicrotasks();

        expect(mocks.flushViewport).toHaveBeenCalledOnce();
    });
});

describe("bootstrap mode switching", () => {
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
            loadDiagram: vi.fn(async () => ({ warnings: [] })),
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
            getService: vi.fn(() => canvas),
            viewport: { centerOnElement: vi.fn() },
            ...overrides,
        };
    }

    function makeViewer(overrides: Record<string, unknown> = {}) {
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
            getService: vi.fn(() => canvas),
            viewport: { centerOnElement: vi.fn() },
            ...overrides,
        };
    }

    function makeDesigner(overrides: Record<string, unknown> = {}) {
        const canvas = makeCanvas();
        const eventBus = { on: vi.fn() };
        // Has newDiagram (editable) but no setMode → the designer surface.
        return {
            loadDiagram: vi.fn(async () => ({ warnings: [] })),
            exportDiagram: vi.fn(async () => "<exported />"),
            newDiagram: vi.fn(async () => ({ warnings: [] })),
            getDiagramSvg: vi.fn(),
            setFavouriteBpmnElements: vi.fn(),
            captureViewState: vi.fn(() => ({})),
            applyViewState: vi.fn(),
            setTheme: vi.fn(),
            applyLintResults: vi.fn(),
            applyLintingDisabled: vi.fn(),
            startInPageLinting: vi.fn(),
            destroy: vi.fn(),
            getService: vi.fn((name: string) => (name === "eventBus" ? eventBus : canvas)),
            viewport: { centerOnElement: vi.fn() },
            ...overrides,
        };
    }

    function makeHost(file: BpmnFileQuery, language?: string) {
        return {
            getState: vi.fn(() => ({})),
            setState: vi.fn(),
            updateState: vi.fn(),
            postMessage: vi.fn((message: { type: string }) => {
                switch (message.type) {
                    case "GetBpmnFileCommand":
                        dispatch(file);
                        break;
                    case "GetElementTemplatesCommand":
                        dispatch(new ElementTemplatesQuery([]));
                        break;
                    case "GetBpmnModelerSettingCommand":
                        dispatch(
                            new BpmnModelerSettingQuery({
                                alignToOrigin: false,
                                showTransactionBoundaries: false,
                                colorTheme: "light",
                            }),
                        );
                        if (language) {
                            dispatch(new LanguageQuery(language));
                        }
                        break;
                    case "GetPropertiesPanelStateCommand":
                        dispatch(new PropertiesPanelStateQuery(true));
                        break;
                }
            }),
        };
    }

    const modeButtons = () =>
        Array.from(document.querySelectorAll<HTMLButtonElement>(".mode-menu-item"));

    const sentTypes = (host: { postMessage: ReturnType<typeof vi.fn> }): string[] =>
        host.postMessage.mock.calls.map(([m]) => (m as { type: string }).type);

    function boot(host: unknown) {
        bootstrap(host as never, { capabilities: {}, clipboard: "native", linting: false });
    }

    it("opens an untagged model in Design with Implement disabled", async () => {
        mocks.createDesigner.mockResolvedValue(makeDesigner());
        const host = makeHost(new BpmnFileQuery("<untagged />", undefined, "modeler", 1));

        boot(host);
        await drainAsyncWork();

        expect(mocks.createDesigner).toHaveBeenCalledOnce();
        expect(mocks.createModeler).not.toHaveBeenCalled();
        // The designer's panel mounts in the runtime-created mount, not the host.
        expect(mocks.createDesigner.mock.calls[0][1].propertiesPanel.parent.id).toBe(
            "js-properties-panel-mount",
        );
        // The strip always offers all three modes; Implement is greyed out on
        // an untagged model (discoverable rather than hidden).
        const [view, design, implement] = modeButtons();
        expect(view.getAttribute("aria-disabled")).toBeNull();
        expect(design.getAttribute("aria-checked")).toBe("true");
        expect(implement.getAttribute("aria-disabled")).toBe("true");
    });

    it("requests the lint config for a designer and routes the in-page handback to it", async () => {
        const designer = makeDesigner();
        mocks.createDesigner.mockResolvedValue(designer);
        const host = makeHost(new BpmnFileQuery("<untagged />", undefined, "modeler", 1));

        boot(host);
        await drainAsyncWork();

        // The designer lints too: it asks the host for the workspace
        // lint config, but never for the modeler-only element templates.
        expect(sentTypes(host)).toContain("GetBpmnlintConfigCommand");
        expect(sentTypes(host)).not.toContain("GetElementTemplatesCommand");

        // The host's no-workspace-config handback reaches the designer's linter,
        // which resolves the engine-neutral Design default in-page.
        dispatch(new BpmnlintInPageQuery(undefined, "tok-1"));
        await drainMicrotasks();
        expect(designer.startInPageLinting).toHaveBeenCalledWith(undefined, "tok-1");
    });

    it("opens a saved View mode as the readonly viewer and ignores modeler-only queries", async () => {
        mocks.savedMode = "view";
        mocks.createViewer.mockResolvedValue(makeViewer());
        const host = makeHost(new BpmnFileQuery("<tagged />", "c7", "modeler", 1));

        boot(host);
        await drainAsyncWork();

        expect(mocks.createViewer).toHaveBeenCalledOnce();
        expect(mocks.createModeler).not.toHaveBeenCalled();
        // No templates request on a non-modeler surface.
        expect(sentTypes(host)).not.toContain("GetElementTemplatesCommand");
        // A stray ElementTemplatesQuery is a no-op (no throw, viewer has no setter).
        dispatch(new ElementTemplatesQuery([{ id: "tpl" }]));
        await drainMicrotasks();
        expect(sentTypes(host)).not.toContain("LogErrorCommand");
    });

    it("prefetches the saved surface before the host replies with the document", () => {
        mocks.savedMode = "implement";
        const host = {
            getState: vi.fn(),
            setState: vi.fn(),
            updateState: vi.fn(),
            postMessage: vi.fn(),
        };

        bootstrap(host as never, { capabilities: {}, clipboard: "native" });

        expect(mocks.prefetchSurfaceModules).toHaveBeenCalledWith("implement", { linting: true });
    });

    it("loads neither the viewer nor the designer for a tagged Implement open", async () => {
        mocks.createModeler.mockResolvedValue(makeModeler());
        const host = makeHost(new BpmnFileQuery("<tagged />", "c7", "modeler", 1));

        boot(host);
        await drainAsyncWork();

        expect(mocks.createModeler).toHaveBeenCalledOnce();
        expect(mocks.prefetchSurfaceModules).not.toHaveBeenCalled();
        expect(loadViewerModule).not.toHaveBeenCalled();
        expect(loadDesignerModule).not.toHaveBeenCalled();
    });

    it("seeds the initial mode from the host defaultMode when nothing is persisted", async () => {
        mocks.createViewer.mockResolvedValue(makeViewer());
        const host = makeHost(new BpmnFileQuery("<tagged />", "c7", "modeler", 1, "view"));

        boot(host);
        await drainAsyncWork();

        expect(mocks.createViewer).toHaveBeenCalledOnce();
        expect(mocks.createModeler).not.toHaveBeenCalled();
    });

    it("toggles Design↔Implement live via setMode without recreating", async () => {
        const modeler = makeModeler();
        mocks.createModeler.mockResolvedValue(modeler);
        const host = makeHost(new BpmnFileQuery("<tagged />", "c7", "modeler", 1));

        boot(host);
        await drainAsyncWork();
        expect(mocks.createModeler).toHaveBeenCalledOnce();

        // Click "Design": Design↔Implement on a tagged model is a live toggle.
        modeButtons()[1].click();
        await drainAsyncWork();

        expect(modeler.setMode).toHaveBeenCalledWith("design");
        expect(modeler.destroy).not.toHaveBeenCalled();
        expect(mocks.createModeler).toHaveBeenCalledOnce();
    });

    it("reports rejected element templates as one info box plus per-error log lines", async () => {
        mocks.createModeler.mockResolvedValue(makeModeler());
        const host = makeHost(new BpmnFileQuery("<tagged />", "c7", "modeler", 1));

        boot(host);
        await drainAsyncWork();

        const options = mocks.createModeler.mock.calls[0][1] as {
            onElementTemplatesErrors: (errors: unknown[]) => void;
        };
        host.postMessage.mockClear();
        options.onElementTemplatesErrors([new Error("bad"), "worse"]);

        const sent = host.postMessage.mock.calls.map(
            ([m]) => m as { type: string; message?: string },
        );
        expect(sent.filter((m) => m.type === "LogWarningCommand").map((m) => m.message)).toEqual([
            "Element template rejected: bad",
            "Element template rejected: worse",
        ]);
        expect(sent.filter((m) => m.type === "ShowInfoCommand").map((m) => m.message)).toEqual([
            "2 element templates were rejected and are ignored. See the log for details.",
        ]);

        host.postMessage.mockClear();
        options.onElementTemplatesErrors([]);
        expect(host.postMessage).not.toHaveBeenCalled();
    });

    it("recreates from Implement to View, carrying the diagram and view state over", async () => {
        const modeler = makeModeler();
        const viewer = makeViewer();
        mocks.createModeler.mockResolvedValue(modeler);
        mocks.createViewer.mockResolvedValue(viewer);
        const host = makeHost(new BpmnFileQuery("<tagged />", "c7", "modeler", 1));

        boot(host);
        await drainAsyncWork();

        // Click "View": anything involving View recreates the surface.
        modeButtons()[0].click();
        await drainAsyncWork();

        expect(modeler.exportDiagram).toHaveBeenCalled();
        expect(modeler.destroy).toHaveBeenCalledOnce();
        expect(mocks.createViewer).toHaveBeenCalledOnce();
        expect(viewer.loadDiagram).toHaveBeenCalledWith("<exported />");
        expect(viewer.applyViewState).toHaveBeenCalledOnce();
        expect(mocks.persistMode).toHaveBeenCalledWith("view");
        // Importing never fires commandStack.changed, so no outbound sync on a switch.
        expect(sentTypes(host)).not.toContain("SyncDocumentCommand");
        // The handle-less window is closed: inert restored, strip no longer busy.
        expect(document.body.inert).toBe(false);
        expect(document.getElementById("js-properties-panel")!.getAttribute("aria-busy")).toBe(
            "false",
        );
    });

    it.each([false, true])(
        "restores the page's inert state (%s) once a mode switch finishes",
        async (inertBeforeSwitch) => {
            let finishViewer!: () => void;
            mocks.createModeler.mockResolvedValue(makeModeler());
            mocks.createViewer.mockReturnValueOnce(
                new Promise((resolve) => {
                    finishViewer = () => resolve(makeViewer());
                }),
            );
            boot(makeHost(new BpmnFileQuery("<tagged />", "c7", "modeler", 1)));
            await drainAsyncWork();
            document.body.inert = inertBeforeSwitch;

            modeButtons()[0].click();
            await drainAsyncWork();
            expect(document.body.inert).toBe(true);

            finishViewer();
            await drainAsyncWork();

            expect(mocks.createViewer).toHaveBeenCalledOnce();
            expect(document.body.inert).toBe(inertBeforeSwitch);
        },
    );

    it("keeps the page locked for a destructive flush that outlasts a mode switch", async () => {
        let finishViewer!: () => void;
        const viewer = makeViewer();
        mocks.createModeler.mockResolvedValue(makeModeler());
        mocks.createViewer.mockReturnValueOnce(
            new Promise((resolve) => {
                finishViewer = () => resolve(viewer);
            }),
        );
        boot(makeHost(new BpmnFileQuery("<tagged />", "c7", "modeler", 1)));
        await drainAsyncWork();

        modeButtons()[0].click();
        await drainAsyncWork();
        dispatch(new FlushDocumentQuery(8, true));
        await drainAsyncWork();
        finishViewer();
        await drainAsyncWork();

        expect(viewer.loadDiagram).toHaveBeenCalledOnce();
        expect(document.body.inert).toBe(true);

        dispatch(new ReleaseDocumentFlushQuery(8));
        await drainMicrotasks();

        expect(document.body.inert).toBe(false);
    });

    it("keeps the page locked when an engine reload lands during a mode switch", async () => {
        let finishViewer!: () => void;
        mocks.createModeler.mockResolvedValue(makeModeler());
        mocks.createViewer.mockReturnValueOnce(
            new Promise((resolve) => {
                finishViewer = () => resolve(makeViewer());
            }),
        );
        bootstrap(makeHost(new BpmnFileQuery("<tagged />", "c7", "modeler", 1)) as never, {
            capabilities: {},
            clipboard: "native",
            linting: false,
            reload: mocks.reload,
        });
        await drainAsyncWork();

        modeButtons()[0].click();
        await drainAsyncWork();
        dispatch(new BpmnFileQuery("<c8 />", "c8", "modeler", 2));
        await drainAsyncWork();
        finishViewer();
        await drainAsyncWork();

        expect(mocks.reload).toHaveBeenCalledOnce();
        expect(document.body.inert).toBe(true);
    });

    const stateManagers = () =>
        mocks.stateManagerCreated.mock.calls.map(
            ([manager]) => manager as { restoreViewport: ReturnType<typeof vi.fn> },
        );

    it("leaves a recreated surface on its carried view state", async () => {
        const modeler = makeModeler();
        const viewer = makeViewer();
        mocks.createModeler.mockResolvedValue(modeler);
        mocks.createViewer.mockResolvedValue(viewer);

        boot(makeHost(new BpmnFileQuery("<tagged />", "c7", "modeler", 1)));
        await drainAsyncWork();
        modeButtons()[0].click();
        await drainAsyncWork();

        expect(viewer.applyViewState).toHaveBeenCalledOnce();
        const [initial, recreated] = stateManagers();
        expect(initial.restoreViewport).toHaveBeenCalledOnce();
        expect(recreated.restoreViewport).not.toHaveBeenCalled();
    });

    it("asks the host for the templates and lint config of a modeler a mode switch creates", async () => {
        mocks.savedMode = "view";
        mocks.createViewer.mockResolvedValue(makeViewer());
        mocks.createModeler.mockResolvedValue(makeModeler());
        const host = makeHost(new BpmnFileQuery("<tagged />", "c7", "modeler", 1));

        boot(host);
        await drainAsyncWork();
        host.postMessage.mockClear();
        modeButtons()[2].click();
        await drainAsyncWork();

        expect(
            sentTypes(host).filter(
                (type) =>
                    type === "GetElementTemplatesCommand" || type === "GetBpmnlintConfigCommand",
            ),
        ).toEqual(["GetElementTemplatesCommand", "GetBpmnlintConfigCommand"]);
    });

    it("persists and shows a mode toggle the modeler announces itself", async () => {
        mocks.createModeler.mockResolvedValue(makeModeler());

        boot(makeHost(new BpmnFileQuery("<tagged />", "c7", "modeler", 1)));
        await drainAsyncWork();
        mocks.persistMode.mockClear();
        mocks.createModeler.mock.calls[0][1].onModeChanged("design");

        expect(mocks.persistMode).toHaveBeenCalledExactlyOnceWith("design");
        expect(modeButtons()[1].getAttribute("aria-checked")).toBe("true");
    });

    it("restores the persisted viewport on a fallback surface after its import", async () => {
        const first = makeModeler();
        const fallback = makeModeler();
        mocks.createModeler.mockResolvedValueOnce(first).mockResolvedValueOnce(fallback);
        mocks.createViewer.mockRejectedValue(new Error("viewer failed"));

        boot(makeHost(new BpmnFileQuery("<tagged />", "c7", "modeler", 1)));
        await drainAsyncWork();
        // View fails to build, so the session falls back to Implement.
        modeButtons()[0].click();
        await drainAsyncWork();

        expect(fallback.loadDiagram).toHaveBeenCalledWith("<exported />");
        const fallbackManager = stateManagers().at(-1)!;
        expect(fallbackManager.restoreViewport).toHaveBeenCalledOnce();
        expect(fallback.loadDiagram.mock.invocationCallOrder[0]).toBeLessThan(
            fallbackManager.restoreViewport.mock.invocationCallOrder[0],
        );
    });

    it("auto-focuses the canvas of the current surface after a recreate", async () => {
        const modeler = makeModeler();
        const viewer = makeViewer();
        mocks.createModeler.mockResolvedValue(modeler);
        mocks.createViewer.mockResolvedValue(viewer);
        const host = makeHost(new BpmnFileQuery("<tagged />", "c7", "modeler", 1));

        boot(host);
        await drainAsyncWork();
        modeButtons()[0].click();
        await drainAsyncWork();

        expect(installCanvasAutoFocus).toHaveBeenCalledOnce();
        vi.mocked(installCanvasAutoFocus).mock.calls[0][0].focusCanvas();
        expect(viewer.getService("canvas").focus).toHaveBeenCalledOnce();
        expect(modeler.getService("canvas").focus).not.toHaveBeenCalled();
    });

    it("asks the host for focus once ready and focuses the canvas when told to", async () => {
        const modeler = makeModeler();
        mocks.createModeler.mockResolvedValue(modeler);
        const host = makeHost(new BpmnFileQuery("<tagged />", "c7", "modeler", 1));

        boot(host);
        await drainAsyncWork();
        expect(sentTypes(host)).toContain("RequestFocusCommand");
        expect(modeler.getService("canvas").focus).not.toHaveBeenCalled();

        dispatch(new TakeFocusQuery());
        await drainAsyncWork();

        expect(modeler.getService("canvas").focus).toHaveBeenCalledOnce();
    });

    it("ignores a mode click while a switch is in flight", async () => {
        const modeler = makeModeler();
        const viewer = makeViewer();
        let releaseExport!: () => void;
        modeler.exportDiagram = vi.fn(
            () =>
                new Promise<string>((resolve) => {
                    releaseExport = () => resolve("<exported />");
                }),
        );
        mocks.createModeler.mockResolvedValue(modeler);
        mocks.createViewer.mockResolvedValue(viewer);
        const host = makeHost(new BpmnFileQuery("<tagged />", "c7", "modeler", 1));

        boot(host);
        await drainAsyncWork();

        modeButtons()[0].click(); // → View (recreate), blocks on export
        await drainMicrotasks();
        modeButtons()[1].click(); // → Design, must be ignored while switch pending
        await drainMicrotasks();

        releaseExport();
        await drainAsyncWork();

        // Only the View switch ran: one destroy, the viewer stood up once.
        expect(modeler.destroy).toHaveBeenCalledOnce();
        expect(mocks.createViewer).toHaveBeenCalledOnce();
    });

    it("ignores mode clicks until the initial surface is ready", async () => {
        let releaseImport!: () => void;
        const modeler = makeModeler({
            loadDiagram: vi.fn(
                () =>
                    new Promise((resolve) => {
                        releaseImport = () => resolve({ warnings: [] });
                    }),
            ),
        });
        mocks.createModeler.mockResolvedValue(modeler);
        mocks.createViewer.mockResolvedValue(makeViewer());
        boot(makeHost(new BpmnFileQuery("<tagged />", "c7", "modeler", 1)));
        await drainAsyncWork();

        modeButtons()[0].click();
        await drainMicrotasks();
        releaseImport();
        await drainAsyncWork();

        expect(mocks.createViewer).not.toHaveBeenCalled();
        expect(modeler.destroy).not.toHaveBeenCalled();
        expect(mocks.startPersisting).toHaveBeenCalledOnce();
    });

    describe("host state on a rebuilt modeler", () => {
        const hostSettings = {
            alignToOrigin: true,
            showTransactionBoundaries: false,
            colorTheme: "light" as const,
            favouriteBpmnElements: ["bpmn:UserTask"],
        };
        const openScripts = [
            {
                elementId: "Task_1",
                kind: "script-task" as const,
                listenerIndex: undefined,
                fileName: "Task_1.js",
            },
        ];

        function makeSettingsHost() {
            const host = makeHost(new BpmnFileQuery("<tagged />", "c7", "modeler", 1));
            const answerDefaults = host.postMessage.getMockImplementation()!;
            host.postMessage.mockImplementation((message: { type: string }) => {
                if (message.type !== "GetBpmnModelerSettingCommand") {
                    answerDefaults(message);
                    return;
                }
                dispatch(new BpmnModelerSettingQuery(hostSettings));
                dispatch(new UpdateOpenScriptEditorsQuery(openScripts));
            });
            return host;
        }

        function makeScriptLockingModeler() {
            const applyOpenScriptEditors = vi.fn();
            return { modeler: makeModeler({ applyOpenScriptEditors }), applyOpenScriptEditors };
        }

        const implementButton = () => modeButtons()[2];
        const viewButton = () => modeButtons()[0];

        it("applies the host settings and open-script locks to a modeler a mode switch creates", async () => {
            mocks.savedMode = "view";
            const { modeler, applyOpenScriptEditors } = makeScriptLockingModeler();
            mocks.createViewer.mockResolvedValue(makeViewer());
            mocks.createModeler.mockResolvedValue(modeler);

            boot(makeSettingsHost());
            await drainAsyncWork();
            implementButton().click();
            await drainAsyncWork();

            expect(mocks.createModeler).toHaveBeenCalledOnce();
            expect(mocks.createModeler.mock.calls[0][1]).toMatchObject({ settings: hostSettings });
            expect(applyOpenScriptEditors).toHaveBeenCalledWith(openScripts);
            // The script-source watcher baselines from the model, so the locks
            // must land on the imported diagram, not on the empty canvas.
            expect(modeler.loadDiagram.mock.invocationCallOrder[0]).toBeLessThan(
                applyOpenScriptEditors.mock.invocationCallOrder[0],
            );
        });

        it("carries the host state into the second modeler after Implement → View → Implement", async () => {
            const first = makeScriptLockingModeler();
            const second = makeScriptLockingModeler();
            mocks.createModeler
                .mockResolvedValueOnce(first.modeler)
                .mockResolvedValueOnce(second.modeler);
            mocks.createViewer.mockResolvedValue(makeViewer());

            boot(makeSettingsHost());
            await drainAsyncWork();
            viewButton().click();
            await drainAsyncWork();
            implementButton().click();
            await drainAsyncWork();

            expect(first.modeler.setSettings).toHaveBeenCalledWith(hostSettings);
            expect(first.applyOpenScriptEditors).toHaveBeenCalledWith(openScripts);
            expect(mocks.createModeler).toHaveBeenCalledTimes(2);
            expect(mocks.createModeler.mock.calls[1][1]).toMatchObject({ settings: hostSettings });
            expect(second.applyOpenScriptEditors).toHaveBeenCalledWith(openScripts);
        });

        it("hands host state pushed while in View to the next modeler", async () => {
            mocks.savedMode = "view";
            const { modeler, applyOpenScriptEditors } = makeScriptLockingModeler();
            mocks.createViewer.mockResolvedValue(makeViewer());
            mocks.createModeler.mockResolvedValue(modeler);
            const pushedSettings = { ...hostSettings, favouriteBpmnElements: ["bpmn:ScriptTask"] };

            boot(makeSettingsHost());
            await drainAsyncWork();
            dispatch(new BpmnModelerSettingQuery(pushedSettings));
            dispatch(new UpdateOpenScriptEditorsQuery([]));
            await drainMicrotasks();
            implementButton().click();
            await drainAsyncWork();

            expect(mocks.createModeler.mock.calls[0][1]).toMatchObject({
                settings: pushedSettings,
            });
            expect(applyOpenScriptEditors).toHaveBeenCalledExactlyOnceWith([]);
        });

        it("applies settings pushed while the rebuilt modeler initialises", async () => {
            mocks.savedMode = "view";
            const modeler = makeModeler();
            let finishModelerInit!: () => void;
            mocks.createViewer.mockResolvedValue(makeViewer());
            mocks.createModeler.mockReturnValueOnce(
                new Promise((resolve) => {
                    finishModelerInit = () => resolve(modeler);
                }),
            );
            const pushedSettings = { ...hostSettings, alignToOrigin: false };

            boot(makeSettingsHost());
            await drainAsyncWork();
            implementButton().click();
            await drainAsyncWork();
            expect(mocks.createModeler.mock.calls[0][1]).toMatchObject({ settings: hostSettings });
            dispatch(new BpmnModelerSettingQuery(pushedSettings));
            finishModelerInit();
            await drainAsyncWork();

            expect(modeler.setSettings).toHaveBeenCalledExactlyOnceWith(pushedSettings);
        });
    });

    describe("host favourites in Design", () => {
        const hostSettings = {
            alignToOrigin: true,
            showTransactionBoundaries: false,
            colorTheme: "light" as const,
            favouriteBpmnElements: ["bpmn:UserTask"],
        };
        const pushedSettings = { ...hostSettings, favouriteBpmnElements: ["bpmn:ServiceTask"] };

        function makeSettingsHost(file: BpmnFileQuery) {
            const host = makeHost(file);
            const answerDefaults = host.postMessage.getMockImplementation()!;
            host.postMessage.mockImplementation((message: { type: string }) => {
                if (message.type === "GetBpmnModelerSettingCommand") {
                    dispatch(new BpmnModelerSettingQuery(hostSettings));
                    return;
                }
                answerDefaults(message);
            });
            return host;
        }

        const untagged = () => new BpmnFileQuery("<untagged />", undefined, "modeler", 1);
        const viewButton = () => modeButtons()[0];
        const designButton = () => modeButtons()[1];

        it("hands the host favourites to the initial designer", async () => {
            const designer = makeDesigner();
            mocks.createDesigner.mockResolvedValue(designer);

            boot(makeSettingsHost(untagged()));
            await drainAsyncWork();

            expect(designer.setFavouriteBpmnElements).toHaveBeenCalledExactlyOnceWith([
                "bpmn:UserTask",
            ]);
        });

        it("updates the live designer when the host pushes new favourites", async () => {
            const designer = makeDesigner();
            mocks.createDesigner.mockResolvedValue(designer);

            boot(makeSettingsHost(untagged()));
            await drainAsyncWork();
            dispatch(new BpmnModelerSettingQuery(pushedSettings));
            await drainMicrotasks();

            expect(designer.setFavouriteBpmnElements.mock.calls).toEqual([
                [["bpmn:UserTask"]],
                [["bpmn:ServiceTask"]],
            ]);
        });

        it("leaves the designer's favourites alone when the host settings carry none", async () => {
            const designer = makeDesigner();
            mocks.createDesigner.mockResolvedValue(designer);

            boot(makeHost(untagged()));
            await drainAsyncWork();

            expect(designer.setFavouriteBpmnElements).not.toHaveBeenCalled();
        });

        it("creates the designer of a Design → View → Design switch with the favourites", async () => {
            const second = makeDesigner();
            mocks.createDesigner
                .mockResolvedValueOnce(makeDesigner())
                .mockResolvedValueOnce(second);
            mocks.createViewer.mockResolvedValue(makeViewer());

            boot(makeSettingsHost(untagged()));
            await drainAsyncWork();
            viewButton().click();
            await drainAsyncWork();
            designButton().click();
            await drainAsyncWork();

            expect(mocks.createDesigner).toHaveBeenCalledTimes(2);
            expect(mocks.createDesigner.mock.calls[1][1]).toMatchObject({
                favouriteBpmnElements: ["bpmn:UserTask"],
            });
            expect(second.setFavouriteBpmnElements).not.toHaveBeenCalled();
        });

        it("applies favourites pushed while the rebuilt designer initialises", async () => {
            mocks.savedMode = "view";
            const designer = makeDesigner();
            let finishDesignerInit!: () => void;
            mocks.createViewer.mockResolvedValue(makeViewer());
            mocks.createDesigner.mockReturnValueOnce(
                new Promise((resolve) => {
                    finishDesignerInit = () => resolve(designer);
                }),
            );

            boot(makeSettingsHost(untagged()));
            await drainAsyncWork();
            designButton().click();
            await drainAsyncWork();
            expect(mocks.createDesigner.mock.calls[0][1]).toMatchObject({
                favouriteBpmnElements: ["bpmn:UserTask"],
            });
            dispatch(new BpmnModelerSettingQuery(pushedSettings));
            finishDesignerInit();
            await drainAsyncWork();

            expect(designer.setFavouriteBpmnElements).toHaveBeenCalledExactlyOnceWith([
                "bpmn:ServiceTask",
            ]);
        });

        it("keeps handing a modeler its favourites through setSettings", async () => {
            const setFavouriteBpmnElements = vi.fn();
            const modeler = makeModeler({ setFavouriteBpmnElements });
            mocks.createModeler.mockResolvedValue(modeler);

            boot(makeSettingsHost(new BpmnFileQuery("<tagged />", "c7", "modeler", 1)));
            await drainAsyncWork();
            dispatch(new BpmnModelerSettingQuery(pushedSettings));
            await drainMicrotasks();

            expect(modeler.setSettings.mock.calls).toEqual([[hostSettings], [pushedSettings]]);
            expect(setFavouriteBpmnElements).not.toHaveBeenCalled();
        });
    });

    describe("initial locale", () => {
        const germanFile = new BpmnFileQuery("<tagged />", "c7", "modeler", 1, undefined, "de");

        it("applies the host locale before the first import so the matching LanguageQuery does not re-import", async () => {
            const modeler = makeModeler();
            mocks.createModeler.mockResolvedValue(modeler);

            boot(makeHost(germanFile, "de"));
            await drainAsyncWork();

            expect(modeler.loadDiagram).toHaveBeenCalledOnce();
            expect(modeler.exportDiagram).not.toHaveBeenCalled();
            expect(vi.mocked(i18n.setLanguage).mock.invocationCallOrder[0]).toBeLessThan(
                mocks.createModeler.mock.invocationCallOrder[0],
            );
            expect(i18n.getLocale()).toBe("de");
        });

        it("still re-imports when the language changes after the seeded open", async () => {
            const modeler = makeModeler();
            mocks.createModeler.mockResolvedValue(modeler);

            boot(makeHost(germanFile, "de"));
            await drainAsyncWork();
            dispatch(new LanguageQuery("fr"));
            await drainAsyncWork();

            expect(modeler.exportDiagram).toHaveBeenCalledOnce();
            expect(modeler.loadDiagram).toHaveBeenCalledTimes(2);
            expect(i18n.getLocale()).toBe("fr");
        });

        it("ignores the locale on later host pushes", async () => {
            const modeler = makeModeler();
            mocks.createModeler.mockResolvedValue(modeler);

            boot(makeHost(germanFile, "de"));
            await drainAsyncWork();
            dispatch(new BpmnFileQuery("<pushed />", "c7", "modeler", 2, undefined, "fr"));
            await drainAsyncWork();

            expect(modeler.loadDiagram).toHaveBeenLastCalledWith("<pushed />");
            expect(i18n.setLanguage).not.toHaveBeenCalledWith("fr");
            expect(i18n.getLocale()).toBe("de");
        });
    });

    describe("host handshake", () => {
        const settingsQuery = () =>
            new BpmnModelerSettingQuery({
                alignToOrigin: false,
                showTransactionBoundaries: false,
                colorTheme: "light",
            });

        // The document reply is dispatched by the test, so other replies can
        // overtake it the way an awaited host lookup (engine picker) lets them.
        function makeDeferredFileHost(replies: Record<string, () => unknown[]> = {}) {
            return {
                getState: vi.fn(() => ({})),
                setState: vi.fn(),
                updateState: vi.fn(),
                postMessage: vi.fn((message: { type: string }) => {
                    const answer = replies[message.type];
                    if (answer) {
                        queueMicrotask(() => answer().forEach(dispatch));
                    }
                }),
            };
        }

        function makeGatedImportModeler(overrides: Record<string, unknown> = {}) {
            let releaseImport!: () => void;
            const modeler = makeModeler({
                loadDiagram: vi.fn(
                    () =>
                        new Promise((resolve) => {
                            releaseImport = () => resolve({ warnings: [] });
                        }),
                ),
                ...overrides,
            });
            return { modeler, releaseImport: () => releaseImport() };
        }

        const firstCall = (fn: ReturnType<typeof vi.fn>) => fn.mock.invocationCallOrder[0];

        it("requests settings and panel state together with the document", () => {
            const host = makeDeferredFileHost();

            boot(host);

            expect(sentTypes(host)).toEqual([
                "GetBpmnFileCommand",
                "GetBpmnModelerSettingCommand",
                "GetPropertiesPanelStateCommand",
            ]);
        });

        it("requests element templates and the lint config before the import completes", async () => {
            const { modeler, releaseImport } = makeGatedImportModeler();
            mocks.createModeler.mockResolvedValue(modeler);
            const host = makeDeferredFileHost();

            boot(host);
            dispatch(new BpmnFileQuery("<tagged />", "c7", "modeler", 1));
            await drainAsyncWork();

            expect(modeler.loadDiagram).toHaveBeenCalledOnce();
            expect(sentTypes(host)).toEqual(
                expect.arrayContaining(["GetElementTemplatesCommand", "GetBpmnlintConfigCommand"]),
            );

            releaseImport();
            await drainAsyncWork();
        });

        it("applies replies that overtake the document after the import, in arrival order", async () => {
            const applyOpenScriptEditors = vi.fn();
            const modeler = makeModeler({ applyOpenScriptEditors });
            mocks.createModeler.mockResolvedValue(modeler);
            const host = makeDeferredFileHost({
                GetBpmnModelerSettingCommand: () => [
                    settingsQuery(),
                    new UpdateOpenScriptEditorsQuery([]),
                ],
                GetElementTemplatesCommand: () => [new ElementTemplatesQuery([])],
            });

            boot(host);
            await drainMicrotasks();
            dispatch(new BpmnFileQuery("<tagged />", "c7", "modeler", 1));
            await drainAsyncWork();

            expect(firstCall(modeler.loadDiagram)).toBeLessThan(firstCall(modeler.setSettings));
            expect(firstCall(modeler.setSettings)).toBeLessThan(firstCall(applyOpenScriptEditors));
            expect(firstCall(applyOpenScriptEditors)).toBeLessThan(
                firstCall(modeler.setElementTemplates),
            );
            expect(sentTypes(host)).not.toContain("LogErrorCommand");
        });

        it("does not re-import for a matching LanguageQuery that overtakes the document", async () => {
            const modeler = makeModeler();
            mocks.createModeler.mockResolvedValue(modeler);
            const host = makeDeferredFileHost({
                GetBpmnModelerSettingCommand: () => [settingsQuery(), new LanguageQuery("de")],
            });

            boot(host);
            await drainMicrotasks();
            dispatch(new BpmnFileQuery("<tagged />", "c7", "modeler", 1, undefined, "de"));
            await drainAsyncWork();

            expect(modeler.loadDiagram).toHaveBeenCalledOnce();
            expect(modeler.exportDiagram).not.toHaveBeenCalled();
            expect(i18n.getLocale()).toBe("de");
        });

        it("clears busy without another host request after the import", async () => {
            const { modeler, releaseImport } = makeGatedImportModeler();
            mocks.createModeler.mockResolvedValue(modeler);
            const host = makeDeferredFileHost({
                GetBpmnModelerSettingCommand: () => [settingsQuery()],
                GetPropertiesPanelStateCommand: () => [new PropertiesPanelStateQuery(true)],
                GetElementTemplatesCommand: () => [new ElementTemplatesQuery([])],
            });

            boot(host);
            dispatch(new BpmnFileQuery("<tagged />", "c7", "modeler", 1));
            await drainAsyncWork();
            host.postMessage.mockClear();

            releaseImport();
            // Microtasks only: advancing timers would let the reply timeouts clear busy.
            for (let round = 0; round < 5; round++) {
                await drainMicrotasks();
            }

            expect(sentTypes(host).filter((type) => type.startsWith("Get"))).toEqual([]);
            expect(document.getElementById("js-properties-panel")!.getAttribute("aria-busy")).toBe(
                "false",
            );
        });

        it("drops held replies in a diff pane and applies later language changes directly", async () => {
            const host = makeDeferredFileHost({
                GetBpmnModelerSettingCommand: () => [settingsQuery(), new LanguageQuery("de")],
            });

            boot(host);
            await drainMicrotasks();
            dispatch(new BpmnFileQuery("<left />", "c7", "viewer", 1));
            await drainAsyncWork();
            expect(i18n.setLanguage).not.toHaveBeenCalledWith("de");

            dispatch(new LanguageQuery("fr"));
            await drainMicrotasks();

            expect(i18n.setLanguage).toHaveBeenCalledWith("fr");
            expect(sentTypes(host)).not.toContain("LogErrorCommand");
        });
    });

    type Posted = { type: string } & Record<string, unknown>;

    const sentOfType = (host: { postMessage: ReturnType<typeof vi.fn> }, type: string): Posted[] =>
        host.postMessage.mock.calls
            .map(([message]) => message as Posted)
            .filter((message) => message.type === type);

    const tagged = (engine: "c7" | "c8" = "c7") =>
        new BpmnFileQuery("<tagged />", engine, "modeler", 1);

    function modelerWithServices(
        services: Record<string, unknown>,
        overrides: Record<string, unknown> = {},
    ) {
        const canvas = makeCanvas();
        return makeModeler({
            getService: vi.fn((name: string) => services[name] ?? canvas),
            ...overrides,
        });
    }

    describe("production defaults", () => {
        interface DefaultModelerOptions {
            capabilities: Required<ModelerCapabilities>;
            clipboard?: Required<ClipboardOptions>;
            onLintResults: (event: { results: unknown; unresolved: readonly string[] }) => void;
            onLintingToggled: (enabled: boolean) => void;
        }

        beforeEach(() => {
            vi.stubEnv("NODE_ENV", "production");
        });

        afterEach(() => {
            vi.unstubAllEnvs();
        });

        // Mirrors main.ts: no capabilities, clipboard or linting options.
        async function bootLikeMain(file = tagged(), modeler = makeModeler()) {
            mocks.createModeler.mockResolvedValue(modeler);
            const host = makeHost(file);
            bootstrap(host as never);
            await drainAsyncWork();
            const options = mocks.createModeler.mock.calls[0][1] as DefaultModelerOptions;
            return { host, modeler, options, ports: options.capabilities };
        }

        it("routes navigation, code-link and scripting ports to host commands", async () => {
            const definitions = {
                rootElements: [
                    {
                        $type: "bpmn:Process",
                        flowElements: [
                            { $type: "bpmn:ScriptTask", id: "Task_1", resultVariable: "total" },
                        ],
                    },
                ],
            };
            const { host, ports } = await bootLikeMain(
                tagged(),
                makeModeler({ getDefinitions: vi.fn(() => definitions) }),
            );

            ports.modelNavigation.openReference({ id: "Form_1", kind: "form" });
            ports.codeLink.navigateToImplementation("com.example.Delegate", "javaClass");
            ports.codeLink.syncActivities([]);
            ports.scripting.openScriptEditor({
                elementId: "Task_1",
                kind: "script-task",
                listenerIndex: undefined,
                eventName: undefined,
                scriptFormat: "javascript",
                content: "total = 1",
            });
            ports.scripting.scriptSourceChanged({
                elementId: "Task_1",
                kind: "script-task",
                listenerIndex: undefined,
                content: "total = 2",
            });

            expect(sentOfType(host, "NavigateToReferencedModelCommand")).toEqual([
                expect.objectContaining({ referenceId: "Form_1", referenceKind: "form" }),
            ]);
            expect(sentOfType(host, "NavigateToImplementationCommand")).toEqual([
                expect.objectContaining({ reference: "com.example.Delegate", kind: "javaClass" }),
            ]);
            expect(sentOfType(host, "SyncActivitiesCommand")).toHaveLength(1);
            const [openEditor] = sentOfType(host, "OpenScriptEditorCommand");
            expect(openEditor).toMatchObject({ elementId: "Task_1", content: "total = 1" });
            expect(openEditor.variables).toEqual([expect.objectContaining({ name: "total" })]);
            expect(sentOfType(host, "UpdateScriptSourceCommand")).toEqual([
                expect.objectContaining({ elementId: "Task_1", content: "total = 2" }),
            ]);
        });

        it("offers form references only once the host reports the form exists", async () => {
            const { host, ports } = await bootLikeMain(tagged("c8"));
            const { modelNavigation } = ports;
            const availabilityChanged = vi.fn();
            const stopListening =
                modelNavigation.onReferenceAvailabilityChanged!(availabilityChanged);

            expect(sentOfType(host, "GetFormReferenceStatusCommand")).toHaveLength(1);
            expect(
                modelNavigation.isReferenceAvailable!({ id: "Process_1", kind: "process" }),
            ).toBe(true);
            expect(modelNavigation.isReferenceAvailable!({ id: "Form_1", kind: "form" })).toBe(
                false,
            );

            dispatch(new FormReferenceStatusQuery(["Form_1"]));
            dispatch(new FormReferenceStatusQuery(["Form_1"]));
            await drainMicrotasks();

            expect(modelNavigation.isReferenceAvailable!({ id: "Form_1", kind: "form" })).toBe(
                true,
            );
            expect(availabilityChanged).toHaveBeenCalledOnce();

            dispatch(new FormReferenceStatusQuery(["Form_2"]));
            await drainMicrotasks();
            expect(availabilityChanged).toHaveBeenCalledTimes(2);

            stopListening();
            dispatch(new FormReferenceStatusQuery([]));
            await drainMicrotasks();
            expect(availabilityChanged).toHaveBeenCalledTimes(2);
        });

        it("asks for form reference status only for Camunda 8 diagrams", async () => {
            const { host } = await bootLikeMain(tagged("c7"));

            expect(sentOfType(host, "GetFormReferenceStatusCommand")).toHaveLength(0);
        });

        it("settles each workspace search with the reply carrying its request id", async () => {
            const { host, ports } = await bootLikeMain();
            const orderDefinition = {
                kind: "message" as const,
                name: "OrderPlaced",
                source: { path: "order.bpmn", label: "order.bpmn" },
                usages: [],
            };

            const first = ports.definitionSearch.search({ kind: "message", text: "pay" });
            const second = ports.definitionSearch.search({ kind: "message", text: "order" });
            const requestIds = sentOfType(host, "SearchWorkspaceDefinitionsCommand").map(
                (command) => command.requestId,
            );
            dispatch(new WorkspaceDefinitionsQuery(99, []));
            dispatch(new WorkspaceDefinitionsQuery(requestIds[1] as number, [orderDefinition]));
            dispatch(new WorkspaceDefinitionsQuery(requestIds[0] as number, [], true));

            expect(new Set(requestIds).size).toBe(2);
            await expect(second).resolves.toEqual([orderDefinition]);
            await expect(first).rejects.toThrow("The host could not search other models");
        });

        it("fails a workspace search the host never answers and ignores its late reply", async () => {
            const { host, ports } = await bootLikeMain();
            const settled = vi.fn();
            void ports.definitionSearch.search({ kind: "message", text: "order" }).then(
                (definitions) => settled({ definitions }),
                (error: Error) => settled({ error: error.message }),
            );
            const [{ requestId }] = sentOfType(host, "SearchWorkspaceDefinitionsCommand");

            await vi.advanceTimersByTimeAsync(DEFINITION_SEARCH_TIMEOUT_MS - 1);
            expect(settled).not.toHaveBeenCalled();

            await vi.advanceTimersByTimeAsync(1);
            expect(settled).toHaveBeenCalledExactlyOnceWith({
                error: expect.stringMatching(/did not answer/),
            });
            expect(sentOfType(host, "LogWarningCommand")).toContainEqual(
                expect.objectContaining({ message: expect.stringContaining("search") }),
            );

            dispatch(new WorkspaceDefinitionsQuery(requestId as number, []));
            await drainMicrotasks();
            expect(settled).toHaveBeenCalledOnce();
        });

        it("still resolves a workspace search answered just before the deadline", async () => {
            const { host, ports } = await bootLikeMain();
            const definition = {
                kind: "message" as const,
                name: "OrderPlaced",
                source: { path: "order.bpmn", label: "order.bpmn" },
                usages: [],
            };
            const search = ports.definitionSearch.search({ kind: "message", text: "order" });
            const [{ requestId }] = sentOfType(host, "SearchWorkspaceDefinitionsCommand");

            await vi.advanceTimersByTimeAsync(DEFINITION_SEARCH_TIMEOUT_MS - 1);
            dispatch(new WorkspaceDefinitionsQuery(requestId as number, [definition]));

            await expect(search).resolves.toEqual([definition]);
        });

        it.each(["bridge", "text"] as const)(
            "skips a %s paste the host never answers",
            async (channel) => {
                const { host, options } = await bootLikeMain();
                const settled = vi.fn();
                void options.clipboard![channel].requestClipboard().then(settled);

                await vi.advanceTimersByTimeAsync(HOST_REPLY_TIMEOUT_MS - 1);
                expect(settled).not.toHaveBeenCalled();

                await vi.advanceTimersByTimeAsync(1);
                expect(settled).toHaveBeenCalledWith("");
                expect(sentOfType(host, "LogWarningCommand")).toContainEqual(
                    expect.objectContaining({ message: expect.stringContaining("clipboard") }),
                );
            },
        );

        it("copies and pastes through separate host channels for elements and text", async () => {
            const { host, options } = await bootLikeMain();
            const { bridge, text } = options.clipboard!;

            const elementPaste = bridge.requestClipboard();
            dispatch(new TextClipboardQuery("label text"));
            dispatch(new ClipboardQuery("<bpmn-elements />"));
            const textPaste = text.requestClipboard();
            dispatch(new TextClipboardQuery(undefined as unknown as string));
            bridge.writeClipboard("<copied />");
            text.writeClipboard("copied label");

            await expect(elementPaste).resolves.toBe("<bpmn-elements />");
            await expect(textPaste).resolves.toBe("");
            expect(sentOfType(host, "GetClipboardCommand")).toHaveLength(1);
            expect(sentOfType(host, "GetTextClipboardCommand")).toHaveLength(1);
            expect(sentOfType(host, "SetClipboardCommand")).toEqual([
                expect.objectContaining({ text: "<copied />" }),
            ]);
            expect(sentOfType(host, "SetTextClipboardCommand")).toEqual([
                expect.objectContaining({ text: "copied label" }),
            ]);
        });

        it("keeps the browser clipboard in the development preview", async () => {
            vi.stubEnv("NODE_ENV", "development");

            const { options } = await bootLikeMain();

            expect(options.clipboard).toBeUndefined();
        });

        it("pairs every lint run with the config token the host sent last", async () => {
            const { host, modeler, options } = await bootLikeMain();
            const config = { extends: ["bpmnlint:recommended"] };

            dispatch(new BpmnlintInPageQuery(config, "tok-7"));
            await drainMicrotasks();
            options.onLintResults({ results: {}, unresolved: ["missing-plugin"] });
            options.onLintingToggled(false);

            expect(modeler.startInPageLinting).toHaveBeenCalledWith(config, "tok-7");
            expect(sentOfType(host, "UpdateLintResultsCommand")).toEqual([
                expect.objectContaining({ unresolved: ["missing-plugin"], configToken: "tok-7" }),
            ]);
            expect(sentOfType(host, "SetLintingEnabledCommand")).toEqual([
                expect.objectContaining({ enabled: false }),
            ]);
        });
    });

    describe("host requests", () => {
        function formattableModeler(overrides: Record<string, unknown> = {}) {
            const eventBus = { on: vi.fn() };
            const modeler = modelerWithServices(
                { eventBus },
                {
                    formatDiagram: vi.fn(async () => undefined),
                    cleanupDiagram: vi.fn(() => ({ status: "clean", items: [] })),
                    ...overrides,
                },
            );
            return { modeler, eventBus };
        }

        async function bootWith(surface: unknown, file = tagged()) {
            if ("setMode" in (surface as object)) {
                mocks.createModeler.mockResolvedValue(surface);
            } else {
                mocks.savedMode = "view";
                mocks.createViewer.mockResolvedValue(surface);
            }
            const host = makeHost(file);
            boot(host);
            await drainAsyncWork();
            host.postMessage.mockClear();
            return host;
        }

        it("reports the outcome of every format run on the canvas", async () => {
            const { modeler, eventBus } = formattableModeler();
            const host = await bootWith(modeler);
            const [, announce] = eventBus.on.mock.calls.find(
                ([event]) => event === "layout.formatted",
            )!;

            announce({ status: "failed", diagnostics: [], code: "ENGINE_FAILED", message: "x" });

            expect(sentOfType(host, "DiagramFormattedCommand")).toEqual([
                expect.objectContaining({
                    status: "failed",
                    diagnostics: [],
                    code: "ENGINE_FAILED",
                    message: "x",
                }),
            ]);
        });

        it("reports a format run that throws", async () => {
            const { modeler } = formattableModeler({
                formatDiagram: vi.fn(async () => {
                    throw new Error("layout engine crashed");
                }),
            });
            const host = await bootWith(modeler);

            dispatch(new FormatDiagramQuery());
            await drainMicrotasks();

            expect(sentOfType(host, "DiagramFormattedCommand")).toEqual([
                expect.objectContaining({
                    status: "failed",
                    code: "ENGINE_FAILED",
                    message: "layout engine crashed",
                }),
            ]);
        });

        it("answers format and cleanup on the readonly viewer with a failure", async () => {
            const host = await bootWith(makeViewer());

            dispatch(new FormatDiagramQuery());
            dispatch(new CleanupDiagramQuery(false));
            await drainMicrotasks();

            expect(sentOfType(host, "DiagramFormattedCommand")).toEqual([
                expect.objectContaining({ status: "failed", code: "UNSUPPORTED_SURFACE" }),
            ]);
            expect(sentOfType(host, "CleanupReportCommand")).toEqual([
                expect.objectContaining({
                    outcome: {
                        status: "failed",
                        items: [],
                        message: "this surface cannot be cleaned up",
                    },
                    applied: false,
                }),
            ]);
        });

        it("always answers a cleanup request, even when the cleanup throws", async () => {
            const { modeler } = formattableModeler({
                cleanupDiagram: vi
                    .fn()
                    .mockReturnValueOnce({ status: "clean", items: [] })
                    .mockImplementationOnce(() => {
                        throw new Error("cleanup crashed");
                    }),
            });
            const host = await bootWith(modeler);

            dispatch(new CleanupDiagramQuery(false));
            dispatch(new CleanupDiagramQuery(true));
            await drainMicrotasks();

            expect(sentOfType(host, "CleanupReportCommand")).toEqual([
                expect.objectContaining({
                    outcome: { status: "clean", items: [] },
                    applied: false,
                }),
                expect.objectContaining({
                    outcome: { status: "failed", items: [], message: "cleanup crashed" },
                    applied: true,
                }),
            ]);
            expect(sentOfType(host, "LogErrorCommand")).toEqual([
                expect.objectContaining({
                    message: "Error receiving message: CleanupDiagramQuery — cleanup crashed",
                }),
            ]);
        });

        it("echoes an SVG request with the rendered diagram", async () => {
            const host = await bootWith(
                makeModeler({ getDiagramSvg: vi.fn(async () => "<svg />") }),
            );

            dispatch(new GetDiagramAsSVGCommand());
            await drainMicrotasks();

            expect(sentOfType(host, "GetDiagramAsSVGCommand")).toEqual([
                expect.objectContaining({ svg: "<svg />" }),
            ]);
        });

        it("hands every inline script task to the host in one reply", async () => {
            const scripts = [{ elementId: "Task_1", scriptFormat: "javascript", content: "x" }];
            const host = await bootWith(
                makeModeler({ collectInlineScriptTasks: vi.fn(() => scripts) }),
            );

            dispatch(new OpenAllScriptTasksQuery());
            await drainMicrotasks();

            expect(sentOfType(host, "OpenScriptEditorsCommand")).toEqual([
                expect.objectContaining({ scripts, variables: [] }),
            ]);
        });

        it("logs a script update the modeler rejects", async () => {
            const host = await bootWith(
                makeModeler({
                    updateScriptContent: vi.fn(() => {
                        throw new Error("element gone");
                    }),
                }),
            );

            dispatch(new UpdateScriptContentQuery("Task_1", "script-task", undefined, "x = 1"));
            await drainMicrotasks();

            expect(sentOfType(host, "LogErrorCommand")).toEqual([
                expect.objectContaining({
                    message: "Error receiving message: UpdateScriptContentQuery — element gone",
                }),
            ]);
        });

        it("applies host lint results to the live surface", async () => {
            const modeler = makeModeler();
            await bootWith(modeler);
            const results = { Task_1: [] };

            dispatch(new BpmnlintResultsQuery(results));
            await drainMicrotasks();

            expect(modeler.applyLintResults).toHaveBeenCalledWith(results);
        });

        it("logs a lint push that reaches a destroyed surface instead of throwing", async () => {
            const host = await bootWith(
                makeModeler({
                    applyLintResults: vi.fn(() => {
                        throw new NoModelerError();
                    }),
                }),
            );

            dispatch(new BpmnlintResultsQuery({}));
            await drainMicrotasks();

            expect(sentOfType(host, "LogErrorCommand")).toEqual([
                expect.objectContaining({
                    message:
                        "Error receiving message: BpmnlintResultsQuery — Modeler is not initialized!",
                }),
            ]);
        });

        it("turns in-page linting off when the host disables it", async () => {
            const modeler = makeModeler();
            await bootWith(modeler);

            dispatch(new BpmnLintDisabledQuery());
            await drainMicrotasks();

            expect(modeler.applyLintingDisabled).toHaveBeenCalledOnce();
        });

        it("applies a script format chosen in the host editor", async () => {
            const updateScriptFormat = vi.fn();
            await bootWith(makeModeler({ updateScriptFormat }));

            dispatch(new UpdateScriptFormatQuery("Task_1", "script-task", undefined, "groovy"));
            await drainMicrotasks();

            expect(updateScriptFormat).toHaveBeenCalledExactlyOnceWith(
                "Task_1",
                "script-task",
                undefined,
                "groovy",
            );
        });

        it("marks the implementations the host resolved", async () => {
            const applyImplementationStatus = vi.fn();
            await bootWith(makeModeler({ applyImplementationStatus }));
            const resolved = { "com.example.Delegate": true, "com.example.Missing": false };

            dispatch(new ImplementationStatusQuery(resolved));
            await drainMicrotasks();

            expect(applyImplementationStatus).toHaveBeenCalledExactlyOnceWith(resolved);
        });

        it("ignores script, lint and implementation pushes on the readonly viewer", async () => {
            const host = await bootWith(makeViewer());

            dispatch(new BpmnlintResultsQuery({}));
            dispatch(new BpmnLintDisabledQuery());
            dispatch(new BpmnlintInPageQuery(undefined, "tok-1"));
            dispatch(new UpdateScriptContentQuery("Task_1", "script-task", undefined, "x = 1"));
            dispatch(new UpdateScriptFormatQuery("Task_1", "script-task", undefined, "groovy"));
            dispatch(new UpdateOpenScriptEditorsQuery([]));
            dispatch(new ImplementationStatusQuery({ "com.example.Delegate": true }));
            dispatch(new OpenAllScriptTasksQuery());
            await drainMicrotasks();

            expect(host.postMessage).not.toHaveBeenCalled();
        });
    });

    describe("session callbacks", () => {
        it("persists a panel toggle per editor and as the new host default", async () => {
            mocks.createModeler.mockResolvedValue(makeModeler());
            const host = makeHost(tagged());
            boot(host);
            await drainAsyncWork();
            const panel = mocks.initResizer.mock.results[0].value;

            panel.onVisibilityChanged.mock.calls[0][0](false);

            expect(mocks.persistPanelVisibility).toHaveBeenCalledWith(false);
            expect(sentOfType(host, "SetPropertiesPanelStateCommand")).toEqual([
                expect.objectContaining({ visible: false }),
            ]);
        });

        it("falls back to a visible panel when the host never sends its default", async () => {
            mocks.createModeler.mockResolvedValue(makeModeler());
            const host = makeHost(tagged());
            host.postMessage.mockImplementation((message: { type: string }) => {
                if (message.type === "GetBpmnFileCommand") dispatch(tagged());
            });
            boot(host);
            await drainMicrotasks();
            await vi.advanceTimersByTimeAsync(4999);
            expect(mocks.restorePanelVisibility).not.toHaveBeenCalled();

            await vi.advanceTimersByTimeAsync(1);

            expect(mocks.restorePanelVisibility).toHaveBeenCalledWith(
                mocks.initResizer.mock.results[0].value,
                true,
            );
        });

        it("lets the host trigger undo on an editable surface only", async () => {
            const editorActions = { trigger: vi.fn() };
            const modeler = modelerWithServices({ editorActions });
            const viewer = makeViewer();
            mocks.createModeler.mockResolvedValue(modeler);
            mocks.createViewer.mockResolvedValue(viewer);
            boot(makeHost(tagged()));
            await drainAsyncWork();
            const triggerHostAction = vi.mocked(installHostEditorActions).mock.calls[0][0];

            triggerHostAction("undo");
            modeButtons()[0].click();
            await drainAsyncWork();
            triggerHostAction("redo");

            expect(editorActions.trigger.mock.calls).toEqual([["undo"]]);
            expect(viewer.getService).not.toHaveBeenCalledWith("editorActions");
        });

        it.each([
            [new UnsupportedEngineError("c9"), "Unsupported engine: c9"],
            [new Error("bpmn-js failed"), "Unable to create modeler surface\nbpmn-js failed"],
        ])("reports a surface that cannot be created (%s)", async (error, message) => {
            mocks.createModeler.mockRejectedValue(error);
            const host = makeHost(tagged());

            boot(host);
            await drainAsyncWork();

            expect(sentOfType(host, "LogErrorCommand")).toEqual([
                expect.objectContaining({ message }),
            ]);
        });

        it("forwards import warnings to the host log", async () => {
            mocks.createModeler.mockResolvedValue(
                makeModeler({
                    loadDiagram: vi.fn(async () => ({
                        warnings: [new Error("unknown attribute")],
                    })),
                }),
            );
            const host = makeHost(tagged());

            boot(host);
            await drainAsyncWork();

            expect(sentOfType(host, "LogWarningCommand")).toEqual([
                expect.objectContaining({
                    message: expect.stringContaining("unknown attribute"),
                }),
            ]);
        });

        it("reports an outbound sync whose export fails", async () => {
            let commandStackChanged!: () => void;
            mocks.createModeler.mockResolvedValue(
                makeModeler({
                    exportDiagram: vi.fn(async () => {
                        throw new Error("export broke");
                    }),
                    onCommandStackChanged: vi.fn((listener: () => void) => {
                        commandStackChanged = listener;
                    }),
                }),
            );
            const host = makeHost(tagged());
            boot(host);
            await drainAsyncWork();

            commandStackChanged();
            await vi.advanceTimersByTimeAsync(300);

            expect(sentOfType(host, "LogErrorCommand")).toEqual([
                expect.objectContaining({
                    message: "Failed to sync diagram changes: export broke",
                }),
            ]);
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
            const host = makeHost(tagged());
            boot(host);
            await drainAsyncWork();

            commandStackChanged();
            Object.defineProperty(document, "visibilityState", {
                configurable: true,
                value: "hidden",
            });
            document.dispatchEvent(new Event("visibilitychange"));
            await drainMicrotasks();
            Object.defineProperty(document, "visibilityState", {
                configurable: true,
                value: "visible",
            });

            expect(sentOfType(host, "SyncDocumentCommand")).toHaveLength(1);
            expect(mocks.flushViewport).toHaveBeenCalledOnce();
        });

        it("waits for the page to load before asking the host for the document", async () => {
            Object.defineProperty(document, "readyState", { configurable: true, value: "loading" });
            mocks.createModeler.mockResolvedValue(makeModeler());
            const host = makeHost(tagged());

            boot(host);
            await drainMicrotasks();
            expect(host.postMessage).not.toHaveBeenCalled();

            window.dispatchEvent(new Event("load"));
            await drainAsyncWork();

            expect(sentTypes(host)).toContain("GetBpmnFileCommand");
            expect(mocks.createModeler).toHaveBeenCalledOnce();
        });
    });

    describe("document sync", () => {
        function makeEditableModeler(overrides: Record<string, unknown> = {}) {
            const commandStackListeners: Array<() => void> = [];
            const modeler = makeModeler({
                onCommandStackChanged: vi.fn((listener: () => void) => {
                    commandStackListeners.push(listener);
                }),
                ...overrides,
            });
            const change = () => commandStackListeners.forEach((listener) => listener());
            const edit = async () => {
                change();
                await vi.advanceTimersByTimeAsync(300);
            };
            return { modeler, change, edit };
        }

        const stateManagerAt = (index: number) =>
            mocks.stateManagerCreated.mock.calls[index][0] as {
                captureViewState: ReturnType<typeof vi.fn>;
                applyViewState: ReturnType<typeof vi.fn>;
            };

        function hidePage(): void {
            Object.defineProperty(document, "visibilityState", {
                configurable: true,
                value: "hidden",
            });
            document.dispatchEvent(new Event("visibilitychange"));
            Object.defineProperty(document, "visibilityState", {
                configurable: true,
                value: "visible",
            });
        }

        it("ignores a host document older than the latest revision", async () => {
            const { modeler, edit } = makeEditableModeler();
            mocks.createModeler.mockResolvedValue(modeler);
            const host = makeHost(new BpmnFileQuery("<tagged />", "c7", "modeler", 3));
            boot(host);
            await drainAsyncWork();

            dispatch(new BpmnFileQuery("<stale />", "c7", "modeler", 2));
            await drainAsyncWork();
            await edit();

            expect(modeler.loadDiagram).toHaveBeenCalledExactlyOnceWith("<tagged />");
            expect(sentOfType(host, "SyncDocumentCommand")).toEqual([
                expect.objectContaining({ documentRevision: 3 }),
            ]);
        });

        it("drops an outbound export that a host update overtook", async () => {
            let finishExport!: (xml: string) => void;
            const { modeler, edit } = makeEditableModeler({
                exportDiagram: vi.fn(
                    () =>
                        new Promise<string>((resolve) => {
                            finishExport = resolve;
                        }),
                ),
            });
            mocks.createModeler.mockResolvedValue(modeler);
            const host = makeHost(tagged());
            boot(host);
            await drainAsyncWork();

            await edit();
            expect(modeler.exportDiagram).toHaveBeenCalledOnce();
            dispatch(new BpmnFileQuery("<pushed />", "c7", "modeler", 2));
            await drainAsyncWork();
            expect(modeler.loadDiagram).toHaveBeenLastCalledWith("<pushed />");

            finishExport("<edit before the push />");
            await drainAsyncWork();

            expect(sentOfType(host, "SyncDocumentCommand")).toEqual([]);
        });

        it("drops a pending edit when a host update arrives", async () => {
            const { modeler, change } = makeEditableModeler();
            mocks.createModeler.mockResolvedValue(modeler);
            const host = makeHost(tagged());
            boot(host);
            await drainAsyncWork();

            change();
            dispatch(new BpmnFileQuery("<pushed />", "c7", "modeler", 2));
            await drainAsyncWork();

            expect(modeler.loadDiagram).toHaveBeenLastCalledWith("<pushed />");
            expect(modeler.exportDiagram).not.toHaveBeenCalled();
            expect(sentOfType(host, "SyncDocumentCommand")).toEqual([]);
        });

        it("drops an edit flushed while a host update waits to import", async () => {
            const { modeler, change } = makeEditableModeler();
            mocks.createModeler.mockResolvedValue(modeler);
            const host = makeHost(tagged());
            boot(host);
            await drainAsyncWork();

            dispatch(new BpmnFileQuery("<pushed />", "c7", "modeler", 2));
            change();
            hidePage();
            await drainMicrotasks();
            expect(modeler.exportDiagram).toHaveBeenCalledOnce();
            await drainAsyncWork();

            expect(modeler.loadDiagram).toHaveBeenLastCalledWith("<pushed />");
            expect(sentOfType(host, "SyncDocumentCommand")).toEqual([]);
        });

        it("imports every push from a host that sends no revisions", async () => {
            const modeler = makeModeler();
            mocks.createModeler.mockResolvedValue(modeler);
            boot(makeHost(new BpmnFileQuery("<first />", "c7")));
            await drainAsyncWork();

            dispatch(new BpmnFileQuery("<second />", "c7"));
            await drainAsyncWork();

            expect(modeler.loadDiagram.mock.calls).toEqual([["<first />"], ["<second />"]]);
        });

        it("syncs an edit to the host with the revision it was based on", async () => {
            const { modeler, edit } = makeEditableModeler();
            mocks.createModeler.mockResolvedValue(modeler);
            const host = makeHost(tagged());
            boot(host);
            await drainAsyncWork();

            dispatch(new BpmnFileQuery("<pushed />", "c7", "modeler", 2));
            await drainAsyncWork();
            await edit();

            expect(sentOfType(host, "SyncDocumentCommand")).toEqual([
                expect.objectContaining({ content: "<exported />", documentRevision: 2 }),
            ]);
        });

        it("imports a newer document that arrived during the initial import", async () => {
            let finishInitialImport!: () => void;
            const { modeler, edit } = makeEditableModeler({
                loadDiagram: vi
                    .fn()
                    .mockImplementationOnce(
                        () =>
                            new Promise((resolve) => {
                                finishInitialImport = () => resolve({ warnings: [] });
                            }),
                    )
                    .mockResolvedValue({ warnings: [] }),
            });
            mocks.createModeler.mockResolvedValue(modeler);
            const host = makeHost(tagged());
            boot(host);
            await drainAsyncWork();

            dispatch(new BpmnFileQuery("<newer />", "c7", "modeler", 2));
            finishInitialImport();
            await drainAsyncWork();
            await edit();

            expect(modeler.loadDiagram.mock.calls).toEqual([["<tagged />"], ["<newer />"]]);
            expect(sentOfType(host, "SyncDocumentCommand")).toEqual([
                expect.objectContaining({ documentRevision: 2 }),
            ]);
        });

        it("reports an initial document that cannot be opened", async () => {
            mocks.createModeler.mockResolvedValue(
                makeModeler({ loadDiagram: vi.fn().mockRejectedValue(new Error("not BPMN")) }),
            );
            const host = makeHost(tagged());

            boot(host);
            await drainAsyncWork();

            expect(sentOfType(host, "LogErrorCommand")).toEqual([
                expect.objectContaining({ message: "Unable to open XML\nnot BPMN" }),
            ]);
            expect(mocks.startPersisting).not.toHaveBeenCalled();
        });

        it("syncs a pending edit before a destructive flush exports the document", async () => {
            const { modeler, change } = makeEditableModeler();
            mocks.createModeler.mockResolvedValue(modeler);
            const host = makeHost(tagged());
            boot(host);
            await drainAsyncWork();

            change();
            dispatch(new FlushDocumentQuery(5, true));
            await drainAsyncWork();

            expect(
                sentTypes(host).filter((type) =>
                    ["SyncDocumentCommand", "DocumentFlushedCommand"].includes(type),
                ),
            ).toEqual(["SyncDocumentCommand", "DocumentFlushedCommand"]);
            expect(sentOfType(host, "DocumentFlushedCommand")).toEqual([
                expect.objectContaining({
                    token: 5,
                    status: "flushed",
                    content: "<exported />",
                    documentRevision: 1,
                }),
            ]);
            expect(document.body.inert).toBe(true);
        });

        it("drains the sync an align-to-origin pass schedules before replying to a flush", async () => {
            const { modeler, change } = makeEditableModeler();
            modeler.alignElementsToOrigin.mockImplementationOnce(change);
            mocks.createModeler.mockResolvedValue(modeler);
            const host = makeHost(tagged());
            boot(host);
            await drainAsyncWork();

            change();
            dispatch(new FlushDocumentQuery(5, true));
            await drainAsyncWork();

            expect(
                sentTypes(host).filter((type) =>
                    ["SyncDocumentCommand", "DocumentFlushedCommand"].includes(type),
                ),
            ).toEqual(["SyncDocumentCommand", "SyncDocumentCommand", "DocumentFlushedCommand"]);
        });

        it("syncs a pending edit before a mode switch destroys the surface", async () => {
            const { modeler, change } = makeEditableModeler();
            mocks.createModeler.mockResolvedValue(modeler);
            mocks.createViewer.mockResolvedValue(makeViewer());
            const host = makeHost(tagged());
            boot(host);
            await drainAsyncWork();

            change();
            modeButtons()[0].click();
            await drainAsyncWork();

            const syncCall = host.postMessage.mock.calls.findIndex(
                ([message]) => (message as { type: string }).type === "SyncDocumentCommand",
            );
            expect(syncCall).toBeGreaterThanOrEqual(0);
            expect(host.postMessage.mock.invocationCallOrder[syncCall]).toBeLessThan(
                modeler.destroy.mock.invocationCallOrder[0],
            );
        });

        it("syncs the edit an align-to-origin pass schedules before a mode switch destroys the modeler", async () => {
            const { modeler, change } = makeEditableModeler();
            modeler.alignElementsToOrigin.mockImplementationOnce(change);
            mocks.createModeler.mockResolvedValue(modeler);
            mocks.createViewer.mockResolvedValue(makeViewer());
            const host = makeHost(tagged());
            boot(host);
            await drainAsyncWork();

            change();
            modeButtons()[0].click();
            await drainAsyncWork();
            await vi.advanceTimersByTimeAsync(1000);

            const syncOrders = host.postMessage.mock.calls.flatMap(([message], call) =>
                (message as { type: string }).type === "SyncDocumentCommand"
                    ? [host.postMessage.mock.invocationCallOrder[call]]
                    : [],
            );
            expect(syncOrders).toHaveLength(2);
            for (const syncOrder of syncOrders) {
                expect(syncOrder).toBeLessThan(modeler.destroy.mock.invocationCallOrder[0]);
            }
        });

        it("syncs a designer edit to the host", async () => {
            const designer = makeDesigner();
            mocks.createDesigner.mockResolvedValue(designer);
            const host = makeHost(new BpmnFileQuery("<untagged />", undefined, "modeler", 4));
            boot(host);
            await drainAsyncWork();
            const eventBus = designer.getService("eventBus") as { on: ReturnType<typeof vi.fn> };
            const [, commandStackChanged] = eventBus.on.mock.calls.find(
                ([event]) => event === "commandStack.changed",
            )!;

            commandStackChanged();
            await vi.advanceTimersByTimeAsync(300);

            expect(sentOfType(host, "SyncDocumentCommand")).toEqual([
                expect.objectContaining({ content: "<exported />", documentRevision: 4 }),
            ]);
        });

        it("captures the view before a host re-import and restores it after", async () => {
            const modeler = makeModeler();
            mocks.createModeler.mockResolvedValue(modeler);
            boot(makeHost(tagged()));
            await drainAsyncWork();
            const stateManager = stateManagerAt(0);

            dispatch(new BpmnFileQuery("<pushed />", "c7", "modeler", 2));
            await drainAsyncWork();

            expect(modeler.loadDiagram).toHaveBeenLastCalledWith("<pushed />");
            expect(stateManager.applyViewState).toHaveBeenCalledExactlyOnceWith(
                mocks.viewStateSnapshot,
            );
            const reimportOrder = modeler.loadDiagram.mock.invocationCallOrder[1];
            expect(stateManager.captureViewState.mock.invocationCallOrder[0]).toBeLessThan(
                reimportOrder,
            );
            expect(reimportOrder).toBeLessThan(
                stateManager.applyViewState.mock.invocationCallOrder[0],
            );
        });

        it("restores the captured view state even when the host re-import fails", async () => {
            const modeler = makeModeler({
                loadDiagram: vi
                    .fn()
                    .mockResolvedValueOnce({ warnings: [] })
                    .mockRejectedValueOnce(new Error("broken push")),
            });
            mocks.createModeler.mockResolvedValue(modeler);
            const host = makeHost(tagged());
            boot(host);
            await drainAsyncWork();
            const stateManager = stateManagerAt(0);

            dispatch(new BpmnFileQuery("<broken />", "c7", "modeler", 2));
            await drainAsyncWork();

            expect(stateManager.applyViewState).toHaveBeenCalledExactlyOnceWith(
                mocks.viewStateSnapshot,
            );
            expect(sentOfType(host, "LogErrorCommand")).toEqual([
                expect.objectContaining({ message: expect.stringContaining("broken push") }),
            ]);
        });

        it.each([false, true])(
            "restores the page's inert state (%s) when the host releases a destructive flush",
            async (inertBeforeFlush) => {
                mocks.createModeler.mockResolvedValue(makeModeler());
                const host = makeHost(tagged());
                boot(host);
                await drainAsyncWork();
                document.body.inert = inertBeforeFlush;

                dispatch(new FlushDocumentQuery(7, true));
                await drainAsyncWork();
                expect(document.body.inert).toBe(true);
                expect(sentOfType(host, "DocumentFlushedCommand")).toEqual([
                    expect.objectContaining({ token: 7, status: "clean" }),
                ]);

                dispatch(new ReleaseDocumentFlushQuery(7));
                await drainMicrotasks();

                expect(document.body.inert).toBe(inertBeforeFlush);
            },
        );

        it("starts a blank diagram when the host document is empty", async () => {
            const modeler = makeModeler();
            mocks.createModeler.mockResolvedValue(modeler);

            boot(makeHost(new BpmnFileQuery("", "c7", "modeler", 1)));
            await drainAsyncWork();

            expect(modeler.newDiagram).toHaveBeenCalledOnce();
            expect(modeler.loadDiagram).not.toHaveBeenCalled();
        });

        it("hands an empty document to the readonly viewer unchanged", async () => {
            mocks.savedMode = "view";
            const viewer = makeViewer();
            mocks.createViewer.mockResolvedValue(viewer);

            boot(makeHost(new BpmnFileQuery("", "c7", "modeler", 1)));
            await drainAsyncWork();

            expect(viewer.loadDiagram).toHaveBeenCalledExactlyOnceWith("");
        });

        it("publishes the C7 process variables on open and again only when they change", async () => {
            let definitions: unknown = {};
            const { modeler, edit } = makeEditableModeler({
                getDefinitions: vi.fn(() => definitions),
            });
            mocks.createModeler.mockResolvedValue(modeler);
            const host = makeHost(tagged("c7"));
            bootstrap(host as never, {
                capabilities: {
                    scripting: { openScriptEditor: vi.fn(), scriptSourceChanged: vi.fn() },
                },
                clipboard: "native",
                linting: false,
            });
            await drainAsyncWork();
            expect(sentOfType(host, "UpdateScriptVariablesCommand")).toEqual([
                expect.objectContaining({ variables: [] }),
            ]);

            await edit();
            expect(sentOfType(host, "UpdateScriptVariablesCommand")).toHaveLength(1);

            definitions = {
                rootElements: [
                    {
                        $type: "bpmn:Process",
                        flowElements: [
                            { $type: "bpmn:ScriptTask", id: "Task_1", resultVariable: "total" },
                        ],
                    },
                ],
            };
            await edit();

            expect(sentOfType(host, "UpdateScriptVariablesCommand")).toEqual([
                expect.objectContaining({ variables: [] }),
                expect.objectContaining({
                    variables: [expect.objectContaining({ name: "total" })],
                }),
            ]);
        });

        it("drops the variable publish still pending when a mode switch destroys the modeler", async () => {
            let definitions: unknown = {};
            const { modeler, change } = makeEditableModeler({
                getDefinitions: vi.fn(() => definitions),
            });
            mocks.createModeler.mockResolvedValue(modeler);
            mocks.createViewer.mockResolvedValue(makeViewer());
            const host = makeHost(tagged("c7"));
            bootstrap(host as never, {
                capabilities: {
                    scripting: { openScriptEditor: vi.fn(), scriptSourceChanged: vi.fn() },
                },
                clipboard: "native",
                linting: false,
            });
            await drainAsyncWork();

            definitions = {
                rootElements: [
                    {
                        $type: "bpmn:Process",
                        flowElements: [
                            { $type: "bpmn:ScriptTask", id: "Task_1", resultVariable: "total" },
                        ],
                    },
                ],
            };
            change();
            modeButtons()[0].click();
            await vi.advanceTimersByTimeAsync(0);
            expect(modeler.destroy).toHaveBeenCalledOnce();
            await vi.advanceTimersByTimeAsync(300);

            expect(sentOfType(host, "SyncDocumentCommand")).toHaveLength(1);
            expect(sentOfType(host, "UpdateScriptVariablesCommand")).toEqual([
                expect.objectContaining({ variables: [] }),
            ]);
        });
    });

    describe("engine change", () => {
        function bootReloadable(host: unknown) {
            bootstrap(host as never, {
                capabilities: {},
                clipboard: "native",
                linting: false,
                reload: mocks.reload,
            });
        }

        it("reloads when a document for another engine arrives before the initial import", async () => {
            const modeler = makeModeler();
            let finishModelerInit!: () => void;
            mocks.createModeler.mockReturnValueOnce(
                new Promise((resolve) => {
                    finishModelerInit = () => resolve(modeler);
                }),
            );
            bootReloadable(makeHost(tagged("c7")));
            await drainAsyncWork();

            dispatch(new BpmnFileQuery("<c8 />", "c8", "modeler", 2));
            finishModelerInit();
            await drainAsyncWork();

            expect(modeler.loadDiagram).not.toHaveBeenCalled();
            expect(modeler.destroy).toHaveBeenCalledOnce();
            expect(mocks.reload).toHaveBeenCalledOnce();
            expect(document.body.inert).toBe(true);
        });

        it("reloads when a document for another engine arrives during the initial import", async () => {
            let finishImport!: () => void;
            const modeler = makeModeler({
                loadDiagram: vi.fn(
                    () =>
                        new Promise((resolve) => {
                            finishImport = () => resolve({ warnings: [] });
                        }),
                ),
            });
            mocks.createModeler.mockResolvedValue(modeler);
            bootReloadable(makeHost(tagged("c7")));
            await drainAsyncWork();

            dispatch(new BpmnFileQuery("<c8 />", "c8", "modeler", 2));
            finishImport();
            await drainAsyncWork();

            expect(modeler.loadDiagram).toHaveBeenCalledExactlyOnceWith("<tagged />");
            expect(modeler.destroy).toHaveBeenCalledOnce();
            expect(mocks.reload).toHaveBeenCalledOnce();
            expect(mocks.startPersisting).not.toHaveBeenCalled();
        });

        it("stops the boot when another engine arrives while a queued update waits to import", async () => {
            let finishInitialImport!: () => void;
            const modeler = makeModeler({
                loadDiagram: vi
                    .fn()
                    .mockImplementationOnce(
                        () =>
                            new Promise((resolve) => {
                                finishInitialImport = () => resolve({ warnings: [] });
                            }),
                    )
                    .mockResolvedValue({ warnings: [] }),
            });
            mocks.createModeler.mockResolvedValue(modeler);
            bootReloadable(makeHost(tagged("c7")));
            await drainAsyncWork();

            dispatch(new BpmnFileQuery("<queued />", "c7", "modeler", 2));
            finishInitialImport();
            await drainMicrotasks();
            dispatch(new BpmnFileQuery("<c8 />", "c8", "modeler", 3));
            await drainAsyncWork();

            expect(modeler.loadDiagram).toHaveBeenCalledExactlyOnceWith("<tagged />");
            expect(mocks.reload).toHaveBeenCalledOnce();
            expect(mocks.stateManagerCreated).not.toHaveBeenCalled();
            expect(installHostEditorActions).not.toHaveBeenCalled();
        });

        it("reloads when a later host push switches the engine", async () => {
            const modeler = makeModeler();
            mocks.createModeler.mockResolvedValue(modeler);
            bootReloadable(makeHost(tagged("c7")));
            await drainAsyncWork();

            dispatch(new BpmnFileQuery("<c8 />", "c8", "modeler", 2));
            await drainAsyncWork();

            expect(modeler.loadDiagram).not.toHaveBeenCalledWith("<c8 />");
            expect(modeler.destroy).toHaveBeenCalledOnce();
            expect(mocks.reload).toHaveBeenCalledOnce();
        });

        it("answers only flush requests while the reload is pending", async () => {
            mocks.createModeler.mockResolvedValue(makeModeler());
            const host = makeHost(tagged("c7"));
            bootReloadable(host);
            await drainAsyncWork();
            dispatch(new BpmnFileQuery("<c8 />", "c8", "modeler", 2));
            await drainAsyncWork();
            host.postMessage.mockClear();

            dispatch(new GetDiagramAsSVGCommand());
            dispatch(new FlushDocumentQuery(9, true));
            await drainAsyncWork();

            expect(sentOfType(host, "GetDiagramAsSVGCommand")).toEqual([]);
            expect(sentOfType(host, "DocumentFlushedCommand")).toEqual([
                expect.objectContaining({ token: 9, status: "unavailable" }),
            ]);
        });
    });

    describe("diff pane", () => {
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
            [
                "BpmnModelerSettingQuery",
                () =>
                    new BpmnModelerSettingQuery({
                        alignToOrigin: false,
                        showTransactionBoundaries: false,
                        colorTheme: "light",
                    }),
            ],
            ["ElementTemplatesQuery", () => new ElementTemplatesQuery([])],
            ["GetDiagramAsSVGCommand", () => new GetDiagramAsSVGCommand()],
            ["TakeFocusQuery", () => new TakeFocusQuery()],
        ])("ignores %s without an error", async (_type, query) => {
            document.body.insertAdjacentHTML("beforeend", `<div id="js-drop-zone"></div>`);
            const host = makeHost(new BpmnFileQuery("<left />", "c7", "viewer", 1));
            boot(host);
            await drainAsyncWork();

            await deliverToSession(query());

            expect(sentOfType(host, "LogErrorCommand")).toEqual([]);
        });

        it("ignores session messages even when the diff view cannot start", async () => {
            const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
            onTestFinished(() => consoleError.mockRestore());
            const host = makeHost(new BpmnFileQuery("<left />", "c7", "viewer", 1));
            boot(host);
            await drainAsyncWork();

            await deliverToSession(new GetDiagramAsSVGCommand());

            expect(consoleError).toHaveBeenCalledWith(
                "Diff mode: missing #js-canvas or #js-drop-zone",
            );
            expect(sentOfType(host, "LogErrorCommand")).toEqual([]);
        });

        it("switches the translator on a later language change and touches no surface", async () => {
            document.body.insertAdjacentHTML("beforeend", `<div id="js-drop-zone"></div>`);
            const host = makeHost(new BpmnFileQuery("<left />", "c7", "viewer", 1));
            boot(host);
            await drainAsyncWork();
            host.postMessage.mockClear();

            await deliverToSession(new LanguageQuery("de"));
            await drainAsyncWork();

            expect(i18n.setLanguage).toHaveBeenLastCalledWith("de");
            expect(i18n.getLocale()).toBe("de");
            expect(host.postMessage).not.toHaveBeenCalled();
            expect(mocks.createViewer).not.toHaveBeenCalled();
            expect(mocks.createDesigner).not.toHaveBeenCalled();
            expect(mocks.createModeler).not.toHaveBeenCalled();
            expect(mocks.stateManagerCreated).not.toHaveBeenCalled();
        });
    });
});
