import { afterEach, describe, expect, it, vi } from "vitest";

import {
    BpmnFileQuery,
    BpmnModelerSettingQuery,
    ElementTemplatesQuery,
    FocusElementQuery,
    LanguageQuery,
    PropertiesPanelStateQuery,
} from "@miragon/bpmn-modeler-shared";

const mocks = vi.hoisted(() => ({
    createModeler: vi.fn(),
    initResizer: vi.fn(() => ({
        setVisible: vi.fn(),
        onVisibilityChanged: vi.fn(),
    })),
    stateManagerCreated: vi.fn(),
}));

vi.mock("./app", () => ({
    BpmnModeler: class {},
    createModeler: mocks.createModeler,
    installContentEditableClipboardPolyfill: vi.fn(),
    UnsupportedEngineError: class extends Error {},
}));

vi.mock("@miragon/bpmn-modeler-types", () => ({
    NoModelerError: class extends Error {},
    formatErrors: vi.fn(() => ""),
    initResizer: mocks.initResizer,
    initTheme: vi.fn(),
    installPanelShortcuts: vi.fn(),
    observeCanvasSize: vi.fn(),
    setColorThemeMode: vi.fn(),
}));

vi.mock("@miragon/bpmn-modeler-clipboard", () => ({
    createClipboardModules: vi.fn(() => []),
}));

vi.mock("@miragon/bpmn-modeler-i18n", () => ({
    TranslateModule: {},
    i18n: {
        extend: vi.fn(),
        onChange: vi.fn(),
        setLanguage: vi.fn(),
        translate: vi.fn((value: string) => value),
    },
}));

vi.mock("@miragon/bpmn-modeler-i18n-extras", () => ({ extras: {} }));

vi.mock("./app/diff/DiffMode", () => ({ DiffMode: class {} }));
vi.mock("./app/hostEditorActions", () => ({ installHostEditorActions: vi.fn() }));
vi.mock("./app/state", () => ({
    WebviewStateManager: class {
        constructor() {
            mocks.stateManagerCreated();
        }
        captureViewState = vi.fn();
        applyViewState = vi.fn();
        restoreViewport = vi.fn();
        restoreSelection = vi.fn();
        restorePanelUiState = vi.fn();
        startPersisting = vi.fn();
        flushViewport = vi.fn();
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
    afterEach(() => {
        vi.useRealTimers();
        document.body.innerHTML = "";
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
        const successfulImports: string[] = [];
        let commandStackChanged: (() => void) | undefined;
        const canvas = {
            focus: vi.fn(),
            getContainer: () => document.getElementById("js-canvas")!,
            isFocused: () => false,
        };
        const modeler = {
            create: vi.fn(async () => {
                await createGate;
                modelerCreated = true;
            }),
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
                    markPostInitImportStarted();
                    await postInitImportGate;
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
            getService: vi.fn(() => canvas),
            viewport: { centerOnElement: vi.fn() },
        };
        mocks.createModeler.mockReturnValue(modeler);

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
        });
        await drainMicrotasks();
        expect(modeler.create).toHaveBeenCalledOnce();

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
        await drainAsyncWork();

        expect(successfulImports.at(-1)).toBe("<post-init />");
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
                documentRevision: 4,
            }),
        );
    });
});
