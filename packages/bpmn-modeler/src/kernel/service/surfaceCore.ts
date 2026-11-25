import type BaseViewer from "bpmn-js/lib/BaseViewer";
import {
    type DisposableStore,
    type FlushableDebounceInput,
    NoModelerError,
} from "@miragon/bpmn-modeler-types";
import { ThemeController } from "@miragon/bpmn-modeler-browser";

import { DEBOUNCE_INPUT, SURFACE_ROOTS } from "../domain/kernelNames";
import type { ThemeMode } from "../domain/themeMode";
import type { ViewState } from "../domain/viewState";
import type { RootElementManager, SelectionManager, ViewportManager } from "../port/canvasManagers";
import { SurfaceView } from "./viewState";

type SurfaceInstance = Pick<BaseViewer, "get" | "destroy">;

interface DestroyEventBus {
    on(event: "error", priority: number, listener: () => false): void;
    fire(event: "diagram.destroy"): unknown;
}

const SWALLOW_ALL_ERRORS = 10_000;

const THEME_ATTRIBUTE = "data-bpmn-theme";

export interface SurfaceServices {
    /** @throws {NoModelerError} If no bpmn-js instance is live. */
    service<S>(name: string): S;
    /** `undefined` when the instance was built without the service. */
    optionalService<S>(name: string): S | undefined;
}

/**
 * The facade owns the {@link DisposableStore} and hands it in, so registration
 * order, and with it LIFO teardown, stays the facade's.
 */
export class SurfaceCore<T extends SurfaceInstance> implements SurfaceServices {
    private liveInstance: T | undefined;

    private view: SurfaceView | undefined;

    private themeController: ThemeController | undefined;

    // The bus of the instance under construction, so a constructor that throws late can be torn down.
    private constructingEventBus: DestroyEventBus | undefined;

    /**
     * @param container The canvas host the bpmn-js instance attaches to.
     * @param roots The surface's roots, the container first: `surfaceRoots`,
     *   and the elements that carry this instance's `data-bpmn-theme`.
     */
    constructor(
        private readonly container: HTMLElement,
        readonly roots: readonly HTMLElement[],
    ) {}

    /** @throws {NoModelerError} If no bpmn-js instance is live. */
    get instance(): T {
        if (!this.liveInstance) {
            throw new NoModelerError();
        }
        return this.liveInstance;
    }

    get viewport(): ViewportManager {
        return this.liveView().viewport;
    }

    get selection(): SelectionManager {
        return this.liveView().selection;
    }

    get rootElement(): RootElementManager {
        return this.liveView().rootElement;
    }

    /**
     * The kernel's `surfaceRoots` module. List it in every construction this
     * core allocates: it also lets {@link allocate} tear down a constructor
     * that throws after the modules initialised.
     */
    rootsModule(): object {
        const watchConstruction = (eventBus: DestroyEventBus): void => {
            this.constructingEventBus = eventBus;
        };
        watchConstruction.$inject = ["eventBus"];
        return { __init__: [watchConstruction], [SURFACE_ROOTS]: ["value", this.roots] };
    }

    /**
     * Constructs the bpmn-js instance and registers, in this order, its
     * destruction and its view on `store`.
     */
    allocate(store: DisposableStore, construct: () => T): void {
        this.constructingEventBus = undefined;
        try {
            this.liveInstance = construct();
        } catch (error) {
            this.tearDownPartialConstruction();
            throw error;
        } finally {
            this.constructingEventBus = undefined;
        }
        store.add(() => {
            this.liveInstance?.destroy();
            this.liveInstance = undefined;
        });
        const view = new SurfaceView(<S>(name: string): S => this.service<S>(name));
        this.view = view;
        store.add(() => view.dispose());
    }

    /** Drops the managers once the facade's store has torn the instance down. */
    releaseManagers(): void {
        this.view = undefined;
    }

    service<S>(name: string): S {
        return this.instance.get<S>(name);
    }

    optionalService<S>(name: string): S | undefined {
        return this.instance.get<S>(name, false) ?? undefined;
    }

    captureViewState(): ViewState {
        return this.liveView().capture();
    }

    applyViewState(state: ViewState): void {
        this.liveView().apply(state);
    }

    /** @see SurfaceView.keepAcross. Async so a destroyed surface rejects, as `loadDiagram` does. */
    async keepViewAcross<R>(reimport: () => Promise<R>): Promise<R> {
        return this.liveView().keepAcross(reimport);
    }

    /** `false` once destroyed: a torn-down panel holds no input. */
    hasPendingInput(): boolean {
        return this.panelInput()?.hasPending() ?? false;
    }

    /** A no-op once destroyed. */
    flushPendingInput(): void {
        this.panelInput()?.flush();
    }

    /** Arms the one-time initial fit for the diagram that was just imported. */
    armInitialViewport(): void {
        this.liveView().diagramLoaded();
    }

    /** A no-op once `store` is disposed, so a destroyed surface keeps no theme residue. */
    setTheme(store: DisposableStore, theme: ThemeMode): void {
        if (store.isDisposed) {
            return;
        }
        if (!this.themeController) {
            this.themeController = new ThemeController(this.roots, THEME_ATTRIBUTE);
            store.add(() => {
                this.themeController?.dispose();
                // A replacement store on the same surface must be able to rebuild it.
                this.themeController = undefined;
            });
        }
        this.themeController.setMode(theme);
    }

    private panelInput(): FlushableDebounceInput | undefined {
        return this.liveInstance?.get<FlushableDebounceInput>(DEBOUNCE_INPUT, false) ?? undefined;
    }

    // A half-built bpmn-js has no handle to destroy; its modules still hold page listeners.
    private tearDownPartialConstruction(): void {
        try {
            // Listeners of modules that never initialised throw on destroy; handling those
            // errors keeps them off the console and lets the remaining listeners run.
            this.constructingEventBus?.on("error", SWALLOW_ALL_ERRORS, () => false);
            this.constructingEventBus?.fire("diagram.destroy");
        } catch {
            // A secondary teardown failure must not mask the construction error.
        }
        // A partially-constructed bpmn-js attaches `.bjs-container`; clear the dedicated container.
        this.container.replaceChildren();
    }

    private liveView(): SurfaceView {
        if (!this.view) {
            throw new NoModelerError();
        }
        return this.view;
    }
}
