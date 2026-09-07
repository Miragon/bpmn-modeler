import { describe, expect, it, vi } from "vitest";

import type { DmnModelerOptions } from "./app/publicApi";

const mocks = vi.hoisted(() => {
    const handle = {
        loadDiagram: vi.fn(async () => ({ warnings: [] })),
        exportDiagram: vi.fn(async () => "<saved />"),
        getActiveView: vi.fn(),
        getViews: vi.fn(() => []),
        openView: vi.fn(async () => ({ warnings: [] })),
        isDrdViewActive: vi.fn(() => true),
        focusCanvas: vi.fn(),
        isCanvasFocused: vi.fn(() => true),
        setTheme: vi.fn(),
        destroy: vi.fn(),
        getService: vi.fn(),
    };
    const panelHandle = {
        setVisible: vi.fn(),
        onVisibilityChanged: vi.fn(),
    };
    return {
        handle,
        panelHandle,
        createModeler: vi.fn(
            async (_container: HTMLElement, _options: DmnModelerOptions) => handle,
        ),
        initResizer: vi.fn(() => panelHandle),
        initTheme: vi.fn(),
        installPanelShortcuts: vi.fn(),
        setColorThemeMode: vi.fn(),
        stateManager: {
            restorePanelVisibility: vi.fn(),
            persistPanelVisibility: vi.fn(),
            restorePanelUiState: vi.fn(),
            startPersisting: vi.fn(),
        },
    };
});

vi.mock("./app", () => ({
    createModeler: mocks.createModeler,
    readSavedPanelVisibility: vi.fn(() => undefined),
    WebviewStateManager: class {
        restorePanelVisibility = mocks.stateManager.restorePanelVisibility;
        persistPanelVisibility = mocks.stateManager.persistPanelVisibility;
        restorePanelUiState = mocks.stateManager.restorePanelUiState;
        startPersisting = mocks.stateManager.startPersisting;
    },
}));

vi.mock("@miragon/bpmn-modeler-i18n", () => ({
    i18n: {
        translate: (text: string) => text,
        onChange: vi.fn(),
    },
}));

vi.mock("@miragon/bpmn-modeler-shared", async () => {
    const actual = await vi.importActual<Record<string, unknown>>("@miragon/bpmn-modeler-shared");
    return {
        ...actual,
        initResizer: mocks.initResizer,
        initTheme: mocks.initTheme,
        installPanelShortcuts: mocks.installPanelShortcuts,
        setColorThemeMode: mocks.setColorThemeMode,
    };
});

interface PostedMessage {
    type: string;
    content?: string;
    documentRevision?: number;
    message?: string;
    token?: number;
}

describe("DMN bootstrap", () => {
    it("adapts facade callbacks, authoritative updates, flushes, warnings, and shortcuts", async () => {
        document.body.innerHTML = `
            <main id="js-canvas"></main>
            <aside id="js-properties-panel"></aside>
        `;
        Object.defineProperty(document, "readyState", { value: "complete", configurable: true });

        const posted: PostedMessage[] = [];
        const host = {
            postMessage(message: PostedMessage) {
                posted.push(message);
                if (message.type === "GetDmnFileCommand") {
                    queueMicrotask(() =>
                        dispatch({
                            type: "DmnFileQuery",
                            content: "<initial />",
                            documentRevision: 7,
                        }),
                    );
                } else if (message.type === "GetPropertiesPanelStateCommand") {
                    queueMicrotask(() =>
                        dispatch({ type: "PropertiesPanelStateQuery", visible: true }),
                    );
                } else if (message.type === "GetDmnModelerSettingCommand") {
                    queueMicrotask(() =>
                        dispatch({
                            type: "DmnModelerSettingQuery",
                            setting: { colorTheme: "automatic" },
                        }),
                    );
                }
            },
            getState: () => undefined,
            setState: vi.fn(),
            updateState: vi.fn(),
        };

        const { bootstrap } = await import("./bootstrap");
        bootstrap(host as never);

        await vi.waitFor(() =>
            expect(mocks.handle.loadDiagram).toHaveBeenCalledWith("<initial />"),
        );

        const canvas = document.querySelector("#js-canvas");
        const panel = document.querySelector("#js-properties-panel");
        expect(mocks.createModeler).toHaveBeenCalledWith(
            canvas,
            expect.objectContaining({ propertiesPanel: { parent: panel } }),
        );
        expect(mocks.createModeler.mock.invocationCallOrder[0]).toBeLessThan(
            mocks.initResizer.mock.invocationCallOrder[0],
        );

        const options = mocks.createModeler.mock.calls[0][1] as DmnModelerOptions;
        options.onWarning?.("recovered warning");
        expect(posted).toContainEqual(
            expect.objectContaining({ type: "LogWarningCommand", message: "recovered warning" }),
        );

        const shortcutOptions = mocks.installPanelShortcuts.mock.calls[0][0];
        shortcutOptions.focusCanvas();
        expect(shortcutOptions.isCanvasFocused()).toBe(true);
        expect(shortcutOptions.isEnabled()).toBe(true);
        expect(mocks.handle.focusCanvas).toHaveBeenCalledOnce();
        expect(mocks.handle.isCanvasFocused).toHaveBeenCalledOnce();
        expect(mocks.handle.isDrdViewActive).toHaveBeenCalledOnce();

        options.onContentChanged?.();
        dispatch({ type: "DmnFileQuery", content: "<host-update />", documentRevision: 8 });
        await vi.waitFor(
            () => expect(mocks.handle.loadDiagram).toHaveBeenCalledWith("<host-update />"),
            { timeout: 1000 },
        );
        await new Promise((resolve) => setTimeout(resolve, 350));
        expect(posted.filter((message) => message.type === "SyncDocumentCommand")).toHaveLength(0);

        mocks.handle.exportDiagram.mockResolvedValueOnce("<edited-after-host />");
        options.onContentChanged?.();
        await vi.waitFor(
            () =>
                expect(posted).toContainEqual(
                    expect.objectContaining({
                        type: "SyncDocumentCommand",
                        content: "<edited-after-host />",
                        documentRevision: 8,
                    }),
                ),
            { timeout: 1000 },
        );

        mocks.handle.exportDiagram.mockResolvedValueOnce("<flush />");
        options.onContentChanged?.();
        dispatch({ type: "FlushDocumentQuery", token: 41, exportWhenClean: true });
        await vi.waitFor(
            () =>
                expect(posted).toContainEqual(
                    expect.objectContaining({
                        type: "DocumentFlushedCommand",
                        token: 41,
                        content: "<flush />",
                    }),
                ),
            { timeout: 1000 },
        );

        function dispatch(data: Record<string, unknown>): void {
            window.dispatchEvent(new MessageEvent("message", { data }));
        }
    });
});
