import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DmnView, DmnViewChangedEvent, DmnWarning } from "./publicApi";

interface MockEventBus {
    on: ReturnType<typeof vi.fn>;
    off: ReturnType<typeof vi.fn>;
    fire(): void;
}

interface MockViewer {
    services: Record<string, unknown>;
    get<T>(name: string): T;
}

interface MockModelerConfiguration {
    container: HTMLElement;
    drd: { propertiesPanel: unknown; additionalModules: unknown[] };
    decisionTable: { additionalModules: unknown[] };
    literalExpression: { additionalModules: unknown[] };
    boxedExpression: { additionalModules: unknown[] };
    common: {
        expressionLanguages: { options: unknown[]; defaults?: { editor?: string } };
        dataTypes: string[];
        keyboard?: { readonly bind?: boolean };
    };
    moddleExtensions: Record<string, object>;
}

interface MockVendor {
    options: MockModelerConfiguration;
    activeView?: DmnView;
    activeViewer?: MockViewer;
    views: DmnView[];
    importResult: { warnings: DmnWarning[] };
    openResult: { warnings: DmnWarning[] };
    importError?: unknown;
    openError?: unknown;
    xml?: string;
    managerListener?: (event: DmnViewChangedEvent) => void;
    importXML: ReturnType<typeof vi.fn>;
    open: ReturnType<typeof vi.fn>;
    saveXML: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
    off: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
    emitViews(event?: DmnViewChangedEvent): void;
}

const mocks = vi.hoisted(() => ({
    vendors: [] as MockVendor[],
    resizeCanvases: [] as Array<{ resized(): void }>,
    resizeCallbacks: [] as Array<() => void>,
    resizeDisposers: [] as Array<ReturnType<typeof vi.fn>>,
    drdPanel: { id: "drd-panel" },
    drdProvider: { id: "drd-provider" },
    camundaProvider: { id: "camunda-provider" },
    drdSimulation: { id: "drd-simulation" },
    tableSimulation: { id: "table-simulation" },
    translateModule: { id: "translate" },
    locale: "en",
    setLanguage: vi.fn((locale: string) => {
        mocks.locale = locale;
    }),
}));

vi.mock("dmn-js/lib/Modeler", () => ({
    default: class {
        options: MockModelerConfiguration;
        activeView?: DmnView;
        activeViewer?: MockViewer;
        views: DmnView[] = [];
        importResult = { warnings: [] as DmnWarning[] };
        openResult = { warnings: [] as DmnWarning[] };
        importError?: unknown;
        openError?: unknown;
        xml?: string = "<definitions />";
        managerListener?: (event: DmnViewChangedEvent) => void;
        destroy = vi.fn();

        constructor(options: MockModelerConfiguration) {
            this.options = options;
            mocks.vendors.push(this as unknown as MockVendor);
        }

        importXML = vi.fn(async () => {
            if (this.importError) throw this.importError;
            return this.importResult;
        });
        open = vi.fn(async () => {
            if (this.openError) throw this.openError;
            return this.openResult;
        });
        saveXML = vi.fn(async () => ({ xml: this.xml }));
        getActiveView = () => this.activeView;
        getActiveViewer = () => this.activeViewer;
        getViews = () => this.views;
        on = vi.fn((_event: string, listener: (event: DmnViewChangedEvent) => void) => {
            this.managerListener = listener;
        });
        off = vi.fn();
        emitViews(event = { views: this.views, activeView: this.activeView }) {
            this.managerListener?.(event);
        }
    },
}));

vi.mock("dmn-js-properties-panel", () => ({
    DmnPropertiesPanelModule: mocks.drdPanel,
    DmnPropertiesProviderModule: mocks.drdProvider,
    CamundaPropertiesProviderModule: mocks.camundaProvider,
}));

vi.mock("@emaarco/dmn-js-simulation", () => ({
    default: {
        decisionRequirementsDiagram: mocks.drdSimulation,
        decisionTable: mocks.tableSimulation,
    },
}));

vi.mock("@miragon/bpmn-modeler-types", () => ({
    observeCanvasSize: vi.fn((canvas: { resized(): void }, _container: Element) => {
        const dispose = vi.fn();
        mocks.resizeCanvases.push(canvas);
        mocks.resizeCallbacks.push(() => canvas.resized());
        mocks.resizeDisposers.push(dispose);
        return dispose;
    }),
}));

vi.mock("@miragon/bpmn-modeler-i18n", () => ({
    TranslateModule: mocks.translateModule,
    i18n: {
        getLocale: () => mocks.locale,
        setLanguage: mocks.setLanguage,
    },
}));

import { DmnModeler } from "./modeler";

function createEventBus(): MockEventBus {
    let listener: (() => void) | undefined;
    return {
        on: vi.fn((_event: string, callback: () => void) => {
            listener = callback;
        }),
        off: vi.fn((_event: string, callback: () => void) => {
            if (listener === callback) listener = undefined;
        }),
        fire: () => listener?.(),
    };
}

