import type BaseViewer from "bpmn-js/lib/BaseViewer";
import type { ImportXMLResult } from "bpmn-js/lib/BaseViewer";
import {
    DEFAULT_THEME_MODE,
    DisposableStore,
    type Disposer,
    NoModelerError,
} from "@miragon/bpmn-modeler-types";
import { type EditableSurfaceMode, parseEditableMode } from "@miragon/bpmn-modeler-types/domain";

import {
    type DroppedPlugin,
    type FailedFeature,
    type FeatureOutcome,
    mergeFeatures,
    settleFeatures,
} from "../domain/featureMerge";
import {
    DIAGRAM_TEMPLATE,
    RESERVED_KERNEL_NAMES,
    SURFACE_MODE_SERVICE,
    SURFACE_ROOTS,
} from "../domain/kernelNames";
import {
    baseOfLoaded,
    isBaseConstructor,
    type SurfaceBaseKind,
    surfaceBaseKind,
} from "../domain/surfaceBase";
import type { ThemeMode } from "../domain/themeMode";
import type { ViewState } from "../domain/viewState";
import type { FeatureEntry } from "../port/bpmnSurface";
import type { RootElementManager, SelectionManager, ViewportManager } from "../port/canvasManagers";
import type { DiagramTemplate } from "../port/kernelServices";
import { subscribeCommandStackChanged } from "./commandStackChanged";
import { exportFormattedXml, exportSvg, importDiagram } from "./diagramXml";
import { createReporter, type SurfaceReporter } from "./reporting";
import { SurfaceCore } from "./surfaceCore";
import {
    createSurfaceModeModule,
    holdModeOnRoots,
    type KernelSurfaceMode,
    subscribeModeChanged,
} from "./surfaceMode";

type KernelInstance = Pick<BaseViewer, "get" | "destroy" | "importXML" | "saveXML" | "saveSVG"> & {
    createDiagram?(): Promise<ImportXMLResult>;
};

type BaseConstructor = new (options: object) => KernelInstance;

/** What `createSurface` hands the kernel; the base is a constructor or a lazy loader of one. */
export interface KernelSurfaceOptions {
    readonly base: unknown;
    readonly features: readonly FeatureEntry[];
    readonly plugins?: readonly FeatureEntry[];
    readonly mode?: EditableSurfaceMode;
    readonly extraRoots?: readonly HTMLElement[];
    readonly theme?: ThemeMode;
    onWarning?(message: string): void;
    onError?(error: unknown): void;
    onModeChanged?(mode: EditableSurfaceMode): void;
}

const POSITION_LABEL = /^(feature|plugin) #\d+$/;

function describeFinding(list: "feature" | "plugin", { feature, problem }: DroppedPlugin): string {
    return POSITION_LABEL.test(feature)
        ? `${feature} ${problem}`
        : `${list} "${feature}" ${problem}`;
}

function featureFailure(failed: FailedFeature): Error {
    return new Error(describeFinding("feature", failed), { cause: failed.reason });
}

async function loadBase(base: unknown): Promise<BaseConstructor> {
    const constructor = isBaseConstructor(base)
        ? base
        : baseOfLoaded(await (base as () => Promise<unknown>)());
    if (!isBaseConstructor(constructor)) {
        throw new TypeError("the base is neither a bpmn-js constructor nor a loader of one");
    }
    return constructor as BaseConstructor;
}

/**
 * The one kernel: builds bpmn-js from a base and the merged features, and owns
 * the surface's lifecycle, document I/O, view state, theme and mode. Two-phase
 * like the presets, so a `destroy()` while `init()` awaits leaves nothing behind.
 */
export class KernelSurface {
    private readonly core: SurfaceCore<KernelInstance>;

    private readonly reporter: SurfaceReporter;

    // Replaced on every init(), so a destroy() or a second init() during the await is seen.
    private store = new DisposableStore();

    private kind: SurfaceBaseKind | undefined;

    private modal = false;

    /**
     * @param defaultModules The modules composition hands every surface, registered
     *   right after the kernel's own and before the features.
     */
    constructor(
        private readonly container: HTMLElement,
        private readonly options: KernelSurfaceOptions,
        private readonly defaultModules: readonly unknown[],
    ) {
        this.core = new SurfaceCore(
            container,
            Object.freeze([container, ...(options.extraRoots ?? [])]),
        );
        this.reporter = createReporter({ onWarning: options.onWarning, onError: options.onError });
    }

    /** Whether `init()` built the surface with a mode. */
    get isModal(): boolean {
        return this.modal;
    }

    /** @throws {NoModelerError} Before `init()` has built an instance. */
    get base(): SurfaceBaseKind {
        if (!this.kind) {
            throw new NoModelerError();
        }
        return this.kind;
    }

    get viewport(): ViewportManager {
        return this.core.viewport;
    }

    get selection(): SelectionManager {
        return this.core.selection;
    }

    get rootElement(): RootElementManager {
        return this.core.rootElement;
    }

