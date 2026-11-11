declare module "dmn-js/lib/Modeler" {
    interface DmnViewElement {
        readonly id: string;
        readonly $type: string;
        readonly name?: string;
        readonly [property: string]: unknown;
    }

    interface DmnView {
        readonly id: string;
        readonly name?: string;
        readonly type: "drd" | "decisionTable" | "literalExpression" | "boxedExpression";
        readonly element: DmnViewElement;
    }

    interface DmnWarning {
        readonly message: string;
        readonly error?: { readonly message?: string; readonly stack?: string };
    }

    interface DmnOperationResult {
        readonly warnings: DmnWarning[];
    }

    interface DmnViewChangedEvent {
        readonly views: DmnView[];
        readonly activeView?: DmnView;
    }

    interface DmnModelerConfiguration {
        container: HTMLElement;
        common?: Record<string, unknown>;
        drd?: Record<string, unknown>;
        decisionTable?: Record<string, unknown>;
        literalExpression?: Record<string, unknown>;
        boxedExpression?: Record<string, unknown>;
        moddleExtensions?: Record<string, object>;
    }

    export default class DmnModeler {
        constructor(options: DmnModelerConfiguration);

        importXML(xml: string): Promise<DmnOperationResult>;
        saveXML(options: { format: boolean }): Promise<{ xml?: string }>;
        open(view: DmnView): Promise<DmnOperationResult>;

        getActiveView(): DmnView | undefined;
        getActiveViewer(): { get<T = unknown>(name: string, strict?: boolean): T } | undefined;
        getViews(): DmnView[];

        on(event: "views.changed", callback: (event: DmnViewChangedEvent) => void): void;
        off(event: "views.changed", callback: (event: DmnViewChangedEvent) => void): void;
        destroy(): void;
    }
}

declare module "dmn-js-properties-panel" {
    export const DmnPropertiesPanelModule: unknown;
    export const DmnPropertiesProviderModule: unknown;
    export const CamundaPropertiesProviderModule: unknown;
}

declare module "dmn-js/lib/Viewer" {
    import type DmnModeler from "dmn-js/lib/Modeler";

    type DmnView = ReturnType<DmnModeler["getViews"]>[number];

    interface DmnViewerConfiguration {
        container: HTMLElement;
        common?: Record<string, unknown>;
        drd?: Record<string, unknown>;
        decisionTable?: Record<string, unknown>;
        literalExpression?: Record<string, unknown>;
        boxedExpression?: Record<string, unknown>;
        moddleExtensions?: Record<string, object>;
    }

    export default class DmnViewer {
        constructor(options: DmnViewerConfiguration);

        importXML(xml: string): Promise<{ warnings: unknown[] }>;
        open(view: DmnView): Promise<{ warnings: unknown[] }>;

        getActiveView(): DmnView | undefined;
        getActiveViewer(): { get<T = unknown>(name: string, strict?: boolean): T } | undefined;
        getViews(): DmnView[];

        on(event: string, callback: (event: { activeView?: DmnView }) => void): void;
        off(event: string, callback: (event: { activeView?: DmnView }) => void): void;
        destroy(): void;
    }
}

declare module "diagram-js/lib/navigation/zoomscroll" {
    const module: unknown;
    export default module;
}

declare module "diagram-js/lib/navigation/movecanvas" {
    const module: unknown;
    export default module;
}