function createViewer(services: Record<string, unknown>): MockViewer {
    return { services, get: <T>(name: string) => services[name] as T };
}

const drdView: DmnView = {
    id: "Definitions_1",
    type: "drd",
    element: { id: "Definitions_1", $type: "dmn:Definitions" },
};
const tableView: DmnView = {
    id: "Decision_1",
    name: "Decision",
    type: "decisionTable",
    element: { id: "Decision_1", $type: "dmn:Decision" },
};

describe("DmnModeler", () => {
    beforeEach(() => {
        mocks.vendors.length = 0;
        mocks.resizeCanvases.length = 0;
        mocks.resizeCallbacks.length = 0;
        mocks.resizeDisposers.length = 0;
        mocks.locale = "en";
        mocks.setLanguage.mockClear();
    });

    it("composes defaults before caller modules and merges moddle extensions", () => {
        const drdModule = { id: "custom-drd" };
        const tableModule = { id: "custom-table" };
        const literalModule = { id: "custom-literal" };
        const boxedModule = { id: "custom-boxed" };
        const panel = document.createElement("aside");
        const container = document.createElement("main");

        new DmnModeler(container, {
            propertiesPanel: { parent: panel },
            additionalModules: {
                drd: [drdModule],
                decisionTable: [tableModule],
                literalExpression: [literalModule],
                boxedExpression: [boxedModule],
            },
            moddleExtensions: { camunda: { custom: true }, acme: { name: "acme" } },
        });

        const config = mocks.vendors[0].options;
        expect(config.container).toBe(container);
        expect(config.drd.propertiesPanel).toEqual({
            parent: panel,
            feelPopupContainer: container,
        });
        expect(config.drd.additionalModules).toEqual([
            mocks.translateModule,
            mocks.drdPanel,
            mocks.drdProvider,
            mocks.camundaProvider,
            mocks.drdSimulation,
            drdModule,
        ]);
        expect(config.decisionTable.additionalModules).toEqual([
            mocks.translateModule,
            mocks.tableSimulation,
            tableModule,
        ]);
        expect(config.literalExpression.additionalModules).toEqual([
            mocks.translateModule,
            literalModule,
        ]);
        expect(config.boxedExpression.additionalModules).toEqual([
            mocks.translateModule,
            boxedModule,
        ]);
        expect(config.moddleExtensions.acme).toEqual({ name: "acme" });
        expect(config.moddleExtensions.camunda).toEqual({ custom: true });
        expect(config.common.expressionLanguages.options).toHaveLength(6);
        expect(config.common.expressionLanguages.defaults?.editor).toBe("feel");
        expect(config.common.dataTypes).toEqual([
            "string",
            "boolean",
            "integer",
            "long",
            "double",
            "date",
        ]);
        expect(config.common).toHaveProperty("keyboard");
        expect(config).not.toHaveProperty("keyboard");
    });

    it("replaces language, type, and keyboard defaults when configured", () => {
        const expressionLanguages = {
            options: [{ value: "acme", label: "ACME" }],
            defaults: { editor: "acme" },
        };
        const dataTypes = ["money"];
        new DmnModeler(document.createElement("main"), {
            propertiesPanel: { parent: document.createElement("aside") },
            expressionLanguages,
            dataTypes,
            keyboard: { bind: false },
        });

        expect(mocks.vendors[0].options.common).toEqual({
            expressionLanguages,
            dataTypes,
            keyboard: { bind: false },
        });
    });

    it("keeps view and command-stack subscriptions isolated per instance", () => {
        const firstChanged = vi.fn();
        const secondChanged = vi.fn();
        const firstViews = vi.fn();
        const secondViews = vi.fn();
        new DmnModeler(document.createElement("main"), {
            propertiesPanel: { parent: document.createElement("aside") },
            onContentChanged: firstChanged,
            onViewChanged: firstViews,
        });
        new DmnModeler(document.createElement("main"), {
            propertiesPanel: { parent: document.createElement("aside") },
            onContentChanged: secondChanged,
            onViewChanged: secondViews,
        });

        const firstBus = createEventBus();
        const secondBus = createEventBus();
        mocks.vendors[0].activeView = drdView;
        mocks.vendors[0].activeViewer = createViewer({ eventBus: firstBus });
        mocks.vendors[1].activeView = tableView;
        mocks.vendors[1].activeViewer = createViewer({ eventBus: secondBus });
        mocks.vendors[0].emitViews();
        mocks.vendors[1].emitViews();
        firstBus.fire();

        expect(firstChanged).toHaveBeenCalledOnce();
        expect(secondChanged).not.toHaveBeenCalled();
        expect(firstViews).toHaveBeenCalledOnce();
        expect(secondViews).toHaveBeenCalledOnce();
    });

    it("deduplicates repeated view notifications and rebinds across every view transition", () => {
        const changed = vi.fn();
        const viewsChanged = vi.fn();
        new DmnModeler(document.createElement("main"), {
            propertiesPanel: { parent: document.createElement("aside") },
            onContentChanged: changed,
            onViewChanged: viewsChanged,
        });
        const vendor = mocks.vendors[0];
        const drdBus = createEventBus();
        const tableBus = createEventBus();
        const expressionBus = createEventBus();

        vendor.activeView = drdView;
        vendor.activeViewer = createViewer({ eventBus: drdBus });
        vendor.emitViews();
        vendor.emitViews();
        expect(drdBus.on).toHaveBeenCalledOnce();
        expect(viewsChanged).toHaveBeenCalledTimes(2);

        vendor.activeView = tableView;
        vendor.activeViewer = createViewer({ eventBus: tableBus });
        vendor.emitViews();
        expect(drdBus.off).toHaveBeenCalledOnce();
        tableBus.fire();

        vendor.activeView = {
            id: "Decision_2",
            type: "literalExpression",
            element: { id: "Decision_2", $type: "dmn:Decision" },
        };
        vendor.activeViewer = createViewer({ eventBus: expressionBus });
        vendor.emitViews();
        expect(tableBus.off).toHaveBeenCalledOnce();
        expressionBus.fire();

        vendor.activeView = undefined;
        vendor.activeViewer = undefined;
        vendor.emitViews({ views: [] });
        expect(expressionBus.off).toHaveBeenCalledOnce();
        expect(changed).toHaveBeenCalledTimes(2);
    });

    it("resizes the current canvas and only focuses a DRD canvas", () => {
        const handle = new DmnModeler(document.createElement("main"), {
            propertiesPanel: { parent: document.createElement("aside") },
        });
        const vendor = mocks.vendors[0];
        const canvas = { resized: vi.fn(), focus: vi.fn(), isFocused: vi.fn(() => true) };
        vendor.activeView = drdView;
        vendor.activeViewer = createViewer({ canvas });

        mocks.resizeCallbacks[0]();
        handle.focusCanvas();
        expect(canvas.resized).toHaveBeenCalledOnce();
        expect(canvas.focus).toHaveBeenCalledOnce();
        expect(handle.isCanvasFocused()).toBe(true);

        vendor.activeView = tableView;
        handle.focusCanvas();
        expect(canvas.focus).toHaveBeenCalledOnce();
        expect(handle.isCanvasFocused()).toBe(false);
    });

    it("returns views, opens them, exports formatted XML, and reports non-fatal warnings", async () => {
        const warning = { message: "Recovered", error: { message: "detail", stack: "stack" } };
        const onWarning = vi.fn();
        const handle = new DmnModeler(document.createElement("main"), {
            propertiesPanel: { parent: document.createElement("aside") },
            onWarning,
        });
        const vendor = mocks.vendors[0];
        vendor.views = [drdView, tableView];
        vendor.activeView = tableView;
        vendor.activeViewer = createViewer({ custom: { value: 1 } });
        vendor.importResult = { warnings: [warning] };
        vendor.openResult = { warnings: [{ message: "Open warning" }] };
        vendor.xml = "<formatted />";

        await expect(handle.loadDiagram("<xml />")).resolves.toEqual({ warnings: [warning] });
        await expect(handle.openView(tableView)).resolves.toEqual({
            warnings: [{ message: "Open warning" }],
        });
        await expect(handle.exportDiagram()).resolves.toBe("<formatted />");
        expect(vendor.saveXML).toHaveBeenCalledWith({ format: true });
        expect(handle.getViews()).toEqual([drdView, tableView]);
        expect(handle.getActiveView()).toBe(tableView);
        expect(handle.isDrdViewActive()).toBe(false);
        expect(handle.getService("custom")).toEqual({ value: 1 });
        expect(onWarning).toHaveBeenNthCalledWith(1, "Recovered\ndetail\nstack");
        expect(onWarning).toHaveBeenNthCalledWith(2, "Open warning");
    });

    it("preserves import/open failures and warning details without assuming nested errors", async () => {
        const handle = new DmnModeler(document.createElement("main"), {
            propertiesPanel: { parent: document.createElement("aside") },
        });
        const vendor = mocks.vendors[0];
        const importError = Object.assign(new Error("invalid XML"), {
            warnings: [{ message: "plain warning" }],
        });
        vendor.importError = importError;

        await expect(handle.loadDiagram("broken")).rejects.toMatchObject({
            message: "Unable to import DMN: invalid XML\nplain warning",
            cause: importError,
        });

        const openError = new Error("cannot render");
        vendor.openError = openError;
        await expect(handle.openView(tableView)).rejects.toMatchObject({
            message: "Unable to open DMN view <Decision_1>: cannot render",
            cause: openError,
        });

        vendor.xml = undefined;
        await expect(handle.exportDiagram()).rejects.toThrow(
            "Failed to save changes made to the diagram!",
        );
        const saveError = new Error("serialization failed");
        vendor.saveXML.mockRejectedValueOnce(saveError);
        await expect(handle.exportDiagram()).rejects.toBe(saveError);

        vendor.activeViewer = undefined;
        expect(() => handle.getService("canvas")).toThrow("No active DMN view is available");
    });

    it("re-opens the active view when a locale switch resolves to a new locale", async () => {
        const handle = new DmnModeler(document.createElement("main"), {
            propertiesPanel: { parent: document.createElement("aside") },
        });
        const vendor = mocks.vendors[0];
        vendor.activeView = tableView;
        vendor.activeViewer = createViewer({});

        await handle.setLocale("de");

        expect(mocks.setLanguage).toHaveBeenCalledWith("de");
        expect(vendor.open).toHaveBeenCalledWith(tableView);
    });

    it("does not re-open when the resolved locale is unchanged", async () => {
        mocks.locale = "de";
        const handle = new DmnModeler(document.createElement("main"), {
            propertiesPanel: { parent: document.createElement("aside") },
        });
        const vendor = mocks.vendors[0];
        vendor.activeView = tableView;
        vendor.activeViewer = createViewer({});

        await handle.setLocale("de");

        expect(mocks.setLanguage).toHaveBeenCalledWith("de");
        expect(vendor.open).not.toHaveBeenCalled();
    });

    it("does not re-open when no view is active", async () => {
        const handle = new DmnModeler(document.createElement("main"), {
            propertiesPanel: { parent: document.createElement("aside") },
        });
        const vendor = mocks.vendors[0];
        vendor.activeView = undefined;

        await handle.setLocale("de");

        expect(vendor.open).not.toHaveBeenCalled();
    });

    it("preserves the DRD viewbox across a locale re-open", async () => {
        const handle = new DmnModeler(document.createElement("main"), {
            propertiesPanel: { parent: document.createElement("aside") },
        });
        const vendor = mocks.vendors[0];
        const box = { x: 1, y: 2, width: 3, height: 4 };
        const viewbox = vi.fn((next?: unknown) => (next ? undefined : box));
        vendor.activeView = drdView;
        vendor.activeViewer = createViewer({ canvas: { resized: vi.fn(), viewbox } });

        await handle.setLocale("de");

        expect(vendor.open).toHaveBeenCalledWith(drdView);
        expect(viewbox).toHaveBeenNthCalledWith(1);
        expect(viewbox).toHaveBeenLastCalledWith(box);
    });

    it("rejects setLocale after destroy", async () => {
        const handle = new DmnModeler(document.createElement("main"), {
            propertiesPanel: { parent: document.createElement("aside") },
        });
        handle.destroy();
        await expect(handle.setLocale("de")).rejects.toThrow("DMN modeler has been destroyed");
    });

    it("scopes data-dmn-theme to the container and panel parent and clears it on destroy", () => {
        const container = document.createElement("main");
        const panel = document.createElement("aside");
        const handle = new DmnModeler(container, { propertiesPanel: { parent: panel } });

        handle.setTheme("dark");
        expect(container.getAttribute("data-dmn-theme")).toBe("dark");
        expect(panel.getAttribute("data-dmn-theme")).toBe("dark");

        handle.destroy();
        expect(container.hasAttribute("data-dmn-theme")).toBe(false);
        expect(panel.hasAttribute("data-dmn-theme")).toBe(false);
    });

    it("destroys exactly once, detaches listeners, and rejects later operations", async () => {
        const changed = vi.fn();
        const handle = new DmnModeler(document.createElement("main"), {
            propertiesPanel: { parent: document.createElement("aside") },
            onContentChanged: changed,
        });
        const vendor = mocks.vendors[0];
        const bus = createEventBus();
        vendor.activeView = drdView;
        vendor.activeViewer = createViewer({ eventBus: bus });
        vendor.emitViews();

        handle.destroy();
        handle.destroy();
        bus.fire();
        vendor.emitViews();
        mocks.resizeCallbacks[0]();

        expect(vendor.off).toHaveBeenCalledOnce();
        expect(bus.off).toHaveBeenCalledOnce();
        expect(mocks.resizeDisposers[0]).toHaveBeenCalledOnce();
        expect(vendor.destroy).toHaveBeenCalledOnce();
        expect(changed).not.toHaveBeenCalled();
        expect(() => handle.getViews()).toThrow("DMN modeler has been destroyed");
        await expect(handle.loadDiagram("<xml />")).rejects.toThrow(
            "DMN modeler has been destroyed",
        );
    });
});