    async init(): Promise<void> {
        this.store.dispose();
        const store = new DisposableStore();
        this.store = store;
        const features = this.options.features;
        const [base, ...outcomes] = await Promise.allSettled<unknown>([
            loadBase(this.options.base),
            ...features,
            ...(this.options.plugins ?? []),
        ]);
        if (this.store !== store || store.isDisposed) {
            return;
        }
        if (base.status === "rejected") {
            throw new Error("the surface base failed to load", { cause: base.reason });
        }
        const Base = base.value as BaseConstructor;
        const kind = surfaceBaseKind(Base);
        const mode = this.modeOn(kind);
        const merged = this.merge(
            outcomes.slice(0, features.length),
            outcomes.slice(features.length),
            mode !== undefined,
        );
        const additionalModules = [
            ...(mode === undefined ? [] : [createSurfaceModeModule(mode)]),
            this.core.rootsModule(),
            ...this.defaultModules,
            ...merged.modules,
        ];
        this.core.allocate(
            store,
            () =>
                new Base({
                    ...merged.config,
                    container: this.container,
                    moddleExtensions: merged.moddleExtensions,
                    additionalModules,
                }),
        );
        this.kind = kind;
        this.modal = mode !== undefined;
        if (mode !== undefined) {
            const eventBus = this.core.service<Parameters<typeof holdModeOnRoots>[1]>("eventBus");
            holdModeOnRoots(store, eventBus, this.core.roots, mode);
            const onModeChanged = this.options.onModeChanged;
            if (onModeChanged) {
                store.add(subscribeModeChanged(eventBus, onModeChanged));
            }
        }
        this.core.setTheme(store, this.options.theme ?? DEFAULT_THEME_MODE);
    }

    private modeOn(kind: SurfaceBaseKind): EditableSurfaceMode | undefined {
        const { mode, onModeChanged } = this.options;
        if (mode !== undefined && kind !== "modeler") {
            this.reporter.warn("mode needs a modeler base; this surface is built without one");
            return undefined;
        }
        if (mode === undefined && onModeChanged) {
            this.reporter.warn("onModeChanged needs a mode on a modeler base; it is never called");
        }
        return mode === undefined ? undefined : parseEditableMode(mode);
    }

    private merge(
        builtIns: readonly FeatureOutcome[],
        plugins: readonly FeatureOutcome[],
        modal: boolean,
    ) {
        const load = settleFeatures(builtIns, plugins);
        if (load.kind === "failed") {
            throw featureFailure(load);
        }
        const merged = mergeFeatures(load.builtIns, load.plugins, {
            kernelNames: modal ? [SURFACE_ROOTS, SURFACE_MODE_SERVICE] : [SURFACE_ROOTS],
            reservedNames: RESERVED_KERNEL_NAMES,
        });
        if (merged.kind === "failed") {
            throw featureFailure(merged);
        }
        for (const dropped of [...load.droppedPlugins, ...merged.droppedPlugins]) {
            this.reporter.warn(
                `${describeFinding("plugin", dropped)}; the surface is built without it`,
            );
        }
        return merged;
    }

    destroy(): void {
        this.store.dispose();
        this.core.releaseManagers();
    }

    getService<T = unknown>(name: string): T {
        return this.core.service<T>(name);
    }

    /** `undefined` when the instance was built without the service. */
    optionalService<T>(name: string): T | undefined {
        return this.core.optionalService<T>(name);
    }

    async loadDiagram(xml: string): Promise<ImportXMLResult> {
        const result = await importDiagram(this.core.instance, xml);
        this.core.armInitialViewport();
        return result;
    }

    reloadDiagram(xml: string): Promise<ImportXMLResult> {
        return this.core.keepViewAcross(() => this.loadDiagram(xml));
    }

    async newDiagram(): Promise<ImportXMLResult> {
        const instance = this.core.instance;
        const template = this.core.optionalService<DiagramTemplate>(DIAGRAM_TEMPLATE);
        const result = template
            ? await importDiagram(instance, template.newDiagramXml())
            : await instance.createDiagram!();
        this.core.armInitialViewport();
        return result;
    }

    async exportDiagram(): Promise<string> {
        return exportFormattedXml(this.core.instance);
    }

    async getDiagramSvg(): Promise<string> {
        return exportSvg(this.core.instance);
    }

    captureViewState(): ViewState {
        return this.core.captureViewState();
    }

    applyViewState(state: ViewState): void {
        this.core.applyViewState(state);
    }

    setTheme(theme: ThemeMode): void {
        this.core.setTheme(this.store, theme);
    }

    hasPendingInput(): boolean {
        return this.core.hasPendingInput();
    }

    flushPendingInput(): void {
        this.core.flushPendingInput();
    }

    onCommandStackChanged(listener: () => void): Disposer {
        return subscribeCommandStackChanged(this.core, listener);
    }

    setMode(mode: EditableSurfaceMode): void {
        this.surfaceMode().set(mode);
    }

    getMode(): EditableSurfaceMode {
        return this.surfaceMode().get();
    }

    private surfaceMode(): KernelSurfaceMode {
        return this.core.service<KernelSurfaceMode>(SURFACE_MODE_SERVICE);
    }
}
