import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    BpmnFileQuery,
    BpmnModelerSettingQuery,
    ElementTemplatesQuery,
    FlushDocumentQuery,
    FocusElementQuery,
    LanguageQuery,
    PropertiesPanelStateQuery,
    ReleaseDocumentFlushQuery,
} from "@miragon/bpmn-modeler-shared";

const mocks = vi.hoisted(() => ({
    createModeler: vi.fn(),
    locale: "en",
    reload: vi.fn(),
    flushViewport: vi.fn(),
    initResizer: vi.fn(() => ({
        setVisible: vi.fn(),
        onVisibilityChanged: vi.fn(),
    })),
    stateManagerCreated: vi.fn(),
}));

vi.mock("@miragon/bpmn-modeler", () => ({
    BpmnModeler: class {},
    createModeler: mocks.createModeler,
    UnsupportedEngineError: class extends Error {},
}));

vi.mock("@miragon/bpmn-modeler-types", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@miragon/bpmn-modeler-types")>();
    return {
        ...actual,
        initResizer: mocks.initResizer,
        installPanelShortcuts: vi.fn(),
        observeCanvasSize: vi.fn(),
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
    },
}));

vi.mock("./diffMode", () => ({ DiffMode: class {} }));
vi.mock("./hostEditorActions", () => ({ installHostEditorActions: vi.fn() }));
vi.mock("./state", () => ({
    readSavedPanelVisibility: vi.fn(() => undefined),
    WebviewStateManager: class {
        constructor() {
            mocks.stateManagerCreated();
        }
        captureViewState = vi.fn();
        applyViewState = vi.fn();
        restoreViewport = vi.fn();
        restoreSelection = vi.fn();
        restorePanelUiState = vi.fn();
        restorePanelVisibility = vi.fn();
        persistPanelVisibility = vi.fn();
        startPersisting = vi.fn();
        flushViewport = mocks.flushViewport;
    },
}));

import { bootstrap } from "./bootstrap";

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
        vi.clearAllMocks();
    });

    it("recovers the latest host revision before applying queued session messages", async () => {
        vi.useFakeTimers();
        document.body.innerHTML = `
            <div id="js-canvas"></div>
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
